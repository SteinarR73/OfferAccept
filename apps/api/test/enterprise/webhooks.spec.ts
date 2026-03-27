import { jest } from '@jest/globals';
import * as crypto from 'crypto';
import { Test } from '@nestjs/testing';
import { WebhookService, ALL_WEBHOOK_EVENTS } from '../../src/modules/enterprise/webhook.service';
import { WebhookEndpointNotFoundError } from '../../src/common/errors/domain.errors';
import { SendWebhookHandler } from '../../src/modules/jobs/handlers/send-webhook.handler';
import type { UrlValidationResult } from '../../src/modules/enterprise/webhook-url.validator';
import type { Job } from 'pg-boss';
import type { SendWebhookPayload } from '../../src/modules/jobs/job.types';

// ─── Webhook tests ─────────────────────────────────────────────────────────────
//
// Covers:
//   1. HMAC-SHA256 signature matches expected computation
//   2. Replay protection — second delivery of same webhookEventId is skipped
//   3. Endpoint event filtering — only subscribed endpoints receive events
//   4. Disabled endpoint — delivery dropped without retry
//   5. signPayload() correctness + header format
//   6. Endpoint not found → WebhookEndpointNotFoundError
//   7. createEndpoint() returns secret once; listEndpoints() omits secret
//   8. Dispatch enqueues one job per matching endpoint

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep_1',
    organizationId: 'org_1',
    url: 'https://customer.example.com/hooks',
    secret: crypto.randomBytes(32).toString('hex'),
    events: ['offer.accepted'],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildFakePrisma(endpoint: ReturnType<typeof makeEndpoint> | null) {
  return {
    webhookEndpoint: {
      create: jest.fn<() => Promise<ReturnType<typeof makeEndpoint>>>().mockResolvedValue(
        endpoint ?? ({} as ReturnType<typeof makeEndpoint>),
      ),
      findMany: jest.fn<() => Promise<ReturnType<typeof makeEndpoint>[]>>().mockResolvedValue(
        endpoint ? [endpoint] : [],
      ),
      findFirst: jest.fn<() => Promise<ReturnType<typeof makeEndpoint> | null>>().mockResolvedValue(endpoint),
      findUnique: jest.fn<() => Promise<ReturnType<typeof makeEndpoint> | null>>().mockResolvedValue(endpoint),
      update: jest.fn<() => Promise<ReturnType<typeof makeEndpoint>>>().mockResolvedValue(
        endpoint ?? ({} as ReturnType<typeof makeEndpoint>),
      ),
      delete: jest.fn<() => Promise<ReturnType<typeof makeEndpoint>>>().mockResolvedValue(
        endpoint ?? ({} as ReturnType<typeof makeEndpoint>),
      ),
    },
    webhookDeliveryAttempt: {
      findFirst: jest.fn<() => Promise<{ id: string } | null>>().mockResolvedValue(null),
      create: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'attempt_1' }),
    },
  };
}

function buildFakeJobService() {
  return { send: jest.fn<() => Promise<string>>().mockResolvedValue('job_1') };
}

