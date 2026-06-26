/* HR-005 + HR-014 — proves the RrhhRemindersProcessor runs contract, document AND
 * certification reminders on the daily schedule (it dispatches each sibling job to
 * its service), without replacing the others. */
import { RrhhRemindersProcessor } from './rrhh-reminders.processor';

type Any = Record<string, unknown>;

function makeProcessor() {
  const contractReminders = {
    runForAllCompanies: jest.fn().mockResolvedValue({ tag: 'contracts' }),
  };
  const documentReminders = {
    runForAllCompanies: jest.fn().mockResolvedValue({ tag: 'documents' }),
  };
  const certificationReminders = {
    runForAllCompanies: jest.fn().mockResolvedValue({ tag: 'certifications' }),
  };
  const queue = {
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn(),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const proc = new RrhhRemindersProcessor(
    contractReminders as unknown as ConstructorParameters<typeof RrhhRemindersProcessor>[0],
    documentReminders as unknown as ConstructorParameters<typeof RrhhRemindersProcessor>[1],
    certificationReminders as unknown as ConstructorParameters<typeof RrhhRemindersProcessor>[2],
    queue as unknown as ConstructorParameters<typeof RrhhRemindersProcessor>[3],
  );
  return { proc, contractReminders, documentReminders, certificationReminders, queue };
}

describe('RrhhRemindersProcessor', () => {
  it('registers ALL THREE daily reminder jobs at 07:00 (contracts + documents + certifications)', async () => {
    const { proc, queue } = makeProcessor();
    await proc.onModuleInit();
    const names = queue.add.mock.calls.map((c) => c[0]);
    expect(names).toContain('rrhh-contract-expiry-reminders');
    expect(names).toContain('rrhh-document-expiry-reminders');
    expect(names).toContain('rrhh-certification-expiry-reminders');
    for (const c of queue.add.mock.calls) {
      expect((c[2] as Any).repeat).toEqual({ pattern: '0 7 * * *' });
    }
  });

  it('the contract job dispatches only to contractReminders', async () => {
    const { proc, contractReminders, documentReminders, certificationReminders } = makeProcessor();
    await proc.process({ name: 'rrhh-contract-expiry-reminders', id: '1' } as Any);
    expect(contractReminders.runForAllCompanies).toHaveBeenCalledTimes(1);
    expect(documentReminders.runForAllCompanies).not.toHaveBeenCalled();
    expect(certificationReminders.runForAllCompanies).not.toHaveBeenCalled();
  });

  it('the document job dispatches only to documentReminders', async () => {
    const { proc, contractReminders, documentReminders, certificationReminders } = makeProcessor();
    await proc.process({ name: 'rrhh-document-expiry-reminders', id: '2' } as Any);
    expect(documentReminders.runForAllCompanies).toHaveBeenCalledTimes(1);
    expect(contractReminders.runForAllCompanies).not.toHaveBeenCalled();
    expect(certificationReminders.runForAllCompanies).not.toHaveBeenCalled();
  });

  it('the certification job dispatches only to certificationReminders', async () => {
    const { proc, contractReminders, documentReminders, certificationReminders } = makeProcessor();
    await proc.process({ name: 'rrhh-certification-expiry-reminders', id: '3' } as Any);
    expect(certificationReminders.runForAllCompanies).toHaveBeenCalledTimes(1);
    expect(contractReminders.runForAllCompanies).not.toHaveBeenCalled();
    expect(documentReminders.runForAllCompanies).not.toHaveBeenCalled();
  });
});
