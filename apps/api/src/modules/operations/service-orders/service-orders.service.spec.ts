/* COM-013a — proves the ServiceOrder status machine (legal transitions + illegal jumps +
 * terminality + general-update rejects status), the per-company orderNumber sequence, and
 * the internal createFromHandoff seam (assigns a number, freezes the snapshot, defaults
 * RECIBIDA + null system createdBy). Stateful fake Prisma/RLS in the COM-006/quotes style;
 * no HTTP create exists so creation is exercised at the unit level. */
import { BadRequestException } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { CreateServiceOrderInput, ServiceOrdersService } from './service-orders.service';

type Any = Record<string, unknown>;
const S = ServiceOrderStatus;
const num = (d: unknown) => Number(d as number);

function makeService(seed: Any[] = []) {
  const orders: Any[] = [...seed];
  let seq = 1;
  const match = (r: Any, where: Any = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in (v as Any)) {
        return ((v as Any).in as unknown[]).includes(r[k]);
      }
      return r[k] === v;
    });
  const serviceOrder = {
    findFirst: jest.fn((args: Any = {}) => {
      let rs = orders.filter((r) => match(r, args.where as Any));
      if (args.orderBy) {
        const [k, dir] = Object.entries(args.orderBy as Any)[0] as [string, string];
        rs = [...rs].sort((a, b) => {
          const c = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
          return dir === 'desc' ? -c : c;
        });
      }
      return Promise.resolve(rs[0] ?? null);
    }),
    findMany: jest.fn((args: Any = {}) =>
      Promise.resolve(orders.filter((r) => match(r, args.where as Any))),
    ),
    create: jest.fn((args: Any) => {
      const row = { id: `so${seq++}`, ...(args.data as Any) };
      orders.push(row);
      return Promise.resolve({ ...row });
    }),
    update: jest.fn((args: Any) => {
      const r = orders.find((x) => x.id === (args.where as Any).id) as Any;
      Object.assign(r, args.data);
      return Promise.resolve({ ...r });
    }),
  };
  const prisma = { serviceOrder } as unknown as ConstructorParameters<
    typeof ServiceOrdersService
  >[0];
  const rls = {
    executeWithRls: (_c: string, _u: string | null, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof ServiceOrdersService>[1];
  return { svc: new ServiceOrdersService(prisma, rls), orders, serviceOrder };
}

const order = (status: ServiceOrderStatus, extra: Any = {}): Any => ({
  id: 'so1',
  companyId: 'c1',
  orderNumber: 'OS-0001',
  status,
  ...extra,
});

const validInput = (): CreateServiceOrderInput => ({
  clientName: 'Minera Los Andes SpA',
  title: 'Servicio de aseo faena norte',
  scopeLines: [{ serviceName: 'Aseo mensual', quantity: 2, unitPrice: 10000, lineTotal: 20000 }],
  netAmount: 20000,
  taxAmount: 3800,
  totalAmount: 23800,
});

describe('ServiceOrdersService — status machine', () => {
  it('RECIBIDA → EN_EJECUCION is allowed', async () => {
    const { svc, serviceOrder } = makeService([order(S.RECIBIDA)]);
    await svc.changeStatus('c1', 'u1', 'so1', { status: S.EN_EJECUCION });
    expect((serviceOrder.update.mock.calls[0][0] as Any).data).toEqual({ status: S.EN_EJECUCION });
  });

  it('EN_EJECUCION → COMPLETADA is allowed', async () => {
    const { svc, serviceOrder } = makeService([order(S.EN_EJECUCION)]);
    await svc.changeStatus('c1', 'u1', 'so1', { status: S.COMPLETADA });
    expect((serviceOrder.update.mock.calls[0][0] as Any).data).toEqual({ status: S.COMPLETADA });
  });

  it('CANCELADA is reachable from RECIBIDA and from EN_EJECUCION', async () => {
    for (const from of [S.RECIBIDA, S.EN_EJECUCION]) {
      const { svc, serviceOrder } = makeService([order(from)]);
      await svc.changeStatus('c1', 'u1', 'so1', { status: S.CANCELADA });
      expect((serviceOrder.update.mock.calls[0][0] as Any).data).toEqual({ status: S.CANCELADA });
    }
  });

  it('rejects the illegal jump RECIBIDA → COMPLETADA', async () => {
    const { svc, serviceOrder } = makeService([order(S.RECIBIDA)]);
    await expect(
      svc.changeStatus('c1', 'u1', 'so1', { status: S.COMPLETADA }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceOrder.update).not.toHaveBeenCalled();
  });

  it('rejects going backwards EN_EJECUCION → RECIBIDA', async () => {
    const { svc, serviceOrder } = makeService([order(S.EN_EJECUCION)]);
    await expect(
      svc.changeStatus('c1', 'u1', 'so1', { status: S.RECIBIDA }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceOrder.update).not.toHaveBeenCalled();
  });

  it('terminal states admit no transition (COMPLETADA / CANCELADA → 4xx)', async () => {
    for (const from of [S.COMPLETADA, S.CANCELADA]) {
      const { svc, serviceOrder } = makeService([order(from)]);
      await expect(
        svc.changeStatus('c1', 'u1', 'so1', { status: S.EN_EJECUCION }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(serviceOrder.update).not.toHaveBeenCalled();
    }
  });

  it('general update REJECTS a status edit', async () => {
    const { svc, serviceOrder } = makeService([order(S.RECIBIDA)]);
    await expect(
      svc.update('c1', 'u1', 'so1', { status: S.COMPLETADA } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceOrder.update).not.toHaveBeenCalled();
  });

  it('general update edits title/description/notes (not status)', async () => {
    const { svc, serviceOrder } = makeService([order(S.RECIBIDA)]);
    await svc.update('c1', 'u1', 'so1', { title: 'Nuevo título', notes: 'ok' } as never);
    expect((serviceOrder.update.mock.calls[0][0] as Any).data).toEqual({
      title: 'Nuevo título',
      notes: 'ok',
    });
  });
});

describe('ServiceOrdersService — createFromHandoff (internal seam)', () => {
  it('assigns per-company sequential orderNumber (OS-0001, OS-0002)', async () => {
    const { svc, orders } = makeService();
    const a = (await svc.createFromHandoff('c1', validInput())) as Any;
    const b = (await svc.createFromHandoff('c1', validInput())) as Any;
    expect(a.orderNumber).toBe('OS-0001');
    expect(b.orderNumber).toBe('OS-0002');
    expect(orders).toHaveLength(2);
  });

  it('freezes the scope snapshot + amounts, defaults RECIBIDA + null system createdBy', async () => {
    const { svc } = makeService();
    const o = (await svc.createFromHandoff('c1', validInput())) as Any;
    expect(o.status).toBe(S.RECIBIDA);
    expect(o.clientName).toBe('Minera Los Andes SpA');
    expect(o.scopeLines).toEqual([
      { serviceName: 'Aseo mensual', quantity: 2, unitPrice: 10000, lineTotal: 20000 },
    ]);
    expect(num(o.netAmount)).toBe(20000);
    expect(num(o.taxAmount)).toBe(3800);
    expect(num(o.totalAmount)).toBe(23800);
    expect(o.currency).toBe('CLP');
    expect(o.createdBy).toBeNull(); // system-created by the handler
    expect(o.counterpartyId).toBeNull(); // no counterparty linked
  });

  it('carries the soft provenance ids + optional counterparty when provided', async () => {
    const { svc } = makeService();
    const o = (await svc.createFromHandoff('c1', {
      ...validInput(),
      counterpartyId: 'cp1',
      sourceOpportunityId: 'opp1',
      sourceQuoteId: 'q1',
      ownerId: 'owner1',
      createdBy: 'u9',
    })) as Any;
    expect(o.counterpartyId).toBe('cp1');
    expect(o.sourceOpportunityId).toBe('opp1');
    expect(o.sourceQuoteId).toBe('q1');
    expect(o.ownerId).toBe('owner1');
    expect(o.createdBy).toBe('u9');
  });

  it('findBySourceOpportunity is the idempotency seam for COM-013b', async () => {
    const { svc } = makeService();
    await svc.createFromHandoff('c1', { ...validInput(), sourceOpportunityId: 'opp1' });
    const found = (await svc.findBySourceOpportunity('c1', 'opp1')) as Any;
    expect(found).not.toBeNull();
    expect(found.sourceOpportunityId).toBe('opp1');
    const missing = await svc.findBySourceOpportunity('c1', 'oppZ');
    expect(missing).toBeNull();
  });
});
