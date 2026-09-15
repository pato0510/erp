/* COM-016 — proves the note rules: the opportunity must exist in the caller's company
 * (foreign/missing → 404, never a cross-tenant leak); createdBy comes from the JWT user,
 * never the DTO; author-only update (non-author → 403); author-or-ADMIN delete
 * (non-author MANAGER → 403, ADMIN → ok via `manage`); empty/whitespace/oversized body
 * → 400 (before any write); the list is createdAt DESC. Stateful fake Prisma/RLS (same
 * style as activities.service.spec.ts). Abilities are REAL factory-built abilities per
 * role, so the delete rule is pinned to CASL, not to a role string. */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import { OpportunityNotesService } from './opportunity-notes.service';

type Any = Record<string, unknown>;

interface Seed {
  opps?: Record<string, string>; // id -> companyId (default o1 in c1, oX in OTHER)
  notes?: Any[];
}

function makeService(seed: Seed = {}) {
  const opps: Record<string, string> = seed.opps ?? { o1: 'c1', oX: 'OTHER' };
  const notes: Any[] = seed.notes ? [...seed.notes] : [];
  let seq = 1;

  const opportunityNote = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      const found = notes.find((n) => n.id === w.id && n.companyId === w.companyId);
      return Promise.resolve(found ?? null);
    }),
    findMany: jest.fn((args: Any) => {
      const w = (args.where as Any) ?? {};
      let rows = notes.filter(
        (n) =>
          (w.companyId === undefined || n.companyId === w.companyId) &&
          (w.opportunityId === undefined || n.opportunityId === w.opportunityId),
      );
      // orderBy createdAt DESC (the only ordering the service uses)
      rows = rows
        .slice()
        .sort(
          (x, y) =>
            new Date(y.createdAt as string).getTime() - new Date(x.createdAt as string).getTime(),
        );
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      return Promise.resolve(rows);
    }),
    create: jest.fn((args: Any) => {
      const row = { id: `n${seq++}`, createdAt: new Date().toISOString(), ...(args.data as Any) };
      notes.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn((args: Any) => {
      const row = notes.find((n) => n.id === (args.where as Any).id) as Any;
      Object.assign(row, args.data);
      return Promise.resolve(row);
    }),
    delete: jest.fn((args: Any) => {
      const idx = notes.findIndex((n) => n.id === (args.where as Any).id);
      const [row] = notes.splice(idx, 1);
      return Promise.resolve(row);
    }),
  };
  const opportunity = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      return Promise.resolve(opps[w.id as string] === w.companyId ? { id: w.id } : null);
    }),
  };

  const prisma = { opportunityNote, opportunity } as unknown as ConstructorParameters<
    typeof OpportunityNotesService
  >[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof OpportunityNotesService>[1];

  return { svc: new OpportunityNotesService(prisma, rls), notes, opportunityNote };
}

const factory = new CaslAbilityFactory();
const abilityOf = (role: UserRole) => factory.defineAbilityFor(role);

const own = { id: 'n-own', companyId: 'c1', opportunityId: 'o1', body: 'mía', createdBy: 'u1' };
const theirs = {
  id: 'n-theirs',
  companyId: 'c1',
  opportunityId: 'o1',
  body: 'de otro',
  createdBy: 'u2',
};

