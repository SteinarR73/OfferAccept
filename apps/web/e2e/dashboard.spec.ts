import { test, expect } from '@playwright/test';

// ─── Dashboard E2E (Mocked) ───────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    // Without oa_sess cookie, this will either be a 302 or handled by Next.js middleware
    await page.goto('/dashboard');
    await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });

  test.describe('Authenticated Dashboard', () => {
    test.beforeEach(async ({ context }) => {
      // Mock session cookie
      await context.addCookies([
        { name: 'oa_sess', value: 'mock_session_id', domain: 'localhost', path: '/' }
      ]);
    });

    test('shows FirstDealEmptyState when there are no offers', async ({ page }) => {
      // Mock GET /api/v1/offers to return empty array
      await page.route('**/api/v1/offers*', async (route) => {
        await route.fulfill({ status: 200, json: { data: [], hasMore: false, totalCount: 0 } });
      });

      await page.goto('/dashboard');
      
      // Should show the empty state nudging to send a deal
      await expect(page.getByText(/send your first/i)).toBeVisible();
      await expect(page.getByRole('link', { name: /new deal/i })).toBeVisible();
    });

    test('shows stats and list when there are offers', async ({ page }) => {
      // Mock GET /api/v1/offers to return some mock data
      await page.route('**/api/v1/offers*', async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            data: [
              {
                id: '1', title: 'Test Offer 1', status: 'ACCEPTED',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                recipient: { email: 'recipient1@example.com' }
              },
              {
                id: '2', title: 'Test Offer 2', status: 'SENT',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                recipient: { email: 'recipient2@example.com' }
              }
            ],
            hasMore: false,
            totalCount: 2
          }
        });
      });

      await page.goto('/dashboard');

      // Header
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // Stats block
      await expect(page.getByText('Sent this month')).toBeVisible();
      await expect(page.getByText('Acceptance rate')).toBeVisible();

      // Ensure lists are populated
      await expect(page.getByText('Test Offer 1')).toBeVisible();
      await expect(page.getByText('Test Offer 2')).toBeVisible();
    });
  });
});
