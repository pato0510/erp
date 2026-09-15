/* COM-017 — proves the document rules: the opportunity must exist in the caller's
 * company (foreign/missing → 404, NO storage call); validation runs BEFORE storage
 * (bad extension / mismatched MIME / > 20 MB → 400, no upload; octet-stream tolerated when
 * the extension is allowlisted, storing the derived MIME); filename sanitization;
 * createdBy from the JWT user, never input; storage key layout; unavailable storage →
 * 503; soft delete (author → deletedAt set, no storage delete; non-author MANAGER → 403;
 * ADMIN → ok); list excludes soft-deleted and is createdAt DESC; download of a
 * soft-deleted / foreign document → 404 with NO storage call, live → the bytes via the
 * same StorageService.downloadFile call RRHH uses.
 * Stateful fake Prisma/RLS + mocked StorageService, real factory abilities (same style
 * as opportunity-notes.service.spec.ts). */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OpportunityDocumentKind, UserRole } from '@prisma/client';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import { OpportunityDocumentsService, sanitizeFileName } from './opportunity-documents.service';

type Any = Record<string, unknown>;

interface Seed {
  opps?: Record<string, string>; // id -> companyId (default o1 in c1, oX in OTHER)
  docs?: Any[];
  storageConfigured?: boolean;
  uploadFails?: boolean;
}

function makeService(seed: Seed = {}) {
  const opps: Record<string, string> = seed.opps ?? { o1: 'c1', oX: 'OTHER' };
  const docs: Any[] = seed.docs ? [...seed.docs] : [];
  let seq = 1;

  const opportunityDocument = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      const found = docs.find(
        (d) =>
          d.id === w.id &&
          d.companyId === w.companyId &&
          (w.deletedAt === undefined || (d.deletedAt ?? null) === w.deletedAt),
      );
      return Promise.resolve(found ?? null);
    }),
    findMany: jest.fn((args: Any) => {
      const w = (args.where as Any) ?? {};
      let rows = docs.filter(
        (d) =>
          (w.companyId === undefined || d.companyId === w.companyId) &&
          (w.opportunityId === undefined || d.opportunityId === w.opportunityId) &&
          (w.deletedAt === undefined || (d.deletedAt ?? null) === w.deletedAt),
      );
      rows = rows
        .slice()
        .sort(
          (x, y) =>
            new Date(y.createdAt as string).getTime() - new Date(x.createdAt as string).getTime(),
        );
      return Promise.resolve(rows);
    }),
    create: jest.fn((args: Any) => {
      const row = { id: `d${seq++}`, createdAt: new Date().toISOString(), ...(args.data as Any) };
      docs.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn((args: Any) => {
      const row = docs.find((d) => d.id === (args.where as Any).id) as Any;
      Object.assign(row, args.data);
      return Promise.resolve(row);
    }),
    delete: jest.fn(() => Promise.reject(new Error('hard delete must never be called'))),
  };
  const opportunity = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      return Promise.resolve(opps[w.id as string] === w.companyId ? { id: w.id } : null);
    }),
  };
  const storage = {
    isConfigured: jest.fn(() => seed.storageConfigured ?? true),
    uploadFile: jest.fn((_b: string, key: string) =>
      seed.uploadFails ? Promise.reject(new Error('boom')) : Promise.resolve(key),
    ),
    downloadFile: jest.fn((_b: string, key: string) =>
      Promise.resolve(Buffer.from(`bytes:${key}`)),
    ),
    // deliberately NO delete method — the service must never remove objects
  };

  const prisma = { opportunityDocument, opportunity } as unknown as ConstructorParameters<
    typeof OpportunityDocumentsService
  >[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof OpportunityDocumentsService>[1];
  const storageSvc = storage as unknown as ConstructorParameters<
    typeof OpportunityDocumentsService
  >[2];

  return {
    svc: new OpportunityDocumentsService(prisma, rls, storageSvc),
    docs,
    opportunityDocument,
    storage,
  };
}

const factory = new CaslAbilityFactory();
const abilityOf = (role: UserRole) => factory.defineAbilityFor(role);

function makeFile(over: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: 'cotizacion.pdf',
    mimetype: 'application/pdf',
    size: 1234,
    buffer: Buffer.from('pdf'),
    ...over,
  } as unknown as Express.Multer.File;
}

const dto = { opportunityId: 'o1', kind: OpportunityDocumentKind.COTIZACION };
const own = {
  id: 'd-own',
  companyId: 'c1',
  opportunityId: 'o1',
  kind: 'OTRO',
  fileName: 'mio.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  storageKey: 'companies/c1/opportunities/o1/x-mio.pdf',
  createdBy: 'u1',
  createdAt: '2026-01-01T10:00:00Z',
  deletedAt: null,
};
const theirs = { ...own, id: 'd-theirs', createdBy: 'u2' };

