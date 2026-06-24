/* HR-004a — proves the copy-adapted invariants at the service layer with fake
 * Prisma/RLS/Storage clients (same style as employees.security.spec.ts):
 *   - uploader ≠ approver (self-approval 403)
 *   - approve only from PENDING_REVIEW
 *   - immutable supersession: new version created + old marked REPLACED
 *   - supersede refuses non-APPROVED / already-superseded
 *   - compliance EXCLUDES REPLACED rows
 *   - mime/size validation rejects bad files
 *   - duplicate approved upload → 409 conflict
 */
import { ConflictException } from '@nestjs/common';
import { EmployeeDocumentsService } from './employee-documents.service';

type Any = Record<string, unknown>;

function makeService(opts: {
  prisma?: Any;
  storageConfigured?: boolean;
  tx?: Any;
  requirements?: Any;
}) {
  const tx = opts.tx ?? {};
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof EmployeeDocumentsService>[1];
  const storage = {
    isConfigured: () => opts.storageConfigured ?? false,
    uploadFile: () => Promise.resolve('key'),
    downloadFile: () => Promise.resolve(Buffer.from('x')),
  } as unknown as ConstructorParameters<typeof EmployeeDocumentsService>[2];
  const requirements = (opts.requirements ?? {}) as unknown as ConstructorParameters<
    typeof EmployeeDocumentsService
  >[3];
  return new EmployeeDocumentsService(
    (opts.prisma ?? {}) as unknown as ConstructorParameters<typeof EmployeeDocumentsService>[0],
    rls,
    storage,
    requirements,
  );
}

const goodFile = {
  originalname: 'contrato.pdf',
  mimetype: 'application/pdf',
  size: 1234,
  buffer: Buffer.from('hello'),
} as unknown as Express.Multer.File;

describe('EmployeeDocumentsService — approve (uploader ≠ approver)', () => {
  it('rejects self-approval with 403', async () => {
    const prisma = {
      employeeDocument: {
        findFirst: () =>
          Promise.resolve({ id: 'doc-1', status: 'PENDING_REVIEW', uploadedBy: 'user-1' }),
      },
    };
    const svc = makeService({ prisma });
    await expect(svc.approve('doc-1', 'company-1', 'user-1')).rejects.toThrow(
      /No puedes aprobar un documento que tú mismo cargaste/,
    );
  });

  it('rejects approval when not PENDING_REVIEW', async () => {
    const prisma = {
      employeeDocument: {
        findFirst: () => Promise.resolve({ id: 'doc-1', status: 'DRAFT', uploadedBy: 'user-2' }),
      },
    };
    const svc = makeService({ prisma });
    await expect(svc.approve('doc-1', 'company-1', 'user-1')).rejects.toThrow(/PENDIENTE_REVISION/);
  });

  it('approves (different user) → status APPROVED + approvalStatus APROBADO', async () => {
    const captured: Any[] = [];
    const tx = {
      employeeDocument: {
        update: (args: Any) => {
          captured.push(args);
          return Promise.resolve({
            id: 'doc-1',
            status: 'APPROVED',
            expiryDate: null,
            documentType: {},
          });
        },
      },
    };
    const prisma = {
      employeeDocument: {
        findFirst: () =>
          Promise.resolve({ id: 'doc-1', status: 'PENDING_REVIEW', uploadedBy: 'uploader' }),
      },
    };
    const svc = makeService({ prisma, tx });
    const res = await svc.approve('doc-1', 'company-1', 'approver');
    const data = captured[0].data as Any;
    expect(data.status).toBe('APPROVED');
    expect(data.approvalStatus).toBe('APROBADO');
    expect(data.approvedBy).toBe('approver');
    expect((res as Any).derivedStatus).toBe('APROBADO');
  });
});

