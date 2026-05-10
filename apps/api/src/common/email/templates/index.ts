// ─── Email Templates ───────────────────────────────────────────────────────────
// Pure functions. Each returns { subject, text, html } for a single email type.
//
// Design rules:
//   - All user-supplied values are passed through escapeHtml() before insertion
//   - Signing URLs are safe to include (href attribute) — they are the whole point
//   - OTP codes are digits-only (safe) but still treated as opaque strings
//   - No raw tokens appear in the text/html except the signing URL
//   - Text versions are always included alongside HTML (improves deliverability)
//   - Platform name ("OfferAccept") is a constant, never from user data
//   - Phishing-resistant wording on OTP emails per guidance at docs/email.md

import type {
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
} from '../email.port';

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

// ─── HTML primitives ──────────────────────────────────────────────────────────

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(d: Date): string {
  return d.toUTCString();
}

function layout(body: string, footerNote: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937">
<div style="max-width:580px;margin:40px auto;padding:0 16px">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#15803d;padding:20px 28px;display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span style="color:#fff;font-weight:800;font-size:14px;letter-spacing:-0.5px">OA</span>
      </div>
      <div>
        <div style="color:#fff;font-weight:700;font-size:18px;letter-spacing:-0.3px;line-height:1.2">OfferAccept</div>
        <div style="color:rgba(255,255,255,0.7);font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;margin-top:1px">Acceptance you can prove.</div>
      </div>
    </div>
    <div style="padding:28px">
      ${body}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#f9fafb;font-size:12px;color:#9ca3af">
      ${footerNote}
      <div style="margin-top:8px;font-size:11px;color:#d1d5db">— OfferAccept · Acceptance you can prove.</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:#15803d;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">${escapeHtml(label)}</a>`;
}

const FOOTER_PRIVACY = 'This is an automated message from OfferAccept. Do not reply to this email.';

// ─── 1. OTP email ─────────────────────────────────────────────────────────────

