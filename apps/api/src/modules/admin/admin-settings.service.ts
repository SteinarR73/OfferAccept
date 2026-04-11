import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';

// ─── Setting defaults ─────────────────────────────────────────────────────────
// SETTING_DEFAULTS is the authoritative list of valid setting keys.
// GET /admin/settings merges DB rows with this object so every key always has a
// value, even before any PATCH has been made.
//
// Rules:
//   - Adding a new key here requires no migration — GET returns the default until
//     an OWNER explicitly PATCHes it.
//   - Removing a key here leaves orphan rows in system_settings (harmless).
//   - Never change a key name — the persisted value would be silently lost.
//     Rename by adding a new key with a new default and removing the old key in
//     a separate deploy after migrating the data.

export const SETTING_DEFAULTS = {
  // How many days until a sent offer expires if no explicit expiresAt is set.
  offer_expiry_days: 30,
  // Monthly offer caps per subscription tier (enforced by SubscriptionService).
  max_offers_free_monthly: 5,
  max_offers_starter_monthly: 50,
  max_offers_professional_monthly: 200,
  // How many years an acceptance certificate link remains valid.
  certificate_validity_years: 10,
  // Platform support email shown in transactional emails.
  support_email: 'support@offeraccept.com',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

// The resolved settings object has the same shape as SETTING_DEFAULTS but
// values may differ from the defaults after a PATCH.
export type Settings = {
  [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] extends string ? string : number;
};

// ─── Zod validation schema ────────────────────────────────────────────────────
// Partial: callers may update any subset of keys.
// Strict: no extra keys are accepted — prevents injection of arbitrary setting names.
//
// Validation rationale per field:
//   offer_expiry_days          min=1 (must be at least 1 day), max=730 (2 years; longer
//                              offers are operationally unusual and may indicate error)
//   max_offers_*_monthly       min=0 (zero disables tier), max=9999 (safety cap)
//   certificate_validity_years min=1, max=50 (certificates are legal evidence;
//                              50 years covers all realistic archival requirements)
//   support_email              RFC 5321 max length 254; normalized to lowercase on write

export const UpdateSettingsSchema = z
  .object({
    offer_expiry_days: z
      .number({ invalid_type_error: 'offer_expiry_days must be a number.' })
      .int('offer_expiry_days must be an integer.')
      .min(1, 'offer_expiry_days must be at least 1.')
      .max(730, 'offer_expiry_days may not exceed 730 (2 years).'),

    max_offers_free_monthly: z
      .number({ invalid_type_error: 'max_offers_free_monthly must be a number.' })
      .int('max_offers_free_monthly must be an integer.')
      .min(0, 'max_offers_free_monthly must be 0 or greater.')
      .max(9999, 'max_offers_free_monthly may not exceed 9999.'),

    max_offers_starter_monthly: z
      .number({ invalid_type_error: 'max_offers_starter_monthly must be a number.' })
      .int('max_offers_starter_monthly must be an integer.')
      .min(0, 'max_offers_starter_monthly must be 0 or greater.')
      .max(9999, 'max_offers_starter_monthly may not exceed 9999.'),

    max_offers_professional_monthly: z
      .number({ invalid_type_error: 'max_offers_professional_monthly must be a number.' })
      .int('max_offers_professional_monthly must be an integer.')
      .min(0, 'max_offers_professional_monthly must be 0 or greater.')
      .max(9999, 'max_offers_professional_monthly may not exceed 9999.'),

    certificate_validity_years: z
      .number({ invalid_type_error: 'certificate_validity_years must be a number.' })
      .int('certificate_validity_years must be an integer.')
      .min(1, 'certificate_validity_years must be at least 1.')
      .max(50, 'certificate_validity_years may not exceed 50.'),

    support_email: z
      .string({ invalid_type_error: 'support_email must be a string.' })
      .email('support_email must be a valid email address.')
      .max(254, 'support_email must not exceed 254 characters.')
      // Normalize before storing — email columns are case-sensitive in PostgreSQL.
      .transform((v) => v.toLowerCase().trim()),
  })
  .partial()  // all keys optional — PATCH is always a partial update
  .strict();  // reject unknown keys — prevents injection of arbitrary setting names

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;

// ─── Per-key validation map ───────────────────────────────────────────────────
// Extracted from the inner object schema (before .partial().strict()) so that
// values read back from the DB are validated against the exact same rules used
// for PATCH writes. This catches DB values that passed a former, looser schema
// or were hand-edited outside the API.
//
// Each entry is the non-optional version of the corresponding PATCH field.

const SETTING_VALUE_SCHEMAS: { [K in SettingKey]: z.ZodTypeAny } = {
  offer_expiry_days:              z.number().int().min(1).max(730),
  max_offers_free_monthly:        z.number().int().min(0).max(9999),
  max_offers_starter_monthly:     z.number().int().min(0).max(9999),
  max_offers_professional_monthly:z.number().int().min(0).max(9999),
  certificate_validity_years:     z.number().int().min(1).max(50),
  support_email:                  z.string().email().max(254),
};

// ─── Safe JSON parsing helper ─────────────────────────────────────────────────
// Protects GET /admin/settings from crashing if a DB value is malformed, has
// the wrong type, or fails per-key semantic validation (e.g. from a manual DB
// edit or a schema migration gap).
//
// On any failure: logs a structured warning with safe metadata only (key, error
// category, value length, first-8 hex of SHA-256) — never the raw value — then
// returns the compiled-in default so the endpoint always produces a valid response.

function safeParseDbValue(
  logger: Logger,
  key: SettingKey,
  raw: string,
): string | number {
  // Safe metadata attached to every warning — no raw value in any branch.
  const meta = {
    key,
    byteLength: Buffer.byteLength(raw, 'utf8'),
    sha256Prefix: createHash('sha256').update(raw).digest('hex').slice(0, 8),
  };

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    logger.warn({ ...meta, reason: 'malformed_json' },
      `[SystemSetting] key="${key}" has malformed JSON in DB — falling back to default.`,
    );
    return SETTING_DEFAULTS[key];
  }

  // Type guard: the parsed value must match the type of the compiled-in default.
  const expectedType = typeof SETTING_DEFAULTS[key];
  if (typeof parsed !== expectedType) {
    logger.warn(
      { ...meta, reason: 'type_mismatch', expectedType, actualType: typeof parsed },
      `[SystemSetting] key="${key}" has wrong type in DB — expected ${expectedType}, ` +
      `got ${typeof parsed}. Falling back to default.`,
    );
    return SETTING_DEFAULTS[key];
  }

  // Per-key semantic validation: same rules as PATCH writes.
  const schemaResult = SETTING_VALUE_SCHEMAS[key].safeParse(parsed);
  if (!schemaResult.success) {
    logger.warn(
      { ...meta, reason: 'schema_violation', issues: schemaResult.error.issues.map((i) => i.message) },
      `[SystemSetting] key="${key}" fails schema validation in DB — falling back to default.`,
    );
    return SETTING_DEFAULTS[key];
  }

  return parsed as string | number;
}

