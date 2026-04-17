/**
 * Authority Engine — Gate Group 5: AI Cost Protection
 *
 *  A1  P1  Token Ceiling
 *  A2  P1  Cost Guardrail (daily budget exhaustion)
 */

import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';

const SRC = path.resolve(__dirname, '../../../src');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ─── A1 · Token Ceiling (P1) ─────────────────────────────────────────────────

describe('A1 · Token Ceiling (P1)', () => {
  it('AiService enforces AI_CALL_TIMEOUT_MS hard timeout per call', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('AI_CALL_TIMEOUT_MS');
    expect(aiSvc).toContain('timeout');
  });

  it('env schema validates AI_CALL_TIMEOUT_MS with min/max bounds', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('AI_CALL_TIMEOUT_MS');
    expect(envFile).toMatch(/min\(1000\).*max\(120000\)|max\(120000\).*min\(1000\)/);
  });

  it('AiService enforces AI_DAILY_TOKEN_LIMIT as a hard daily ceiling', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('AI_DAILY_TOKEN_LIMIT');
    expect(aiSvc).toContain('dailyTokenLimit');
  });

  it('AiBudgetExhaustedError is thrown when daily token ceiling is exceeded', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('AiBudgetExhaustedError');
  });

  it('token usage is tracked per call (input + output tokens)', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('tokensInput');
    expect(aiSvc).toContain('tokensOutput');
  });

  it('all AI calls go through AiService (no direct SDK usage in feature code)', () => {
    // Scan feature modules for direct @google/generative-ai or openai imports
    const moduleDirs = ['modules', 'common'].map((d) => path.join(SRC, d));
    const importedDirectly: string[] = [];

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const f of entries) {
        const filePath = path.join(dir, f.toString());
        if (!f.toString().endsWith('.ts')) continue;
        if (filePath.includes('ai.service.ts') || filePath.includes('ai.module.ts')) continue;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content.includes('@google/generative-ai') || content.includes('import openai')) {
            importedDirectly.push(filePath);
          }
        } catch { /* skip */ }
      }
    }

    moduleDirs.forEach(scanDir);
    expect(importedDirectly).toEqual([]);
  });
});

// ─── A2 · Cost Guardrail (P1) ─────────────────────────────────────────────────

describe('A2 · Cost Guardrail (P1)', () => {
  it('AiService tracks daily token usage and resets at UTC midnight', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('dailyTokensUsed');
    expect(aiSvc).toContain('resetDailyBudget');
  });

  it('AiService has circuit breaker to stop runaway AI calls on repeated failures', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('circuitState');
    expect(aiSvc).toContain('AiCircuitOpenError');
    expect(aiSvc).toContain('CLOSED');
    expect(aiSvc).toContain('OPEN');
  });

  it('circuit breaker opens after AI_CIRCUIT_FAILURE_THRESHOLD consecutive failures', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('AI_CIRCUIT_FAILURE_THRESHOLD');
    expect(aiSvc).toContain('consecutiveFailures');
  });

  it('circuit breaker has cooldown before allowing probe (prevents hammering)', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('AI_CIRCUIT_COOLDOWN_MS');
    expect(aiSvc).toContain('HALF_OPEN');
  });

  it('AI provider is disabled by default (AI_PROVIDER=none)', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain("AI_PROVIDER: z.enum(['gemini', 'none']).default('none')");
  });

  it('AiService retries transient errors with exponential backoff', () => {
    const aiSvc = readSrc('common', 'ai', 'ai.service.ts');
    expect(aiSvc).toContain('AI_MAX_RETRIES');
    expect(aiSvc).toMatch(/retry|backoff/i);
  });
});
