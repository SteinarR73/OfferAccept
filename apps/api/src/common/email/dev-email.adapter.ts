import { Injectable, Logger } from '@nestjs/common';
import {
  EmailPort,
  OtpEmailParams,
  OfferLinkEmailParams,
  AcceptanceConfirmationSenderParams,
  AcceptanceConfirmationRecipientParams,
  DeclineNotificationParams,
  DeclineConfirmationRecipientParams,
  ExpiryNotificationParams,
  RecipientReminderParams,
  ExpiryWarningParams,
  EmailVerificationParams,
  PasswordResetParams,
  PasswordChangedParams,
  OrgInviteParams,
} from './email.port';

// ─── DevEmailAdapter ───────────────────────────────────────────────────────────
// Development / test email adapter.
//
// Does NOT send real email. Instead:
//   1. Logs the content to the console (visible in dev server output)
//   2. Stores sent items in memory so tests can retrieve them
//
// Security: this adapter must never be used in production. EmailModule
// gates its use on EMAIL_PROVIDER !== 'resend'.
//
// OTP codes and signing URLs are stored here for test retrieval only.
// This is acceptable because DevEmailAdapter is never active in production.

export interface SentOtp {
  to: string;
  code: string;       // stored for test retrieval — acceptable in dev/test only
  offerTitle: string;
  sentAt: Date;
  expiresAt: Date;
}

export interface SentOfferLink {
  to: string;
  offerTitle: string;
  signingUrl: string; // stored for test retrieval — acceptable in dev/test only
  sentAt: Date;
}

export interface SentAcceptanceConfirmationSender {
  to: string;
  senderName: string;
  offerTitle: string;
  recipientName: string;
  recipientEmail: string;
  acceptedAt: Date;
  certificateId: string;
  certificateHash: string;
  verifyUrl: string;
  sentAt: Date;
}

export interface SentAcceptanceConfirmationRecipient {
  to: string;
  recipientName: string;
  offerTitle: string;
  senderName: string;
  acceptedAt: Date;
  certificateId: string;
  certificateHash: string;
  verifyUrl: string;
  sentAt: Date;
}

export interface SentDeclineNotification {
  to: string;
  senderName: string;
  offerTitle: string;
  recipientName: string;
  recipientEmail: string;
  declinedAt: Date;
  sentAt: Date;
}

export interface SentDeclineConfirmationRecipient {
  to: string;
  recipientName: string;
  offerTitle: string;
  senderName: string;
  declinedAt: Date;
  sentAt: Date;
}

export interface SentExpiryNotification {
  to: string;
  senderName: string;
  offerTitle: string;
  expiredAt: Date;
  sentAt: Date;
}

export interface SentRecipientReminder {
  to: string;
  offerTitle: string;
  signingUrl: string; // acceptable in dev/test only
  variant: string;
  reminderNumber: number;
  sentAt: Date;
}

export interface SentExpiryWarning {
  to: string;
  senderName: string;
  offerTitle: string;
  expiresAt: Date;
  warningLevel: string;
  sentAt: Date;
}

@Injectable()
export class DevEmailAdapter implements EmailPort {
  private readonly logger = new Logger(DevEmailAdapter.name);
  private readonly sentOtps: SentOtp[] = [];
  private readonly sentLinks: SentOfferLink[] = [];
  private readonly sentAcceptanceSender: SentAcceptanceConfirmationSender[] = [];
  private readonly sentAcceptanceRecipient: SentAcceptanceConfirmationRecipient[] = [];
  private readonly sentDeclines: SentDeclineNotification[] = [];
  private readonly sentDeclineConfirmationsRecipient: SentDeclineConfirmationRecipient[] = [];
  private readonly sentExpiries: SentExpiryNotification[] = [];
  private readonly sentReminders: SentRecipientReminder[] = [];
  private readonly sentExpiryWarnings: SentExpiryWarning[] = [];
  private readonly sentVerifications: Array<{ to: string; url: string; sentAt: Date }> = [];
  private readonly sentPasswordResets: Array<{ to: string; url: string; sentAt: Date }> = [];
  private readonly sentOrgInvites: Array<{ to: string; url: string; orgName: string; sentAt: Date }> = [];

