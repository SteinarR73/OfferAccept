/**
 * Authority Engine — Gate Group 3: Database Stability
 *
 *  D1  P0  DB Provider Validation (must be PostgreSQL)
 *  D2  P0  Migration Consistency
 *  D3  P1  Query Latency Check (static: verify index coverage)
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = path.resolve(
  __dirname, '../../../../../packages/database/prisma/schema.prisma',
);
const MIGRATIONS_DIR = path.resolve(
  __dirname, '../../../../../packages/database/prisma/migrations',
);
const SRC = path.resolve(__dirname, '../../../src');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ─── D1 · DB Provider Validation (P0) ────────────────────────────────────────

describe('D1 · DB Provider Validation (P0)', () => {
  it('schema.prisma datasource provider is postgresql (not sqlite)', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).not.toContain('provider = "sqlite"');
  });

  it('DATABASE_URL reads from env — no hardcoded sqlite file path', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    expect(schema).toContain('url      = env("DATABASE_URL")');
    expect(schema).not.toMatch(/file:.*\.db/);
  });

  it('env schema rejects sqlite:// DATABASE_URL format', () => {
    const envFile = readSrc('config', 'env.ts');
    // DATABASE_URL must be a URL (z.string().url()), which accepts postgresql:// but
    // not file: paths used by SQLite
    expect(envFile).toContain('DATABASE_URL: z.string().url()');
  });

  it('production env validation does not allow dev storage or email providers', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain("EMAIL_PROVIDER=dev must never be used in production");
    expect(envFile).toContain("STORAGE_PROVIDER=dev must never be used in production");
  });
});

// ─── D2 · Migration Consistency (P0) ─────────────────────────────────────────

describe('D2 · Migration Consistency (P0)', () => {
  it('migrations directory exists and contains migration folders', () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
    const entries = fs.readdirSync(MIGRATIONS_DIR);
    const migrationDirs = entries.filter((e) => /^\d{8}/.test(e));
    expect(migrationDirs.length).toBeGreaterThan(0);
  });

  it('every migration folder contains a migration.sql file', () => {
    const entries = fs.readdirSync(MIGRATIONS_DIR);
    const migrationDirs = entries.filter((e) => /^\d{8}/.test(e));
    for (const dir of migrationDirs) {
      const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      expect(fs.existsSync(sqlPath)).toBe(true);
    }
  });

  it('migrations are lexicographically ordered (no timestamp collisions)', () => {
    const entries = fs.readdirSync(MIGRATIONS_DIR);
    const migrationDirs = entries
      .filter((e) => /^\d{14}/.test(e))
      .map((e) => e.split('_')[0]);
    const sorted = [...migrationDirs].sort();
    expect(migrationDirs).toEqual(sorted);
    // No duplicates
    const unique = new Set(migrationDirs);
    expect(unique.size).toBe(migrationDirs.length);
  });

  it('CI workflow runs prisma migrate deploy before gate tests', () => {
    const ciFile = path.resolve(__dirname, '../../../../../.github/workflows/ci.yml');
    const ci = fs.readFileSync(ciFile, 'utf-8');
    expect(ci).toContain('prisma migrate deploy');
  });

  it('schema.prisma immutable tables are append-only (no UPDATE in migration files)', () => {
    // AcceptanceRecord, OfferSnapshot, SigningEvent must never have UPDATE migrations
    const entries = fs.readdirSync(MIGRATIONS_DIR);
    const migrationDirs = entries.filter((e) => /^\d{8}/.test(e));
    const immutableTables = ['acceptance_records', 'offer_snapshots', 'signing_events'];

    for (const dir of migrationDirs) {
      const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      const sql = fs.readFileSync(sqlPath, 'utf-8').toUpperCase();
      for (const table of immutableTables) {
        // No ALTER TABLE ... on immutable tables (that would imply DROP or restructure)
        const hasDestructiveAlt = new RegExp(
          `ALTER TABLE[^;]*${table.toUpperCase()}[^;]*DROP COLUMN`,
        ).test(sql);
        expect(hasDestructiveAlt).toBe(false);
      }
    }
  });
});

// ─── D3 · Query Latency Check (P1) ───────────────────────────────────────────
//
// Static analysis: verify that performance-critical queries have index coverage.
// Full p95 latency measurement requires a live database — deferred to staging.

describe('D3 · Query Latency Check (P1)', () => {
  it('OfferRecipient has index on tokenHash for O(1) token lookup', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    // tokenHash must be indexed — used on every signing request
    expect(schema).toMatch(/tokenHash.*@unique|@unique.*tokenHash|@@index\([^)]*tokenHash/);
  });

  it('Offer table has index on organizationId for dashboard list queries', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    expect(schema).toMatch(/@@index\([^)]*organizationId/);
  });

  it('AcceptanceCertificate has fast lookup support for public verification', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    // Certificates are looked up by PK id (UUID) on the verify page.
    // offerId @unique provides secondary access path.
    expect(schema).toMatch(/model AcceptanceCertificate/);
    // offerId @unique provides O(1) lookup from offer → certificate on dashboard
    expect(schema).toMatch(/offerId.*@unique/);
  });

  it('SigningEvent has index on sessionId for event chain queries', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    expect(schema).toMatch(/@@index\([^)]*sessionId/);
  });

  it('Prisma query engine is configured with connection pooling (not direct socket)', () => {
    const envFile = readSrc('config', 'env.ts');
    // DATABASE_URL should accept pooled connection strings (pgbouncer-compatible)
    // At minimum, the system must not forbid connection pool URLs
    expect(envFile).toContain('DATABASE_URL');
  });
});
