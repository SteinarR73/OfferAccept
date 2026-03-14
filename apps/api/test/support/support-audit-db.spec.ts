import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { SupportAuditService } from '../../src/modules/support/support-audit.service';

// ─── SupportAuditService — DB persistence tests ────────────────────────────────
//
// Verifies that:
//   - Every log() call creates a DB row via supportAuditLog.create
//   - actorId, action, resourceType, and resourceId are always persisted
//   - metadata never contains sensitive values (enforced at call site — tested here
//     via the shape of what would be passed by the controller)
//   - A DB write failure is caught and logged, never propagated to the caller

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

// Helper to flush microtask queue (audit write is fire-and-forget via .catch)
function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('SupportAuditService.log() — DB persistence', () => {
  it('creates a DB audit row on every log() call', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    service.log('user-123', 'READ_CASE', 'offer:offer-abc');
    await flushPromises();

    expect(db.supportAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('persists actorId correctly', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    service.log('agent-xyz', 'REVOKE_OFFER', 'offer:offer-1');
    await flushPromises();

    const call = db.supportAuditLog.create.mock.calls[0][0] as { data: { actorId: string } };
    expect(call.data.actorId).toBe('agent-xyz');
  });

  it('persists action and parsed resourceType + resourceId', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    service.log('agent-1', 'READ_TIMELINE', 'offer:offer-999');
    await flushPromises();

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { action: string; resourceType: string; resourceId: string };
    };
    expect(call.data.action).toBe('READ_TIMELINE');
    expect(call.data.resourceType).toBe('offer');
    expect(call.data.resourceId).toBe('offer-999');
  });

  it('persists session resource type and resourceId for session actions', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    service.log('agent-1', 'RESEND_SESSION_OTP', 'session:sess-456');
    await flushPromises();

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { resourceType: string; resourceId: string };
    };
    expect(call.data.resourceType).toBe('session');
    expect(call.data.resourceId).toBe('sess-456');
  });

  it('persists ipAddress and userAgent from ctx', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    service.log('agent-1', 'REVOKE_OFFER', 'offer:x', {
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
    });
    await flushPromises();

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { ipAddress: string; userAgent: string };
    };
    expect(call.data.ipAddress).toBe('10.0.0.1');
    expect(call.data.userAgent).toBe('Mozilla/5.0');
  });

  it('does NOT propagate DB write failures to the caller', async () => {
    const db = createMockDb();
    db.supportAuditLog.create.mockRejectedValue(new Error('DB unavailable') as never);
    const service = await buildService(db);

    // Should NOT throw — fire-and-forget
    expect(() =>
      service.log('agent-1', 'READ_CASE', 'offer:abc'),
    ).not.toThrow();

    // Flush so the rejected promise is handled
    await flushPromises();
  });

  it('metadata does not contain sensitive field names (enforced by call site)', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    // This is what the controller passes — masked email only, no raw tokens
    const safeDetail = {
      offerId: 'offer-abc',
      recipientEmail: 'ja**@example.com', // already masked
    };

    service.log('agent-1', 'SEARCH_OFFERS', 'offers:search', undefined, safeDetail);
    await flushPromises();

    const call = db.supportAuditLog.create.mock.calls[0][0] as {
      data: { metadata: Record<string, unknown> };
    };

    // Verify the exact metadata that was stored
    expect(call.data.metadata).toEqual(safeDetail);

    // Common sensitive field names must never appear in audit metadata
    const sensitiveKeys = ['token', 'tokenHash', 'codeHash', 'rawCode', 'password', 'secret'];
    for (const key of sensitiveKeys) {
      expect(Object.keys(call.data.metadata)).not.toContain(key);
    }
  });
});

describe('SupportAuditService.getEntriesForResource()', () => {
  it('queries by resourceType and resourceId', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    await service.getEntriesForResource('offer', 'offer-abc');

    expect(db.supportAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resourceType: 'offer', resourceId: 'offer-abc' },
      }),
    );
  });
});

describe('SupportAuditService.getEntriesForActor()', () => {
  it('queries by actorId', async () => {
    const db = createMockDb();
    const service = await buildService(db);

    await service.getEntriesForActor('agent-xyz');

    expect(db.supportAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorId: 'agent-xyz' },
      }),
    );
  });
});
