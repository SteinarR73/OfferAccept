import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// NestJS logs its own non-JSON bootstrap messages through the same Logger.
// tryParseJson silently skips them so assertions only see handler events.
function tryParseJson(s: unknown): Record<string, unknown> | null {
  if (typeof s !== 'string') return null;
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}
// Accept the raw mock.calls array (works with both jest.fn() and jest.spyOn()).
function parsedLogCalls(calls: unknown[][]): Array<Record<string, unknown>> {
  return calls
    .map((args) => tryParseJson(args[0]))
    .filter((v): v is Record<string, unknown> => v !== null);
}
import { IssueCertificateHandler } from '../../src/modules/jobs/handlers/issue-certificate.handler';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import type { Job } from 'pg-boss';
import type { IssueCertificatePayload } from '../../src/modules/jobs/job.types';

// ─── IssueCertificateHandler — observability and retry tests ──────────────────
//
// These tests verify the structured logging contract for the certificate job:
//
//   1. certificate_job_started  — emitted at the start of every attempt
//   2. certificate_issued       — emitted on success, includes jobId + attempt
//   3. certificate_issuance_failed — emitted on failure, before rethrow
//   4. certificate_dlq_risk     — emitted when attempt === retryLimit (final retry)
//   5. Error rethrow            — pg-boss must see the failure to schedule a retry
//   6. Batch processing         — multiple jobs processed in one handle() call
//   7. Idempotency on retry     — second attempt works if first failed

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCEPTANCE_RECORD_ID = 'record-cert-1';
const JOB_ID               = 'job-cert-1';
const CERT_ID              = 'cert-1';

function makeJob(overrides: Partial<{
  id: string;
  acceptanceRecordId: string;
  retrycount: number;
  retrylimit: number;
}> = {}): Job<IssueCertificatePayload> {
  // retrycount and retrylimit are raw DB fields not typed on Job<T> — cast required.
  return {
    id:           overrides.id                  ?? JOB_ID,
    name:         'issue-certificate',
    data:         { acceptanceRecordId: overrides.acceptanceRecordId ?? ACCEPTANCE_RECORD_ID },
    retrycount:   overrides.retrycount          ?? 0,
    retrylimit:   overrides.retrylimit          ?? 5,
  } as unknown as Job<IssueCertificatePayload>;
}

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeCertService(overrides: Partial<{
  generateForAcceptance: () => Promise<{ certificateId: string }>;
}> = {}) {
  return {
    generateForAcceptance: jest.fn<() => Promise<{ certificateId: string }>>()
      .mockResolvedValue({ certificateId: CERT_ID }),
    ...overrides,
  };
}