  async sendOtp(params: OtpEmailParams): Promise<void> {
    this.sentOtps.push({
      to: params.to,
      code: params.code,
      offerTitle: params.offerTitle,
      sentAt: new Date(),
      expiresAt: params.expiresAt,
    });
    this.logger.log(
      `[DEV EMAIL] OTP for ${params.to}: ${params.code} ` +
      `(offer: "${params.offerTitle}", expires: ${params.expiresAt.toISOString()})`,
    );
  }

  async sendOfferLink(params: OfferLinkEmailParams): Promise<void> {
    this.sentLinks.push({
      to: params.to,
      offerTitle: params.offerTitle,
      signingUrl: params.signingUrl,
      sentAt: new Date(),
    });
    this.logger.log(
      `[DEV EMAIL] Offer link for ${params.to} — "${params.offerTitle}"\n` +
      `  Signing URL: ${params.signingUrl}`,
    );
  }

  async sendAcceptanceConfirmationToSender(params: AcceptanceConfirmationSenderParams): Promise<void> {
    this.sentAcceptanceSender.push({
      to: params.to,
      senderName: params.senderName,
      offerTitle: params.offerTitle,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      acceptedAt: params.acceptedAt,
      certificateId: params.certificateId,
      certificateHash: params.certificateHash,
      verifyUrl: params.verifyUrl,
      sentAt: new Date(),
    });
    this.logger.log(
      `[DEV EMAIL] Acceptance → sender ${params.to}: "${params.offerTitle}" ` +
      `accepted by ${params.recipientName} (cert: ${params.certificateId})`,
    );
  }

  async sendAcceptanceConfirmationToRecipient(params: AcceptanceConfirmationRecipientParams): Promise<void> {
    this.sentAcceptanceRecipient.push({
      to: params.to,
      recipientName: params.recipientName,
      offerTitle: params.offerTitle,
      senderName: params.senderName,
      acceptedAt: params.acceptedAt,
      certificateId: params.certificateId,
      certificateHash: params.certificateHash,
      verifyUrl: params.verifyUrl,
      sentAt: new Date(),
    });
    this.logger.log(
      `[DEV EMAIL] Acceptance → recipient ${params.to}: "${params.offerTitle}" ` +
      `(cert: ${params.certificateId})`,
    );
  }

  async sendDeclineNotification(params: DeclineNotificationParams): Promise<void> {
    this.sentDeclines.push({
      to: params.to,
      senderName: params.senderName,
      offerTitle: params.offerTitle,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      declinedAt: params.declinedAt,
      sentAt: new Date(),
    });
    this.logger.log(
      `[DEV EMAIL] Decline → sender ${params.to}: "${params.offerTitle}" ` +
      `declined by ${params.recipientName}`,
    );
  }

  async sendDeclineConfirmationToRecipient(params: DeclineConfirmationRecipientParams): Promise<void> {
    this.sentDeclineConfirmationsRecipient.push({
      to: params.to,
      recipientName: params.recipientName,
      offerTitle: params.offerTitle,
      senderName: params.senderName,
      declinedAt: params.declinedAt,
      sentAt: new Date(),
    });
    this.logger.log(
      `[DEV EMAIL] Decline confirmation → recipient ${params.to}: "${params.offerTitle}" ` +
      `declined (sent by ${params.senderName})`,
    );
  }

  async sendExpiryNotification(params: ExpiryNotificationParams): Promise<void> {
    this.sentExpiries.push({
      to: params.to,
      senderName: params.senderName,
      offerTitle: params.offerTitle,
      expiredAt: params.expiredAt,
      sentAt: new Date(),
    });
    this.logger.log(
      `[DEV EMAIL] Expiry → sender ${params.to}: "${params.offerTitle}" expired at ${params.expiredAt.toISOString()}`,
    );
  }

  async sendRecipientReminder(params: RecipientReminderParams): Promise<void> {
    this.sentReminders.push({
      to: params.to,
      offerTitle: params.offerTitle,
      signingUrl: params.signingUrl,
      variant: params.variant,
      reminderNumber: params.reminderNumber,
      sentAt: new Date(),
    });
    // Do not log signingUrl — contains the raw token
    this.logger.log(
      `[DEV EMAIL] Reminder #${params.reminderNumber} (${params.variant}) → ${params.to}: "${params.offerTitle}"`,
    );
  }

  async sendExpiryWarning(params: ExpiryWarningParams): Promise<void> {
    this.sentExpiryWarnings.push({
      to: params.to,
      senderName: params.senderName,
      offerTitle: params.offerTitle,
      expiresAt: params.expiresAt,
      warningLevel: params.warningLevel,
      sentAt: new Date(),
    });
    this.logger.log(
      `[DEV EMAIL] Expiry warning (${params.warningLevel}) → sender ${params.to}: "${params.offerTitle}" expires ${params.expiresAt.toISOString()}`,
    );
  }

