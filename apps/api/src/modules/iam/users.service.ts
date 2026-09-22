import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Membership, Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { assertPasswordPolicy } from './password-policy';

const BCRYPT_ROUNDS = 10;

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  membershipId: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rls: RlsService,
  ) {}

  async findAll(companyId: string): Promise<UserListItem[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.role,
      membershipId: m.id,
      isActive: m.isActive && m.user.isActive,
      lastLoginAt: m.user.lastLoginAt,
      createdAt: m.createdAt,
    }));
  }

  async create(companyId: string, actorUserId: string, dto: CreateUserDto): Promise<UserListItem> {
    if (dto.role === UserRole.SUPER_ADMIN) {
      await this.requireSuperAdmin(companyId, actorUserId);
    }
    assertPasswordPolicy(dto.password);
    // Hash outside the RLS transaction so we don't hold it longer than necessary.
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const email = dto.email.toLowerCase();

    return this.rls.executeWithRls(companyId, actorUserId, async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });

      if (existing) {
        const currentMembership = await tx.membership.findUnique({
          where: { userId_companyId: { userId: existing.id, companyId } },
        });
        if (currentMembership) {
          throw new BadRequestException('Ya existe un usuario con ese email en esta empresa.');
        }
        // Reuse the existing global user — just add a membership to this company.
        const newMembership = await tx.membership.create({
          data: { userId: existing.id, companyId, role: dto.role },
        });
        return this.toListItem(existing, newMembership);
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          memberships: { create: { companyId, role: dto.role } },
        },
        include: { memberships: { where: { companyId } } },
      });
      return this.toListItem(user, user.memberships[0]);
    });
  }

  async update(
    userId: string,
    companyId: string,
    actorUserId: string,
    dto: UpdateUserDto,
  ): Promise<UserListItem> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership) {
      throw new NotFoundException('Usuario no encontrado en esta empresa');
    }

    const roleChanges = dto.role !== undefined && dto.role !== membership.role;
    if (userId === actorUserId && (roleChanges || dto.isActive === false)) {
      throw new BadRequestException(
        'No puedes cambiar tu propio rol ni desactivar tu propia cuenta.',
      );
    }
    if (
      roleChanges &&
      (dto.role === UserRole.SUPER_ADMIN || membership.role === UserRole.SUPER_ADMIN)
    ) {
      await this.requireSuperAdmin(companyId, actorUserId);
    }
    await this.assertMayModifyAccount(membership, companyId, actorUserId, {
      credential: dto.password !== undefined,
      operation: 'update',
    });
    if (dto.password !== undefined) assertPasswordPolicy(dto.password);

    // Hash outside the transaction if password is being changed.
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS) : undefined;

    return this.rls.executeWithRls(companyId, actorUserId, async (tx) => {
      const userData: Prisma.UserUpdateInput = {};
      if (dto.firstName !== undefined) userData.firstName = dto.firstName.trim();
      if (dto.lastName !== undefined) userData.lastName = dto.lastName.trim();
      if (passwordHash) {
        userData.passwordHash = passwordHash;
        userData.tokenVersion = { increment: 1 };
        userData.refreshTokenHash = null;
        userData.passwordChangedAt = new Date();
      }

      const membershipData: Prisma.MembershipUpdateInput = {};
      if (dto.role !== undefined) membershipData.role = dto.role;
      if (dto.isActive !== undefined) membershipData.isActive = dto.isActive;

      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userData });
      }
      let updatedMembership = membership;
      if (Object.keys(membershipData).length > 0) {
        updatedMembership = await tx.membership.update({
          where: { userId_companyId: { userId, companyId } },
          data: membershipData,
        });
      }

      const freshUser = await tx.user.findUnique({ where: { id: userId } });
      if (!freshUser) throw new NotFoundException('Usuario no encontrado');
      return this.toListItem(freshUser, updatedMembership);
    });
  }

  async resetAccess(userId: string, companyId: string, actorUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership) throw new NotFoundException('Usuario no encontrado en esta empresa');
    if (userId === actorUserId) {
      throw new BadRequestException('Usa "Cambiar contraseña" para tu propia cuenta.');
    }

    await this.assertMayModifyAccount(membership, companyId, actorUserId, {
      credential: true,
      operation: 'reset-access',
    });

    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const alphabet = letters + digits;
    const characters = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
    while (characters.length < 12) characters.push(alphabet[randomInt(alphabet.length)]);
    for (let i = characters.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [characters[i], characters[j]] = [characters[j], characters[i]];
    }
    const temporaryPassword = characters.join('');
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    await this.rls.executeWithRls(companyId, actorUserId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: true,
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
          passwordChangedAt: new Date(),
        },
        select: { id: true },
      }),
    );
    return { temporaryPassword };
  }

  private async assertMayModifyAccount(
    targetMembership: Pick<Membership, 'userId' | 'role'>,
    companyId: string,
    actorUserId: string,
    options: { credential: boolean; operation: 'update' | 'reset-access' },
  ) {
    const isSuperAdmin = (await this.actorRole(companyId, actorUserId)) === UserRole.SUPER_ADMIN;
    if (targetMembership.role === UserRole.SUPER_ADMIN && !isSuperAdmin) {
      throw new ForbiddenException(
        'Solo un superadministrador puede modificar la cuenta de un superadministrador.',
      );
    }
    if (!options.credential || isSuperAdmin) return;

    // Global credentials require checking other companies, not only the current scope.
    // This identity lookup follows the existing IAM client path; HARDEN-004 must
    // preserve cross-company visibility before switching runtime to app_user.
    const otherMembership = await this.prisma.membership.findFirst({
      where: { userId: targetMembership.userId, companyId: { not: companyId }, isActive: true },
      select: { id: true },
    });
    if (otherMembership) {
      throw new ConflictException(
        options.operation === 'reset-access'
          ? 'Este usuario también pertenece a otra empresa; solo un superadministrador puede restablecer su acceso.'
          : 'Este usuario también pertenece a otra empresa; solo un superadministrador puede cambiar su contraseña.',
      );
    }
  }

  private async actorRole(companyId: string, actorUserId: string) {
    const actor = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId: actorUserId, companyId } },
      select: { role: true, isActive: true },
    });
    if (!actor?.isActive) throw new ForbiddenException('No active membership for this company');
    return actor.role;
  }

  private async requireSuperAdmin(companyId: string, actorUserId: string) {
    if ((await this.actorRole(companyId, actorUserId)) !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Solo un superadministrador puede asignar ese rol.');
    }
  }

  private toListItem(
    user: User,
    membership: { id: string; role: UserRole; isActive: boolean; createdAt: Date },
  ): UserListItem {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: membership.role,
      membershipId: membership.id,
      isActive: membership.isActive && user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: membership.createdAt,
    };
  }
}