export function otpEmail(p: OtpEmailParams): EmailTemplate {
  const expiryStr = formatDate(p.expiresAt);
  const minutesLeft = Math.ceil((p.expiresAt.getTime() - Date.now()) / 60_000);

  const subject = `Your verification code for "${p.offerTitle}"`;

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `You requested a verification code to review the document "${p.offerTitle}".`,
    ``,
    `Your code is:`,
    ``,
    `  ${p.code}`,
    ``,
    `This code expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} (${expiryStr}).`,
    ``,
    `─────────────────────────────────────────`,
    `Security notice:`,
    `OfferAccept will NEVER ask you to share this code by email, phone, or chat.`,
    `If you did not request this code, you can safely ignore this message.`,
    `─────────────────────────────────────────`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.recipientName)},</p>
    <p style="margin:0 0 20px;color:#374151">You requested a verification code to review the document <strong>${escapeHtml(p.offerTitle)}</strong>.</p>
    <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:0 0 20px">
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;color:#111827">${escapeHtml(p.code)}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:8px">Expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}</div>
    </div>
    <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:14px;margin:0 0 20px">
      <p style="margin:0;font-size:13px;color:#92400e"><strong>Security notice:</strong> OfferAccept will never ask you to share this code by email, phone, or chat. If you did not request this code, you can safely ignore this message.</p>
    </div>`,
    `${FOOTER_PRIVACY} Expires: ${escapeHtml(expiryStr)}.`,
  );

  return { subject, text, html };
}

// ─── 2. Offer link email ──────────────────────────────────────────────────────

export function offerLinkEmail(p: OfferLinkEmailParams): EmailTemplate {
  const expiryLine = p.expiresAt
    ? `This link expires on ${formatDate(p.expiresAt)}.`
    : 'This link does not have a specific expiry date.';

  const subject = `${p.senderName} is requesting your acceptance — ${p.offerTitle}`;

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `${p.senderName} has shared a document for your acceptance:`,
    ``,
    `  ${p.offerTitle}`,
    ``,
    `To review and accept or decline this document, open the link below:`,
    ``,
    `  ${p.signingUrl}`,
    ``,
    `${expiryLine}`,
    ``,
    `You will be asked to verify your email address before accepting.`,
    `If you accept, OfferAccept will issue a tamper-proof acceptance certificate`,
    `as a permanent record of your decision.`,
    ``,
    `If you were not expecting this document, you can safely ignore this message.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.recipientName)},</p>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 24px;background:#f9fafb">
      <div style="font-size:12px;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">From</div>
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px">${escapeHtml(p.senderName)}</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Document</div>
      <div style="font-size:18px;font-weight:600;color:#111827">${escapeHtml(p.offerTitle)}</div>
    </div>
    <p style="margin:0 0 20px;color:#374151">Click the button below to review this document. You will be asked to verify your email address with a one-time code before accepting.</p>
    <p style="margin:0 0 24px">${button(p.signingUrl, `Review document from ${p.senderName}`)}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or copy this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(p.signingUrl)}</p>
    ${expiryLine ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280">${escapeHtml(expiryLine)}</p>` : ''}
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">No account required. The process takes under 60 seconds.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">If you accept, a tamper-proof certificate will be issued as a permanent record.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">If you were not expecting this document, you can safely ignore this message.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 3. Acceptance confirmation to sender ─────────────────────────────────────

export function acceptanceConfirmationSenderEmail(p: AcceptanceConfirmationSenderParams): EmailTemplate {
  const subject = `${p.recipientName} accepted your document — certificate ready`;
  const acceptedAtStr = formatDate(p.acceptedAt);

  const text = [
    `Hi ${p.senderName},`,
    ``,
    `${p.recipientName} accepted "${p.offerTitle}".`,
    ``,
    `Accepted at:      ${acceptedAtStr}`,
    `Certificate ID:   ${p.certificateId}`,
    `Certificate hash: ${p.certificateHash}`,
    ``,
    `This certificate proves:`,
    `  • when the acceptance occurred`,
    `  • which document version was accepted`,
    `  • that the recipient verified access to their email address`,
    ``,
    `Verify online: ${p.verifyUrl}`,
    ``,
    `Forward this certificate to accounting, legal, or your customer.`,
    `Anyone can independently verify it — no account required.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.senderName)},</p>

    <div style="border-left:4px solid #16a34a;padding:14px 18px;margin:0 0 24px;background:#f0fdf4;border-radius:0 8px 8px 0">
      <p style="margin:0 0 2px;font-size:18px;font-weight:700;color:#15803d">${escapeHtml(p.recipientName)} accepted your document</p>
      <p style="margin:0;font-size:13px;color:#166534">${escapeHtml(p.offerTitle)}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:130px">Accepted by</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.recipientName)} &lt;${escapeHtml(p.recipientEmail)}&gt;</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Accepted at</td>
        <td style="padding:10px 0">${escapeHtml(acceptedAtStr)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Certificate ID</td>
        <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:12px;color:#374151">${escapeHtml(p.certificateId)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280;vertical-align:top">Certificate hash</td>
        <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:11px;color:#374151;word-break:break-all">${escapeHtml(p.certificateHash)}</td>
      </tr>
    </table>

    <p style="margin:0 0 12px;text-align:center">
      ${button(p.verifyUrl, 'View acceptance certificate')}
    </p>

    <div style="border:1px solid #d1fae5;background:#f0fdf4;border-radius:8px;padding:16px;margin:0 0 20px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#065f46">This certificate proves:</p>
      <ul style="margin:0 0 10px;padding-left:0;list-style:none">
        <li style="font-size:13px;color:#047857;padding:3px 0">· when the acceptance occurred</li>
        <li style="font-size:13px;color:#047857;padding:3px 0">· which document version was accepted</li>
        <li style="font-size:13px;color:#047857;padding:3px 0">· that the recipient verified access to their email address</li>
      </ul>
      <p style="margin:0;font-size:12px;color:#6b7280">Keep this email. Even if the platform is unavailable, the hash above lets you verify the record independently.</p>
    </div>

    <div style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;padding:14px;margin:0 0 16px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151">Forward this certificate</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Anyone can independently verify this record. Useful for:</p>
      <ul style="margin:6px 0 0;padding-left:0;list-style:none">
        <li style="font-size:12px;color:#6b7280;padding:2px 0">· accounting records &amp; project documentation</li>
        <li style="font-size:12px;color:#6b7280;padding:2px 0">· customer approvals &amp; legal or archive purposes</li>
      </ul>
    </div>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 4. Acceptance confirmation to recipient ──────────────────────────────────

export function acceptanceConfirmationRecipientEmail(p: AcceptanceConfirmationRecipientParams): EmailTemplate {
  const subject = `Your acceptance of "${p.offerTitle}" is recorded`;
  const acceptedAtStr = formatDate(p.acceptedAt);

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `Your acceptance of the document "${p.offerTitle}" from ${p.senderName} has been recorded.`,
    ``,
    `Accepted at:     ${acceptedAtStr}`,
    `Certificate ID:  ${p.certificateId}`,
    `Certificate hash: ${p.certificateHash}`,
    ``,
    `Keep this email for your records. The hash above lets you verify the acceptance`,
    `record independently even if the platform is unavailable.`,
    ``,
    `Verify online: ${p.verifyUrl}`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.recipientName)},</p>
    <div style="border-left:4px solid #16a34a;padding:12px 16px;margin:0 0 24px;background:#f0fdf4;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#15803d">Acceptance recorded</p>
      <p style="margin:4px 0 0;color:#166534">You have accepted the document from ${escapeHtml(p.senderName)}. A certificate has been issued.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Document</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.offerTitle)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Accepted at</td>
        <td style="padding:10px 0">${escapeHtml(acceptedAtStr)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Certificate ID</td>
        <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:12px;color:#374151">${escapeHtml(p.certificateId)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280;vertical-align:top">Certificate hash</td>
        <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:11px;color:#374151;word-break:break-all">${escapeHtml(p.certificateHash)}</td>
      </tr>
    </table>
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af">Keep this email for your records. The hash above lets you verify the acceptance record independently.</p>
    <p style="margin:0 0 16px"><a href="${escapeHtml(p.verifyUrl)}" style="color:#15803d;font-size:13px;font-weight:600;text-decoration:underline">Verify this certificate →</a></p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 6. Email verification ────────────────────────────────────────────────────

export function emailVerificationEmail(p: EmailVerificationParams): EmailTemplate {
  const minutesLeft = Math.ceil((p.expiresAt.getTime() - Date.now()) / 60_000);
  const subject = 'Verify your OfferAccept email address';

  const text = [
    `Hi ${p.name},`,
    ``,
    `Welcome to OfferAccept! Please verify your email address by clicking the link below:`,
    ``,
    `  ${p.verificationUrl}`,
    ``,
    `This link expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
    ``,
    `If you did not create an OfferAccept account, you can safely ignore this message.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.name)},</p>
    <p style="margin:0 0 20px;color:#374151">Welcome to OfferAccept! Please verify your email address to activate your account.</p>
    <p style="margin:0 0 24px">${button(p.verificationUrl, 'Verify email address')}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or copy this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(p.verificationUrl)}</p>
    <p style="margin:0;font-size:13px;color:#6b7280">This link expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}. If you did not create an account, you can safely ignore this message.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 7. Password reset ────────────────────────────────────────────────────────

export function passwordResetEmail(p: PasswordResetParams): EmailTemplate {
  const minutesLeft = Math.ceil((p.expiresAt.getTime() - Date.now()) / 60_000);
  const subject = 'Reset your OfferAccept password';

  const text = [
    `Hi ${p.name},`,
    ``,
    `We received a request to reset your OfferAccept password. Click the link below to set a new password:`,
    ``,
    `  ${p.resetUrl}`,
    ``,
    `This link expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
    ``,
    `─────────────────────────────────────────`,
    `Security notice:`,
    `If you did not request a password reset, your account may be at risk. Please contact support immediately.`,
    `OfferAccept will NEVER ask you to share your password by email, phone, or chat.`,
    `─────────────────────────────────────────`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.name)},</p>
    <p style="margin:0 0 20px;color:#374151">We received a request to reset your OfferAccept password. Click the button below to set a new password.</p>
    <p style="margin:0 0 24px">${button(p.resetUrl, 'Reset password')}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or copy this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(p.resetUrl)}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280">This link expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.</p>
    <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:14px">
      <p style="margin:0;font-size:13px;color:#92400e"><strong>Security notice:</strong> If you did not request a password reset, your account may be at risk. Please contact support immediately. OfferAccept will never ask you to share your password.</p>
    </div>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 8. Password changed confirmation ─────────────────────────────────────────

