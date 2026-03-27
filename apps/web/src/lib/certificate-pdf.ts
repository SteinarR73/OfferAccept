import type { CertificateDetail } from './offers-api';

// ─── generateCertificatePdf ────────────────────────────────────────────────────
// Generates a professional PDF acceptance certificate from certificate data.
// Uses pdf-lib (imported dynamically — only loaded when the user downloads).
//
// The PDF is self-contained: all fonts are standard PDF fonts (no embedding
// required), and the layout is fixed A4 portrait (595 × 842 pt).
//
// The certificate includes:
//   - OfferAccept branded header
//   - Deal title and parties
//   - Accepted by / date / verification method
//   - Full SHA-256 certificate hash and certificate ID
//   - Independent verification URL
//   - Tamper-evident footer statement

export async function generateCertificatePdf(
  cert: CertificateDetail,
  verifyBaseUrl: string,
): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  const doc = await PDFDocument.create();
  doc.setTitle(`Acceptance Certificate — ${cert.offer.title}`);
  doc.setAuthor('OfferAccept');
  doc.setSubject('Deal Acceptance Certificate');
  doc.setCreationDate(new Date(cert.issuedAt));

  // A4 portrait: 595.28 × 841.89 pt
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontMono    = await doc.embedFont(StandardFonts.Courier);

  // ─── Palette ───────────────────────────────────────────────────────────────

  const clrGreen      = rgb(0.133, 0.529, 0.380); // #22875e
  const clrGreenLight = rgb(0.184, 0.627, 0.451); // #2fa073
  const clrWhite      = rgb(1, 1, 1);
  const clrBlack      = rgb(0.098, 0.098, 0.098);
  const clrGray       = rgb(0.45, 0.45, 0.45);
  const clrBorder     = rgb(0.87, 0.87, 0.87);
  const clrBg         = rgb(0.976, 0.992, 0.984); // near-white green tint

  const margin = 52;

  // ─── Header bar ───────────────────────────────────────────────────────────

  const hdrH = 108;
  page.drawRectangle({ x: 0, y: height - hdrH, width, height: hdrH, color: clrGreen });

  // Logo box
  page.drawRectangle({ x: margin, y: height - 74, width: 34, height: 34, color: clrWhite });
  page.drawText('OA', { x: margin + 6, y: height - 64, size: 14, font: fontBold, color: clrGreen });

  // Brand
  page.drawText('OfferAccept', {
    x: margin + 44, y: height - 60,
    size: 12, font: fontBold, color: clrWhite,
  });

  // Title
  page.drawText('Acceptance Certificate', {
    x: margin, y: height - 96,
    size: 19, font: fontBold, color: clrWhite,
  });

  // Issued date (top-right of header)
  const issuedAt = new Date(cert.issuedAt);
  const issuedLabel = formatDate(issuedAt) + ' UTC';
  const labelW = fontRegular.widthOfTextAtSize(issuedLabel, 8.5);
  page.drawText('Issued', {
    x: width - margin - labelW, y: height - 55,
    size: 7.5, font: fontBold, color: rgb(0.75, 0.96, 0.86),
  });
  page.drawText(issuedLabel, {
    x: width - margin - labelW, y: height - 67,
    size: 8.5, font: fontRegular, color: clrWhite,
  });

  // ─── Green accent stripe ────────────────────────────────────────────────────

  page.drawRectangle({ x: 0, y: height - hdrH - 6, width, height: 6, color: clrGreenLight });

  // ─── Body ──────────────────────────────────────────────────────────────────

  let y = height - hdrH - 38;

  // Deal title
  page.drawText('DEAL', {
    x: margin, y,
    size: 7.5, font: fontBold, color: clrGray,
  });
  y -= 15;

  const dealTitle = truncate(cert.offer.title, 72);
  page.drawText(dealTitle, {
    x: margin, y,
    size: 15, font: fontBold, color: clrBlack,
  });
  y -= 32;

  // ── Divider
  drawDivider(page, margin, y, width, clrBorder);
  y -= 28;

  // ── Parties section
  const col2x = width / 2 + 6;

  // Accepted by
  page.drawText('ACCEPTED BY', { x: margin, y, size: 7.5, font: fontBold, color: clrGray });
  page.drawText('SENDER', { x: col2x, y, size: 7.5, font: fontBold, color: clrGray });
  y -= 15;

  const recipientDisplay = cert.recipient.name
    ? cert.recipient.name
    : cert.recipient.email;
  page.drawText(truncate(recipientDisplay, 34), {
    x: margin, y, size: 11, font: fontBold, color: clrBlack,
  });
  page.drawText(truncate(cert.sender.name, 34), {
    x: col2x, y, size: 11, font: fontBold, color: clrBlack,
  });
  y -= 14;

  page.drawText(truncate(cert.recipient.email, 38), {
    x: margin, y, size: 9, font: fontRegular, color: clrGray,
  });
  page.drawText(truncate(cert.sender.email, 38), {
    x: col2x, y, size: 9, font: fontRegular, color: clrGray,
  });
  y -= 30;

  // ── Date and method
  page.drawText('DATE & TIME', { x: margin, y, size: 7.5, font: fontBold, color: clrGray });
  page.drawText('VERIFICATION METHOD', { x: col2x, y, size: 7.5, font: fontBold, color: clrGray });
  y -= 15;

  page.drawText(issuedLabel, { x: margin, y, size: 11, font: fontRegular, color: clrBlack });
  page.drawText('OTP-verified email', { x: col2x, y, size: 11, font: fontRegular, color: clrBlack });
  y -= 36;

  // ── Divider
  drawDivider(page, margin, y, width, clrBorder);
  y -= 28;

  // ── Cryptographic proof section (light-tinted box)
  const proofBoxTop = y;
  const proofBoxH   = 118;

  page.drawRectangle({
    x: margin, y: proofBoxTop - proofBoxH,
    width: width - margin * 2, height: proofBoxH,
    color: clrBg,
    borderColor: clrBorder,
    borderWidth: 0.5,
  });

  y -= 16;
  page.drawText('CRYPTOGRAPHIC PROOF', {
    x: margin + 16, y,
    size: 7.5, font: fontBold, color: clrGray,
  });
  y -= 18;

  // Certificate ID
  page.drawText('Certificate ID', { x: margin + 16, y, size: 8, font: fontBold, color: clrGray });
  y -= 13;
  page.drawText(cert.certificateId, {
    x: margin + 16, y, size: 9, font: fontMono, color: clrBlack,
  });
  y -= 20;

  // SHA-256 hash — split into two equal halves for readability
  page.drawText('SHA-256 Hash', { x: margin + 16, y, size: 8, font: fontBold, color: clrGray });
  y -= 13;
  const hash = cert.certificateHash;
  const half = Math.ceil(hash.length / 2);
  page.drawText(hash.slice(0, half), {
    x: margin + 16, y, size: 9, font: fontMono, color: clrBlack,
  });
  y -= 12;
  page.drawText(hash.slice(half), {
    x: margin + 16, y, size: 9, font: fontMono, color: clrBlack,
  });

  y = proofBoxTop - proofBoxH - 28;

  // ── Divider
  drawDivider(page, margin, y, width, clrBorder);
  y -= 28;

  // ── Verification section
  page.drawText('INDEPENDENT VERIFICATION', {
    x: margin, y, size: 7.5, font: fontBold, color: clrGray,
  });
  y -= 16;

  page.drawText(
    'Any third party can verify the authenticity of this certificate at:',
    { x: margin, y, size: 10, font: fontRegular, color: clrBlack },
  );
  y -= 16;

  const verifyUrl = `${verifyBaseUrl}/verify/${cert.certificateId}`;
  page.drawText(verifyUrl, {
    x: margin, y, size: 10, font: fontMono, color: clrGreenLight,
  });
  y -= 24;

  page.drawText(
    'To verify: open the URL above, compute SHA-256 of the canonical JSON payload, and compare to the hash above.',
    { x: margin, y, size: 8.5, font: fontRegular, color: clrGray },
  );

  // ─── Footer ────────────────────────────────────────────────────────────────

  const footerY = 36;
  drawDivider(page, margin, footerY + 18, width, clrBorder);

  page.drawText(
    'This certificate is tamper-evident and cryptographically sealed. ' +
    'The acceptance record is stored immutably by OfferAccept. ' +
    'Recomputing the SHA-256 hash from the exported canonical JSON must yield the hash above.',
    {
      x: margin, y: footerY,
      size: 7, font: fontRegular, color: clrGray,
      maxWidth: width - margin * 2,
      lineHeight: 10,
    },
  );

  return doc.save();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawDivider(page: any, x: number, y: number, width: number, color: unknown) {
  page.drawLine({ start: { x, y }, end: { x: width - x, y }, thickness: 0.5, color });
}

function formatDate(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  });
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}
