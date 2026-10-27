import { AccessModule, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PASSWORD_POLICY } from './password-policy';

jest.mock('bcrypt');
const hash = bcrypt.hash as jest.Mock;

describe('UsersService access recovery and administration', () => {
  const companyId = 'c1';
  const actorId = 'admin';
  const userId = 'target';
  const membership = {
    id: 'm1',
    userId,
    companyId,
    role: UserRole.VIEWER,
    isActive: true,
    restrictedModules: [] as AccessModule[],
    createdAt: new Date(),
  };
  const user = {
    id: userId,
    email: 'target@example.cl',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    lastLoginAt: null,
  };
  const createDto = {
    firstName: 'Test',
    lastName: 'User',
    email: user.email,
    password: 'TestPass123',
    role: UserRole.SUPER_ADMIN,
  };
  let actorRole: UserRole;
  let targetMembership: typeof membership | null;
  let prisma: { membership: { findUnique: jest.Mock; findFirst: jest.Mock } };
  let tx: {
    user: { update: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    membership: { update: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  };
  let rls: { executeWithRls: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    hash.mockReset().mockResolvedValue('hashed-password');
    actorRole = UserRole.ADMIN;
    targetMembership = { ...membership };
    prisma = {
      membership: {
        findUnique: jest.fn(async ({ where }) =>
          where.userId_companyId.userId === actorId
            ? { ...membership, userId: actorId, role: actorRole }
            : targetMembership,
        ),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    tx = {
      user: {
        update: jest.fn().mockResolvedValue(user),
        findUnique: jest.fn().mockResolvedValue(user),
        create: jest.fn().mockResolvedValue({ ...user, memberships: [membership] }),
      },
      membership: {
        update: jest.fn().mockResolvedValue(membership),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(membership),
      },
    };
    rls = { executeWithRls: jest.fn(async (_company, _actor, callback) => callback(tx)) };
    service = new UsersService(prisma as never, rls as never);
  });

  it('returns only a compliant temporary password and atomically revokes credentials', async () => {
    const result = await service.resetAccess(userId, companyId, actorId);
    expect(Object.keys(result)).toEqual(['temporaryPassword']);
    expect(result.temporaryPassword).toHaveLength(12);
    expect(result.temporaryPassword).toMatch(PASSWORD_POLICY);
    expect(result.temporaryPassword).not.toMatch(/[0O1lI]/);
    expect(hash).toHaveBeenCalledWith(result.temporaryPassword, 10);
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId, companyId: { not: companyId }, isActive: true },
      select: { id: true },
    });
    expect(rls.executeWithRls).toHaveBeenCalledWith(companyId, actorId, expect.any(Function));
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: {
        passwordHash: 'hashed-password',
        mustChangePassword: true,
        tokenVersion: { increment: 1 },
        refreshTokenHash: null,
        passwordChangedAt: expect.any(Date),
      },
      select: { id: true },
    });
    expect(JSON.stringify(tx.user.update.mock.calls)).not.toContain(result.temporaryPassword);
  });

  it('generates a fresh secret per reset and never exposes it on the user list projection', async () => {
    const first = await service.resetAccess(userId, companyId, actorId);
    const second = await service.resetAccess(userId, companyId, actorId);
    expect(first.temporaryPassword).not.toEqual(second.temporaryPassword);
    const result = await service.update(userId, companyId, actorId, { firstName: 'Changed' });
    expect(result).not.toHaveProperty('temporaryPassword');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects self reset with 400', async () => {
    await expect(service.resetAccess(actorId, companyId, actorId)).rejects.toMatchObject({
      status: 400,
      message: 'Usa "Cambiar contraseña" para tu propia cuenta.',
    });
    expect(hash).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects a target outside the caller company with 404', async () => {
    targetMembership = null;
    await expect(service.resetAccess(userId, companyId, actorId)).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.membership.findUnique).toHaveBeenCalledWith({
      where: { userId_companyId: { userId, companyId } },
    });
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects another active company for ADMIN with 409', async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 'foreign' });
    await expect(service.resetAccess(userId, companyId, actorId)).rejects.toMatchObject({
      status: 409,
      message:
        'Este usuario también pertenece a otra empresa; solo un superadministrador puede restablecer su acceso.',
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('allows another active company for SUPER_ADMIN', async () => {
    actorRole = UserRole.SUPER_ADMIN;
    prisma.membership.findFirst.mockResolvedValue({ id: 'foreign' });
    await expect(service.resetAccess(userId, companyId, actorId)).resolves.toHaveProperty(
      'temporaryPassword',
    );
  });

  it('forbids ADMIN resetting a SUPER_ADMIN before hashing or writing', async () => {
    targetMembership = { ...membership, role: UserRole.SUPER_ADMIN };
    await expect(service.resetAccess(userId, companyId, actorId)).rejects.toMatchObject({
      status: 403,
      message: 'Solo un superadministrador puede modificar la cuenta de un superadministrador.',
    });
    expect(hash).not.toHaveBeenCalled();
    expect(rls.executeWithRls).not.toHaveBeenCalled();
  });

  it.each([
    { firstName: 'Changed' },
    { lastName: 'Changed' },
    { isActive: false },
    { password: 'ChangedPass123' },
  ])('forbids ADMIN modifying a SUPER_ADMIN with %p', async (dto) => {
    targetMembership = { ...membership, role: UserRole.SUPER_ADMIN };
    await expect(service.update(userId, companyId, actorId, dto)).rejects.toMatchObject({
      status: 403,
      message: 'Solo un superadministrador puede modificar la cuenta de un superadministrador.',
    });
    expect(hash).not.toHaveBeenCalled();
    expect(rls.executeWithRls).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN resetting another SUPER_ADMIN', async () => {
    actorRole = UserRole.SUPER_ADMIN;
    targetMembership = { ...membership, role: UserRole.SUPER_ADMIN };
    await expect(service.resetAccess(userId, companyId, actorId)).resolves.toHaveProperty(
      'temporaryPassword',
    );
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    { firstName: 'Changed' },
    { lastName: 'Changed' },
    { isActive: false },
    { password: 'ChangedPass123' },
  ])('allows SUPER_ADMIN modifying another SUPER_ADMIN with %p', async (dto) => {
    actorRole = UserRole.SUPER_ADMIN;
    targetMembership = { ...membership, role: UserRole.SUPER_ADMIN };
    await expect(service.update(userId, companyId, actorId, dto)).resolves.toMatchObject({
      id: userId,
    });
    expect(rls.executeWithRls).toHaveBeenCalledTimes(1);
  });

  it('rejects ADMIN changing a global password across active companies', async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 'foreign' });
    await expect(
      service.update(userId, companyId, actorId, { password: 'ChangedPass123' }),
    ).rejects.toMatchObject({
      status: 409,
      message:
        'Este usuario también pertenece a otra empresa; solo un superadministrador puede cambiar su contraseña.',
    });
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId, companyId: { not: companyId }, isActive: true },
      select: { id: true },
    });
    expect(hash).not.toHaveBeenCalled();
    expect(rls.executeWithRls).not.toHaveBeenCalled();
  });

  it('still allows ADMIN editing names for a member of another active company', async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 'foreign' });
    await service.update(userId, companyId, actorId, { firstName: 'Changed' });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { firstName: 'Changed' },
    });
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN changing a password across active companies', async () => {
    actorRole = UserRole.SUPER_ADMIN;
    prisma.membership.findFirst.mockResolvedValue({ id: 'foreign' });
    await service.update(userId, companyId, actorId, { password: 'ChangedPass123' });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenVersion: { increment: 1 }, refreshTokenHash: null }),
      }),
    );
  });

  it('does not reactivate an inactive membership when resetting credentials', async () => {
    targetMembership = { ...membership, isActive: false };
    await service.resetAccess(userId, companyId, actorId);
    expect(tx.membership.update).not.toHaveBeenCalled();
    expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty('isActive');
  });

  it('forbids ADMIN granting SUPER_ADMIN during create', async () => {
    await expect(service.create(companyId, actorId, createDto)).rejects.toMatchObject({
      status: 403,
      message: 'Solo un superadministrador puede asignar ese rol.',
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it.each([
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.ANALYST,
    UserRole.VIEWER,
  ])('forbids %s granting SUPER_ADMIN during update', async (role) => {
    actorRole = role;
    await expect(
      service.update(userId, companyId, actorId, { role: UserRole.SUPER_ADMIN }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Solo un superadministrador puede asignar ese rol.',
    });
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('forbids ADMIN removing SUPER_ADMIN', async () => {
    targetMembership = { ...membership, role: UserRole.SUPER_ADMIN };
    await expect(
      service.update(userId, companyId, actorId, { role: UserRole.ADMIN }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Solo un superadministrador puede asignar ese rol.',
    });
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN assigning and removing that role on other users', async () => {
    actorRole = UserRole.SUPER_ADMIN;
    await service.update(userId, companyId, actorId, { role: UserRole.SUPER_ADMIN });
    targetMembership = { ...membership, role: UserRole.SUPER_ADMIN };
    await service.update(userId, companyId, actorId, { role: UserRole.ADMIN });
    expect(tx.membership.update).toHaveBeenCalledTimes(2);
    tx.user.findUnique.mockResolvedValue(null);
    await service.create(companyId, actorId, createDto);
    expect(tx.user.create).toHaveBeenCalled();
  });

  it.each([{ role: UserRole.VIEWER }, { isActive: false }])(
    'rejects own role/deactivation changes',
    async (dto) => {
      await expect(service.update(actorId, companyId, actorId, dto)).rejects.toMatchObject({
        status: 400,
        message: 'No puedes cambiar tu propio rol ni desactivar tu propia cuenta.',
      });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.membership.update).not.toHaveBeenCalled();
    },
  );

  it('allows own profile edits and an unchanged role', async () => {
    await service.update(actorId, companyId, actorId, {
      firstName: 'Name',
      role: UserRole.ADMIN,
      isActive: true,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: actorId },
      data: { firstName: 'Name' },
    });
  });

  it('PATCH password revokes old sessions without imposing a forced change', async () => {
    await service.update(userId, companyId, actorId, { password: 'NewPassword123' });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: {
        passwordHash: 'hashed-password',
        tokenVersion: { increment: 1 },
        refreshTokenHash: null,
        passwordChangedAt: expect.any(Date),
      },
    });
  });

  it.each(['Short1234', 'OnlyLetters', '1234567890', 'x'.repeat(100) + '1'])(
    'rejects invalid passwords in create and update before writes',
    async (password) => {
      await expect(service.update(userId, companyId, actorId, { password })).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        service.create(companyId, actorId, { ...createDto, role: UserRole.VIEWER, password }),
      ).rejects.toMatchObject({ status: 400 });
      expect(hash).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );
});

