import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailModule } from '../../src/common/email/email.module';
import { DevEmailAdapter } from '../../src/common/email/dev-email.adapter';
import { EMAIL_PORT, EmailPort } from '../../src/common/email/email.port';
import { ResendEmailAdapter } from '../../src/common/email/resend-email.adapter';

// ─── Secrets leakage tests ─────────────────────────────────────────────────────
// These tests verify that sensitive values (OTP codes, signing URLs / raw tokens)
// are not captured in ways that would cause them to appear in structured logs.
//
// DevEmailAdapter intentionally stores these values in memory for test retrieval.
// The test concern is the ResendEmailAdapter: its logger calls must not include
// the code or URL in the logged strings.

describe('Email secrets — ResendEmailAdapter does not log secrets', () => {
  let adapter: ResendEmailAdapter;
  let loggedMessages: string[];

  beforeEach(() => {
    loggedMessages = [];

    adapter = new ResendEmailAdapter({
      apiKey: 're_test_key',
      fromEmail: 'noreply@test.com',
    });

    // Spy on the private logger — intercept all log calls
    const logger = (adapter as unknown as { logger: { log: (msg: string) => void; error: (msg: string) => void } }).logger;
    jest.spyOn(logger, 'log').mockImplementation((msg: string) => { loggedMessages.push(msg); });
    jest.spyOn(logger, 'error').mockImplementation((msg: string) => { loggedMessages.push(msg); });

    // Stub fetch to return 200 so we don't make real HTTP calls
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg_1' }),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not log the OTP code when sending an OTP email', async () => {
    const SECRET_CODE = '847291';
    await adapter.sendOtp({
      to: 'bob@client.com',
      recipientName: 'Bob',
      code: SECRET_CODE,
      offerTitle: 'Test Offer',
      expiresAt: new Date(Date.now() + 600_000),
    });

    for (const msg of loggedMessages) {
      expect(msg).not.toContain(SECRET_CODE);
    }
  });

  it('does not log the signing URL (raw token) when sending an offer link email', async () => {
    const SECRET_URL = 'https://app.example.com/accept/oa_SECRETTOKEN123';
    await adapter.sendOfferLink({
      to: 'bob@client.com',
      recipientName: 'Bob',
      offerTitle: 'Test Offer',
      senderName: 'Alice',
      signingUrl: SECRET_URL,
      expiresAt: null,
    });

    for (const msg of loggedMessages) {
      expect(msg).not.toContain('oa_SECRETTOKEN123');
    }
  });

  it('does not log the Resend API key in error responses', async () => {
    const API_KEY = 're_ultra_secret_key_xyz';
    const errorAdapter = new ResendEmailAdapter({ apiKey: API_KEY, fromEmail: 'noreply@test.com' });
    const errorLogger = (errorAdapter as unknown as { logger: { log: jest.Mock; error: jest.Mock } }).logger;
    jest.spyOn(errorLogger, 'log').mockImplementation((msg: unknown) => { loggedMessages.push(msg as string); });
    jest.spyOn(errorLogger, 'error').mockImplementation((msg: unknown) => { loggedMessages.push(msg as string); });

    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Invalid API key' }),
    } as Response);

    await expect(errorAdapter.sendOtp({
      to: 'bob@client.com',
      recipientName: 'Bob',
      code: '123456',
      offerTitle: 'Test',
      expiresAt: new Date(),
    })).rejects.toThrow();

    for (const msg of loggedMessages) {
      expect(msg).not.toContain(API_KEY);
    }
  });

  it('includes the email address and subject in logs (non-secret metadata)', async () => {
    await adapter.sendOtp({
      to: 'bob@client.com',
      recipientName: 'Bob',
      code: '847291',
      offerTitle: 'Test Offer',
      expiresAt: new Date(Date.now() + 600_000),
    });

    const allLogs = loggedMessages.join(' ');
    expect(allLogs).toContain('bob@client.com');
    expect(allLogs).toContain('Test Offer');
  });
});

// ─── Provider selection tests ──────────────────────────────────────────────────

describe('EmailModule provider selection', () => {
  it('provides DevEmailAdapter when EMAIL_PROVIDER is not set (default: dev)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EmailModule,
      ],
    }).compile();

    const emailPort = module.get<EmailPort>(EMAIL_PORT);
    const devAdapter = module.get(DevEmailAdapter);

    // The EMAIL_PORT token should resolve to the DevEmailAdapter instance
    expect(emailPort).toBe(devAdapter);

    await module.close();
  });

  it('provides DevEmailAdapter when EMAIL_PROVIDER=dev', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ EMAIL_PROVIDER: 'dev' })],
        }),
        EmailModule,
      ],
    }).compile();

    const emailPort = module.get<EmailPort>(EMAIL_PORT);
    const devAdapter = module.get(DevEmailAdapter);

    expect(emailPort).toBe(devAdapter);

    await module.close();
  });

  it('provides ResendEmailAdapter when EMAIL_PROVIDER=resend', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            EMAIL_PROVIDER: 'resend',
            RESEND_API_KEY: 're_test_key_12345',
            EMAIL_FROM: 'noreply@test.com',
          })],
        }),
        EmailModule,
      ],
    }).compile();

    const emailPort = module.get<EmailPort>(EMAIL_PORT);

    expect(emailPort).toBeInstanceOf(ResendEmailAdapter);

    await module.close();
  });

  it('DevEmailAdapter is always accessible via module.get() regardless of active provider', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            EMAIL_PROVIDER: 'resend',
            RESEND_API_KEY: 're_test_key_12345',
            EMAIL_FROM: 'noreply@test.com',
          })],
        }),
        EmailModule,
      ],
    }).compile();

    // Even with Resend active, DevEmailAdapter is still in the DI container
    const devAdapter = module.get(DevEmailAdapter);
    expect(devAdapter).toBeInstanceOf(DevEmailAdapter);

    await module.close();
  });
});

