import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { ApiKeyInvalidError } from '../../common/errors/domain.errors';

// ─── ApiKeyService ─────────────────────────────────────────────────────────────
// Manages programmatic API keys for enterprise customers.
//
// Security model (consistent with token / OTP patterns):
//   - Raw key format: "oa_" + base64url(32 random bytes) — 256 bits of entropy
//   - Raw key is returned ONCE at creation and NEVER stored.
//   - Only SHA-256(rawKey) is stored in ApiKey.keyHash.
//   - Lookup: WHERE keyHash = SHA256(incoming) AND revokedAt IS NULL
//             AND (expiresAt IS NULL OR expiresAt > NOW())
//   - lastUsedAt is updated on each successful authentication for key rotation telemetry.
//
// keyPrefix: first 12 characters of the raw key (e.g. "oa_abc123xyz0").
//   Used for display/identification only. Cannot reconstruct the full key.

@Injectable()
export class ApiKeyService {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // Generate a new API key. Returns the raw key ONCE — caller must surface it to the
  // user immediately. Raw key is not recoverable after this call returns.
  async generate(params: {
    organizationId: string;
    name: string;
    createdById: string;
    expiresAt?: Date;
  }): Promise<{ key: string; id: string; prefix: string }> {
    const rawKey = 'oa_' + crypto.randomBytes(32).toString('base64url');
    const keyHash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 12);

    const record = await this.db.apiKey.create({
      data: {
        organizationId: params.organizationId,
        name: params.name,
        keyHash,
        keyPrefix,
        createdById: params.createdById,
        expiresAt: params.expiresAt ?? null,
      },
    });

    return { key: rawKey, id: record.id, prefix: keyPrefix };
  }

  // Validate an incoming raw key. Returns the orgId if valid.
  // Throws ApiKeyInvalidError for all failure modes (not found, revoked, expired)
  // to prevent enumeration attacks.
  async validate(rawKey: string): Promise<{ orgId: string; keyId: string }> {
    const hash = sha256(rawKey);

    const apiKey = await this.db.apiKey.findUnique({
      where: { keyHash: hash },
    });

    if (!apiKey) throw new ApiKeyInvalidError();
    if (apiKey.revokedAt) throw new ApiKeyInvalidError();
    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) throw new ApiKeyInvalidError();

    // Update lastUsedAt best-effort — do not fail the request if this update fails.
    await this.db.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {/* best-effort */});

    return { orgId: apiKey.organizationId, keyId: apiKey.id };
  }

  // Revoke an API key. Sets revokedAt; row is kept for audit.
  // Throws ApiKeyInvalidError if not found or belongs to a different org.
  async revoke(keyId: string, organizationId: string): Promise<void> {
    const key = await this.db.apiKey.findFirst({
      where: { id: keyId, organizationId },
    });

    if (!key) throw new ApiKeyInvalidError();

    await this.db.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
  }

  // List active (non-revoked) API keys for an org.
  // Never returns keyHash — only safe display fields.
  async list(organizationId: string): Promise<ApiKeyListItem[]> {
    const keys = await this.db.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    }));
  }
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
