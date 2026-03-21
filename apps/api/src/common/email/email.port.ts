// ─── Email Delivery Port ───────────────────────────────────────────────────────
// Interface (port) for outbound email delivery. Inject the concrete adapter
// via the DI token 'EMAIL_PORT'. EmailModule selects the implementation at
// startup based on the EMAIL_PROVIDER environment variable.
//
// Security notes:
//   - OtpEmailParams.code is the raw 6-digit code — never log it
//   - OfferLinkEmailParams.signingUrl contains the raw recipient token — never
//     persist; log at DEBUG level only if absolutely required for debugging
//   - All other fields in these params are non-secret

export interface OtpEmailParams {
  to: string;
  recipientName: string;
  code: string;         // raw 6-digit code — never log this
  offerTitle: string;
  expiresAt: Date;
}

export interface OfferLinkEmailParams {
  to: string;
  recipientName: string;
  offerTitle: string;
  senderName: string;
  signingUrl: string;   // full URL including raw token — never persist; log at DEBUG only
  expiresAt: Date | null;
}

export interface AcceptanceConfirmationSenderParams {
  to: string;           // sender's email
  senderName: string;
  offerTitle: string;
  recipientName: string;
  recipientEmail: string;
  acceptedAt: Date;
  certificateId: string;
}

export interface AcceptanceConfirmationRecipientParams {
  to: string;           // recipient's verified email
  recipientName: string;
  offerTitle: string;
  senderName: string;
  acceptedAt: Date;
  certificateId: string;
}

export interface DeclineNotificationParams {
  to: string;           // sender's email
  senderName: string;
  offerTitle: string;
  recipientName: string;
  recipientEmail: string;
  declinedAt: Date;
}

export interface EmailVerificationParams {
  to: string;
  name: string;
  verificationUrl: string;  // full URL including raw token — never persist; log at DEBUG only
  expiresAt: Date;
}

export interface PasswordResetParams {
  to: string;
  name: string;
  resetUrl: string;         // full URL including raw token — never persist; log at DEBUG only
  expiresAt: Date;
}

export interface PasswordChangedParams {
  to: string;
  name: string;
  changedAt: Date;
  ipAddress?: string;
}

export interface OrgInviteParams {
  to: string;
  orgName: string;
  role: string;
  inviteUrl: string;   // contains raw token — never persist; log at DEBUG only
  expiresAt: Date;
}

export interface EmailPort {
  sendOtp(params: OtpEmailParams): Promise<void>;
  sendOfferLink(params: OfferLinkEmailParams): Promise<void>;
  sendAcceptanceConfirmationToSender(params: AcceptanceConfirmationSenderParams): Promise<void>;
  sendAcceptanceConfirmationToRecipient(params: AcceptanceConfirmationRecipientParams): Promise<void>;
  sendDeclineNotification(params: DeclineNotificationParams): Promise<void>;
  sendEmailVerification(params: EmailVerificationParams): Promise<void>;
  sendPasswordReset(params: PasswordResetParams): Promise<void>;
  sendPasswordChanged(params: PasswordChangedParams): Promise<void>;
  sendOrgInvite(params: OrgInviteParams): Promise<void>;
}

export const EMAIL_PORT = 'EMAIL_PORT';
