import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NotifyDealAcceptedHandler } from '../../src/modules/jobs/handlers/notify-deal-accepted.handler';
import { EMAIL_PORT } from '../../src/common/email/email.port';
import type { Job } from 'pg-boss';
import type { NotifyDealAcceptedPayload } from '../../src/modules/jobs/job.types';

// ─── NotifyDealAcceptedHandler unit tests ─────────────────────────────────────
//
// Verifies:
//   1. Happy path — sendAcceptanceConfirmationToSender + sendAcceptanceConfirmationToRecipient
//      called with correct arguments; handler resolves without throwing.
//   2. Sender email failure — handler re-throws so pg-boss marks attempt failed.
//   3. Recipient email failure — handler re-throws so pg-boss marks attempt failed.
//   4. Both emails called sequentially — sender first, then recipient.

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCEPTANCE_RECORD_ID = 'ar-abc123';
const OFFER_ID             = 'offer-xyz';
const JOB_ID               = 'job-001';
const ACCEPTED_AT_ISO      = '2026-03-26T12:00:00.000Z';
const ACCEPTED_AT_DATE     = new Date(ACCEPTED_AT_ISO);
const CERTIFICATE_ID       = 'cert-999';

const BASE_PAYLOAD: NotifyDealAcceptedPayload = {
  acceptanceRecordId: ACCEPTANCE_RECORD_ID,
  offerId:            OFFER_ID,
  offerTitle:         'Enterprise SaaS Agreement',
  senderEmail:        'alice@acme.com',
  senderName:         'Alice',
  recipientEmail:     'bob@example.com',
  recipientName:      'Bob',
  acceptedAt:         ACCEPTED_AT_ISO,
  certificateId:      CERTIFICATE_ID,
  certificateHash:    'a'.repeat(64),
  verifyUrl:          `https://app.offeraccept.com/verify/${CERTIFICATE_ID}`,
};

