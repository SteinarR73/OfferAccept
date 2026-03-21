import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../../src/modules/auth/session.service';
import { SessionRevokedError } from '../../src/common/errors/domain.errors';

// ─── SessionService rotation tests ────────────────────────────────────────────
//
// Verifies:
//   - create() generates a random raw token and stores the SHA-256 hash
//   - findByRawToken() throws SessionRevokedError on revoked sessions
//   - findByRawToken() returns null on expired sessions
//   - rotate() revokes old session and creates new one in a single transaction
//   - rotate() returns a DIFFERENT rawToken than the original
//   - revokeAll() marks all non-revoked sessions for the user

function makeSession(overrides: Partial<{
  id: string;
  userId: string;
  refreshTokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash1',
    ipAddress: null,
    userAgent: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

async function buildService(sessionRows: ReturnType<typeof makeSession>[] = []) {
  const dbMock = {
    session: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
        makeSession({ id: 'new-session', refreshTokenHash: data['refreshTokenHash'] as string })
      ),
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { refreshTokenHash: string } }) => {
        return sessionRows.find((s) => s.refreshTokenHash === where.refreshTokenHash) ?? null;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = sessionRows.find((s) => s.id === where.id);
        if (row) Object.assign(row, data);
        return row ?? makeSession();
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
  };

  const configMock = { get: jest.fn().mockReturnValue(30) };

  const module = await Test.createTestingModule({
    providers: [
      SessionService,
      { provide: 'PRISMA', useValue: dbMock },
      { provide: ConfigService, useValue: configMock },
    ],
  }).compile();

  return { service: module.get(SessionService), db: dbMock };
}

describe('SessionService', () => {
  describe('create()', () => {
    it('creates a session with a refreshTokenHash (not the raw token)', async () => {
      const { service, db } = await buildService();
      const { rawToken } = await service.create('user-1', {});

      // The token stored in the DB must NOT be the raw token
      const stored = (db.session.create as jest.Mock).mock.calls[0][0].data.refreshTokenHash;
      expect(stored).not.toBe(rawToken);
      expect(stored).toHaveLength(64); // SHA-256 hex
    });

    it('returns a non-empty raw token for cookie delivery', async () => {
      const { service } = await buildService();
      const { rawToken } = await service.create('user-1', {});
      expect(rawToken).toBeTruthy();
      expect(rawToken.length).toBeGreaterThan(30);
    });
  });

  describe('findByRawToken()', () => {
    it('throws SessionRevokedError for a revoked session', async () => {
      // We need to build a session with a known hash
      // We'll pre-populate by creating a session first and storing the hash
      const { service, db } = await buildService();

      // Create a session to get a valid hash
      const { rawToken } = await service.create('user-1', {});
      const storedHash = (db.session.create as jest.Mock).mock.calls[0][0].data.refreshTokenHash;

      // Make findUnique return a revoked session with that hash
      (db.session.findUnique as jest.Mock).mockResolvedValue(
        makeSession({ refreshTokenHash: storedHash, revokedAt: new Date() })
      );

      await expect(service.findByRawToken(rawToken)).rejects.toThrow(SessionRevokedError);
    });

    it('returns null for an expired session', async () => {
      const { service, db } = await buildService();
      const { rawToken } = await service.create('user-1', {});
      const storedHash = (db.session.create as jest.Mock).mock.calls[0][0].data.refreshTokenHash;

      (db.session.findUnique as jest.Mock).mockResolvedValue(
        makeSession({ refreshTokenHash: storedHash, expiresAt: new Date(Date.now() - 1000) })
      );

      const result = await service.findByRawToken(rawToken);
      expect(result).toBeNull();
    });

    it('returns null for an unknown token', async () => {
      const { service, db } = await buildService();
      (db.session.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.findByRawToken('completely-unknown-token');
      expect(result).toBeNull();
    });
  });

  describe('rotate()', () => {
    it('revokes the old session and creates a new one atomically', async () => {
      const { service, db } = await buildService();
      await service.rotate('session-old', 'user-1', {});

      // $transaction should be called with two operations
      expect(db.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([expect.anything(), expect.anything()]),
      );
    });

    it('returns a new rawToken different from any constant', async () => {
      const { service } = await buildService();
      const { rawToken: first } = await service.create('user-1', {});
      const { rawToken: second } = await service.rotate('session-old', 'user-1', {});
      // Two separate random tokens must differ
      expect(first).not.toBe(second);
    });
  });

  describe('revokeAll()', () => {
    it('calls updateMany with revokedAt for all active sessions of the user', async () => {
      const { service, db } = await buildService();
      await service.revokeAll('user-1');

      expect(db.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', revokedAt: null }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