export function passwordChangedEmail(p: PasswordChangedParams): EmailTemplate {
  const changedAtStr = formatDate(p.changedAt);
  const subject = 'Your OfferAccept password was changed';

  const text = [
    `Hi ${p.name},`,
    ``,
    `Your OfferAccept password was successfully changed.`,
    ``,
    `Changed at: ${changedAtStr}`,
    p.ipAddress ? `IP address: ${p.ipAddress}` : '',
    ``,
    `─────────────────────────────────────────`,
    `If you did not make this change, your account may be compromised.`,
    `Please contact support immediately and change your password.`,
    `─────────────────────────────────────────`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].filter(Boolean).join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.name)},</p>
    <div style="border-left:4px solid #1d4ed8;padding:12px 16px;margin:0 0 24px;background:#eff6ff;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:15px;font-weight:600;color:#1e40af">Password changed</p>
      <p style="margin:4px 0 0;color:#1d4ed8;font-size:13px">Changed at: ${escapeHtml(changedAtStr)}${p.ipAddress ? ` · IP: ${escapeHtml(p.ipAddress)}` : ''}</p>
    </div>
    <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:14px">
      <p style="margin:0;font-size:13px;color:#92400e"><strong>Not you?</strong> If you did not make this change, your account may be compromised. Please contact support immediately.</p>
    </div>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 9. Organization invite ───────────────────────────────────────────────────