function makeJob(data: NotifyDealAcceptedPayload = BASE_PAYLOAD): Job<NotifyDealAcceptedPayload> {
  return {
    id:          JOB_ID,
    name:        'notify-deal-accepted',
    data,
    retryCount:  0,
    state:       'active',
    priority:    0,
    createdOn:   new Date(),
    startedOn:   new Date(),
    completedOn: null,
    expireInSeconds: 3600,
    keepUntil:   new Date(),
    singletonKey: `notify-deal-accepted:${ACCEPTANCE_RECORD_ID}`,
    retryLimit:  5,
    retryDelay:  60,
    retryBackoff: true,
  } as unknown as Job<NotifyDealAcceptedPayload>;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

function makeEmailPort() {
  return {
    sendAcceptanceConfirmationToSender:    jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendAcceptanceConfirmationToRecipient: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendOtp:                               jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendDeclineNotification:               jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendDealSentNotification:              jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendReminderEmail:                     jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

async function buildHandler() {
  const emailPort = makeEmailPort();

  const module = await Test.createTestingModule({
    providers: [
      NotifyDealAcceptedHandler,
      { provide: EMAIL_PORT, useValue: emailPort },
    ],
  }).compile();

  return {
    handler:   module.get(NotifyDealAcceptedHandler),
    emailPort,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotifyDealAcceptedHandler', () => {
  describe('happy path', () => {
    it('calls sendAcceptanceConfirmationToSender with correct arguments', async () => {
      const { handler, emailPort } = await buildHandler();
      await handler.handle([makeJob()]);

      expect(emailPort.sendAcceptanceConfirmationToSender).toHaveBeenCalledTimes(1);
      expect(emailPort.sendAcceptanceConfirmationToSender).toHaveBeenCalledWith({
        to:             BASE_PAYLOAD.senderEmail,
        senderName:     BASE_PAYLOAD.senderName,
        offerTitle:     BASE_PAYLOAD.offerTitle,
        recipientName:  BASE_PAYLOAD.recipientName,
        recipientEmail: BASE_PAYLOAD.recipientEmail,
        acceptedAt:     ACCEPTED_AT_DATE,
        certificateId:  CERTIFICATE_ID,
        certificateHash: BASE_PAYLOAD.certificateHash,
        verifyUrl:      BASE_PAYLOAD.verifyUrl,
      });
    });

    it('calls sendAcceptanceConfirmationToRecipient with correct arguments', async () => {
      const { handler, emailPort } = await buildHandler();
      await handler.handle([makeJob()]);

      expect(emailPort.sendAcceptanceConfirmationToRecipient).toHaveBeenCalledTimes(1);
      expect(emailPort.sendAcceptanceConfirmationToRecipient).toHaveBeenCalledWith({
        to:             BASE_PAYLOAD.recipientEmail,
        recipientName:  BASE_PAYLOAD.recipientName,
        offerTitle:     BASE_PAYLOAD.offerTitle,
        senderName:     BASE_PAYLOAD.senderName,
        acceptedAt:     ACCEPTED_AT_DATE,
        certificateId:  CERTIFICATE_ID,
        certificateHash: BASE_PAYLOAD.certificateHash,
        verifyUrl:      BASE_PAYLOAD.verifyUrl,
      });
    });

    it('resolves without throwing when both emails succeed', async () => {
      const { handler } = await buildHandler();
      await expect(handler.handle([makeJob()])).resolves.toBeUndefined();
    });

    it('processes multiple jobs in the batch', async () => {
      const { handler, emailPort } = await buildHandler();
      const job1 = makeJob({ ...BASE_PAYLOAD, acceptanceRecordId: 'ar-1', offerId: 'offer-1' });
      const job2 = makeJob({ ...BASE_PAYLOAD, acceptanceRecordId: 'ar-2', offerId: 'offer-2' });
      await handler.handle([job1, job2]);

      expect(emailPort.sendAcceptanceConfirmationToSender).toHaveBeenCalledTimes(2);
      expect(emailPort.sendAcceptanceConfirmationToRecipient).toHaveBeenCalledTimes(2);
    });

    it('converts acceptedAt ISO string to Date before passing to emailPort', async () => {
      const { handler, emailPort } = await buildHandler();
      await handler.handle([makeJob()]);

      const calls = emailPort.sendAcceptanceConfirmationToSender.mock.calls as unknown as Array<[{ acceptedAt: unknown }]>;
      const call = calls[0][0];
      expect(call.acceptedAt).toBeInstanceOf(Date);
      expect((call.acceptedAt as Date).toISOString()).toBe(ACCEPTED_AT_ISO);
    });
  });

  describe('email delivery failure — re-throw for pg-boss retry', () => {
    it('re-throws when sendAcceptanceConfirmationToSender fails', async () => {
      const { handler, emailPort } = await buildHandler();
      emailPort.sendAcceptanceConfirmationToSender.mockRejectedValue(new Error('Resend 503'));

      await expect(handler.handle([makeJob()])).rejects.toThrow('Resend 503');
    });

    it('does NOT call sendAcceptanceConfirmationToRecipient when sender email fails', async () => {
      const { handler, emailPort } = await buildHandler();
      emailPort.sendAcceptanceConfirmationToSender.mockRejectedValue(new Error('sender fail'));

      await expect(handler.handle([makeJob()])).rejects.toThrow();
      expect(emailPort.sendAcceptanceConfirmationToRecipient).not.toHaveBeenCalled();
    });

    it('re-throws when sendAcceptanceConfirmationToRecipient fails', async () => {
      const { handler, emailPort } = await buildHandler();
      emailPort.sendAcceptanceConfirmationToRecipient.mockRejectedValue(new Error('Resend timeout'));

      await expect(handler.handle([makeJob()])).rejects.toThrow('Resend timeout');
    });

    it('stops processing batch on first job failure', async () => {
      const { handler, emailPort } = await buildHandler();
      emailPort.sendAcceptanceConfirmationToSender.mockRejectedValue(new Error('network error'));

      const job1 = makeJob({ ...BASE_PAYLOAD, acceptanceRecordId: 'ar-1', offerId: 'offer-1' });
      const job2 = makeJob({ ...BASE_PAYLOAD, acceptanceRecordId: 'ar-2', offerId: 'offer-2' });

      await expect(handler.handle([job1, job2])).rejects.toThrow();
      // withEmailRetry makes 3 attempts before giving up; job2 is never started
      expect(emailPort.sendAcceptanceConfirmationToSender).toHaveBeenCalledTimes(3);
      expect(emailPort.sendAcceptanceConfirmationToRecipient).not.toHaveBeenCalled();
    });
  });

  describe('empty certificateId', () => {
    it('passes empty certificateId through to both email calls without throwing', async () => {
      const { handler, emailPort } = await buildHandler();
      const payload: NotifyDealAcceptedPayload = { ...BASE_PAYLOAD, certificateId: '' };
      await handler.handle([makeJob(payload)]);

      const senderCalls = emailPort.sendAcceptanceConfirmationToSender.mock.calls as unknown as Array<[{ certificateId: string }]>;
      const recipientCalls = emailPort.sendAcceptanceConfirmationToRecipient.mock.calls as unknown as Array<[{ certificateId: string }]>;
      const senderCall = senderCalls[0][0];
      const recipientCall = recipientCalls[0][0];
      expect(senderCall.certificateId).toBe('');
      expect(recipientCall.certificateId).toBe('');
    });
  });
});
