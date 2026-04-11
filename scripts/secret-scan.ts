#!/usr/bin/env tsx
/**
 * secret-scan.ts
 *
 * CI-safe secret scanner that checks all tracked files (or a specified
 * file list) for patterns that indicate leaked credentials.
 *
 * Usage:
 *   # Scan all tracked files (CI default)
 *   tsx scripts/secret-scan.ts
 *
 *   # Scan only staged files (pre-commit fast path)
 *   tsx scripts/secret-scan.ts --staged
 *
 *   # Scan a specific file list piped in (e.g. from git diff)
 *   git diff --name-only HEAD~1 | tsx scripts/secret-scan.ts --files -
 *
 * Exit codes:
 *   0 — no violations found
 *   1 — one or more violations found (CI should fail the build)
 *
 * Limitations:
 *   - Pattern-based: will not catch all secrets, only common formats.
 *   - False-positive suppression: lines containing 'example', 'test',
 *     'placeholder', or 'YOUR_' are skipped (case-insensitive).
 *   - Binary files are skipped automatically.
 */

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Rule {
  name: string;
  pattern: RegExp;
  /** Brief guidance shown when the pattern matches */
  remediation: string;
}

interface Violation {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
}

// ── Detection rules ───────────────────────────────────────────────────────────

const RULES: Rule[] = [
  {
    name: 'stripe-live-secret',
    pattern: /sk_live_[A-Za-z0-9]{20,}/,
    remediation: 'Rotate the key at dashboard.stripe.com/apikeys and remove from source.',
  },
  {
    name: 'stripe-live-publishable',
    pattern: /pk_live_[A-Za-z0-9]{20,}/,
    remediation: 'Publishable keys are low risk but should not be hardcoded — move to env vars.',
  },
  {
    name: 'stripe-webhook-secret',
    pattern: /whsec_[A-Za-z0-9]{20,}/,
    remediation: 'Rotate webhook secret in Stripe dashboard and remove from source.',
  },
  {
    name: 'aws-access-key-id',
    pattern: /AKIA[A-Z0-9]{16}/,
    remediation: 'Deactivate the AWS key immediately at console.aws.amazon.com/iam.',
  },
  {
    name: 'aws-secret-access-key',
    // 40-char base64 string after common assignment patterns
    pattern: /(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[=:]\s*['"]?[A-Za-z0-9+/]{40}['"]?/,
    remediation: 'Rotate AWS credentials immediately.',
  },
  {
    name: 'private-key-header',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    remediation: 'Remove private key material from source entirely.',
  },
  {
    name: 'long-jwt-secret-assignment',
    // Matches JWT_SECRET = <≥32 chars> — likely a real secret value
    pattern: /JWT_SECRET\s*[=:]\s*['"]?[A-Za-z0-9+/=_\-]{32,}['"]?/,
    remediation: 'Move JWT_SECRET value to an environment variable or secrets manager; do not hardcode it.',
  },
  {
    name: 'gemini-api-key',
    pattern: /AIza[A-Za-z0-9_\-]{35}/,
    remediation: 'Rotate the Gemini/Google API key at console.cloud.google.com.',
  },
  {
    name: 'generic-secret-assignment-40chars',
    // SOME_SECRET = <40+ char value>; avoids short test/placeholder values
    pattern: /(?:SECRET|API_KEY|ACCESS_TOKEN|PRIVATE_KEY)\s*[=:]\s*['"]?[A-Za-z0-9+/=_\-]{40,}['"]?/i,
    remediation: 'Possible secret — verify this is not a real credential and move to env vars.',
  },
  {
    name: 'database-url-with-password',
    // postgresql://user:password@host/db — catches embedded credentials
    pattern: /(?:postgresql|postgres|mysql|mongodb):\/\/[^:@\s]+:[^@\s]{8,}@/i,
    remediation: 'Remove database password from the connection string; use env vars.',
  },
];

// ── File exclusions ───────────────────────────────────────────────────────────

/** Directories and file patterns that are never scanned */
const EXCLUDE_PATTERNS: RegExp[] = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.next\//,
  /coverage\//,
  /pnpm-lock\.yaml$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.gif$/i,
  /\.ico$/i,
  /\.woff2?$/i,
  /\.ttf$/i,
  /\.pdf$/i,
  /\.zip$/i,
];

/** Line-level false positive suppression — skip lines containing these strings */
const FALSE_POSITIVE_TOKENS = ['example', 'test', 'placeholder', 'your_', 'xxx', '<secret>', '${'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTrackedFiles(): string[] {
  const output = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' });
  return output
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

function getStagedFiles(): string[] {
  const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  return output
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

function shouldExclude(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some((p) => p.test(filePath));
}

function isBinary(filePath: string): boolean {
  try {
    const stat = statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) return true; // skip files > 5 MB
    const buf = readFileSync(filePath);
    // If the first 512 bytes contain a null byte, treat as binary
    const sample = buf.subarray(0, Math.min(512, buf.length));
    return sample.includes(0);
  } catch {
    return true;
  }
}

function scanFile(filePath: string): Violation[] {
  if (shouldExclude(filePath) || isBinary(filePath)) return [];

  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const violations: Violation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lowerLine = line.toLowerCase();

    // Skip lines that are likely test/example values
    if (FALSE_POSITIVE_TOKENS.some((token) => lowerLine.includes(token))) continue;

    // Skip comment-only lines in common languages
    if (/^\s*(\/\/|#|\/\*|\*)\s/.test(line)) continue;

    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          rule: rule.name,
          // Truncate long lines for display; mask the middle of potential secrets
          excerpt: line.length > 120 ? `${line.slice(0, 60)}…${line.slice(-20)}` : line.trim(),
        });
        // One violation per rule per line — avoid duplicate alerts for the same line
        break;
      }
    }
  }

  return violations;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const staged = args.includes('--staged');

  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

  const files = staged ? getStagedFiles() : getTrackedFiles();
  const absoluteFiles = files.map((f) => path.join(repoRoot, f));

  console.log(`[secret-scan] Scanning ${files.length} files${staged ? ' (staged only)' : ''}…`);

  const allViolations: Violation[] = [];

  for (const absoluteFile of absoluteFiles) {
    const violations = scanFile(absoluteFile);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log('[secret-scan] ✓ No secret patterns found.');
    process.exit(0);
  }

  console.error(`\n[secret-scan] ✗ Found ${allViolations.length} potential secret(s):\n`);

  for (const v of allViolations) {
    const relPath = path.relative(repoRoot, v.file);
    const rule = RULES.find((r) => r.name === v.rule)!;
    console.error(`  ${relPath}:${v.line}  [${v.rule}]`);
    console.error(`    ${v.excerpt}`);
    console.error(`    → ${rule.remediation}`);
    console.error('');
  }

  console.error('[secret-scan] Fix the issues above before merging.');
  console.error('If this is a false positive, add an exception comment:');
  console.error('  // secret-scan-ignore: <reason>');
  console.error('or prefix the line with a FALSE_POSITIVE_TOKEN (e.g. "example").');

  process.exit(1);
}

main();
