import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import { ApiKeyService } from '../../src/modules/enterprise/api-key.service';
import { ApiKeyInvalidError } from '../../src/common/errors/domain.errors';

// ─── ApiKeyService tests ───────────────────────────────────────────────────────
//
// Verifies:
//   1. Raw key is never stored — only SHA-256 hash in DB
//   2. Validation succeeds with correct raw key, fails with wrong key
//   3. Revoked keys are rejected (revokedAt set)
//   4. Expired keys are rejected (expiresAt in past)
//   5. list() never returns keyHash or raw key — only safe display fields
//   6. Revocation scoped to org — cross-org revocation rejected
//   7. lastUsedAt is updated on successful validation

// ── FakePrisma ────────────────────────────────────────────────────────────────

function makeKey(overrides: Record<string, unknown> = {}) {
  const rawKey = 'oa_' + crypto.randomBytes(32).toString('base64url');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  return {
    id: 'key_1',
    organizationId: 'org_1',
    name: 'Test Key',
    keyHash,
    keyPrefix: rawKey.slice(0, 12),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    createdById: 'user_1',
    ...overrides,
    _rawKey: rawKey, // for test assertions only
  };
}

function buildFakePrisma(storedKey: ReturnType<typeof makeKey> | null) {
  const updateMock = jest.fn<() => Promise<ReturnType<typeof makeKey>>>().mockResolvedValue(
    storedKey ?? ({} as ReturnType<typeof makeKey>),
  );

  return {
    apiKey: {
      create: jest.fn<() => Promise<ReturnType<typeof makeKey>>>().mockResolvedValue(
        storedKey ?? ({} as ReturnType<typeof makeKey>),
      ),
      findUnique: jest.fn<(args: { where: { keyHash: string } }) => Promise<ReturnType<typeof makeKey> | null>>()
        .mockImplementation(({ where }) => {
          if (!storedKey) return Promise.resolve(null);
          return Promise.resolve(where.keyHash === storedKey.keyHash ? storedKey : null);
        }),
      findFirst: jest.fn<(args: { where: { id: string; organizationId: string } }) => Promise<ReturnType<typeof makeKey> | null>>()
        .mockImplementation(({ where }) => {
          if (!storedKey) return Promise.resolve(null);
          return Promise.resolve(
            storedKey.id === where.id && storedKey.organizationId === where.organizationId
              ? storedKey
              : null,
          );
        }),
      update: updateMock,
      findMany: jest.fn<() => Promise<ReturnType<typeof makeKey>[]>>().mockResolvedValue(
        storedKey ? [storedKey] : [],
      ),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiKeyService', () => {
  describe('generate()', () => {
    it('stores only the SHA-256 hash — never the raw key', async () => {
      const storedKey = makeKey();
      const db = buildFakePrisma(storedKey);

      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      const { key, id, prefix } = await service.generate({
        organizationId: 'org_1',
        name: 'Test Key',
        createdById: 'user_1',
      });

      // Raw key is returned to the caller
      expect(key).toMatch(/^oa_/);
      expect(key.length).toBeGreaterThan(30);

      // Prefix is the first 12 chars of the raw key
      expect(prefix).toBe(key.slice(0, 12));
      expect(id).toBe('key_1');

      // create() was called with keyHash (SHA-256), NOT the raw key
      const createCall = (db.apiKey.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
      expect(createCall.data).toHaveProperty('keyHash');
      expect(createCall.data).not.toHaveProperty('key');
      expect(createCall.data).not.toHaveProperty('rawKey');

      // The stored hash is the SHA-256 of the returned raw key
      const expectedHash = crypto.createHash('sha256').update(key).digest('hex');
      expect(createCall.data.keyHash).toBe(expectedHash);
    });

    it('key has 256 bits of entropy (≥40 character base64url suffix)', async () => {
      const storedKey = makeKey();
      const db = buildFakePrisma(storedKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      const { key } = await service.generate({ organizationId: 'org_1', name: 'x', createdById: 'u' });
      // "oa_" prefix + base64url(32 bytes) = 3 + 43 chars = 46 chars minimum
      expect(key.length).toBeGreaterThanOrEqual(46);
    });
  });

  describe('validate()', () => {
    it('accepts the correct raw key and returns orgId', async () => {
      const storedKey = makeKey();
      const db = buildFakePrisma(storedKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      const result = await service.validate(storedKey._rawKey);
      expect(result.orgId).toBe('org_1');
    });

    it('rejects an unknown raw key with ApiKeyInvalidError', async () => {
      const db = buildFakePrisma(null);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      await expect(service.validate('oa_wrongkey')).rejects.toThrow(ApiKeyInvalidError);
    });

    it('rejects a revoked key even if hash matches', async () => {
      const revokedKey = makeKey({ revokedAt: new Date() });
      const db = buildFakePrisma(revokedKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      await expect(service.validate(revokedKey._rawKey)).rejects.toThrow(ApiKeyInvalidError);
    });

    it('rejects an expired key', async () => {
      const pastDate = new Date(Date.now() - 1000);
      const expiredKey = makeKey({ expiresAt: pastDate });
      const db = buildFakePrisma(expiredKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      await expect(service.validate(expiredKey._rawKey)).rejects.toThrow(ApiKeyInvalidError);
    });

    it('accepts a key with a future expiresAt', async () => {
      const futureDate = new Date(Date.now() + 86_400_000);
      const validKey = makeKey({ expiresAt: futureDate });
      const db = buildFakePrisma(validKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      const result = await service.validate(validKey._rawKey);
      expect(result.orgId).toBe('org_1');
    });

    it('updates lastUsedAt on valid authentication', async () => {
      const storedKey = makeKey();
      const db = buildFakePrisma(storedKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      await service.validate(storedKey._rawKey);
      expect(db.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastUsedAt: expect.any(Date) }) }),
      );
    });

    it('returns same error for wrong key and revoked key — no enumeration', async () => {
      const revokedKey = makeKey({ revokedAt: new Date() });
      const db = buildFakePrisma(revokedKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      // Wrong key
      const err1 = await service.validate('oa_wrong').catch((e: Error) => e);
      // Revoked key
      const err2 = await service.validate(revokedKey._rawKey).catch((e: Error) => e);

      expect(err1).toBeInstanceOf(ApiKeyInvalidError);
      expect(err2).toBeInstanceOf(ApiKeyInvalidError);
      // Same message — caller cannot distinguish the two failure modes
      expect((err1 as ApiKeyInvalidError).message).toBe((err2 as ApiKeyInvalidError).message);
    });
  });

  describe('revoke()', () => {
    it('sets revokedAt on the key', async () => {
      const storedKey = makeKey();
      const db = buildFakePrisma(storedKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      await service.revoke('key_1', 'org_1');
      expect(db.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
    });

    it('rejects cross-org revocation with ApiKeyInvalidError', async () => {
      const db = buildFakePrisma(null); // findFirst returns null for wrong org
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      await expect(service.revoke('key_1', 'org_OTHER')).rejects.toThrow(ApiKeyInvalidError);
      expect(db.apiKey.update).not.toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('never includes keyHash or raw key in the response', async () => {
      const storedKey = makeKey();
      const db = buildFakePrisma(storedKey);
      const module = await Test.createTestingModule({
        providers: [ApiKeyService, { provide: 'PRISMA', useValue: db }],
      }).compile();
      const service = module.get(ApiKeyService);

      const list = await service.list('org_1');
      expect(list).toHaveLength(1);
      const item = list[0];
      expect(item).not.toHaveProperty('keyHash');
      expect(item).not.toHaveProperty('key');
      expect(item).not.toHaveProperty('rawKey');
      expect(item).toHaveProperty('prefix');
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
    });
  });
});