// ─── AdminSettingsService ─────────────────────────────────────────────────────

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // Returns all settings, merging persisted DB values with defaults.
  // Keys present in the DB override defaults; unset keys fall back to defaults.
  // Invalid DB values are logged and replaced with the default for that key —
  // this method never throws due to a malformed DB row.
  async getAll(): Promise<Settings> {
    const rows = await this.db.systemSetting.findMany();

    const persisted = new Map<string, string>(rows.map((r) => [r.key, r.value]));

    return Object.fromEntries(
      (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => {
        if (!persisted.has(key)) return [key, SETTING_DEFAULTS[key]];
        return [key, safeParseDbValue(this.logger, key, persisted.get(key)!)];
      }),
    ) as Settings;
  }

  // Persists changed keys and writes one audit row per changed key, all inside
  // a single transaction. Keys whose incoming value matches the current persisted
  // value produce no DB writes and no audit rows.
  //
  // updatedBy: userId of the OWNER or INTERNAL_SUPPORT actor.
  // Changes must have been validated by UpdateSettingsSchema before this is called.
  async updateMany(updatedBy: string, changes: UpdateSettingsDto): Promise<Settings> {
    // Filter out keys whose value is undefined (Zod .partial() may produce them)
    const entries = (Object.entries(changes) as [SettingKey, unknown][]).filter(
      ([, v]) => v !== undefined,
    );

    if (entries.length === 0) return this.getAll();

    // Read current persisted values for the affected keys only — we need them to:
    //   1. detect whether a key actually changed (skip no-op writes)
    //   2. record the old value in the audit log
    const currentRows = await this.db.systemSetting.findMany({
      where: { key: { in: entries.map(([k]) => k) } },
    });
    const currentMap = new Map<string, string>(currentRows.map((r) => [r.key, r.value]));

    // Only process keys where the new JSON representation differs from what is
    // currently stored. This avoids phantom audit rows on idempotent PATCHes.
    const changed = entries.filter(([key, newVal]) => {
      const newJson = JSON.stringify(newVal);
      const oldJson = currentMap.get(key); // undefined if key was never persisted
      return newJson !== oldJson;
    });

    if (changed.length === 0) return this.getAll();

    await this.db.$transaction([
      // Upsert only the keys that actually changed
      ...changed.map(([key, value]) =>
        this.db.systemSetting.upsert({
          where:  { key },
          create: { key, value: JSON.stringify(value), updatedBy },
          update: { value: JSON.stringify(value), updatedBy },
        }),
      ),
      // Write one audit row per changed key in the same transaction.
      // oldValue is null when the key was never persisted (was using the default).
      ...changed.map(([key, value]) =>
        this.db.settingAuditLog.create({
          data: {
            key,
            oldValue: currentMap.get(key) ?? null,
            newValue: JSON.stringify(value),
            changedBy: updatedBy,
          },
        }),
      ),
    ]);

    return this.getAll();
  }

  // Returns recent audit log entries, newest first.
  // limit: maximum rows to return (default 100, capped at 500 to avoid unbounded reads).
  // No raw secret values are stored in the log — values are the JSON-serialized setting
  // values written by the admin, which may include support_email; treat rows as internal.
  async getAuditLog(limit = 100): Promise<{
    id: string;
    key: string;
    oldValue: string | null;
    newValue: string;
    changedBy: string;
    changedAt: Date;
  }[]> {
    const take = Math.min(Math.max(1, limit), 500);
    return this.db.settingAuditLog.findMany({
      orderBy: { changedAt: 'desc' },
      take,
      select: { id: true, key: true, oldValue: true, newValue: true, changedBy: true, changedAt: true },
    });
  }
}
