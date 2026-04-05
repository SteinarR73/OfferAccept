/**
 * TEST 7 — Webhook Idempotency
 *
 * Invariant: Replaying the same webhook job N times must produce exactly ONE
 * successful HTTP delivery. All subsequent attempts are skipped via the
 * webhookEventId replay guard.
 *
 * Simulates the pg-boss retry scenario:
 *   - A job is delivered and the HTTP call succeeds.
 *   - pg-boss crashes after delivery but before job acknowledgement.
 *   - The job is re-queued and attempted 9 more times (10 total).
 *
 * Verifies:
 *   - HTTP delivery attempted exactly once
 *   - All 9 replay attempts return early without an HTTP call
 *   - WebhookDeliveryAttempt.success = true recorded exactly once
 */

import { jest } from '@jest/globals';
import { SendWebhookHandler } from '../../src/modules/jobs/handlers/send-webhook.handler';
import { WebhookService } from '../../src/modules/enterprise/webhook.service';

const WEBHOOK_EVENT_ID = 'event-uuid-stable-across-retries';
const ENDPOINT_ID = 'endpoint-1';
const ENDPOINT_SECRET = 'a'.repeat(64);

function makeJob(attempt: number) {
  return {
    id: `job-${attempt}`,
    data: {
      endpointId: ENDPOINT_ID,
      event: 'deal_accepted',
      payload: { offerId: 'offer-1', recipientEmail: 'jane@example.com' },
      webhookEventId: WEBHOOK_EVENT_ID, // stable across all retries
      attempt,
      traceId: 'trace-1',
    },
  };
}

describe('TEST 7 — Webhook Idempotency', () => {
  it('delivers exactly once across 10 replay attempts', async () => {
    let deliveryCount = 0;
    let successfulDeliveryRecorded = false;

    // Mock WebhookService
    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<any>().mockImplementation(async () => {
        // Returns false on first call (not yet delivered), true on all subsequent
        return successfulDeliveryRecorded;
      }),
      getEndpoint: jest.fn<any>().mockResolvedValue({
        id: ENDPOINT_ID,
        url: 'https://customer.example.com/webhook',
        secret: ENDPOINT_SECRET,
        enabled: true,
        events: ['deal_accepted'],
      }),
      recordDeliveryAttempt: jest.fn<any>().mockImplementation(
        async (params: { success: boolean }) => {
          if (params.success) {
            successfulDeliveryRecorded = true;
          }
          return {};
        },
      ),
      validateUrl: jest.fn<any>().mockResolvedValue({ valid: true }),
      signPayload: jest.fn<any>().mockReturnValue('sha256=abc123'),
    } as unknown as WebhookService;

    // Mock fetch to simulate a successful HTTP response
    const mockFetch = jest.fn<any>().mockImplementation(async () => {
      deliveryCount++;
      return { ok: true, status: 200, text: async () => 'OK' };
    });

    // Temporarily replace global fetch
    const originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const handler = new SendWebhookHandler(mockWebhookService);

      // Replay the same job 10 times
      for (let i = 1; i <= 10; i++) {
        await handler.handle([makeJob(i) as never]);
      }
    } finally {
      global.fetch = originalFetch;
    }

    // HTTP was only called once — first attempt
    expect(deliveryCount).toBe(1);

    // isAlreadyDelivered was called on every attempt
    expect(mockWebhookService.isAlreadyDelivered).toHaveBeenCalledTimes(10);

    // Successful delivery was recorded exactly once
    expect(mockWebhookService.recordDeliveryAttempt).toHaveBeenCalledTimes(1);
  });

  it('does not skip delivery when webhookEventId is different (new logical event)', async () => {
    let deliveryCount = 0;
    const deliveredIds = new Set<string>();

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<any>().mockImplementation(
        async (_endpointId: string, webhookEventId: string) => {
          return deliveredIds.has(webhookEventId);
        },
      ),
      getEndpoint: jest.fn<any>().mockResolvedValue({
        id: ENDPOINT_ID,
        url: 'https://customer.example.com/webhook',
        secret: ENDPOINT_SECRET,
        enabled: true,
        events: ['deal_accepted'],
      }),
      recordDeliveryAttempt: jest.fn<any>().mockImplementation(
        async (params: { webhookEventId: string; success: boolean }) => {
          if (params.success) deliveredIds.add(params.webhookEventId);
          return {};
        },
      ),
      validateUrl: jest.fn<any>().mockResolvedValue({ valid: true }),
      signPayload: jest.fn<any>().mockReturnValue('sha256=abc123'),
    } as unknown as WebhookService;

    const mockFetch = jest.fn<any>().mockImplementation(async () => {
      deliveryCount++;
      return { ok: true, status: 200, text: async () => 'OK' };
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const handler = new SendWebhookHandler(mockWebhookService);

      // 3 DISTINCT webhook events — each should be delivered once
      for (let i = 1; i <= 3; i++) {
        const job = {
          ...makeJob(1),
          data: { ...makeJob(1).data, webhookEventId: `event-uuid-${i}` },
        };
        await handler.handle([job as never]);
      }
    } finally {
      global.fetch = originalFetch;
    }

    // All 3 distinct events delivered
    expect(deliveryCount).toBe(3);
  });

  it('skips delivery if endpoint is disabled', async () => {
    let deliveryCount = 0;

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<any>().mockResolvedValue(false),
      getEndpoint: jest.fn<any>().mockResolvedValue({
        id: ENDPOINT_ID,
        url: 'https://customer.example.com/webhook',
        secret: ENDPOINT_SECRET,
        enabled: false, // disabled
        events: ['deal_accepted'],
      }),
      recordDeliveryAttempt: jest.fn<any>().mockResolvedValue({}),
      validateUrl: jest.fn<any>().mockResolvedValue({ valid: true }),
      signPayload: jest.fn<any>().mockReturnValue('sha256=abc123'),
    } as unknown as WebhookService;

    const mockFetch = jest.fn<any>().mockImplementation(async () => {
      deliveryCount++;
      return { ok: true, status: 200, text: async () => 'OK' };
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const handler = new SendWebhookHandler(mockWebhookService);
      await handler.handle([makeJob(1) as never]);
    } finally {
      global.fetch = originalFetch;
    }

    // Disabled endpoint — no HTTP delivery
    expect(deliveryCount).toBe(0);
  });
});
