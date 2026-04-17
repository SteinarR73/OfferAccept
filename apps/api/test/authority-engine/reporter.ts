/**
 * Authority Engine — Custom Jest Reporter
 *
 * Collects all test results and outputs the canonical Authority Engine
 * Launch Gate Report at the end of the run. Also writes the report to
 * `authority-engine-report.txt` in the repo root.
 *
 * Test naming convention for gate mapping:
 *   describe block must start with "<GATE_ID> · <Gate Name>"
 *   e.g. "S1 · Admin MFA Enforcement (P0)"
 *
 * Priority is parsed from the describe label:
 *   (P0) = Launch blocker
 *   (P1) = Production safety
 *   (P2) = Observability / scaling readiness (WARNING only)
 */

import * as fs from 'fs';
import * as path from 'path';

interface GateResult {
  id: string;
  name: string;
  priority: 'P0' | 'P1' | 'P2';
  status: 'PASS' | 'FAIL' | 'WARNING';
  failures: string[];
}

// Map describe-block label → gate metadata
const GATE_MAP: Record<string, { group: string; priority: 'P0' | 'P1' | 'P2' }> = {
  'S1': { group: 'Security Gates',      priority: 'P0' },
  'S2': { group: 'Security Gates',      priority: 'P0' },
  'S3': { group: 'Security Gates',      priority: 'P1' },
  'F1': { group: 'Financial Gates',     priority: 'P0' },
  'F2': { group: 'Financial Gates',     priority: 'P0' },
  'F3': { group: 'Financial Gates',     priority: 'P0' },
  'D1': { group: 'Database Gates',      priority: 'P0' },
  'D2': { group: 'Database Gates',      priority: 'P0' },
  'D3': { group: 'Database Gates',      priority: 'P1' },
  'W1': { group: 'Worker Gates',        priority: 'P1' },
  'W2': { group: 'Worker Gates',        priority: 'P1' },
  'A1': { group: 'AI Cost Gates',       priority: 'P1' },
  'A2': { group: 'AI Cost Gates',       priority: 'P1' },
  'O1': { group: 'Observability',       priority: 'P1' },
  'O2': { group: 'Observability',       priority: 'P1' },
  'O3': { group: 'Observability',       priority: 'P2' },
  'P1': { group: 'Product Behavior',    priority: 'P0' },
  'P2': { group: 'Product Behavior',    priority: 'P0' },
  'B1': { group: 'Abuse Protection',    priority: 'P1' },
  'B2': { group: 'Abuse Protection',    priority: 'P1' },
};

class AuthorityEngineReporter {
  private gates = new Map<string, GateResult>();
  private startTime = Date.now();

  // Jest calls this for each test result
  onTestResult(
    _test: unknown,
    testResult: {
      testResults: Array<{
        ancestorTitles: string[];
        title: string;
        status: 'passed' | 'failed' | 'pending' | 'todo';
        failureMessages: string[];
      }>;
    },
  ) {
    for (const t of testResult.testResults) {
      // Expect first ancestor title to be "GateId · Gate Name (Px)"
      const describeLabel = t.ancestorTitles[0] ?? '';
      const match = describeLabel.match(/^([A-Z]\d+)\s*·\s*(.+?)\s*\((P[012])\)/);
      if (!match) continue;

      const [, id, fullName, priority] = match;
      const gateKey = id;

      if (!this.gates.has(gateKey)) {
        this.gates.set(gateKey, {
          id,
          name: fullName.trim(),
          priority: priority as 'P0' | 'P1' | 'P2',
          status: 'PASS',
          failures: [],
        });
      }

      const gate = this.gates.get(gateKey)!;

      if (t.status === 'failed') {
        // P2 failures are warnings only
        if (gate.priority === 'P2') {
          gate.status = 'WARNING';
        } else {
          gate.status = 'FAIL';
        }
        gate.failures.push(`  ✗ ${t.title}`);
        if (t.failureMessages.length > 0) {
          const msg = t.failureMessages[0]
            .split('\n')
            .slice(0, 3)
            .map((l) => `      ${l}`)
            .join('\n');
          gate.failures.push(msg);
        }
      }
    }
  }