describe('OpportunityNotesService — tenant scoping', () => {
  it('create REJECTS a missing opportunity with 404', async () => {
    const { svc, opportunityNote } = makeService();
    await expect(
      svc.create('c1', 'u1', { opportunityId: 'nope', body: 'hola' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(opportunityNote.create).not.toHaveBeenCalled();
  });

  it('create REJECTS a foreign-company opportunity with the SAME 404 (no existence leak)', async () => {
    const { svc, opportunityNote } = makeService(); // oX belongs to OTHER
    await expect(
      svc.create('c1', 'u1', { opportunityId: 'oX', body: 'hola' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(opportunityNote.create).not.toHaveBeenCalled();
  });

  it('list REJECTS a foreign/missing opportunity with 404', async () => {
    const { svc } = makeService();
    await expect(svc.findAllByOpportunity('c1', 'oX')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.findAllByOpportunity('c1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update/delete of a note from ANOTHER company → 404 (scoped lookup)', async () => {
    const foreign = { ...own, id: 'n-f', companyId: 'OTHER' };
    const { svc } = makeService({ notes: [foreign] });
    await expect(svc.update('c1', 'u1', 'n-f', { body: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.remove('c1', 'u1', 'n-f', abilityOf(UserRole.ADMIN))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('OpportunityNotesService — create', () => {
  it('sets createdBy from the JWT user, NEVER from the DTO', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', {
      opportunityId: 'o1',
      body: 'hola',
      createdBy: 'attacker',
    } as never)) as Any;
    expect(row.createdBy).toBe('u1');
    expect(row.companyId).toBe('c1');
    expect(row.opportunityId).toBe('o1');
  });

  it('TRIMS the body and preserves inner line breaks', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', {
      opportunityId: 'o1',
      body: '  línea 1\nlínea 2  \n',
    })) as Any;
    expect(row.body).toBe('línea 1\nlínea 2');
  });

  it('REJECTS an empty / whitespace-only body with 400 (no write)', async () => {
    const { svc, opportunityNote } = makeService();
    await expect(svc.create('c1', 'u1', { opportunityId: 'o1', body: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.create('c1', 'u1', { opportunityId: 'o1', body: '   \n\t ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(opportunityNote.create).not.toHaveBeenCalled();
  });

  it('REJECTS a body over 5000 chars with 400 (no write)', async () => {
    const { svc, opportunityNote } = makeService();
    await expect(
      svc.create('c1', 'u1', { opportunityId: 'o1', body: 'a'.repeat(5001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(opportunityNote.create).not.toHaveBeenCalled();
  });

  it('ACCEPTS exactly 5000 chars', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', {
      opportunityId: 'o1',
      body: 'a'.repeat(5000),
    })) as Any;
    expect((row.body as string).length).toBe(5000);
  });
});

describe('OpportunityNotesService — update (author only)', () => {
  it('ALLOWS the author to edit', async () => {
    const { svc } = makeService({ notes: [{ ...own }] });
    const row = (await svc.update('c1', 'u1', 'n-own', { body: ' editada ' })) as Any;
    expect(row.body).toBe('editada');
  });

  it('REJECTS a non-author with 403 (no write) — even an ADMIN', async () => {
    const { svc, opportunityNote } = makeService({ notes: [{ ...theirs }] });
    await expect(svc.update('c1', 'u1', 'n-theirs', { body: 'hack' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(opportunityNote.update).not.toHaveBeenCalled();
  });

  it('REJECTS an empty / oversized body with 400', async () => {
    const { svc, opportunityNote } = makeService({ notes: [{ ...own }] });
    await expect(svc.update('c1', 'u1', 'n-own', { body: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.update('c1', 'u1', 'n-own', { body: 'b'.repeat(5001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(opportunityNote.update).not.toHaveBeenCalled();
  });
});

describe('OpportunityNotesService — delete (author or ADMIN/SUPER_ADMIN)', () => {
  it('ALLOWS the author (MANAGER ability) to delete their own note', async () => {
    const { svc, notes } = makeService({ notes: [{ ...own }] });
    await svc.remove('c1', 'u1', 'n-own', abilityOf(UserRole.MANAGER));
    expect(notes).toHaveLength(0);
  });

  it('REJECTS a non-author MANAGER with 403 (no write)', async () => {
    const { svc, opportunityNote } = makeService({ notes: [{ ...theirs }] });
    await expect(
      svc.remove('c1', 'u1', 'n-theirs', abilityOf(UserRole.MANAGER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(opportunityNote.delete).not.toHaveBeenCalled();
  });

  it('ALLOWS a non-author ADMIN and SUPER_ADMIN to delete any note (manage)', async () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      const { svc, notes } = makeService({ notes: [{ ...theirs }] });
      await svc.remove('c1', 'u1', 'n-theirs', abilityOf(role));
      expect(notes).toHaveLength(0);
    }
  });
});

describe('OpportunityNotesService — list ordering', () => {
  const rows: Any[] = [
    { ...own, id: 'old', createdAt: '2026-01-01T10:00:00Z' },
    { ...own, id: 'new', createdAt: '2026-03-01T10:00:00Z' },
    { ...own, id: 'mid', createdAt: '2026-02-01T10:00:00Z' },
    { ...own, id: 'other-opp', opportunityId: 'o2', createdAt: '2026-04-01T10:00:00Z' },
  ];

  it('returns ONLY that opportunity’s notes, createdAt DESC', async () => {
    const { svc, opportunityNote } = makeService({ opps: { o1: 'c1', o2: 'c1' }, notes: rows });
    const list = (await svc.findAllByOpportunity('c1', 'o1')) as Any[];
    expect(list.map((n) => n.id)).toEqual(['new', 'mid', 'old']);
    expect(opportunityNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }] }),
    );
  });

  it('clamps the limit (default 100, max 200)', async () => {
    const { svc, opportunityNote } = makeService({ notes: rows });
    await svc.findAllByOpportunity('c1', 'o1');
    expect(opportunityNote.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    await svc.findAllByOpportunity('c1', 'o1', 999);
    expect(opportunityNote.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 200 }),
    );
    await svc.findAllByOpportunity('c1', 'o1', 2);
    expect(opportunityNote.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 2 }));
  });
});