describe('OpportunityDocumentsService — tenant scoping (no storage call)', () => {
  it('create REJECTS a missing opportunity with 404', async () => {
    const { svc, storage, opportunityDocument } = makeService();
    await expect(
      svc.create('c1', 'u1', { ...dto, opportunityId: 'nope' }, makeFile()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(opportunityDocument.create).not.toHaveBeenCalled();
  });

  it('create REJECTS a foreign-company opportunity with the SAME 404', async () => {
    const { svc, storage } = makeService();
    await expect(
      svc.create('c1', 'u1', { ...dto, opportunityId: 'oX' }, makeFile()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('list REJECTS a foreign/missing opportunity with 404', async () => {
    const { svc } = makeService();
    await expect(svc.findAllByOpportunity('c1', 'oX')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.findAllByOpportunity('c1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('download/delete of a document from ANOTHER company → 404', async () => {
    const foreign = { ...own, id: 'd-f', companyId: 'OTHER' };
    const { svc } = makeService({ docs: [foreign] });
    await expect(svc.downloadFile('c1', 'd-f')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove('c1', 'u1', 'd-f', abilityOf(UserRole.ADMIN))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('OpportunityDocumentsService — file validation BEFORE storage', () => {
  it('missing file → 400', async () => {
    const { svc, storage } = makeService();
    await expect(svc.create('c1', 'u1', dto, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('extension not allowlisted (.exe / .webp / no extension) → 400, no upload — whatever the MIME', async () => {
    const cases = [
      { mimetype: 'application/x-msdownload', originalname: 'setup.exe' },
      { mimetype: 'image/webp', originalname: 'foto.webp' },
      { mimetype: 'application/pdf', originalname: 'sin-extension' },
    ];
    for (const c of cases) {
      const { svc, storage } = makeService();
      await expect(svc.create('c1', 'u1', dto, makeFile(c))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storage.uploadFile).not.toHaveBeenCalled();
    }
  });

  it('declared MIME that disagrees with the extension → 400 (pdf MIME + .docx; png MIME + .pdf; png MIME + .docx)', async () => {
    const cases = [
      { mimetype: 'application/pdf', originalname: 'acta.docx' },
      { mimetype: 'image/png', originalname: 'foto.pdf' },
      { mimetype: 'image/png', originalname: 'acta.docx' },
    ];
    for (const c of cases) {
      const { svc, storage } = makeService();
      await expect(svc.create('c1', 'u1', dto, makeFile(c))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storage.uploadFile).not.toHaveBeenCalled();
    }
  });

  it('application/octet-stream + allowlisted extension → accepted, storing the MIME derived from the extension', async () => {
    const { svc, storage } = makeService();
    const row = (await svc.create(
      'c1',
      'u1',
      dto,
      makeFile({ mimetype: 'application/octet-stream', originalname: 'acta.docx' }),
    )) as Any;
    expect(row.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(String),
      row.storageKey,
      expect.any(Buffer),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('application/octet-stream + .exe → 400, no upload', async () => {
    const { svc, storage } = makeService();
    await expect(
      svc.create(
        'c1',
        'u1',
        dto,
        makeFile({ mimetype: 'application/octet-stream', originalname: 'setup.exe' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('jpeg accepts both .jpg and .jpeg', async () => {
    for (const originalname of ['foto.jpg', 'foto.JPEG']) {
      const { svc } = makeService();
      const row = (await svc.create(
        'c1',
        'u1',
        dto,
        makeFile({ mimetype: 'image/jpeg', originalname }),
      )) as Any;
      expect(row.fileName).toBe(originalname);
    }
  });

  it('> 20 MB → 400, no upload; exactly 20 MB accepted', async () => {
    const { svc, storage } = makeService();
    await expect(
      svc.create('c1', 'u1', dto, makeFile({ size: 20 * 1024 * 1024 + 1 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    const row = (await svc.create('c1', 'u1', dto, makeFile({ size: 20 * 1024 * 1024 }))) as Any;
    expect(row.sizeBytes).toBe(20 * 1024 * 1024);
  });

  it('empty file → 400', async () => {
    const { svc } = makeService();
    await expect(svc.create('c1', 'u1', dto, makeFile({ size: 0 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('sanitizeFileName', () => {
  it('strips path separators (keeps the last segment)', () => {
    expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('C:\\Users\\pato\\Acta.docx')).toBe('Acta.docx');
  });

  it('strips control characters and collapses whitespace', () => {
    expect(sanitizeFileName('acta\u0000  de \treunión\u001f.pdf')).toBe('acta de reunión.pdf');
    expect(sanitizeFileName('   cotización   final .xlsx ')).toBe('cotización final .xlsx');
  });

  it('caps at 200 chars and PRESERVES the extension', () => {
    const out = sanitizeFileName('a'.repeat(300) + '.pdf');
    expect(out.length).toBe(200);
    expect(out.endsWith('.pdf')).toBe(true);
  });

  it('rejects names with nothing usable', () => {
    expect(() => sanitizeFileName('')).toThrow(BadRequestException);
    expect(() => sanitizeFileName('   ')).toThrow(BadRequestException);
    expect(() => sanitizeFileName('/')).toThrow(BadRequestException);
    expect(() => sanitizeFileName('..')).toThrow(BadRequestException);
  });
});

describe('OpportunityDocumentsService — create', () => {
  it('sets createdBy from the JWT user, NEVER from input; persists derived file fields', async () => {
    const { svc, storage } = makeService();
    const row = (await svc.create(
      'c1',
      'u1',
      { ...dto, createdBy: 'attacker' } as never,
      makeFile({ originalname: ' Cotización Nº 12.pdf' }),
    )) as Any;
    expect(row.createdBy).toBe('u1');
    expect(row.companyId).toBe('c1');
    expect(row.opportunityId).toBe('o1');
    expect(row.kind).toBe(OpportunityDocumentKind.COTIZACION);
    expect(row.fileName).toBe('Cotización Nº 12.pdf');
    expect(row.mimeType).toBe('application/pdf');
    expect(row.sizeBytes).toBe(1234);
    expect(row.storageKey).toMatch(
      /^companies\/c1\/opportunities\/o1\/[0-9a-f-]{36}-Cotizaci_n_N_12\.pdf$/,
    );
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(String),
      row.storageKey,
      expect.any(Buffer),
      'application/pdf',
    );
  });

  it('storage NOT configured → 503, no row written (no blob fallback by design)', async () => {
    const { svc, storage, opportunityDocument } = makeService({ storageConfigured: false });
    await expect(svc.create('c1', 'u1', dto, makeFile())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(opportunityDocument.create).not.toHaveBeenCalled();
  });

  it('storage upload failure → 503, no row written', async () => {
    const { svc, opportunityDocument } = makeService({ uploadFails: true });
    await expect(svc.create('c1', 'u1', dto, makeFile())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(opportunityDocument.create).not.toHaveBeenCalled();
  });
});

describe('OpportunityDocumentsService — soft delete (author or ADMIN/SUPER_ADMIN)', () => {
  it('author (MANAGER ability) → deletedAt set, row kept, NO storage delete', async () => {
    const { svc, docs, opportunityDocument } = makeService({ docs: [{ ...own }] });
    const row = (await svc.remove('c1', 'u1', 'd-own', abilityOf(UserRole.MANAGER))) as Any;
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(docs).toHaveLength(1);
    expect(opportunityDocument.delete).not.toHaveBeenCalled();
  });

  it('non-author MANAGER → 403 (no write)', async () => {
    const { svc, opportunityDocument } = makeService({ docs: [{ ...theirs }] });
    await expect(
      svc.remove('c1', 'u1', 'd-theirs', abilityOf(UserRole.MANAGER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(opportunityDocument.update).not.toHaveBeenCalled();
  });

  it('non-author ADMIN and SUPER_ADMIN → ok (manage)', async () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      const { svc } = makeService({ docs: [{ ...theirs }] });
      const row = (await svc.remove('c1', 'u1', 'd-theirs', abilityOf(role))) as Any;
      expect(row.deletedAt).toBeInstanceOf(Date);
    }
  });

  it('already soft-deleted → 404', async () => {
    const gone = { ...own, deletedAt: new Date('2026-02-01T00:00:00Z') };
    const { svc } = makeService({ docs: [gone] });
    await expect(svc.remove('c1', 'u1', 'd-own', abilityOf(UserRole.ADMIN))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('OpportunityDocumentsService — list & download', () => {
  const rows: Any[] = [
    { ...own, id: 'old', createdAt: '2026-01-01T10:00:00Z' },
    { ...own, id: 'new', createdAt: '2026-03-01T10:00:00Z' },
    { ...own, id: 'gone', createdAt: '2026-04-01T10:00:00Z', deletedAt: new Date() },
    { ...own, id: 'mid', createdAt: '2026-02-01T10:00:00Z' },
    { ...own, id: 'other-opp', opportunityId: 'o2', createdAt: '2026-05-01T10:00:00Z' },
  ];

  it('returns ONLY that opportunity’s LIVE documents, createdAt DESC', async () => {
    const { svc, opportunityDocument } = makeService({ opps: { o1: 'c1', o2: 'c1' }, docs: rows });
    const list = (await svc.findAllByOpportunity('c1', 'o1')) as Any[];
    expect(list.map((d) => d.id)).toEqual(['new', 'mid', 'old']);
    expect(opportunityDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'c1', opportunityId: 'o1', deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
      }),
    );
  });

  it('download of a live document → the bytes + stored mimeType/fileName via StorageService.downloadFile', async () => {
    const { svc, storage } = makeService({ docs: rows });
    const res = await svc.downloadFile('c1', 'new');
    expect(res.buffer.toString()).toBe(`bytes:${own.storageKey}`);
    expect(res.mimeType).toBe('application/pdf');
    expect(res.fileName).toBe('mio.pdf');
    expect(storage.downloadFile).toHaveBeenCalledWith(expect.any(String), own.storageKey);
  });

  it('download of a soft-deleted document → 404, no storage call', async () => {
    const { svc, storage } = makeService({ docs: rows });
    await expect(svc.downloadFile('c1', 'gone')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.downloadFile).not.toHaveBeenCalled();
  });
});