  onRunComplete() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const report = this.buildReport(elapsed);

    // Print to stdout
    process.stdout.write('\n' + report + '\n');

    // Write to file
    const outPath = path.resolve(__dirname, '../../../../authority-engine-report.txt');
    try {
      fs.writeFileSync(outPath, report, 'utf-8');
      process.stdout.write(`\nReport written to: authority-engine-report.txt\n`);
    } catch {
      // Don't fail the run if file write fails (e.g., read-only CI)
    }

    // Exit 1 if any P0 or P1 gate failed
    const blockers = [...this.gates.values()].filter(
      (g) => g.status === 'FAIL' && (g.priority === 'P0' || g.priority === 'P1'),
    );
    if (blockers.length > 0) {
      process.exitCode = 1;
    }
  }

  private buildReport(elapsed: string): string {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
    const groups = new Map<string, GateResult[]>();

    // Sort gates by ID
    const sortedGates = [...this.gates.values()].sort((a, b) => a.id.localeCompare(b.id));

    for (const gate of sortedGates) {
      const meta = GATE_MAP[gate.id];
      const groupName = meta?.group ?? 'Other';
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName)!.push(gate);
    }

    const lines: string[] = [];
    const W = 60;
    const border = '═'.repeat(W);
    const thin = '─'.repeat(W);

    lines.push(`╔${border}╗`);
    lines.push(center('  Authority Engine Launch Gate Report  ', W + 2));
    lines.push(center(`  ${now}  `, W + 2));
    lines.push(`╚${border}╝`);
    lines.push('');

    const failedGates: GateResult[] = [];

    for (const [groupName, gates] of groups) {
      lines.push(`${groupName}:`);
      for (const gate of gates) {
        const statusLabel = gate.status === 'PASS'
          ? '  PASS  '
          : gate.status === 'FAIL'
            ? '  FAIL  '
            : ' WARNING';
        const badge = gate.status === 'PASS'
          ? `[ PASS ]`
          : gate.status === 'FAIL'
            ? `[ FAIL ]`
            : `[ WARN ]`;
        const prio = `(${gate.priority})`;
        lines.push(`  ${gate.id.padEnd(3)} ${badge} ${prio} ${gate.name}`);
        if (gate.failures.length > 0) {
          for (const f of gate.failures) lines.push(f);
        }
      }
      lines.push('');
    }

    lines.push(thin);

    const allGates = [...this.gates.values()];
    const p0Fail = allGates.filter((g) => g.priority === 'P0' && g.status === 'FAIL').length;
    const p1Fail = allGates.filter((g) => g.priority === 'P1' && g.status === 'FAIL').length;
    const p2Warn = allGates.filter((g) => g.status === 'WARNING').length;
    const totalPass = allGates.filter((g) => g.status === 'PASS').length;

    lines.push(`Summary: ${totalPass} PASS  |  ${p0Fail + p1Fail} FAIL  |  ${p2Warn} WARN  (${elapsed}s)`);
    lines.push('');

    const finalStatus =
      p0Fail > 0 || p1Fail > 0
        ? '  ✗  BLOCKED — NOT SAFE FOR PRODUCTION DEPLOY  '
        : p2Warn > 0
          ? '  ~  SAFE WITH WARNINGS — review P2 items before deploy  '
          : '  ✓  SAFE FOR PRODUCTION DEPLOY  ';

    lines.push(`╔${border}╗`);
    lines.push(center(`FINAL STATUS:`, W + 2));
    lines.push(center(finalStatus, W + 2));
    lines.push(`╚${border}╝`);

    return lines.join('\n');
  }
}

function center(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return '║' + ' '.repeat(pad) + text + ' '.repeat(width - pad - text.length - 2) + '║';
}

module.exports = AuthorityEngineReporter;