export function orgInviteEmail(p: OrgInviteParams): EmailTemplate {
  const daysLeft = Math.ceil((p.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const subject = `You've been invited to join ${p.orgName} on OfferAccept`;

  const text = [
    `You've been invited to join ${p.orgName} on OfferAccept as ${p.role}.`,
    ``,
    `To accept this invitation, click the link below:`,
    ``,
    `  ${p.inviteUrl}`,
    ``,
    `This invitation expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`,
    ``,
    `If you were not expecting this invitation, you can safely ignore this message.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 20px;color:#374151">You've been invited to join <strong>${escapeHtml(p.orgName)}</strong> on OfferAccept as <strong>${escapeHtml(p.role)}</strong>.</p>
    <p style="margin:0 0 24px">${button(p.inviteUrl, 'Accept invitation')}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or copy this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(p.inviteUrl)}</p>
    <p style="margin:0;font-size:13px;color:#6b7280">This invitation expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. If you were not expecting it, you can safely ignore this message.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 5b. Expiry notification to sender ────────────────────────────────────────

export function expiryNotificationEmail(p: ExpiryNotificationParams): EmailTemplate {
  const subject = `Your document "${p.offerTitle}" has expired`;
  const expiredAtStr = formatDate(p.expiredAt);

  const text = [
    `Hi ${p.senderName},`,
    ``,
    `Your document "${p.offerTitle}" expired on ${expiredAtStr} without a response from the recipient.`,
    ``,
    `If you still need a response, you can send a new document with an updated expiry date.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.senderName)},</p>
    <div style="border-left:4px solid #d97706;padding:12px 16px;margin:0 0 24px;background:#fffbeb;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#92400e">Document expired</p>
      <p style="margin:4px 0 0;color:#78350f">Your document expired without a response from the recipient.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Document</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.offerTitle)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280">Expired at</td>
        <td style="padding:10px 0">${escapeHtml(expiredAtStr)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280">If you still need a response, you can send a new document with an updated expiry date.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 10. Recipient reminder ───────────────────────────────────────────────────
// Three copy variants depending on how far the recipient got in the acceptance flow.

export function recipientReminderEmail(p: RecipientReminderParams): EmailTemplate {
  const expiryLine = p.expiresAt
    ? `This document expires on ${formatDate(p.expiresAt)}.`
    : '';

  const copy = {
    not_opened: {
      subject: `Reminder: document waiting for your review`,
      headline: 'Document waiting for your review',
      body: 'You received a document that is waiting for your response. Please review it at your earliest convenience.',
      cta: 'Review document',
    },
    opened: {
      subject: `Reminder: document awaiting your acceptance`,
      headline: 'Document awaiting your acceptance',
      body: 'You previously opened this document but have not yet accepted it. Click the button below to pick up where you left off.',
      cta: 'Open document',
    },
    otp_started: {
      subject: `Complete your document acceptance`,
      headline: 'Complete your acceptance',
      body: 'You started accepting this document but did not complete the process. Click below to finish — it only takes a moment.',
      cta: 'Complete acceptance',
    },
  }[p.variant];

  const subject = copy.subject;

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    copy.body,
    ``,
    `Document: ${p.offerTitle}`,
    `Sent by: ${p.senderName}`,
    ``,
    `To review and accept this document, open the link below:`,
    ``,
    `  ${p.signingUrl}`,
    ``,
    expiryLine,
    ``,
    `You will be asked to verify your email address before accepting.`,
    `When you accept, OfferAccept will issue a tamper-proof acceptance certificate`,
    `as a permanent record.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].filter((l) => l !== undefined).join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.recipientName)},</p>
    <div style="border-left:4px solid #f59e0b;padding:12px 16px;margin:0 0 24px;background:#fffbeb;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:15px;font-weight:600;color:#92400e">${escapeHtml(copy.headline)}</p>
      <p style="margin:4px 0 0;color:#78350f;font-size:13px">${escapeHtml(copy.body)}</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 24px;background:#f9fafb">
      <div style="font-size:12px;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Document</div>
      <div style="font-size:17px;font-weight:600;color:#111827">${escapeHtml(p.offerTitle)}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px">Sent by ${escapeHtml(p.senderName)}</div>
    </div>
    <p style="margin:0 0 24px">${button(p.signingUrl, copy.cta)}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or copy this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(p.signingUrl)}</p>
    ${expiryLine ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280">${escapeHtml(expiryLine)}</p>` : ''}
    <p style="margin:0;font-size:13px;color:#6b7280">When you accept, OfferAccept will issue a tamper-proof acceptance certificate as a permanent record.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 11. Sender expiry warning ────────────────────────────────────────────────
// Proactive alert to the deal sender: "your deal expires in X hours"

export function expiryWarningEmail(p: ExpiryWarningParams): EmailTemplate {
  const timeLabel = p.warningLevel === '24h' ? '24 hours' : '2 hours';
  const subject = `Your document "${p.offerTitle}" expires in ${timeLabel}`;
  const expiresAtStr = formatDate(p.expiresAt);

  const text = [
    `Hi ${p.senderName},`,
    ``,
    `Your document "${p.offerTitle}" has not yet been accepted and expires in approximately ${timeLabel} (${expiresAtStr}).`,
    ``,
    `If the recipient needs more time, you can resend the document link from your dashboard.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.senderName)},</p>
    <div style="border-left:4px solid #f59e0b;padding:12px 16px;margin:0 0 24px;background:#fffbeb;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#92400e">Document expires in ${escapeHtml(timeLabel)}</p>
      <p style="margin:4px 0 0;color:#78350f">This document has not yet been accepted.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Document</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.offerTitle)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280">Expires at</td>
        <td style="padding:10px 0">${escapeHtml(expiresAtStr)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280">If the recipient needs more time, you can resend the document link from your dashboard to give them a fresh link before expiry.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 5a. Decline confirmation to recipient ────────────────────────────────────

export function declineConfirmationRecipientEmail(p: DeclineConfirmationRecipientParams): EmailTemplate {
  const subject = `You declined a document via OfferAccept`;
  const declinedAtStr = formatDate(p.declinedAt);

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `You declined the document "${p.offerTitle}" sent by ${p.senderName}.`,
    ``,
    `Declined at: ${declinedAtStr}`,
    ``,
    `You declined this document. No acceptance record was created.`,
    ``,
    `If you declined by mistake, please contact the sender directly.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.recipientName)},</p>
    <div style="border-left:4px solid #6b7280;padding:12px 16px;margin:0 0 24px;background:#f9fafb;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#374151">Document declined</p>
      <p style="margin:4px 0 0;color:#6b7280">You declined this document. No acceptance record was created.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Document</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.offerTitle)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Sent by</td>
        <td style="padding:10px 0">${escapeHtml(p.senderName)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280">Declined at</td>
        <td style="padding:10px 0">${escapeHtml(declinedAtStr)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280">If you declined by mistake, please contact the sender directly.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 5. Decline notification to sender ────────────────────────────────────────

export function declineNotificationEmail(p: DeclineNotificationParams): EmailTemplate {
  const subject = `${p.recipientName} has declined your document: "${p.offerTitle}"`;
  const declinedAtStr = formatDate(p.declinedAt);

  const text = [
    `Hi ${p.senderName},`,
    ``,
    `${p.recipientName} (${p.recipientEmail}) has declined your document "${p.offerTitle}".`,
    ``,
    `Declined at: ${declinedAtStr}`,
    ``,
    `No further action is required. You may wish to reach out to ${p.recipientName} directly`,
    `if you have any questions.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.senderName)},</p>
    <div style="border-left:4px solid #dc2626;padding:12px 16px;margin:0 0 24px;background:#fef2f2;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#dc2626">Document declined</p>
      <p style="margin:4px 0 0;color:#991b1b">${escapeHtml(p.recipientName)} has declined your document.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Document</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.offerTitle)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Declined by</td>
        <td style="padding:10px 0">${escapeHtml(p.recipientName)} &lt;${escapeHtml(p.recipientEmail)}&gt;</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280">Declined at</td>
        <td style="padding:10px 0">${escapeHtml(declinedAtStr)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280">No further action is required. You may wish to reach out to ${escapeHtml(p.recipientName)} directly if you have questions.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}
