import { defineConfig, devices } from '@playwright/test';

// ─── Playwright configuration ─────────────────────────────────────────────────
// E2E tests require a running API + web server.
//
// Local usage:
//   docker compose up -d          # start Postgres + Redis
//   npm run dev --workspace=apps/api &
//   npm run test:e2e --workspace=apps/web
//
// CI: add a 'test-e2e' job after the 'build' job, using the full Docker Compose
// stack (docker compose --profile full up -d) and set BASE_URL accordingly.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // signing flows have sequential state; run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    // Cookie-based auth — preserve cookies within a test
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
