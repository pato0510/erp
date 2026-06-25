/* HR-005 — proves the RrhhRemindersProcessor runs BOTH contract and document
 * reminders on the daily schedule (it dispatches each sibling job to its service),
 * without replacing contracts. */
import { RrhhRemindersProcessor } from './rrhh-reminders.processor';

type Any = Record<string, unknown>;

function makeProcessor() {
  const contractReminders = {
    runForAllCompanies: jest.fn().mockResolvedValue({ tag: 'contracts' }),
  };
  const documentReminders = {
    runForAllCompanies: jest.fn().mockResolvedValue({ tag: 'documents' }),
  };
  const queue = {
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn(),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const proc = new RrhhRemindersProcessor(
    contractReminders as unknown as ConstructorParameters<typeof RrhhRemindersProcessor>[0],
    documentReminders as unknown as ConstructorParameters<typeof RrhhRemindersProcessor>[1],
    queue as unknown as ConstructorParameters<typeof RrhhRemindersProcessor>[2],
  );
  return { proc, contractReminders, documentReminders, queue };
}

describe('RrhhRemindersProcessor', () => {
  it('registers BOTH daily reminder jobs at 07:00 (contracts + documents), not just contracts', async () => {
    const { proc, queue } = makeProcessor();
    await proc.onModuleInit();
    const names = queue.add.mock.calls.map((c) => c[0]);
    expect(names).toContain('rrhh-contract-expiry-reminders');
    expect(names).toContain('rrhh-document-expiry-reminders');
    // both scheduled on the same daily cron
    for (const c of queue.add.mock.calls) {
      expect((c[2] as Any).repeat).toEqual({ pattern: '0 7 * * *' });
    }
  });

  it('the contract job dispatches to contractReminders.runForAllCompanies', async () => {
    const { proc, contractReminders, documentReminders } = makeProcessor();
    await proc.process({ name: 'rrhh-contract-expiry-reminders', id: '1' } as Any);
    expect(contractReminders.runForAllCompanies).toHaveBeenCalledTimes(1);
    expect(documentReminders.runForAllCompanies).not.toHaveBeenCalled();
  });

  it('the document job dispatches to documentReminders.runForAllCompanies', async () => {
    const { proc, contractReminders, documentReminders } = makeProcessor();
    await proc.process({ name: 'rrhh-document-expiry-reminders', id: '2' } as Any);
    expect(documentReminders.runForAllCompanies).toHaveBeenCalledTimes(1);
    expect(contractReminders.runForAllCompanies).not.toHaveBeenCalled();
  });
});