async function buildHandler(certService: ReturnType<typeof makeCertService>) {
  const module = await Test.createTestingModule({
    providers: [
      IssueCertificateHandler,
      { provide: CertificateService, useValue: certService },
    ],
  }).compile();
  return module.get(IssueCertificateHandler);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Structured log: certificate_job_started
// ─────────────────────────────────────────────────────────────────────────────

describe('IssueCertificateHandler — certificate_job_started', () => {
  it('logs certificate_job_started at the beginning of each job', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const handler = await buildHandler(makeCertService());

    await handler.handle([makeJob()]);

    const calls = parsedLogCalls(logSpy.mock.calls as unknown[][]);
    const started = calls.find((c) => c['event'] === 'certificate_job_started');
    expect(started).toBeDefined();
    expect(started!['jobId']).toBe(JOB_ID);
    expect(started!['acceptanceRecordId']).toBe(ACCEPTANCE_RECORD_ID);
    expect(started!['attempt']).toBe(1);
    expect(started!['retryLimit']).toBe(5);

    logSpy.mockRestore();
  });

  it('reports attempt=2 on the first retry (retrycount=1)', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const handler = await buildHandler(makeCertService());

    await handler.handle([makeJob({ retrycount: 1 })]);

    const calls = parsedLogCalls(logSpy.mock.calls as unknown[][]);
    const started = calls.find((c) => c['event'] === 'certificate_job_started');
    expect(started!['attempt']).toBe(2);

    logSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Structured log: certificate_issued (success path)
// ─────────────────────────────────────────────────────────────────────────────

describe('IssueCertificateHandler — success path', () => {
  it('logs certificate_issued with jobId, certId, acceptanceRecordId, attempt', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const handler = await buildHandler(makeCertService());

    await handler.handle([makeJob()]);

    const calls = parsedLogCalls(logSpy.mock.calls as unknown[][]);
    const issued = calls.find((c) => c['event'] === 'certificate_issued');
    expect(issued).toBeDefined();
    expect(issued!['jobId']).toBe(JOB_ID);
    expect(issued!['certId']).toBe(CERT_ID);
    expect(issued!['acceptanceRecordId']).toBe(ACCEPTANCE_RECORD_ID);
    expect(issued!['attempt']).toBe(1);

    logSpy.mockRestore();
  });

  it('does not throw on success', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const handler = await buildHandler(makeCertService());

    await expect(handler.handle([makeJob()])).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Structured log: certificate_issuance_failed + rethrow (failure path)
// ─────────────────────────────────────────────────────────────────────────────

describe('IssueCertificateHandler — failure path', () => {
  it('logs certificate_issuance_failed with jobId and acceptanceRecordId', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const certService = makeCertService();
    (certService.generateForAcceptance as ReturnType<typeof jest.fn>)
      .mockRejectedValue(new Error('DB timeout'));
    const handler = await buildHandler(certService);

    await handler.handle([makeJob()]).catch(() => {});

    const calls = parsedLogCalls(errSpy.mock.calls as unknown[][]);
    const failed = calls.find((c) => c['event'] === 'certificate_issuance_failed');
    expect(failed).toBeDefined();
    expect(failed!['jobId']).toBe(JOB_ID);
    expect(failed!['acceptanceRecordId']).toBe(ACCEPTANCE_RECORD_ID);
    expect(failed!['attempt']).toBe(1);

    errSpy.mockRestore();
  });

  it('rethrows the error so pg-boss schedules a retry', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const certService = makeCertService();
    const dbError = new Error('Connection lost');
    (certService.generateForAcceptance as ReturnType<typeof jest.fn>)
      .mockRejectedValue(dbError);
    const handler = await buildHandler(certService);

    await expect(handler.handle([makeJob()])).rejects.toThrow('Connection lost');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Dead-letter risk signal: certificate_dlq_risk
// ─────────────────────────────────────────────────────────────────────────────

describe('IssueCertificateHandler — DLQ risk signal', () => {
  it('logs certificate_dlq_risk on the final attempt (retrycount = retrylimit - 1)', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const handler = await buildHandler(makeCertService());

    // retrycount=4, retrylimit=5 → attempt 5 of 5 (final)
    await handler.handle([makeJob({ retrycount: 4, retrylimit: 5 })]);

    const calls = parsedLogCalls(errSpy.mock.calls as unknown[][]);
    const dlq = calls.find((c) => c['event'] === 'certificate_dlq_risk');
    expect(dlq).toBeDefined();
    expect(dlq!['jobId']).toBe(JOB_ID);
    expect(dlq!['acceptanceRecordId']).toBe(ACCEPTANCE_RECORD_ID);
    expect(dlq!['attempt']).toBe(5);
    expect(dlq!['retryLimit']).toBe(5);
    expect(dlq!['alert']).toBeDefined();

    errSpy.mockRestore();
  });

  it('does NOT log certificate_dlq_risk on a non-final attempt', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const handler = await buildHandler(makeCertService());

    // retrycount=2, retrylimit=5 → attempt 3 of 5 (not final)
    await handler.handle([makeJob({ retrycount: 2, retrylimit: 5 })]);

    const calls = parsedLogCalls(errSpy.mock.calls as unknown[][]);
    expect(calls.find((c) => c['event'] === 'certificate_dlq_risk')).toBeUndefined();

    errSpy.mockRestore();
  });

  it('logs certificate_dlq_risk before the attempt — so it fires even if the job succeeds', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    // certificateService succeeds on the final attempt
    const handler = await buildHandler(makeCertService());

    await handler.handle([makeJob({ retrycount: 4, retrylimit: 5 })]);

    const calls = parsedLogCalls(errSpy.mock.calls as unknown[][]);
    // DLQ risk fired even though the job succeeded
    expect(calls.find((c) => c['event'] === 'certificate_dlq_risk')).toBeDefined();

    errSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Batch processing
// ─────────────────────────────────────────────────────────────────────────────

describe('IssueCertificateHandler — batch processing', () => {
  it('processes all jobs in a batch and calls generateForAcceptance for each', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const certService = makeCertService();
    const handler = await buildHandler(certService);

    const jobs = [
      makeJob({ id: 'job-1', acceptanceRecordId: 'record-1' }),
      makeJob({ id: 'job-2', acceptanceRecordId: 'record-2' }),
      makeJob({ id: 'job-3', acceptanceRecordId: 'record-3' }),
    ];

    await handler.handle(jobs);

    expect(certService.generateForAcceptance).toHaveBeenCalledTimes(3);
    expect(certService.generateForAcceptance).toHaveBeenCalledWith('record-1');
    expect(certService.generateForAcceptance).toHaveBeenCalledWith('record-2');
    expect(certService.generateForAcceptance).toHaveBeenCalledWith('record-3');
  });

  it('rethrows on the first failing job in a batch, halting the rest', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const certService = makeCertService();
    (certService.generateForAcceptance as ReturnType<typeof jest.fn>)
      .mockRejectedValueOnce(new Error('First job failed'))
      .mockResolvedValue({ certificateId: 'cert-2' });
    const handler = await buildHandler(certService);

    const jobs = [
      makeJob({ id: 'job-1', acceptanceRecordId: 'record-1' }),
      makeJob({ id: 'job-2', acceptanceRecordId: 'record-2' }),
    ];

    await expect(handler.handle(jobs)).rejects.toThrow('First job failed');
    // pg-boss will retry — second job never reached
    expect(certService.generateForAcceptance).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Reconciliation tests (ReconcileCertificatesHandler)
// ─────────────────────────────────────────────────────────────────────────────

import { ReconcileCertificatesHandler } from '../../src/modules/jobs/handlers/reconcile-certificates.handler';
import { JobService } from '../../src/modules/jobs/job.service';
import type { ReconcileCertificatesPayload } from '../../src/modules/jobs/job.types';

function makeReconcileJob(): Job<ReconcileCertificatesPayload> {
  return { id: 'reconcile-1', name: 'reconcile-certificates', data: {} } as unknown as Job<ReconcileCertificatesPayload>;
}

async function buildReconcileHandler(
  missing: Array<{ id: string; acceptedAt: Date }>,
  sendMock = jest.fn<() => Promise<string | null>>().mockResolvedValue('job-new'),
) {
  const certService = {
    findMissingCertificates: jest.fn<() => Promise<typeof missing>>().mockResolvedValue(missing),
  };
  const jobService = { send: sendMock };

  const module = await Test.createTestingModule({
    providers: [
      ReconcileCertificatesHandler,
      { provide: CertificateService, useValue: certService },
      { provide: JobService, useValue: jobService },
    ],
  }).compile();

  return { handler: module.get(ReconcileCertificatesHandler), certService, jobService };
}

describe('ReconcileCertificatesHandler — clean state', () => {
  it('logs certificate_reconciliation_clean when no missing certificates', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const { handler } = await buildReconcileHandler([]);

    await handler.handle([makeReconcileJob()]);

    const calls = parsedLogCalls(logSpy.mock.calls as unknown[][]);
    expect(calls.find((c) => c['event'] === 'certificate_reconciliation_clean')).toBeDefined();

    logSpy.mockRestore();
  });

  it('does not enqueue any jobs when no missing certificates', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const sendMock = jest.fn<() => Promise<string | null>>().mockResolvedValue('j');
    const { handler } = await buildReconcileHandler([], sendMock);

    await handler.handle([makeReconcileJob()]);

    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('ReconcileCertificatesHandler — backlog detected', () => {
  const MISSING = [
    { id: 'record-stuck-1', acceptedAt: new Date('2026-03-26T08:00:00Z') },
    { id: 'record-stuck-2', acceptedAt: new Date('2026-03-26T09:00:00Z') },
  ];

  it('logs certificate_reconciliation_backlog with count and IDs', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const { handler } = await buildReconcileHandler(MISSING);

    await handler.handle([makeReconcileJob()]);

    const calls = parsedLogCalls(warnSpy.mock.calls as unknown[][]);
    const backlog = calls.find((c) => c['event'] === 'certificate_reconciliation_backlog');
    expect(backlog).toBeDefined();
    expect(backlog!['count']).toBe(2);
    expect(backlog!['acceptanceRecordIds']).toEqual(['record-stuck-1', 'record-stuck-2']);

    warnSpy.mockRestore();
  });

  it('re-enqueues one issue-certificate job per missing record', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const sendMock = jest.fn<() => Promise<string | null>>().mockResolvedValue('new-job');
    const { handler } = await buildReconcileHandler(MISSING, sendMock);

    await handler.handle([makeReconcileJob()]);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock).toHaveBeenCalledWith('issue-certificate', { acceptanceRecordId: 'record-stuck-1' });
    expect(sendMock).toHaveBeenCalledWith('issue-certificate', { acceptanceRecordId: 'record-stuck-2' });
  });

  it('does not throw when backlog is found', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const { handler } = await buildReconcileHandler(MISSING);

    await expect(handler.handle([makeReconcileJob()])).resolves.not.toThrow();
  });
});
