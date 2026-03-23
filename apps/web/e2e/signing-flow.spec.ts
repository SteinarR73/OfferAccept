import { test, expect } from '@playwright/test';

// ─── Signing flow E2E ─────────────────────────────────────────────────────────
// Tests the full recipient-side signing journey:
//   /sign/:token  → OTP verification → acceptance → completion certificate
//
// Prerequisites (must be running before this test suite):
//   - API server at NEXT_PUBLIC_API_URL (default http://localhost:3001/api/v1)
//   - Web server at BASE_URL (default http://localhost:3000)
//
// The test uses a SENT offer token seeded by the API's e2e test helpers or a
// real token set via the PLAYWRIGHT_SIGN_TOKEN env var.
//
// If no token is provided the tests are skipped with an informative message.

const SIGN_TOKEN = process.env.PLAYWRIGHT_SIGN_TOKEN;

// ─── Skip guard ────────────────────────────────────────────────────────────────

test.beforeAll(() => {
  if (!SIGN_TOKEN) {
    console.warn(
      '[E2E] PLAYWRIGHT_SIGN_TOKEN not set — signing flow tests skipped.\n' +
        'Set PLAYWRIGHT_SIGN_TOKEN to a valid SENT offer token to run these tests.',
    );
  }
});

// ─── Signing page — initial load ───────────────────────────────────────────────

test('signing page loads and shows offer details', async ({ page }) => {
  test.skip(!SIGN_TOKEN, 'PLAYWRIGHT_SIGN_TOKEN not set');

  await page.goto(`/sign/${SIGN_TOKEN}`);

  // Trust banner should be visible on every signing step
  await expect(page.getByText('Secure signing session')).toBeVisible();

  // OTP entry form should render
  await expect(page.getByRole('heading', { name: /verify/i })).toBeVisible();
});

// ─── Signing page — OTP error state ───────────────────────────────────────────

test('signing page shows error on invalid OTP', async ({ page }) => {
  test.skip(!SIGN_TOKEN, 'PLAYWRIGHT_SIGN_TOKEN not set');

  await page.goto(`/sign/${SIGN_TOKEN}`);

  // Enter an obviously wrong OTP
  await page.getByRole('textbox').fill('000000');
  await page.getByRole('button', { name: /verify/i }).click();

  // Error state should appear — the exact message depends on API response
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
});

// ─── Signing page — expired / not-found token ─────────────────────────────────

test('signing page handles invalid token gracefully', async ({ page }) => {
  await page.goto('/sign/invalid-token-that-does-not-exist');

  // Should not show a raw error — either an error card or redirect
  // The page must NOT display an unhandled exception stack trace
  await expect(page.locator('pre')).not.toBeVisible({ timeout: 3000 });

  // Should show some form of "not found" or "expired" UI
  const body = await page.textContent('body');
  expect(body).not.toContain('Unhandled');
  expect(body).not.toContain('NEXT_NOT_FOUND');
});

// ─── Landing page ─────────────────────────────────────────────────────────────

test('landing page renders core sections', async ({ page }) => {
  await page.goto('/landing');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // CTA buttons
  await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
});

// ─── Login page ───────────────────────────────────────────────────────────────

test('login page shows error on bad credentials', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel(/email/i).fill('nobody@example.com');
  await page.getByLabel(/password/i).fill('wrongpassword');
  await page.getByRole('button', { name: /sign in/i }).click();

  // API returns 401 — the login form should show an error alert
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
});

// ─── Unauthenticated redirect ─────────────────────────────────────────────────

test('dashboard redirects unauthenticated users', async ({ page }) => {
  // Fresh context — no auth cookies
  await page.goto('/dashboard');

  // Should end up on login or landing, not the dashboard
  await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 5000 });
  expect(page.url()).not.toContain('/dashboard');
});
