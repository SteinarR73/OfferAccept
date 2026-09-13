import { test, expect } from '@playwright/test';

// ─── Acceptance flow E2E (Mocked) ─────────────────────────────────────────────

const MOCK_TOKEN = 'mock-valid-token';

test.describe('Signing Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock getContext
    await page.route(`**/api/v1/signing/${MOCK_TOKEN}`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          sessionId: 'session-123',
          offerTitle: 'Mock Offer',
          offerMessage: 'Please sign this',
          senderName: 'Acme Corp',
          recipientName: 'John Doe',
          expiresAt: null,
          documents: [{ documentId: 'doc-1', filename: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: 1024 }],
          acceptanceStatement: 'I accept',
        }
      });
    });

    // Mock recordDocumentView
    await page.route(`**/api/v1/signing/${MOCK_TOKEN}/documents/*/view`, async (route) => {
      await route.fulfill({ status: 200, json: { recorded: true } });
    });
  });

  test('happy path acceptance flow', async ({ page }) => {
    // Mock requestOtp
    await page.route(`**/api/v1/signing/${MOCK_TOKEN}/otp`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          json: { challengeId: 'challenge-123', deliveryAddressMasked: 'j***@example.com', expiresAt: new Date(Date.now() + 600000).toISOString() }
        });
      } else {
        await route.continue();
      }
    });

    // Mock verifyOtp
    await page.route(`**/api/v1/signing/${MOCK_TOKEN}/otp/verify`, async (route) => {
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        if (payload.code === '123456') {
          await route.fulfill({ status: 200, json: { verified: true, verifiedAt: new Date().toISOString() } });
        } else {
          await route.fulfill({ status: 400, json: { code: 'INVALID_OTP', message: 'Invalid OTP' } });
        }
      } else {
        await route.continue();
      }
    });

    // Mock accept
    await page.route(`**/api/v1/signing/${MOCK_TOKEN}/accept`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          json: { acceptanceRecordId: 'record-123', acceptedAt: new Date().toISOString(), certificateId: 'cert-123' }
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/accept/${MOCK_TOKEN}`);

    // Details visible
    await expect(page.getByText('Mock Offer')).toBeVisible();
    await expect(page.getByText('Secure acceptance session')).toBeVisible();

    // Initiate signing
    const startBtn = page.getByRole('button', { name: /Continue to accept/i });
    if (await startBtn.isVisible()) {
      await startBtn.click();
    } else {
      // It might be Verify Email depending on the component state
      await page.getByRole('button', { name: /Verify Email/i }).click();
    }

    // OTP screen
    await expect(page.getByText(/verify your email/i)).toBeVisible();
    await expect(page.getByText('j***@example.com')).toBeVisible();

    // Fill OTP
    const inputs = page.locator('input[type="text"]');
    for (let i = 0; i < 6; i++) {
      await inputs.nth(i).fill((i + 1).toString()); // 123456
    }
    await page.getByRole('button', { name: /Verify/i }).click();

    // Accept step
    await expect(page.getByText('Accept this document')).toBeVisible();
    await page.getByRole('button', { name: /I Accept/i }).click();

    // Success screen
    await expect(page.getByText(/completed|success/i)).toBeVisible();
  });

  test('acceptance page shows error on invalid OTP', async ({ page }) => {
    await page.route(`**/api/v1/signing/${MOCK_TOKEN}/otp`, async (route) => {
      await route.fulfill({
        status: 200,
        json: { challengeId: 'challenge-123', deliveryAddressMasked: 'j***@example.com', expiresAt: new Date(Date.now() + 600000).toISOString() }
      });
    });

    await page.route(`**/api/v1/signing/${MOCK_TOKEN}/otp/verify`, async (route) => {
      await route.fulfill({ status: 400, json: { code: 'INVALID_OTP', message: 'Invalid or expired code.' } });
    });

    await page.goto(`/accept/${MOCK_TOKEN}`);
    
    const startBtn = page.getByRole('button', { name: /Continue to accept/i });
    if (await startBtn.isVisible()) {
      await startBtn.click();
    } else {
      await page.getByRole('button', { name: /Verify Email/i }).click();
    }

    const inputs = page.locator('input[type="text"]');
    for (let i = 0; i < 6; i++) {
      await inputs.nth(i).fill('0');
    }
    await page.getByRole('button', { name: /Verify/i }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid or expired code');
  });

  test('acceptance page handles invalid token gracefully', async ({ page }) => {
    const BAD_TOKEN = 'invalid-token-that-does-not-exist';
    await page.route(`**/api/v1/signing/${BAD_TOKEN}`, async (route) => {
      await route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'Offer not found' } });
    });

    await page.goto(`/accept/${BAD_TOKEN}`);

    const body = await page.textContent('body');
    expect(body).not.toContain('Unhandled Runtime Error');
    await expect(page.getByText(/not found|expired|invalid/i)).toBeVisible();
  });

  test('acceptance page handles already accepted deal', async ({ page }) => {
    await page.route(`**/api/v1/signing/${MOCK_TOKEN}`, async (route) => {
      await route.fulfill({ status: 409, json: { code: 'ALREADY_ACCEPTED', message: 'Deal is already accepted' } });
    });

    await page.goto(`/accept/${MOCK_TOKEN}`);

    await expect(page.getByText(/already accepted|completed/i)).toBeVisible();
  });
});
