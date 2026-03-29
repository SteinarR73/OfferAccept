import { Injectable, Inject, Logger } from '@nestjs/common';
import { EMAIL_PORT, EmailPort } from '../../common/email/email.port';
import { DealAcceptedEvent } from './events/deal-accepted.event';
import { DealDeclinedEvent } from './events/deal-declined.event';
import { DealExpiredEvent } from './events/deal-expired.event';

// ─── NotificationsService ────────────────────────────────────────────────────
// Owns all outbound sender (and recipient) notification emails.
// Dispatches are best-effort — failures are logged but never propagated to the
// caller, so a broken email configuration cannot reverse a business operation.
//
// Callers:
//   SigningFlowService  → onDealAccepted, onDealDeclined
//   ExpireOffersHandler → onDealExpired

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(EMAIL_PORT) private readonly emailPort: EmailPort) {}

  // ── Deal accepted ──────────────────────────────────────────────────────────
  // Sends two emails:
  //   1. Sender   — "Your deal was accepted" with certificate ID + verify link
  //   2. Recipient — "Your acceptance is confirmed" with certificate ID + verify link
  async onDealAccepted(event: DealAcceptedEvent): Promise<void> {
    const appBaseUrl = process.env['APP_URL'] ?? 'https://app.offeraccept.com';
    const verifyUrl = `${appBaseUrl}/verify/${encodeURIComponent(event.certificateId)}`;

    try {
      await this.emailPort.sendAcceptanceConfirmationToSender({
        to: event.senderEmail,
        senderName: event.senderName,
        offerTitle: event.offerTitle,
        recipientName: event.recipientName,
        recipientEmail: event.recipientEmail,
        acceptedAt: event.acceptedAt,
        certificateId: event.certificateId,
        certificateHash: event.certificateHash,
        verifyUrl: event.verifyUrl || verifyUrl,
      });
      await this.emailPort.sendAcceptanceConfirmationToRecipient({
        to: event.recipientEmail,
        recipientName: event.recipientName,
        offerTitle: event.offerTitle,
        senderName: event.senderName,
        acceptedAt: event.acceptedAt,
        certificateId: event.certificateId,
        certificateHash: event.certificateHash,
        verifyUrl: event.verifyUrl || verifyUrl,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send acceptance notifications for offer ${event.offerId}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Deal declined ──────────────────────────────────────────────────────────
  // Sends two emails:
  //   1. Sender    — "Your deal was declined"
  //   2. Recipient — "You declined a deal via OfferAccept"
  async onDealDeclined(event: DealDeclinedEvent): Promise<void> {
    try {
      await this.emailPort.sendDeclineNotification({
        to: event.senderEmail,
        senderName: event.senderName,
        offerTitle: event.offerTitle,
        recipientName: event.recipientName,
        recipientEmail: event.recipientEmail,
        declinedAt: event.declinedAt,
      });
      await this.emailPort.sendDeclineConfirmationToRecipient({
        to: event.recipientEmail,
        recipientName: event.recipientName,
        offerTitle: event.offerTitle,
        senderName: event.senderName,
        declinedAt: event.declinedAt,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send decline notifications for offer ${event.offerId}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Deal expired ───────────────────────────────────────────────────────────
  // Sends one email to the sender: "Your deal expired"
  async onDealExpired(event: DealExpiredEvent): Promise<void> {
    try {
      await this.emailPort.sendExpiryNotification({
        to: event.senderEmail,
        senderName: event.senderName,
        offerTitle: event.offerTitle,
        expiredAt: event.expiredAt,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send expiry notification for offer ${event.offerId}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
