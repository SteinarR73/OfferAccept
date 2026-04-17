'use strict';
/**
 * Authority Engine — Custom Jest Reporter (CommonJS)
 *
 * Produces the Authority Engine Launch Gate Report after the test run.
 * Writes authority-engine-report.txt to the repo root.
 * Exits with code 1 if any P0/P1 gate fails.
 *
 * Test naming convention:
 *   describe('S1 · Admin MFA Enforcement (P0)', () => { ... })
 *   The gate ID is the first token before ' · '
 */

const fs = require('fs');
const path = require('path');

// Priority is inferred from the gate ID prefix if not in the label
const GATE_META = {
  S1: { group: 'Security Gates',    priority: 'P0' },
  S2: { group: 'Security Gates',    priority: 'P0' },
  S3: { group: 'Security Gates',    priority: 'P1' },
  F1: { group: 'Financial Gates',   priority: 'P0' },
  F2: { group: 'Financial Gates',   priority: 'P0' },
  F3: { group: 'Financial Gates',   priority: 'P0' },
  D1: { group: 'Database Gates',    priority: 'P0' },
  D2: { group: 'Database Gates',    priority: 'P0' },
  D3: { group: 'Database Gates',    priority: 'P1' },
  W1: { group: 'Worker Gates',      priority: 'P1' },
  W2: { group: 'Worker Gates',      priority: 'P1' },
  A1: { group: 'AI Cost Gates',     priority: 'P1' },
  A2: { group: 'AI Cost Gates',     priority: 'P1' },
  O1: { group: 'Observability',     priority: 'P1' },
  O2: { group: 'Observability',     priority: 'P1' },
  O3: { group: 'Observability',     priority: 'P2' },
  P1: { group: 'Product Behavior',  priority: 'P0' },
  P2: { group: 'Product Behavior',  priority: 'P0' },
  B1: { group: 'Abuse Protection',  priority: 'P1' },
  B2: { group: 'Abuse Protection',  priority: 'P1' },
};

class AuthorityEngineReporter {
  constructor(_globalConfig, _options) {
    this._gates = new Map();
    this._startTime = Date.now();
  }

  onTestResult(_test, testResult) {
    for (const t of testResult.testResults) {
      const describeLabel = (t.ancestorTitles || [])[0] || '';
      // Match: "S1 · Admin MFA Enforcement (P0)"
      const match = describeLabel.match(/^([A-Z]\d+)\s*·\s*(.+?)\s*\((P[012])\)/);
      if (!match) continue;

      const [, id, fullName, priority] = match;

      if (!this._gates.has(id)) {
        this._gates.set(id, {
          id,
          name: fullName.trim(),
          priority,
          status: 'PASS',
          failures: [],
        });
      }

      const gate = this._gates.get(id);

      if (t.status === 'failed') {
        gate.status = priority === 'P2' ? 'WARNING' : 'FAIL';
        gate.failures.push(`  ✗ ${t.title}`);
        if (t.failureMessages && t.failureMessages.length > 0) {
          const msg = t.failureMessages[0]
            .split('\n')
            .slice(0, 3)
            .map((l) => `    ${l}`)
            .join('\n');
          gate.failures.push(msg);
        }
      }
    }
  }

  onRunComplete(_contexts, results) {
    const elapsed = ((Date.now() - this._startTime) / 1000).toFixed(1);
    const report = this._buildReport(elapsed);

    process.stdout.write('\n' + report + '\n');

    // Write report file to repo root
    const outPath = path.resolve(__dirname, '../../../../authority-engine-report.txt');
    try {
      fs.writeFileSync(outPath, report, 'utf-8');
      process.stdout.write('\nReport written: authority-engine-report.txt\n');
    } catch (_) {
      // Non-fatal — CI artifact upload will pick up what it can
    }

    // Signal failure if any P0/P1 gate failed
    const blockers = [...this._gates.values()].filter(
      (g) => g.status === 'FAIL' && g.priority !== 'P2',
    );
    if (blockers.length > 0) {
      // Jest will read process.exitCode
      process.exitCode = 1;
    }
  }

  _buildReport(elapsed) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const W = 62;
    const border = '═'.repeat(W);
    const thin = '─'.repeat(W);

    const groups = new Map();
    const sorted = [...this._gates.values()].sort((a, b) => a.id.localeCompare(b.id));

    for (const gate of sorted) {
      const meta = GATE_META[gate.id] || { group: 'Other', priority: gate.priority };
      if (!groups.has(meta.group)) groups.set(meta.group, []);
      groups.get(meta.group).push(gate);
    }

    const lines = [];

    lines.push(`╔${border}╗`);
    lines.push(box('  Authority Engine — Launch Gate Report  ', W));
    lines.push(box(`  ${now}  `, W));
    lines.push(`╚${border}╝`);
    lines.push('');

    for (const [groupName, gates] of groups) {
      lines.push(`${groupName}:`);
      for (const gate of gates) {
        const badge =
          gate.status === 'PASS'    ? '[ PASS ]' :
          gate.status === 'FAIL'    ? '[ FAIL ]' :
                                      '[ WARN ]';
        lines.push(`  ${gate.id.padEnd(3)} ${badge} (${gate.priority}) ${gate.name}`);
        for (const f of gate.failures) lines.push(f);
      }
      lines.push('');
    }

    lines.push(thin);

    const all = [...this._gates.values()];
    const pass    = all.filter((g) => g.status === 'PASS').length;
    const fail    = all.filter((g) => g.status === 'FAIL').length;
    const warn    = all.filter((g) => g.status === 'WARNING').length;
    const missing = Object.keys(GATE_META).length - all.length;

    lines.push(`Summary: ${pass} PASS  |  ${fail} FAIL  |  ${warn} WARN  |  ${missing} NOT RUN  (${elapsed}s)`);
    lines.push('');

    const blocked = fail > 0;
    const finalMsg = blocked
      ? '  ✗  BLOCKED — NOT SAFE FOR PRODUCTION DEPLOY  '
      : warn > 0
        ? '  ~  SAFE WITH WARNINGS — review P2 items  '
        : '  ✓  SAFE FOR PRODUCTION DEPLOY  ';

    lines.push(`╔${border}╗`);
    lines.push(box('FINAL STATUS:', W));
    lines.push(box(finalMsg, W));
    lines.push(`╚${border}╝`);

    return lines.join('\n');
  }
}

function box(text, width) {
  const inner = width; // width between ║ chars = W
  const pad = Math.max(0, Math.floor((inner - text.length) / 2));
  const right = inner - pad - text.length;
  return '║' + ' '.repeat(pad) + text + ' '.repeat(Math.max(0, right)) + '║';
}

module.exports = AuthorityEngineReporter;
