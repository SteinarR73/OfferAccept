import { test, expect } from '@playwright/test';

// ─── Landing and Auth Flow E2E ────────────────────────────────────────────────

test.describe('Auth Flow', () => {
  test('landing page renders core sections and links', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // CTA buttons
    const signInBtn = page.getByRole('link', { name: /sign in|log in/i }).first();
    await expect(signInBtn).toBeVisible();
  });

  test('login page shows error on bad credentials', async ({ page }) => {
    // Mock the login API to fail
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        json: { code: 'UNAUTHORIZED', message: 'Invalid credentials' }
      });
    });

    await page.goto('/login');

    await page.getByLabel(/email/i).fill('nobody@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // API returns 401 — the login form should show an error alert
    await expect(page.getByRole('alert')).toContainText(/Invalid credentials/i);
  });
});