describe('ACCESS-001 — restrictedModules on create and update', () => {
  const companyId = 'c1';
  const actorId = 'admin';
  const userId = 'target';
  const baseMembership = {
    id: 'm1',
    userId,
    companyId,
    role: UserRole.MANAGER,
    isActive: true,
    restrictedModules: [] as AccessModule[],
    createdAt: new Date(),
  };
  const user = {
    id: userId,
    email: 'target@example.cl',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    lastLoginAt: null,
  };
  let targetMembership: typeof baseMembership;
  let prisma: { membership: { findUnique: jest.Mock; findFirst: jest.Mock } };
  let tx: {
    user: { update: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    membership: { update: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  };
  let service: UsersService;

  beforeEach(() => {
    hash.mockReset().mockResolvedValue('hashed-password');
    targetMembership = { ...baseMembership };
    prisma = {
      membership: {
        findUnique: jest.fn(async ({ where }) =>
          where.userId_companyId.userId === actorId
            ? { ...baseMembership, userId: actorId, role: UserRole.ADMIN }
            : targetMembership,
        ),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    tx = {
      user: {
        update: jest.fn().mockResolvedValue(user),
        findUnique: jest.fn().mockResolvedValue(user),
        create: jest.fn(async ({ data }) => ({
          ...user,
          memberships: [{ ...baseMembership, ...data.memberships.create }],
        })),
      },
      membership: {
        update: jest.fn(async ({ data }) => ({ ...targetMembership, ...data })),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ ...baseMembership, ...data })),
      },
    };
    const rls = { executeWithRls: jest.fn(async (_c, _a, callback) => callback(tx)) };
    service = new UsersService(prisma as never, rls as never);
  });

  const createDto = {
    firstName: 'Test',
    lastName: 'User',
    email: user.email,
    password: 'TestPass123',
    role: UserRole.MANAGER,
  };

  it('create with a restriction persists it and returns it on the list item', async () => {
    tx.user.findUnique.mockResolvedValue(null); // brand-new user → user.create branch
    const result = await service.create(companyId, actorId, {
      ...createDto,
      restrictedModules: [AccessModule.FINANZAS, AccessModule.RRHH],
    });
    expect(tx.user.create.mock.calls[0][0].data.memberships.create.restrictedModules).toEqual([
      AccessModule.FINANZAS,
      AccessModule.RRHH,
    ]);
    expect(result.restrictedModules).toEqual([AccessModule.FINANZAS, AccessModule.RRHH]);
  });

  it("create without the list stores [] (today's access) — existing-user branch", async () => {
    // tx.user.findUnique resolves the existing global user → membership.create branch
    const result = await service.create(companyId, actorId, createDto);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.membership.create.mock.calls[0][0].data.restrictedModules).toEqual([]);
    expect(result.restrictedModules).toEqual([]);
  });

  it('create: ADMIN with a restriction → 400 before any write', async () => {
    await expect(
      service.create(companyId, actorId, {
        ...createDto,
        role: UserRole.ADMIN,
        restrictedModules: [AccessModule.FINANZAS],
      }),
    ).rejects.toThrow('Un administrador ve todos los módulos.');
    expect(hash).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('update: restriction on a MANAGER is written as a full replacement', async () => {
    const result = await service.update(userId, companyId, actorId, {
      restrictedModules: [AccessModule.RRHH],
    });
    expect(tx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { restrictedModules: [AccessModule.RRHH] } }),
    );
    expect(result.restrictedModules).toEqual([AccessModule.RRHH]);
  });

  it('update: ADMIN + restriction → 400 (resulting role)', async () => {
    await expect(
      service.update(userId, companyId, actorId, {
        role: UserRole.ADMIN,
        restrictedModules: [AccessModule.FINANZAS],
      }),
    ).rejects.toThrow('Un administrador ve todos los módulos.');
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('update: an already-ADMIN target cannot receive a restriction', async () => {
    targetMembership = { ...baseMembership, role: UserRole.ADMIN };
    await expect(
      service.update(userId, companyId, actorId, { restrictedModules: [AccessModule.RRHH] }),
    ).rejects.toThrow('Un administrador ve todos los módulos.');
  });

  it('update: role raised to ADMIN without the list clears the blocks in the same write', async () => {
    targetMembership = { ...baseMembership, restrictedModules: [AccessModule.FINANZAS] };
    await service.update(userId, companyId, actorId, { role: UserRole.ADMIN });
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    expect(tx.membership.update.mock.calls[0][0].data).toEqual({
      role: UserRole.ADMIN,
      restrictedModules: [],
    });
  });

  it('update: role raised to ADMIN on an unrestricted member does not touch the list', async () => {
    await service.update(userId, companyId, actorId, { role: UserRole.ADMIN });
    expect(tx.membership.update.mock.calls[0][0].data).toEqual({ role: UserRole.ADMIN });
  });

  it('update: the actor changing their own access → 400 (mirror of the self-role lock)', async () => {
    await expect(
      service.update(actorId, companyId, actorId, { restrictedModules: [AccessModule.RRHH] }),
    ).rejects.toThrow('No puedes cambiar tu propio acceso.');
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('update: the actor re-sending their own unchanged (empty) list is a no-op, not an error', async () => {
    await expect(
      service.update(actorId, companyId, actorId, { firstName: 'Ana', restrictedModules: [] }),
    ).resolves.toBeDefined();
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('findAll projects restrictedModules per row', async () => {
    const list = await new UsersService(
      {
        membership: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { ...baseMembership, restrictedModules: [AccessModule.FINANZAS], user },
            ]),
        },
      } as never,
      {} as never,
    ).findAll(companyId);
    expect(list[0].restrictedModules).toEqual([AccessModule.FINANZAS]);
  });
});
