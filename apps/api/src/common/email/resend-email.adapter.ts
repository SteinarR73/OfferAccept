import { Logger } from '@nestjs/common';
import {
  EmailPort,
  OtpEmailParams,
  OfferLinkEmailParams,
  AcceptanceConfirmationSenderParams,
  AcceptanceConfirmationRecipientParams,
  DeclineNotificationParams,
  ExpiryNotificationParams,
  RecipientReminderParams,
  ExpiryWarningParams,
  EmailVerificationParams,
  PasswordResetParams,
  PasswordChangedParams,
  OrgInviteParams,
} from './email.port';
import {
  otpEmail,
  offerLinkEmail,
  acceptanceConfirmationSenderEmail,
  acceptanceConfirmationRecipientEmail,
  declineNotificationEmail,
  expiryNotificationEmail,
  recipientReminderEmail,
  expiryWarningEmail,
  emailVerificationEmail,
  passwordResetEmail,
  passwordChangedEmail,
  orgInviteEmail,
} from './templates';

// ─── ResendEmailAdapter ─────────────────────────────────────────────────────────
// Production email adapter using the Resend API (https://resend.com).
// Uses the global fetch() API (Node 18+). No external SDK dependency.
//
// Instantiated by EmailModule factory — not a NestJS injectable.
//
// Error handling:
//   - Non-2xx responses: throws ResendDeliveryError with status + provider message
//   - Network errors: propagate as-is (caller decides retry strategy)
//   - Never throws for OTP delivery failure — that's the caller's concern
//
// Security:
//   - API key is only in the Authorization header — never logged
//   - Signing URLs appear in the email body (necessary), never in log output
//   - OTP codes appear in the email body (necessary), never in log output

const RESEND_API_URL = 'https://api.resend.com/emails';
const PLATFORM_FROM_NAME = 'OfferAccept';

export interface ResendEmailAdapterConfig {
  apiKey: string;       // Resend API key — never log this
  fromEmail: string;    // e.g. "noreply@yourdomain.com"
}

export class ResendDeliveryError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly providerMessage: string,
  ) {
    super(`Resend delivery failed (HTTP ${statusCode}): ${providerMessage}`);
    this.name = 'ResendDeliveryError';
  }
}

export class ResendEmailAdapter implements EmailPort {
  private readonly logger = new Logger(ResendEmailAdapter.name);
  private readonly fromAddress: string;

  constructor(private readonly config: ResendEmailAdapterConfig) {
    this.fromAddress = `${PLATFORM_FROM_NAME} <${config.fromEmail}>`;
  }

  async sendOtp(params: OtpEmailParams): Promise<void> {
    const template = otpEmail(params);
    // Do not log params.code — it is the raw OTP
    this.logger.log(`Sending OTP email to ${params.to} for offer "${params.offerTitle}"`);
    await this.send('otp', params.to, template.subject, template.html, template.text);
  }

  async sendOfferLink(params: OfferLinkEmailParams): Promise<void> {
    const template = offerLinkEmail(params);
    // Do not log params.signingUrl — it contains the raw token
    this.logger.log(`Sending offer link email to ${params.to} for offer "${params.offerTitle}"`);
    await this.send('offer_link', params.to, template.subject, template.html, template.text);
  }

  async sendAcceptanceConfirmationToSender(params: AcceptanceConfirmationSenderParams): Promise<void> {
    const template = acceptanceConfirmationSenderEmail(params);
    this.logger.log(`Sending acceptance confirmation to sender ${params.to} for offer "${params.offerTitle}"`);
    await this.send('acceptance_confirmation_sender', params.to, template.subject, template.html, template.text);
  }

  async sendAcceptanceConfirmationToRecipient(params: AcceptanceConfirmationRecipientParams): Promise<void> {
    const template = acceptanceConfirmationRecipientEmail(params);
    this.logger.log(`Sending acceptance confirmation to recipient ${params.to} for offer "${params.offerTitle}"`);
    await this.send('acceptance_confirmation_recipient', params.to, template.subject, template.html, template.text);
  }

  async sendDeclineNotification(params: DeclineNotificationParams): Promise<void> {
    const template = declineNotificationEmail(params);
    this.logger.log(`Sending decline notification to sender ${params.to} for offer "${params.offerTitle}"`);
    await this.send('decline_notification', params.to, template.subject, template.html, template.text);
  }

  async sendExpiryNotification(params: ExpiryNotificationParams): Promise<void> {
    const template = expiryNotificationEmail(params);
    this.logger.log(`Sending expiry notification to sender ${params.to} for offer "${params.offerTitle}"`);
    await this.send('expiry_notification', params.to, template.subject, template.html, template.text);
  }

  async sendRecipientReminder(params: RecipientReminderParams): Promise<void> {
    const template = recipientReminderEmail(params);
    // Do not log signingUrl — contains the raw token
    this.logger.log(`Sending reminder #${params.reminderNumber} (${params.variant}) to ${params.to} for offer "${params.offerTitle}"`);
    await this.send('recipient_reminder', params.to, template.subject, template.html, template.text);
  }

  async sendExpiryWarning(params: ExpiryWarningParams): Promise<void> {
    const template = expiryWarningEmail(params);
    this.logger.log(`Sending ${params.warningLevel} expiry warning to sender ${params.to} for offer "${params.offerTitle}"`);
    await this.send('expiry_warning', params.to, template.subject, template.html, template.text);
  }

  async sendEmailVerification(params: EmailVerificationParams): Promise<void> {
    const template = emailVerificationEmail(params);
    // Do not log verificationUrl — contains raw token
    this.logger.log(`Sending email verification to ${params.to}`);
    await this.send('email_verification', params.to, template.subject, template.html, template.text);
  }

  async sendPasswordReset(params: PasswordResetParams): Promise<void> {
    const template = passwordResetEmail(params);
    // Do not log resetUrl — contains raw token
    this.logger.log(`Sending password reset to ${params.to}`);
    await this.send('password_reset', params.to, template.subject, template.html, template.text);
  }

  async sendPasswordChanged(params: PasswordChangedParams): Promise<void> {
    const template = passwordChangedEmail(params);
    this.logger.log(`Sending password changed notification to ${params.to}`);
    await this.send('password_changed', params.to, template.subject, template.html, template.text);
  }

  async sendOrgInvite(params: OrgInviteParams): Promise<void> {
    const template = orgInviteEmail(params);
    // Do not log inviteUrl — contains raw token
    this.logger.log(`Sending org invite to ${params.to} for org "${params.orgName}"`);
    await this.send('org_invite', params.to, template.subject, template.html, template.text);
  }

  private async send(emailType: string, to: string, subject: string, html: string, text: string): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      // Extract provider error message without logging the full request body
      let providerMessage = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { message?: string; name?: string };
        providerMessage = body.message ?? body.name ?? providerMessage;
      } catch {
        // ignore — use the status code message
      }

      // Metric: email_delivery_failed — alert on > 3 failures in 5 min (Resend outage).
      // Never log email body, API key, or token-bearing URLs.
      this.logger.error(
        JSON.stringify({
          metric: 'email_delivery_failed',
          emailType,
          statusCode: response.status,
          providerMessage,
        }),
      );

      throw new ResendDeliveryError(response.status, providerMessage);
    }
  }
}
