/**
 * audit-dev-db.ts
 *
 * Security audit script for a committed SQLite development database.
 *
 * PURPOSE:
 *   Before removing prisma/dev.db from git history, this script inspects the
 *   database to understand what data is present and which records may contain
 *   sensitive credentials, tokens, or PII.
 *
 * USAGE:
 *   npx ts-node scripts/audit-dev-db.ts [path-to-db]
 *   npx ts-node scripts/audit-dev-db.ts prisma/dev.db
 *
 * OUTPUT:
 *   - Table names and row counts
 *   - Fields that appear to contain credentials or tokens
 *   - Sample (redacted) values for dangerous fields
 *   - A summary risk assessment
 *
 * REQUIREMENTS:
 *   npm install better-sqlite3 @types/better-sqlite3
 *
 * IMPORTANT:
 *   This script does NOT modify the database. It is read-only.
 *   Run from the repository root.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ─── Configuration ─────────────────────────────────────────────────────────────

const DB_PATH = process.argv[2] ?? path.join(process.cwd(), 'prisma', 'dev.db');

// Field name patterns that suggest sensitive content
const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  /password/i,
  /hash/i,
  /token/i,
  /secret/i,
  /api.?key/i,
  /private.?key/i,
  /access.?key/i,
  /refresh/i,
  /session/i,
  /credential/i,
  /auth/i,
  /jwt/i,
  /salt/i,
  /nonce/i,
  /otp/i,
  /pin/i,
  /ssn/i,
  /credit.?card/i,
  /card.?number/i,
  /stripe/i,
  /payment/i,
];

// Field name patterns that suggest PII
const PII_FIELD_PATTERNS: RegExp[] = [
  /email/i,
  /phone/i,
  /address/i,
  /first.?name/i,
  /last.?name/i,
  /full.?name/i,
  /dob/i,
  /date.?of.?birth/i,
  /ip.?address/i,
  /user.?agent/i,
  /postal/i,
  /zip/i,
];

// Value patterns that look like hashes or tokens
const TOKEN_VALUE_PATTERNS: RegExp[] = [
  /^\$2[aby]\$\d+\$/,                    // bcrypt hash
  /^\$argon2/,                           // argon2 hash
  /^[a-f0-9]{64}$/i,                    // SHA-256 hex
  /^[a-f0-9]{32}$/i,                    // MD5 / short hash
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, // JWT
  /^sk_[a-z]+_[A-Za-z0-9]{24,}/,       // Stripe secret key
  /^pk_[a-z]+_[A-Za-z0-9]{24,}/,       // Stripe public key
  /^whsec_[A-Za-z0-9]{32,}/,           // Stripe webhook secret
  /^AIza[0-9A-Za-z_-]{35}/,            // Google API key
  /^[A-Za-z0-9_-]{32,}$/,              // Generic long token (32+ chars)
];

// ─── Utilities ─────────────────────────────────────────────────────────────────

function isSensitiveField(name: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some(p => p.test(name));
}

function isPiiField(name: string): boolean {
  return PII_FIELD_PATTERNS.some(p => p.test(name));
}

function looksLikeToken(value: unknown): { isToken: boolean; type: string } {
  if (typeof value !== 'string' || value.length < 8) return { isToken: false, type: '' };

  if (/^\$2[aby]\$\d+\$/.test(value)) return { isToken: true, type: 'bcrypt hash' };
  if (/^\$argon2/.test(value)) return { isToken: true, type: 'argon2 hash' };
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return { isToken: true, type: 'JWT token' };
  if (/^sk_[a-z]+_[A-Za-z0-9]{24,}/.test(value)) return { isToken: true, type: 'Stripe secret key' };
  if (/^pk_[a-z]+_[A-Za-z0-9]{24,}/.test(value)) return { isToken: true, type: 'Stripe publishable key' };
  if (/^whsec_[A-Za-z0-9]{32,}/.test(value)) return { isToken: true, type: 'Stripe webhook secret' };
  if (/^AIza[0-9A-Za-z_-]{35}/.test(value)) return { isToken: true, type: 'Google API key' };
  if (/^[a-f0-9]{64}$/.test(value)) return { isToken: true, type: 'SHA-256 hex hash' };
  if (/^[a-f0-9]{32}$/.test(value)) return { isToken: true, type: 'MD5/short hash' };
  if (value.length >= 40 && /^[A-Za-z0-9_\-+/=]{40,}$/.test(value)) return { isToken: true, type: 'generic long token' };

  return { isToken: false, type: '' };
}

function redact(value: unknown): string {
  if (value === null || value === undefined) return '(null)';
  const str = String(value);
  if (str.length <= 8) return '****';
  return str.slice(0, 4) + '****' + str.slice(-4) + ` [${str.length} chars]`;
}

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16) + '...';
}

function banner(text: string): void {
  const line = '─'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

// ─── Main Audit ────────────────────────────────────────────────────────────────

interface AuditFinding {
  table: string;
  field: string;
  type: 'CREDENTIAL' | 'PII' | 'TOKEN_VALUE' | 'SENSITIVE_FIELD';
  rowCount: number;
  sampleRedacted: string;
  tokenType?: string;
}

interface AuditSummary {
  dbPath: string;
  dbSizeBytes: number;
  tables: Array<{ name: string; rowCount: number; fields: string[] }>;
  findings: AuditFinding[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

function runAudit(): void {
  // ── 1. Check file exists ────────────────────────────────────────────────────
  banner('SQLite Development Database — Security Audit');

  if (!fs.existsSync(DB_PATH)) {
    console.log(`\n✓ Database file not found at: ${DB_PATH}`);
    console.log('  This is expected if dev.db was never committed or has been removed from HEAD.');
    console.log('  To audit a committed version, extract it from git history first:');
    console.log(`  git show HEAD:prisma/dev.db > /tmp/dev-db-audit.db`);
    console.log(`  npx ts-node scripts/audit-dev-db.ts /tmp/dev-db-audit.db\n`);
    process.exit(0);
  }

  const stats = fs.statSync(DB_PATH);
  console.log(`\nDatabase path : ${path.resolve(DB_PATH)}`);
  console.log(`File size     : ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`Last modified : ${stats.mtime.toISOString()}`);

  // ── 2. Open database (read-only) ────────────────────────────────────────────
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  const summary: AuditSummary = {
    dbPath: DB_PATH,
    dbSizeBytes: stats.size,
    tables: [],
    findings: [],
    riskLevel: 'LOW',
  };

  try {
    // ── 3. List all tables ──────────────────────────────────────────────────
    banner('Tables Found');

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log('\n  (no tables found — database may be empty or corrupted)');
    }

    for (const { name: tableName } of tables) {
      const rowCount = (db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get() as { cnt: number }).cnt;
      const pragma = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
        cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
      }>;
      const fields = pragma.map(p => p.name);

      summary.tables.push({ name: tableName, rowCount, fields });
      console.log(`\n  Table: ${tableName}  (${rowCount} rows)`);
      console.log(`  Fields: ${fields.join(', ')}`);

      // ── 4. Check field names ──────────────────────────────────────────────
      for (const field of fields) {
        if (isSensitiveField(field)) {
          const sample = db.prepare(`SELECT "${field}" FROM "${tableName}" WHERE "${field}" IS NOT NULL LIMIT 1`).get() as Record<string, unknown> | undefined;
          const sampleValue = sample?.[field];
          const tokenCheck = looksLikeToken(sampleValue);

          summary.findings.push({
            table: tableName,
            field,
            type: tokenCheck.isToken ? 'TOKEN_VALUE' : 'CREDENTIAL',
            rowCount,
            sampleRedacted: sampleValue != null ? redact(sampleValue) : '(no data)',
            tokenType: tokenCheck.type || undefined,
          });

          console.log(`  ⚠  SENSITIVE FIELD: ${field}${tokenCheck.isToken ? ` → looks like ${tokenCheck.type}` : ''}`);
          if (sampleValue != null) {
            console.log(`     Sample (redacted): ${redact(sampleValue)}`);
            if (typeof sampleValue === 'string' && sampleValue.length > 8) {
              console.log(`     SHA-256 fingerprint: ${fingerprint(sampleValue)}`);
            }
          }
        }

        if (isPiiField(field)) {
          const piiCount = (db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}" WHERE "${field}" IS NOT NULL AND "${field}" != ''`).get() as { cnt: number }).cnt;
          if (piiCount > 0) {
            summary.findings.push({
              table: tableName,
              field,
              type: 'PII',
              rowCount: piiCount,
              sampleRedacted: '(redacted — PII field)',
            });
            console.log(`  ⚠  PII FIELD: ${field} — ${piiCount} non-empty values`);
          }
        }
      }

      // ── 5. Scan all values in small tables for token patterns ─────────────
      if (rowCount > 0 && rowCount <= 1000) {
        const rows = db.prepare(`SELECT * FROM "${tableName}" LIMIT 1000`).all() as Array<Record<string, unknown>>;

        for (const row of rows) {
          for (const [col, val] of Object.entries(row)) {
            if (isSensitiveField(col)) continue; // already reported above
            const check = looksLikeToken(val);
            if (check.isToken) {
              const existing = summary.findings.find(f => f.table === tableName && f.field === col && f.type === 'TOKEN_VALUE');
              if (!existing) {
                summary.findings.push({
                  table: tableName,
                  field: col,
                  type: 'TOKEN_VALUE',
                  rowCount,
                  sampleRedacted: redact(val),
                  tokenType: check.type,
                });
                console.log(`  ⚠  TOKEN IN VALUE: ${col} — looks like ${check.type}`);
                console.log(`     Sample (redacted): ${redact(val)}`);
              }
            }
          }
        }
      }
    }

    // ── 6. Risk level assessment ────────────────────────────────────────────
    banner('Risk Assessment');

    const hasCredentials = summary.findings.some(f => f.type === 'TOKEN_VALUE' || f.type === 'CREDENTIAL');
    const hasPii = summary.findings.some(f => f.type === 'PII');
    const totalRows = summary.tables.reduce((acc, t) => acc + t.rowCount, 0);

    if (hasCredentials && hasPii && totalRows > 0) {
      summary.riskLevel = 'CRITICAL';
    } else if (hasCredentials || (hasPii && totalRows > 0)) {
      summary.riskLevel = 'HIGH';
    } else if (summary.findings.length > 0) {
      summary.riskLevel = 'MEDIUM';
    } else {
      summary.riskLevel = 'LOW';
    }

    const riskEmoji = { LOW: '✓', MEDIUM: '⚠', HIGH: '⚠⚠', CRITICAL: '🚨' }[summary.riskLevel];
    console.log(`\n  ${riskEmoji} Risk level: ${summary.riskLevel}`);
    console.log(`  Total rows across all tables: ${totalRows}`);
    console.log(`  Findings: ${summary.findings.length}`);
    console.log(`  Contains credentials/tokens: ${hasCredentials ? 'YES' : 'No'}`);
    console.log(`  Contains PII: ${hasPii ? 'YES' : 'No'}`);

    // ── 7. Findings summary ─────────────────────────────────────────────────
    if (summary.findings.length > 0) {
      banner('Findings Summary');
      for (const f of summary.findings) {
        console.log(`\n  [${f.type}] ${f.table}.${f.field}`);
        console.log(`    Rows with data: ${f.rowCount}`);
        if (f.tokenType) console.log(`    Token type: ${f.tokenType}`);
        console.log(`    Redacted sample: ${f.sampleRedacted}`);
      }
    }

    // ── 8. Recommended actions ──────────────────────────────────────────────
    banner('Recommended Actions');

    if (summary.riskLevel === 'CRITICAL' || summary.riskLevel === 'HIGH') {
      console.log(`
  1. IMMEDIATE: Rotate all secrets found in this database (see docs/security/secret-rotation-checklist.md)
  2. IMMEDIATE: If the repository was ever public, treat all data as compromised
  3. GDPR: Assess whether Article 33 breach notification applies (72-hour window)
  4. Remove from git history: follow docs/security/dev-db-removal.md
  5. Notify affected users if PII was exposed
`);
    } else if (summary.riskLevel === 'MEDIUM') {
      console.log(`
  1. Remove from git history: follow docs/security/dev-db-removal.md
  2. Review findings above and rotate any credentials found
  3. Add .gitignore entries to prevent recurrence
`);
    } else {
      console.log(`
  1. Remove from git history as a precaution: follow docs/security/dev-db-removal.md
  2. Add .gitignore entries to prevent future commits
`);
    }

    // ── 9. Write JSON report ────────────────────────────────────────────────
    const reportPath = path.join(process.cwd(), 'docs', 'security', 'audit-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      ...summary,
      generatedAt: new Date().toISOString(),
      // Never write actual values to the report — fingerprints only
      findings: summary.findings.map(f => ({
        ...f,
        sampleRedacted: f.sampleRedacted,
      })),
    }, null, 2));

    console.log(`\n  Full report written to: ${reportPath}`);
    console.log('  ⚠  Do not commit audit-report.json — add it to .gitignore\n');

  } finally {
    db.close();
  }
}

// ─── Extract from git history (helper) ────────────────────────────────────────

function printExtractInstructions(): void {
  console.log(`
To audit a database that was committed but already removed from HEAD:

  # Extract the file from the last commit that contained it
  COMMIT=$(git log --all --full-history -- "prisma/dev.db" | head -1 | awk '{print $2}')
  git show $COMMIT:prisma/dev.db > /tmp/dev-db-audit.db
  npx ts-node scripts/audit-dev-db.ts /tmp/dev-db-audit.db

  # Clean up after review
  rm /tmp/dev-db-audit.db
`);
}

// ─── Entry point ───────────────────────────────────────────────────────────────

if (process.argv.includes('--help')) {
  console.log('Usage: npx ts-node scripts/audit-dev-db.ts [path-to-db]');
  printExtractInstructions();
  process.exit(0);
}

runAudit();