// ─── DevEmailAdapter secrets handling ─────────────────────────────────────────

describe('DevEmailAdapter — development secrets handling', () => {
  let adapter: DevEmailAdapter;

  beforeEach(() => {
    adapter = new DevEmailAdapter();
    // Suppress console output in tests
    jest.spyOn(adapter['logger'], 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    adapter.reset();
  });

  it('stores OTP code for test retrieval via getLastCode()', async () => {
    await adapter.sendOtp({
      to: 'bob@client.com',
      recipientName: 'Bob',
      code: '982341',
      offerTitle: 'Test',
      expiresAt: new Date(),
    });
    expect(adapter.getLastCode('bob@client.com')).toBe('982341');
  });

  it('stores signing URL for test retrieval via getLastOfferLink()', async () => {
    await adapter.sendOfferLink({
      to: 'bob@client.com',
      recipientName: 'Bob',
      offerTitle: 'Test',
      senderName: 'Alice',
      signingUrl: 'https://x.com/accept/oa_abc',
      expiresAt: null,
    });
    expect(adapter.getLastOfferLink('bob@client.com')?.signingUrl).toBe('https://x.com/accept/oa_abc');
  });

  it('reset() clears all stored items', async () => {
    await adapter.sendOtp({ to: 'a@b.com', recipientName: 'A', code: '111111', offerTitle: 'T', expiresAt: new Date() });
    await adapter.sendOfferLink({ to: 'a@b.com', recipientName: 'A', offerTitle: 'T', senderName: 'S', signingUrl: 'https://x.com/accept/oa_x', expiresAt: null });
    await adapter.sendAcceptanceConfirmationToSender({ to: 'a@b.com', senderName: 'S', offerTitle: 'T', recipientName: 'R', recipientEmail: 'r@b.com', acceptedAt: new Date(), certificateId: 'c1', certificateHash: 'h', verifyUrl: 'https://x.com/verify/c1' });
    await adapter.sendAcceptanceConfirmationToRecipient({ to: 'a@b.com', recipientName: 'R', offerTitle: 'T', senderName: 'S', acceptedAt: new Date(), certificateId: 'c1', certificateHash: 'h', verifyUrl: 'https://x.com/verify/c1' });
    await adapter.sendDeclineNotification({ to: 'a@b.com', senderName: 'S', offerTitle: 'T', recipientName: 'R', recipientEmail: 'r@b.com', declinedAt: new Date() });

    adapter.reset();

    expect(adapter.getLastCode('a@b.com')).toBeNull();
    expect(adapter.getLastOfferLink('a@b.com')).toBeNull();
    expect(adapter.getLastAcceptanceSenderEmail('a@b.com')).toBeNull();
    expect(adapter.getLastAcceptanceRecipientEmail('a@b.com')).toBeNull();
    expect(adapter.getLastDeclineNotification('a@b.com')).toBeNull();
  });

  it('stores acceptance sender confirmation for test retrieval', async () => {
    await adapter.sendAcceptanceConfirmationToSender({
      to: 'alice@co.com',
      senderName: 'Alice',
      offerTitle: 'Test',
      recipientName: 'Bob',
      recipientEmail: 'bob@client.com',
      acceptedAt: new Date(),
      certificateId: 'cert-xyz',
      certificateHash: 'a'.repeat(64),
      verifyUrl: 'https://app.offeraccept.com/verify/cert-xyz',
    });
    const sent = adapter.getLastAcceptanceSenderEmail('alice@co.com');
    expect(sent?.certificateId).toBe('cert-xyz');
    expect(sent?.recipientName).toBe('Bob');
  });

  it('stores decline notification for test retrieval', async () => {
    await adapter.sendDeclineNotification({
      to: 'alice@co.com',
      senderName: 'Alice',
      offerTitle: 'Test',
      recipientName: 'Bob',
      recipientEmail: 'bob@client.com',
      declinedAt: new Date(),
    });
    const sent = adapter.getLastDeclineNotification('alice@co.com');
    expect(sent?.recipientName).toBe('Bob');
    expect(sent?.offerTitle).toBe('Test');
  });
});