describe('EmployeeDocumentsService — immutable supersession', () => {
  const refsPrisma = (extra: Any) => ({
    employee: { findFirst: () => Promise.resolve({ id: 'emp-1' }) },
    employeeDocumentType: {
      findFirst: () =>
        Promise.resolve({ id: 'dt-1', requiresExpiry: false, defaultValidityDays: null }),
    },
    employeeDocument: {
      aggregate: () => Promise.resolve({ _max: { version: 1 } }),
      ...extra,
    },
  });

  it('refuses to supersede a non-APPROVED document', async () => {
    const prisma = refsPrisma({
      findFirst: () =>
        Promise.resolve({
          id: 'old',
          employeeId: 'emp-1',
          documentTypeId: 'dt-1',
          status: 'DRAFT',
          supersededById: null,
          version: 1,
        }),
    });
    const svc = makeService({ prisma });
    await expect(svc.supersedeDocument('company-1', 'u1', 'old', {}, goodFile)).rejects.toThrow(
      /Solo se pueden reemplazar documentos APROBADOS/,
    );
  });

  it('refuses to supersede an already-superseded document', async () => {
    const prisma = refsPrisma({
      findFirst: () =>
        Promise.resolve({
          id: 'old',
          employeeId: 'emp-1',
          documentTypeId: 'dt-1',
          status: 'APPROVED',
          supersededById: 'newer',
          version: 1,
        }),
    });
    const svc = makeService({ prisma });
    await expect(svc.supersedeDocument('company-1', 'u1', 'old', {}, goodFile)).rejects.toThrow(
      /ya fue reemplazado/,
    );
  });

  it('creates a new version (v2) and marks the old row REPLACED → supersededById set', async () => {
    const captured: Any[] = [];
    const tx = {
      employeeDocument: {
        create: (args: Any) => {
          captured.push({ op: 'create', args });
          return Promise.resolve({
            id: 'new-id',
            status: 'DRAFT',
            expiryDate: null,
            documentType: {},
          });
        },
        update: (args: Any) => {
          captured.push({ op: 'update', args });
          return Promise.resolve({
            id: 'old',
            status: 'REPLACED',
            expiryDate: null,
            documentType: {},
          });
        },
      },
    };
    const prisma = refsPrisma({
      findFirst: () =>
        Promise.resolve({
          id: 'old',
          employeeId: 'emp-1',
          documentTypeId: 'dt-1',
          status: 'APPROVED',
          supersededById: null,
          version: 1,
        }),
    });
    const svc = makeService({ prisma, tx });
    const res = (await svc.supersedeDocument('company-1', 'u1', 'old', {}, goodFile)) as Any;

    const create = captured.find((c) => c.op === 'create')!.args.data as Any;
    const update = captured.find((c) => c.op === 'update')!.args as Any;
    expect(create.version).toBe(2); // monotonic: _max(1) + 1
    expect((update.data as Any).status).toBe('REPLACED');
    expect((update.data as Any).supersededById).toBe('new-id'); // points at the new row
    expect((res.newDocument as Any).derivedStatus).toBe('BORRADOR');
    expect((res.replacedDocument as Any).derivedStatus).toBe('REEMPLAZADO');
  });
});

describe('EmployeeDocumentsService — compliance excludes REPLACED', () => {
  it('a REPLACED-only requirement counts as FALTANTE, not present', async () => {
    const prisma = {
      employee: {
        findFirst: () => Promise.resolve({ id: 'emp-1', fullName: 'Juan', jobPositionId: null }),
      },
      employeeDocument: {
        findMany: () =>
          Promise.resolve([
            {
              documentTypeId: 'dt-1',
              status: 'REPLACED',
              supersededById: 'z',
              expiryDate: null,
              version: 1,
              createdAt: new Date('2026-01-01'),
              documentType: { id: 'dt-1', name: 'Contrato' },
            },
          ]),
      },
    };
    const requirements = {
      resolveRequirementsForEmployee: () =>
        Promise.resolve([
          {
            documentTypeId: 'dt-1',
            documentType: { id: 'dt-1', name: 'Contrato' },
            isMandatory: true,
            appliesToClient: null,
            appliesToSite: null,
            resolvedFrom: 'employee',
          },
        ]),
    };
    const svc = makeService({ prisma, requirements });
    const res = (await svc.compliance('company-1', 'emp-1')) as Any;
    const compliance = res.compliance as Any;
    expect(compliance.totalRequired).toBe(1);
    expect(compliance.missing).toBe(1);
    expect(compliance.valid).toBe(0);
    const required = res.requiredDocuments as Any[];
    expect((required[0] as Any).derivedStatus).toBe('FALTANTE');
    expect((required[0] as Any).latestRecord).toBeNull(); // REPLACED row not surfaced
  });
});

describe('EmployeeDocumentsService — upload validation + conflict', () => {
  it('rejects an oversized file before any DB write', async () => {
    const big = { ...goodFile, size: 11 * 1024 * 1024 } as unknown as Express.Multer.File;
    const svc = makeService({});
    await expect(
      svc.create('company-1', 'u1', { employeeId: 'e', documentTypeId: 'd' } as Any, big),
    ).rejects.toThrow(/excede el límite de 10 MB/);
  });

  it('rejects a disallowed format', async () => {
    const bad = {
      originalname: 'evil.exe',
      mimetype: 'application/x-msdownload',
      size: 10,
      buffer: Buffer.from('x'),
    } as unknown as Express.Multer.File;
    const svc = makeService({});
    await expect(
      svc.create('company-1', 'u1', { employeeId: 'e', documentTypeId: 'd' } as Any, bad),
    ).rejects.toThrow(/Formato no permitido/);
  });

  it('returns 409 when an approved doc of the same type already exists', async () => {
    const prisma = {
      employee: { findFirst: () => Promise.resolve({ id: 'emp-1' }) },
      employeeDocumentType: {
        findFirst: () =>
          Promise.resolve({ id: 'dt-1', requiresExpiry: false, defaultValidityDays: null }),
      },
      employeeDocument: {
        findFirst: () => Promise.resolve({ id: 'existing-approved' }),
      },
    };
    const svc = makeService({ prisma });
    await expect(
      svc.create(
        'company-1',
        'u1',
        { employeeId: 'emp-1', documentTypeId: 'dt-1' } as Any,
        goodFile,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
