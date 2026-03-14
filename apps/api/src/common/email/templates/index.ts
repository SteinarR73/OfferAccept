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
    <div style="background:#1d4ed8;padding:20px 28px">
      <span style="color:#fff;font-weight:700;font-size:18px;letter-spacing:-0.3px">OfferAccept</span>
    </div>
    <div style="padding:28px">
      ${body}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#f9fafb;font-size:12px;color:#9ca3af">
      ${footerNote}
    </div>
  </div>
</div>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">${escapeHtml(label)}</a>`;
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
    `You requested a verification code to review the offer "${p.offerTitle}".`,
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
    <p style="margin:0 0 20px;color:#374151">You requested a verification code to review the offer <strong>${escapeHtml(p.offerTitle)}</strong>.</p>
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

  const subject = `${p.senderName} has sent you an offer: "${p.offerTitle}"`;

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `${p.senderName} has sent you a commercial offer for your review:`,
    ``,
    `  ${p.offerTitle}`,
    ``,
    `To review and respond to this offer, open the link below:`,
    ``,
    `  ${p.signingUrl}`,
    ``,
    `${expiryLine}`,
    ``,
    `You will be asked to verify your email address before you can accept or decline.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.recipientName)},</p>
    <p style="margin:0 0 20px;color:#374151"><strong>${escapeHtml(p.senderName)}</strong> has sent you a commercial offer for your review.</p>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 24px;background:#f9fafb">
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Offer</div>
      <div style="font-size:18px;font-weight:600;color:#111827">${escapeHtml(p.offerTitle)}</div>
    </div>
    <p style="margin:0 0 20px;color:#374151">To review and respond to this offer, click the button below. You will be asked to verify your email address first.</p>
    <p style="margin:0 0 20px">${button(p.signingUrl, 'Review offer')}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or copy this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(p.signingUrl)}</p>
    <p style="margin:0;font-size:13px;color:#6b7280">${escapeHtml(expiryLine)}</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 3. Acceptance confirmation to sender ─────────────────────────────────────

export function acceptanceConfirmationSenderEmail(p: AcceptanceConfirmationSenderParams): EmailTemplate {
  const subject = `${p.recipientName} has accepted your offer: "${p.offerTitle}"`;
  const acceptedAtStr = formatDate(p.acceptedAt);

  const text = [
    `Hi ${p.senderName},`,
    ``,
    `${p.recipientName} (${p.recipientEmail}) has accepted your offer "${p.offerTitle}".`,
    ``,
    `Accepted at: ${acceptedAtStr}`,
    `Certificate ID: ${p.certificateId}`,
    ``,
    `The certificate ID can be used to verify the integrity of this acceptance.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.senderName)},</p>
    <div style="border-left:4px solid #16a34a;padding:12px 16px;margin:0 0 24px;background:#f0fdf4;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#15803d">Offer accepted</p>
      <p style="margin:4px 0 0;color:#166534">${escapeHtml(p.recipientName)} has accepted your offer.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Offer</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.offerTitle)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Accepted by</td>
        <td style="padding:10px 0">${escapeHtml(p.recipientName)} &lt;${escapeHtml(p.recipientEmail)}&gt;</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Accepted at</td>
        <td style="padding:10px 0">${escapeHtml(acceptedAtStr)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280">Certificate ID</td>
        <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:12px;color:#374151">${escapeHtml(p.certificateId)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280">The certificate ID can be used to verify the integrity of this acceptance at any time.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 4. Acceptance confirmation to recipient ──────────────────────────────────

export function acceptanceConfirmationRecipientEmail(p: AcceptanceConfirmationRecipientParams): EmailTemplate {
  const subject = `Your acceptance of "${p.offerTitle}" is confirmed`;
  const acceptedAtStr = formatDate(p.acceptedAt);

  const text = [
    `Hi ${p.recipientName},`,
    ``,
    `This confirms that you have accepted the offer "${p.offerTitle}" from ${p.senderName}.`,
    ``,
    `Accepted at: ${acceptedAtStr}`,
    `Certificate ID: ${p.certificateId}`,
    ``,
    `Please keep this email for your records. The certificate ID is a tamper-evident`,
    `reference to your acceptance.`,
    ``,
    `${FOOTER_PRIVACY}`,
  ].join('\n');

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(p.recipientName)},</p>
    <div style="border-left:4px solid #16a34a;padding:12px 16px;margin:0 0 24px;background:#f0fdf4;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#15803d">Acceptance confirmed</p>
      <p style="margin:4px 0 0;color:#166534">You have accepted the offer from ${escapeHtml(p.senderName)}.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Offer</td>
        <td style="padding:10px 0;font-weight:500">${escapeHtml(p.offerTitle)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280">Accepted at</td>
        <td style="padding:10px 0">${escapeHtml(acceptedAtStr)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6b7280">Certificate ID</td>
        <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:12px;color:#374151">${escapeHtml(p.certificateId)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280">Please keep this email for your records. The certificate ID is a tamper-evident reference to your acceptance that can be independently verified.</p>`,
    `${FOOTER_PRIVACY}`,
  );

  return { subject, text, html };
}

// ─── 5. Decline notification to sender ────────────────────────────────────────

export function declineNotificationEmail(p: DeclineNotificationParams): EmailTemplate {
  const subject = `${p.recipientName} has declined your offer: "${p.offerTitle}"`;
  const declinedAtStr = formatDate(p.declinedAt);

  const text = [
    `Hi ${p.senderName},`,
    ``,
    `${p.recipientName} (${p.recipientEmail}) has declined your offer "${p.offerTitle}".`,
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
      <p style="margin:0;font-size:16px;font-weight:600;color:#dc2626">Offer declined</p>
      <p style="margin:4px 0 0;color:#991b1b">${escapeHtml(p.recipientName)} has declined your offer.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 0;color:#6b7280;width:140px">Offer</td>
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
