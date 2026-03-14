import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { SupportAuditService } from '../../src/modules/support/support-audit.service';

// ─── SupportAuditService.logCritical() — blocking audit write tests ─────────────
//
// Verifies that:
//   - logCritical() awaits the DB write before returning
//   - logCritical() throws (propagates) when the DB write fails
//   - logCritical() writes the same fields as log() (actorId, action, resourceType, etc.)
//   - log() (fire-and-forget) does NOT propagate DB write failures

function createMockDb() {
  return {
    supportAuditLog: {
      create: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'audit-1' }),
      findMany: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
    },
  };
}

type MockDb = ReturnType<typeof createMockDb>;

async function buildService(db: MockDb) {
  const module = await Test.createTestingModule({
    providers: [
      SupportAuditService,
      { provide: 'PRISMA', useValue: db },
    ],
  }).compile();

  return module.get(SupportAuditService);
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('SupportAuditService.logCritical() — synchronous audit', () => {
  it('creates a DB audit row before returning', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    await service.logCritical('agent-1', 'REVOKE_OFFER', 'offer:offer-abc');

    // Must be called synchronously (i.e., before the promise resolves)
    expect(db.supportAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('persists actorId, action, resourceType, and resourceId correctly', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    await service.logCritical('agent-42', 'RESEND_OFFER_LINK', 'offer:offer-999');

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { actorId: string; action: string; resourceType: string; resourceId: string };
    };
    expect(call.data.actorId).toBe('agent-42');
    expect(call.data.action).toBe('RESEND_OFFER_LINK');
    expect(call.data.resourceType).toBe('offer');
    expect(call.data.resourceId).toBe('offer-999');
  });

  it('persists session resourceType for session-scoped actions', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    await service.logCritical('agent-1', 'RESEND_SESSION_OTP', 'session:sess-123');

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { resourceType: string; resourceId: string };
    };
    expect(call.data.resourceType).toBe('session');
    expect(call.data.resourceId).toBe('sess-123');
  });

  it('persists ipAddress and userAgent from ctx', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    await service.logCritical('agent-1', 'REVOKE_OFFER', 'offer:x', {
      ipAddress: '10.0.0.5',
      userAgent: 'internal/1.0',
    });

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { ipAddress: string; userAgent: string };
    };
    expect(call.data.ipAddress).toBe('10.0.0.5');
    expect(call.data.userAgent).toBe('internal/1.0');
  });

  it('PROPAGATES DB write failure to the caller (blocks the action)', async () => {
    const db = createMockDb();
    db.supportAuditLog.create.mockRejectedValue(new Error('DB offline') as never);
    const service = await buildService(db);

    // logCritical MUST throw — the calling action must not proceed
    await expect(
      service.logCritical('agent-1', 'REVOKE_OFFER', 'offer:abc'),
    ).rejects.toThrow('DB offline');
  });

  it('persists detail metadata when provided', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    const detail = { offerId: 'offer-1', reason: 'dispute' };
    await service.logCritical('agent-1', 'REVOKE_OFFER', 'offer:offer-1', undefined, detail);

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(call.data.metadata).toEqual(detail);
  });
});

describe('SupportAuditService.log() — fire-and-forget (control group)', () => {
  it('does NOT propagate DB write failures', async () => {
    const db = createMockDb();
    db.supportAuditLog.create.mockRejectedValue(new Error('DB offline') as never);
    const service = await buildService(db);

    // log() must NOT throw even when DB write fails
    expect(() => service.log('agent-1', 'READ_CASE', 'offer:abc')).not.toThrow();

    // Flush the rejected promise so jest doesn't complain about unhandled rejection
    await flushPromises();
  });
});
