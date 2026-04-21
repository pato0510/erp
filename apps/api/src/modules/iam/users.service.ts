import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

    // Hash outside the transaction if password is being changed.
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS) : undefined;

    return this.rls.executeWithRls(companyId, actorUserId, async (tx) => {
      const userData: Prisma.UserUpdateInput = {};
      if (dto.firstName !== undefined) userData.firstName = dto.firstName.trim();
      if (dto.lastName !== undefined) userData.lastName = dto.lastName.trim();
      if (passwordHash) userData.passwordHash = passwordHash;

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
