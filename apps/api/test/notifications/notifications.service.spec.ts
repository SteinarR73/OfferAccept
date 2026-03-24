import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { EMAIL_PORT } from '../../src/common/email/email.port';
import { DealAcceptedEvent } from '../../src/modules/notifications/events/deal-accepted.event';
import { DealDeclinedEvent } from '../../src/modules/notifications/events/deal-declined.event';
import { DealExpiredEvent } from '../../src/modules/notifications/events/deal-expired.event';

// ─── NotificationsService unit tests ─────────────────────────────────────────
//
// Verifies:
//   - onDealAccepted  sends sender + recipient confirmation emails
//   - onDealDeclined  sends decline notification to sender
//   - onDealExpired   sends expiry notification to sender
//   - Errors from the email port are swallowed (best-effort pattern)

const SENDER_EMAIL = 'alice@acme.com';
const SENDER_NAME = 'Alice';
const RECIPIENT_EMAIL = 'bob@example.com';
const RECIPIENT_NAME = 'Bob';
const OFFER_TITLE = 'Senior Engineer Q1 2026';
const OFFER_ID = 'offer-test-1';
const CERT_ID = 'cert-test-1';
const ACCEPTED_AT = new Date('2026-03-22T14:00:00Z');
const DECLINED_AT = new Date('2026-03-22T15:00:00Z');
const EXPIRED_AT = new Date('2026-03-22T16:00:00Z');

function buildEmailMock() {
  return {
    sendAcceptanceConfirmationToSender: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendAcceptanceConfirmationToRecipient: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendDeclineNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendExpiryNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendOtp: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendOfferLink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendPasswordChanged: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendOrgInvite: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

async function buildService() {
  const emailMock = buildEmailMock();
  const module = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: EMAIL_PORT, useValue: emailMock },
    ],
  }).compile();

  return { svc: module.get(NotificationsService), email: emailMock };
}

// ─── onDealAccepted ───────────────────────────────────────────────────────────

describe('NotificationsService.onDealAccepted()', () => {
  it('sends confirmation to the sender with correct params', async () => {
    const { svc, email } = await buildService();
    const event = new DealAcceptedEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, RECIPIENT_EMAIL, RECIPIENT_NAME, ACCEPTED_AT, CERT_ID);
    await svc.onDealAccepted(event);

    expect(email.sendAcceptanceConfirmationToSender).toHaveBeenCalledWith({
      to: SENDER_EMAIL,
      senderName: SENDER_NAME,
      offerTitle: OFFER_TITLE,
      recipientName: RECIPIENT_NAME,
      recipientEmail: RECIPIENT_EMAIL,
      acceptedAt: ACCEPTED_AT,
      certificateId: CERT_ID,
    });
  });

  it('sends confirmation to the recipient with correct params', async () => {
    const { svc, email } = await buildService();
    const event = new DealAcceptedEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, RECIPIENT_EMAIL, RECIPIENT_NAME, ACCEPTED_AT, CERT_ID);
    await svc.onDealAccepted(event);

    expect(email.sendAcceptanceConfirmationToRecipient).toHaveBeenCalledWith({
      to: RECIPIENT_EMAIL,
      recipientName: RECIPIENT_NAME,
      offerTitle: OFFER_TITLE,
      senderName: SENDER_NAME,
      acceptedAt: ACCEPTED_AT,
      certificateId: CERT_ID,
    });
  });

  it('swallows email port errors (best-effort)', async () => {
    const { svc, email } = await buildService();
    (email.sendAcceptanceConfirmationToSender as jest.Mock<(...args: any[]) => any>)
      .mockRejectedValue(new Error('SMTP down'));

    const event = new DealAcceptedEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, RECIPIENT_EMAIL, RECIPIENT_NAME, ACCEPTED_AT, CERT_ID);

    // Must not throw — notifications are best-effort
    await expect(svc.onDealAccepted(event)).resolves.toBeUndefined();
  });
});

// ─── onDealDeclined ───────────────────────────────────────────────────────────

describe('NotificationsService.onDealDeclined()', () => {
  it('sends decline notification to the sender with correct params', async () => {
    const { svc, email } = await buildService();
    const event = new DealDeclinedEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, RECIPIENT_EMAIL, RECIPIENT_NAME, DECLINED_AT);
    await svc.onDealDeclined(event);

    expect(email.sendDeclineNotification).toHaveBeenCalledWith({
      to: SENDER_EMAIL,
      senderName: SENDER_NAME,
      offerTitle: OFFER_TITLE,
      recipientName: RECIPIENT_NAME,
      recipientEmail: RECIPIENT_EMAIL,
      declinedAt: DECLINED_AT,
    });
  });

  it('swallows email port errors (best-effort)', async () => {
    const { svc, email } = await buildService();
    (email.sendDeclineNotification as jest.Mock<(...args: any[]) => any>)
      .mockRejectedValue(new Error('SMTP down'));

    const event = new DealDeclinedEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, RECIPIENT_EMAIL, RECIPIENT_NAME, DECLINED_AT);

    await expect(svc.onDealDeclined(event)).resolves.toBeUndefined();
  });
});

// ─── onDealExpired ────────────────────────────────────────────────────────────

describe('NotificationsService.onDealExpired()', () => {
  it('sends expiry notification to the sender with correct params', async () => {
    const { svc, email } = await buildService();
    const event = new DealExpiredEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, EXPIRED_AT);
    await svc.onDealExpired(event);

    expect(email.sendExpiryNotification).toHaveBeenCalledWith({
      to: SENDER_EMAIL,
      senderName: SENDER_NAME,
      offerTitle: OFFER_TITLE,
      expiredAt: EXPIRED_AT,
    });
  });

  it('does NOT send any other email type on expiry', async () => {
    const { svc, email } = await buildService();
    const event = new DealExpiredEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, EXPIRED_AT);
    await svc.onDealExpired(event);

    expect(email.sendAcceptanceConfirmationToSender).not.toHaveBeenCalled();
    expect(email.sendDeclineNotification).not.toHaveBeenCalled();
  });

  it('swallows email port errors (best-effort)', async () => {
    const { svc, email } = await buildService();
    (email.sendExpiryNotification as jest.Mock<(...args: any[]) => any>)
      .mockRejectedValue(new Error('Resend API down'));

    const event = new DealExpiredEvent(OFFER_ID, OFFER_TITLE, SENDER_EMAIL, SENDER_NAME, EXPIRED_AT);

    await expect(svc.onDealExpired(event)).resolves.toBeUndefined();
  });
});
