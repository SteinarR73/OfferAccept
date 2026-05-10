#!/usr/bin/env tsx
/**
 * terminology-audit.ts
 *
 * Scans user-facing source files for banned "deal" phrases that should no
 * longer appear in recipient-facing, marketing-facing, or onboarding-facing
 * copy following the v1 terminology refactor.
 *
 * Background
 * ----------
 * "deal" remains valid as internal legacy terminology only (component names,
 * variable identifiers, route paths, Prisma models, API payload keys). User-
 * facing copy should use "document", "acceptance", or a context-specific noun
 * (e.g. "proposal", "agreement", "offer letter").
 *
 * Usage
 *   pnpm terminology:audit          — scan all user-facing directories
 *   pnpm terminology:audit --fix    — (future) auto-suggest replacements
 *
 * Exit codes
 *   0 — no violations found
 *   1 — one or more violations found (CI should fail the build)
 *
 * Adding a permanent exception
 * ----------------------------
 * If a future string must contain a banned phrase for a legitimate reason
 * (e.g. a legal quote, a third-party brand name), add a comment on the same
 * line containing the exact token:
 *
 *   const legalQuote = 'This is not a new deal under law'; // terminology-audit-ignore
 *
 * This is intentionally narrow: the token suppresses only the one line it
 * appears on and must be justified in a code review.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Configuration ────────────────────────────────────────────────────────────

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

/**
 * Directories containing user-facing copy.
 * Test files inside these directories are excluded automatically.
 */
const SCAN_DIRS = [
  'apps/web/src/app/landing',
  'apps/web/src/app/no/landing',
  'apps/web/src/app/pricing',
  'apps/web/src/app/no/pricing',
  'apps/web/src/app/accept',
  'apps/web/src/components/onboarding',
  'apps/web/src/components/dashboard',
  // Actual path (task brief specified the legacy path — both are checked)
  'apps/api/src/common/email/templates',
];

/**
 * Banned user-facing phrases (matched case-insensitively as substrings).
 *
 * These are targeted at *recipient/marketing copy* patterns, not at the word
 * "deal" in isolation (which appears legitimately in variable names, routes,
 * and identifiers).
 */
const BANNED_PHRASES: string[] = [
  'sent you a deal',
  'deal waiting',
  'review this deal',
  'accept this deal',
  'deal from',     // catches "Deal from Acme" — space prevents false-positives on camelCase
  'new deal',      // catches "New deal" button — space prevents false-positives on "newDeal"
  'send deal',     // catches "Send deal" button
  'deal accepted', // catches "Deal accepted" heading
  'deal declined', // catches "Deal declined" heading
];

/**
 * Per-line allowlist patterns.
 *
 * A line matching any of these is skipped even if it contains a banned phrase.
 * These cover legitimate technical usages that are not user-visible copy.
 */
const ALLOWLIST_LINE_PATTERNS: RegExp[] = [
  // Route path segments — /dashboard/deals, /deals/new, /deals/[id]
  /['"](\/dashboard)?\/deals(\/|\?|'|")/,
  // Href and router.push calls containing /deals/
  /\bhref\s*=.*\/deals/,
  /router\.(push|replace)\s*\(.*deals/,
  // Internal identifier references (camelCase / PascalCase)
  /\b(dealName|dealType|draftOfferId|newDealHref|handleSendFirstDeal|isFirstDeal|firstDeal)\b/,
  /\b(DealSummaryCard|DealActivityLog|DealTypeBadge|DealTemplate|DEAL_TEMPLATES)\b/,
  /\b(FirstDealEmptyState|FirstDealOnboarding|NewDealWizard)\b/,
  // Import / export statements
  /^\s*(import|export)\s/,
  // TypeScript type annotations and interface definitions
  /^\s*(interface|type|enum)\s/,
  // Variable / function declarations where the identifier contains "deal"
  /\b(const|let|var|function)\s+\w*[Dd]eal\w*/,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INLINE_IGNORE_TOKEN = 'terminology-audit-ignore';

function collectFiles(dir: string, extensions = ['.tsx', '.ts', '.js']): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, extensions));
    } else if (extensions.some((ext) => full.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function isTestFile(filePath: string): boolean {
  return (
    filePath.includes('__tests__') ||
    filePath.endsWith('.test.ts') ||
    filePath.endsWith('.test.tsx') ||
    filePath.endsWith('.spec.ts') ||
    filePath.endsWith('.spec.tsx')
  );
}

/** True if the line is entirely a comment (not mixed comment+code). */
function isCommentOnlyLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('//') ||
    t.startsWith('*') ||   // inside /* */ blocks
    t.startsWith('/*') ||
    t.startsWith('<!--')   // HTML/JSX comments
  );
}

function isAllowlisted(line: string): boolean {
  return ALLOWLIST_LINE_PATTERNS.some((p) => p.test(line));
}

function hasBannedPhrase(line: string): string | null {
  const lower = line.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  phrase: string;
  content: string;
}

const violations: Violation[] = [];

for (const relDir of SCAN_DIRS) {
  const absDir = join(ROOT, relDir);
  const files = collectFiles(absDir);

  for (const file of files) {
    if (isTestFile(file)) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const relPath = relative(ROOT, file);

    lines.forEach((line, idx) => {
      // Skip lines with the inline suppression token
      if (line.includes(INLINE_IGNORE_TOKEN)) return;
      // Skip comment-only lines
      if (isCommentOnlyLine(line)) return;
      // Skip lines matching known-safe technical patterns
      if (isAllowlisted(line)) return;

      const phrase = hasBannedPhrase(line);
      if (phrase) {
        violations.push({ file: relPath, line: idx + 1, phrase, content: line.trim() });
      }
    });
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────

if (violations.length === 0) {
  console.log('✓ Terminology audit passed — no banned user-facing "deal" phrases found.\n');
  console.log(`  Scanned directories:\n${SCAN_DIRS.map((d) => `    ${d}`).join('\n')}`);
  console.log(`\n  Banned phrases checked (${BANNED_PHRASES.length}):`);
  BANNED_PHRASES.forEach((p) => console.log(`    "${p}"`));
  process.exit(0);
} else {
  console.error(`\n✗ Terminology audit failed — ${violations.length} violation(s) found.\n`);
  console.error('  User-facing copy must not contain legacy "deal" phrases.');
  console.error('  Replace with "document", "acceptance", or a context-specific noun.\n');

  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Phrase: "${v.phrase}"`);
    console.error(`    Line:   ${v.content}`);
    console.error('');
  }

  console.error('  To suppress a legitimate exception, add a comment on the same line:');
  console.error('    // terminology-audit-ignore\n');

  process.exit(1);
}