  async sendEmailVerification(params: EmailVerificationParams): Promise<void> {
    this.sentVerifications.push({ to: params.to, url: params.verificationUrl, sentAt: new Date() });
    // Do not log verificationUrl — it contains the raw token
    this.logger.log(`[DEV EMAIL] Email verification → ${params.to}`);
  }

  async sendPasswordReset(params: PasswordResetParams): Promise<void> {
    this.sentPasswordResets.push({ to: params.to, url: params.resetUrl, sentAt: new Date() });
    // Do not log resetUrl — it contains the raw token
    this.logger.log(`[DEV EMAIL] Password reset → ${params.to}`);
  }

  async sendPasswordChanged(params: PasswordChangedParams): Promise<void> {
    this.logger.log(`[DEV EMAIL] Password changed notification → ${params.to}`);
  }

  async sendOrgInvite(params: OrgInviteParams): Promise<void> {
    this.sentOrgInvites.push({ to: params.to, url: params.inviteUrl, orgName: params.orgName, sentAt: new Date() });
    // Do not log inviteUrl — contains raw token
    this.logger.log(`[DEV EMAIL] Org invite → ${params.to} for org "${params.orgName}" (role: ${params.role})`);
  }

  getLastOrgInviteUrl(email: string): string | null {
    const records = this.sentOrgInvites
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0]?.url ?? null;
  }

  // ─── Test helpers ────────────────────────────────────────────────────────────
  // These methods are only meaningful in dev/test. Production uses ResendEmailAdapter.

  getLastCode(email: string): string | null {
    const records = this.sentOtps
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0]?.code ?? null;
  }

  getLastOfferLink(email: string): SentOfferLink | null {
    const records = this.sentLinks
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getLastAcceptanceSenderEmail(email: string): SentAcceptanceConfirmationSender | null {
    const records = this.sentAcceptanceSender
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getLastAcceptanceRecipientEmail(email: string): SentAcceptanceConfirmationRecipient | null {
    const records = this.sentAcceptanceRecipient
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getLastDeclineNotification(email: string): SentDeclineNotification | null {
    const records = this.sentDeclines
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getLastDeclineConfirmationRecipient(email: string): SentDeclineConfirmationRecipient | null {
    const records = this.sentDeclineConfirmationsRecipient
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getLastExpiryNotification(email: string): SentExpiryNotification | null {
    const records = this.sentExpiries
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getAllExpiryNotifications(): ReadonlyArray<SentExpiryNotification> {
    return this.sentExpiries;
  }

  getLastRecipientReminder(email: string): SentRecipientReminder | null {
    const records = this.sentReminders
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getAllRecipientReminders(email?: string): ReadonlyArray<SentRecipientReminder> {
    return email ? this.sentReminders.filter((r) => r.to === email) : this.sentReminders;
  }

  getLastExpiryWarning(email: string): SentExpiryWarning | null {
    const records = this.sentExpiryWarnings
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0] ?? null;
  }

  getAllExpiryWarnings(): ReadonlyArray<SentExpiryWarning> {
    return this.sentExpiryWarnings;
  }

  getAllSent(): ReadonlyArray<SentOtp> {
    return this.sentOtps;
  }

  getAllSentLinks(): ReadonlyArray<SentOfferLink> {
    return this.sentLinks;
  }

  getLastVerificationUrl(email: string): string | null {
    const records = this.sentVerifications
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0]?.url ?? null;
  }

  getLastPasswordResetUrl(email: string): string | null {
    const records = this.sentPasswordResets
      .filter((r) => r.to === email)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return records[0]?.url ?? null;
  }

  reset(): void {
    this.sentOtps.length = 0;
    this.sentLinks.length = 0;
    this.sentAcceptanceSender.length = 0;
    this.sentAcceptanceRecipient.length = 0;
    this.sentDeclines.length = 0;
    this.sentDeclineConfirmationsRecipient.length = 0;
    this.sentExpiries.length = 0;
    this.sentReminders.length = 0;
    this.sentExpiryWarnings.length = 0;
    this.sentVerifications.length = 0;
    this.sentPasswordResets.length = 0;
    this.sentOrgInvites.length = 0;
  }
}