async function buildWebhookService(db: ReturnType<typeof buildFakePrisma>, jobService = buildFakeJobService()) {
  const module = await Test.createTestingModule({
    providers: [
      WebhookService,
      { provide: 'PRISMA', useValue: db },
      { provide: 'JobService', useValue: jobService },
    ],
  })
    .overrideProvider(WebhookService)
    .useFactory({
      factory: (prisma: typeof db, jobs: typeof jobService) => new WebhookService(prisma as never, jobs as never),
      inject: ['PRISMA', 'JobService'],
    })
    .compile();

  return module.get(WebhookService);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhookService', () => {
  describe('signPayload()', () => {
    it('computes HMAC-SHA256 over the body using the secret', async () => {
      const db = buildFakePrisma(makeEndpoint());
      const service = await buildWebhookService(db);

      const secret = 'test_secret';
      const body = '{"id":"uuid","event":"offer.accepted","data":{}}';

      const signature = service.signPayload(secret, body);
      const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

      expect(signature).toBe(expected);
    });

    it('two different secrets produce different signatures', async () => {
      const db = buildFakePrisma(makeEndpoint());
      const service = await buildWebhookService(db);

      const body = 'same body';
      const sig1 = service.signPayload('secret_a', body);
      const sig2 = service.signPayload('secret_b', body);

      expect(sig1).not.toBe(sig2);
    });

    it('same secret + different body → different signature', async () => {
      const db = buildFakePrisma(makeEndpoint());
      const service = await buildWebhookService(db);

      const secret = 'shared_secret';
      const sig1 = service.signPayload(secret, 'body_a');
      const sig2 = service.signPayload(secret, 'body_b');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('createEndpoint()', () => {
    it('returns a server-generated secret at creation time', async () => {
      const endpoint = makeEndpoint();
      const db = buildFakePrisma(endpoint);
      const service = await buildWebhookService(db);

      const result = await service.createEndpoint({
        organizationId: 'org_1',
        url: 'https://example.com/hooks',
        events: ['offer.accepted'],
      });

      // Secret must be non-empty and long enough for HMAC use
      expect(result.secret).toBeTruthy();
      expect(result.secret.length).toBeGreaterThanOrEqual(32);
    });

    it('rejects unknown event types', async () => {
      const db = buildFakePrisma(makeEndpoint());
      const service = await buildWebhookService(db);

      await expect(
        service.createEndpoint({
          organizationId: 'org_1',
          url: 'https://example.com/hooks',
          events: ['not.a.real.event' as never],
        }),
      ).rejects.toThrow(/Invalid webhook event type/);
    });

    it('rejects empty events array', async () => {
      const db = buildFakePrisma(makeEndpoint());
      const service = await buildWebhookService(db);

      await expect(
        service.createEndpoint({
          organizationId: 'org_1',
          url: 'https://example.com/hooks',
          events: [],
        }),
      ).rejects.toThrow(/At least one event/);
    });
  });

  describe('listEndpoints()', () => {
    it('never returns the secret', async () => {
      const db = buildFakePrisma(makeEndpoint());
      const service = await buildWebhookService(db);

      const list = await service.listEndpoints('org_1');
      expect(list).toHaveLength(1);
      expect(list[0]).not.toHaveProperty('secret');
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('url');
      expect(list[0]).toHaveProperty('events');
    });
  });

  describe('dispatchEvent()', () => {
    it('enqueues one send-webhook job per matching endpoint', async () => {
      const endpoint = makeEndpoint({ events: ['offer.accepted'] });
      const db = buildFakePrisma(endpoint);
      db.webhookEndpoint.findMany = jest.fn<() => Promise<typeof endpoint[]>>().mockResolvedValue([endpoint]);
      const jobService = buildFakeJobService();
      const service = await buildWebhookService(db, jobService);

      await service.dispatchEvent('org_1', 'offer.accepted', { offerId: 'offer_1' });

      expect(jobService.send).toHaveBeenCalledTimes(1);
      expect(jobService.send).toHaveBeenCalledWith(
        'send-webhook',
        expect.objectContaining({
          endpointId: endpoint.id,
          event: 'offer.accepted',
          webhookEventId: expect.stringMatching(/^[0-9a-f-]{36}$/), // UUID format
        }),
      );
    });

    it('does not enqueue jobs when no endpoints match the event', async () => {
      const db = buildFakePrisma(makeEndpoint());
      db.webhookEndpoint.findMany = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
      const jobService = buildFakeJobService();
      const service = await buildWebhookService(db, jobService);

      await service.dispatchEvent('org_1', 'offer.accepted', {});
      expect(jobService.send).not.toHaveBeenCalled();
    });

    it('enqueues separate jobs with distinct webhookEventIds for multiple endpoints', async () => {
      const ep1 = makeEndpoint({ id: 'ep_1', events: ['offer.accepted'] });
      const ep2 = makeEndpoint({ id: 'ep_2', events: ['offer.accepted'] });
      const db = buildFakePrisma(ep1);
      db.webhookEndpoint.findMany = jest.fn<() => Promise<typeof ep1[]>>().mockResolvedValue([ep1, ep2]);
      const jobService = buildFakeJobService();
      const service = await buildWebhookService(db, jobService);

      await service.dispatchEvent('org_1', 'offer.accepted', {});

      expect(jobService.send).toHaveBeenCalledTimes(2);
      const [call1, call2] = jobService.send.mock.calls as unknown as Array<[string, SendWebhookPayload]>;
      const id1 = call1[1].webhookEventId;
      const id2 = call2[1].webhookEventId;
      // Each endpoint gets its own unique webhookEventId
      expect(id1).not.toBe(id2);
    });
  });

  describe('isAlreadyDelivered()', () => {
    it('returns false when no successful delivery exists', async () => {
      const db = buildFakePrisma(makeEndpoint());
      db.webhookDeliveryAttempt.findFirst = jest.fn<() => Promise<null>>().mockResolvedValue(null);
      const service = await buildWebhookService(db);

      const result = await service.isAlreadyDelivered('ep_1', 'uuid_123');
      expect(result).toBe(false);
    });

    it('returns true when a successful delivery exists (replay detected)', async () => {
      const db = buildFakePrisma(makeEndpoint());
      db.webhookDeliveryAttempt.findFirst = jest
        .fn<() => Promise<{ id: string }>>()
        .mockResolvedValue({ id: 'attempt_1' });
      const service = await buildWebhookService(db);

      const result = await service.isAlreadyDelivered('ep_1', 'uuid_123');
      expect(result).toBe(true);
    });
  });

  describe('deleteEndpoint()', () => {
    it('throws WebhookEndpointNotFoundError for unknown endpoint', async () => {
      const db = buildFakePrisma(null);
      const service = await buildWebhookService(db);

      await expect(service.deleteEndpoint('ep_missing', 'org_1')).rejects.toThrow(
        WebhookEndpointNotFoundError,
      );
    });
  });
});

// ─── SendWebhookHandler tests ──────────────────────────────────────────────────

describe('SendWebhookHandler — replay protection + HMAC', () => {
  function makeJob(overrides: Partial<SendWebhookPayload> = {}): Job<SendWebhookPayload> {
    return {
      id: 'job_1',
      name: 'send-webhook',
      data: {
        endpointId: 'ep_1',
        event: 'offer.accepted',
        payload: { offerId: 'offer_1' },
        attempt: 1,
        webhookEventId: crypto.randomUUID(),
        ...overrides,
      },
    } as Job<SendWebhookPayload>;
  }

  it('skips delivery when replay guard detects prior success', async () => {
    const fetchMock = jest.fn<() => Promise<Response>>();
    global.fetch = fetchMock as never;

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      getEndpoint: jest.fn<() => Promise<{ id: string; url: string; secret: string; enabled: boolean }>>(),
      signPayload: jest.fn<() => string>(),
      recordDeliveryAttempt: jest.fn<() => Promise<void>>(),
      validateUrl: jest.fn<() => Promise<UrlValidationResult>>().mockResolvedValue({ valid: true }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SendWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    const handler = module.get(SendWebhookHandler);
    const job = makeJob();
    await handler.handle([job]);

    // Replay guard fired — no HTTP request made, no delivery recorded
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockWebhookService.recordDeliveryAttempt).not.toHaveBeenCalled();
    expect(mockWebhookService.getEndpoint).not.toHaveBeenCalled();
  });

  it('sends correct HMAC-SHA256 signature in X-OfferAccept-Signature header', async () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const endpoint = { id: 'ep_1', url: 'https://customer.example.com/hooks', secret, enabled: true };

    let capturedHeaders: Headers | null = null;
    let capturedBody: string | null = null;

    global.fetch = jest.fn().mockImplementation((_url: unknown, _init: unknown) => {
      const init = _init as RequestInit | undefined;
      capturedHeaders = new Headers(init?.headers as Record<string, string>);
      capturedBody = init?.body as string;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('ok'),
      } as Response);
    }) as unknown as typeof fetch;

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      getEndpoint: jest.fn<() => Promise<typeof endpoint>>().mockResolvedValue(endpoint),
      // Use the real signPayload implementation
      signPayload: (s: string, b: string) =>
        crypto.createHmac('sha256', s).update(b).digest('hex'),
      recordDeliveryAttempt: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      validateUrl: jest.fn<() => Promise<UrlValidationResult>>().mockResolvedValue({ valid: true }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SendWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    const handler = module.get(SendWebhookHandler);
    await handler.handle([makeJob()]);

    expect(capturedBody).not.toBeNull();
    expect(capturedHeaders).not.toBeNull();

    // Recompute expected signature from the captured body
    const expectedSig = crypto.createHmac('sha256', secret).update(capturedBody!).digest('hex');
    const header = capturedHeaders!.get('X-OfferAccept-Signature');
    expect(header).toBe(`sha256=${expectedSig}`);
  });

  it('throws on HTTP non-2xx so pg-boss retries the job', async () => {
    const endpoint = {
      id: 'ep_1',
      url: 'https://customer.example.com/hooks',
      secret: 'secret',
      enabled: true,
    };

    global.fetch = jest.fn<() => Promise<Response>>().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    } as Response) as never;

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      getEndpoint: jest.fn<() => Promise<typeof endpoint>>().mockResolvedValue(endpoint),
      signPayload: jest.fn<() => string>().mockReturnValue('sig'),
      recordDeliveryAttempt: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      validateUrl: jest.fn<() => Promise<UrlValidationResult>>().mockResolvedValue({ valid: true }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SendWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    const handler = module.get(SendWebhookHandler);
    // Handler must throw so pg-boss schedules a retry
    await expect(handler.handle([makeJob()])).rejects.toThrow(/Webhook delivery failed/);
    // Failure was recorded
    expect(mockWebhookService.recordDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, httpStatus: 500 }),
    );
  });

  it('drops job silently if endpoint is disabled (no retry)', async () => {
    const fetchMock = jest.fn<() => Promise<Response>>();
    global.fetch = fetchMock as never;

    const disabledEndpoint = { id: 'ep_1', url: 'https://example.com', secret: 'x', enabled: false };

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      getEndpoint: jest.fn<() => Promise<typeof disabledEndpoint>>().mockResolvedValue(disabledEndpoint),
      signPayload: jest.fn<() => string>(),
      recordDeliveryAttempt: jest.fn<() => Promise<void>>(),
      validateUrl: jest.fn<() => Promise<UrlValidationResult>>().mockResolvedValue({ valid: true }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SendWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    const handler = module.get(SendWebhookHandler);
    // Must NOT throw — disabled endpoint drops silently without retry
    await expect(handler.handle([makeJob()])).resolves.not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('body contains id (webhookEventId), event, timestamp, and data fields', async () => {
    const secret = 'secret';
    const endpoint = { id: 'ep_1', url: 'https://example.com', secret, enabled: true };
    const webhookEventId = crypto.randomUUID();

    let capturedBody: string | null = null;
    global.fetch = jest.fn().mockImplementation((_url: unknown, _init: unknown) => {
      capturedBody = (_init as RequestInit | undefined)?.body as string;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') } as Response);
    }) as unknown as typeof fetch;

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      getEndpoint: jest.fn<() => Promise<typeof endpoint>>().mockResolvedValue(endpoint),
      signPayload: (s: string, b: string) =>
        crypto.createHmac('sha256', s).update(b).digest('hex'),
      recordDeliveryAttempt: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      validateUrl: jest.fn<() => Promise<UrlValidationResult>>().mockResolvedValue({ valid: true }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SendWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    const handler = module.get(SendWebhookHandler);
    await handler.handle([makeJob({ webhookEventId, payload: { offerId: 'o1' } })]);

    const parsed = JSON.parse(capturedBody!) as Record<string, unknown>;
    expect(parsed.id).toBe(webhookEventId);
    expect(parsed.event).toBe('offer.accepted');
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    expect(parsed.data).toEqual({ offerId: 'o1' });
  });

  it('ALL_WEBHOOK_EVENTS contains exactly offer.accepted and certificate.issued', () => {
    expect(ALL_WEBHOOK_EVENTS).toContain('offer.accepted');
    expect(ALL_WEBHOOK_EVENTS).toContain('certificate.issued');
    expect(ALL_WEBHOOK_EVENTS).toHaveLength(2);
  });

  it('records SSRF_BLOCKED attempt and does NOT throw when validateUrl returns invalid', async () => {
    const fetchMock = jest.fn<() => Promise<Response>>();
    global.fetch = fetchMock as never;

    const endpoint = { id: 'ep_1', url: 'https://internal.corp/hooks', secret: 'secret', enabled: true };
    const recordMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const mockWebhookService = {
      isAlreadyDelivered: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      getEndpoint: jest.fn<() => Promise<typeof endpoint>>().mockResolvedValue(endpoint),
      signPayload: jest.fn<() => string>(),
      recordDeliveryAttempt: recordMock,
      validateUrl: jest.fn<() => Promise<UrlValidationResult>>().mockResolvedValue({
        valid: false,
        reason: "Hostname 'internal.corp' resolves to a reserved or private IP address. Delivery blocked (SSRF protection).",
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SendWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    const handler = module.get(SendWebhookHandler);
    // Must NOT throw — SSRF block is permanent, retrying would waste job slots
    await expect(handler.handle([makeJob()])).resolves.not.toThrow();

    // No HTTP request made
    expect(fetchMock).not.toHaveBeenCalled();

    // Failure recorded with SSRF_BLOCKED marker
    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        httpStatus: null,
        responseBody: expect.stringContaining('SSRF_BLOCKED'),
      }),
    );
  });
});
