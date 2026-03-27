import type { CertificateDetail } from './offers-api';

// ─── generateCertificatePdf ────────────────────────────────────────────────────
// Generates a professional PDF acceptance certificate from certificate data.
//
// Both pdf-lib and qrcode are dynamically imported so they are only loaded when
// the user actually clicks "Download PDF" — not on initial page render.
//
// Layout (A4 portrait, 595 × 842 pt):
//   Header bar (green) — branding + title + issued date
//   Deal title
//   Parties (Accepted by / Sender) — two columns
//   Date & time / Verification method — two columns
//   Cryptographic proof box — Certificate ID, SHA-256 hash, Generated at
//   Verification section — URL left, QR code right
//   Footer — tamper-evident statement
//
// Font note: Standard PDF fonts (Helvetica, Courier) are required by the PDF
// specification and are guaranteed to render correctly in every compliant viewer.
// Embedding is not necessary for standard fonts; pdf-lib handles this correctly.

export async function generateCertificatePdf(
  cert: CertificateDetail,
  verifyBaseUrl: string,
): Promise<Uint8Array> {
  const [{ PDFDocument, rgb, StandardFonts }, QRCode] = await Promise.all([
    import('pdf-lib'),
    import('qrcode'),
  ]);

  const doc = await PDFDocument.create();
  doc.setTitle(`Acceptance Certificate — ${cert.offer.title}`);
  doc.setAuthor('OfferAccept');
  doc.setSubject('Deal Acceptance Certificate');
  doc.setCreationDate(new Date(cert.issuedAt));

  // A4 portrait
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
  const clrBg         = rgb(0.976, 0.992, 0.984);

  const margin = 52;

  // ─── QR code ───────────────────────────────────────────────────────────────
  // Generate before drawing so we can embed the image upfront.

  const verifyUrl = `${verifyBaseUrl}/verify/${cert.certificateId}`;

  const qrDataUrl = await QRCode.default.toDataURL(verifyUrl, {
    width: 240,           // larger source → better rasterisation when scaled down in PDF
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#22875e', light: '#ffffff' },
  });
  const qrBase64  = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrBytes   = Uint8Array.from(atob(qrBase64), (c) => c.charCodeAt(0));
  const qrImage   = await doc.embedPng(qrBytes);

  // ─── Header bar ───────────────────────────────────────────────────────────

  const hdrH = 108;
  page.drawRectangle({ x: 0, y: height - hdrH, width, height: hdrH, color: clrGreen });

  // Logo box
  page.drawRectangle({ x: margin, y: height - 74, width: 34, height: 34, color: clrWhite });
  page.drawText('OA', { x: margin + 6, y: height - 64, size: 14, font: fontBold, color: clrGreen });

  // Brand name
  page.drawText('OfferAccept', { x: margin + 44, y: height - 60, size: 12, font: fontBold, color: clrWhite });

  // Certificate title
  page.drawText('Acceptance Certificate', { x: margin, y: height - 96, size: 19, font: fontBold, color: clrWhite });

  // Issued date — top-right of header
  const issuedAt    = new Date(cert.issuedAt);
  const issuedLabel = formatDate(issuedAt) + ' UTC';
  const issuedW     = fontRegular.widthOfTextAtSize(issuedLabel, 8.5);
  page.drawText('Issued', {
    x: width - margin - issuedW, y: height - 55,
    size: 7.5, font: fontBold, color: rgb(0.75, 0.96, 0.86),
  });
  page.drawText(issuedLabel, {
    x: width - margin - issuedW, y: height - 67,
    size: 8.5, font: fontRegular, color: clrWhite,
  });

  // Accent stripe
  page.drawRectangle({ x: 0, y: height - hdrH - 6, width, height: 6, color: clrGreenLight });

  // ─── Body ──────────────────────────────────────────────────────────────────

  let y = height - hdrH - 38;

  // Deal title
  page.drawText('DEAL', { x: margin, y, size: 7.5, font: fontBold, color: clrGray });
  y -= 15;
  page.drawText(truncate(cert.offer.title, 72), { x: margin, y, size: 15, font: fontBold, color: clrBlack });
  y -= 32;

  drawDivider(page, margin, y, width, clrBorder);
  y -= 28;

  // Parties — two columns
  const col2x = width / 2 + 6;

  page.drawText('ACCEPTED BY', { x: margin,  y, size: 7.5, font: fontBold, color: clrGray });
  page.drawText('SENDER',      { x: col2x, y, size: 7.5, font: fontBold, color: clrGray });
  y -= 15;

  const recipientDisplay = cert.recipient.name || cert.recipient.email;
  page.drawText(truncate(recipientDisplay,       34), { x: margin,  y, size: 11, font: fontBold,    color: clrBlack });
  page.drawText(truncate(cert.sender.name,        34), { x: col2x, y, size: 11, font: fontBold,    color: clrBlack });
  y -= 14;
  page.drawText(truncate(cert.recipient.email,    38), { x: margin,  y, size: 9,  font: fontRegular, color: clrGray });
  page.drawText(truncate(cert.sender.email,       38), { x: col2x, y, size: 9,  font: fontRegular, color: clrGray });
  y -= 30;

  // Date & method — two columns
  page.drawText('DATE & TIME',          { x: margin,  y, size: 7.5, font: fontBold, color: clrGray });
  page.drawText('VERIFICATION METHOD',  { x: col2x, y, size: 7.5, font: fontBold, color: clrGray });
  y -= 15;
  page.drawText(issuedLabel,            { x: margin,  y, size: 11, font: fontRegular, color: clrBlack });
  page.drawText('OTP-verified email',   { x: col2x, y, size: 11, font: fontRegular, color: clrBlack });
  y -= 36;

  drawDivider(page, margin, y, width, clrBorder);
  y -= 28;

  // ─── Cryptographic proof box ───────────────────────────────────────────────
  // Now includes: Certificate ID · SHA-256 hash · Generated at

  const proofBoxTop = y;
  const proofBoxH   = 134; // taller to accommodate Generated at row

  page.drawRectangle({
    x: margin, y: proofBoxTop - proofBoxH,
    width: width - margin * 2, height: proofBoxH,
    color: clrBg, borderColor: clrBorder, borderWidth: 0.5,
  });

  const px = margin + 16;
  y -= 16;

  page.drawText('CRYPTOGRAPHIC PROOF', { x: px, y, size: 7.5, font: fontBold, color: clrGray });
  y -= 18;

  // Certificate ID
  page.drawText('Certificate ID', { x: px, y, size: 8, font: fontBold, color: clrGray });
  y -= 13;
  page.drawText(cert.certificateId, { x: px, y, size: 9, font: fontMono, color: clrBlack });
  y -= 20;

  // SHA-256 hash — split in two for readability, always Courier (monospace)
  page.drawText('SHA-256 Hash', { x: px, y, size: 8, font: fontBold, color: clrGray });
  y -= 13;
  const hash = cert.certificateHash;
  const half = Math.ceil(hash.length / 2);
  page.drawText(hash.slice(0, half), { x: px, y, size: 9, font: fontMono, color: clrBlack });
  y -= 12;
  page.drawText(hash.slice(half),    { x: px, y, size: 9, font: fontMono, color: clrBlack });
  y -= 20;

  // Generated at — when this PDF was created (distinct from certificate issuedAt)
  const generatedAt    = new Date();
  const generatedLabel = formatDate(generatedAt) + ' UTC';
  page.drawText('Generated at', { x: px, y, size: 8, font: fontBold, color: clrGray });
  y -= 13;
  page.drawText(generatedLabel, { x: px, y, size: 9, font: fontRegular, color: clrBlack });

  y = proofBoxTop - proofBoxH - 28;

  drawDivider(page, margin, y, width, clrBorder);
  y -= 28;

  // ─── Verification section — URL left, QR code right ───────────────────────

  const qrSize  = 82;
  const qrX     = width - margin - qrSize;
  const textZone = qrX - margin - 16; // available width for text column

  page.drawText('INDEPENDENT VERIFICATION', { x: margin, y, size: 7.5, font: fontBold, color: clrGray });
  y -= 16;

  page.drawText('Any third party can verify this certificate at:', {
    x: margin, y, size: 10, font: fontRegular, color: clrBlack, maxWidth: textZone,
  });
  y -= 16;

  // QR code — anchored to the top-right of this section
  const qrTopY = y + 2; // align with text top
  page.drawImage(qrImage, { x: qrX, y: qrTopY - qrSize, width: qrSize, height: qrSize });

  // Verification URL in green monospace — constrained to text column
  page.drawText(verifyUrl, {
    x: margin, y, size: 9.5, font: fontMono, color: clrGreenLight, maxWidth: textZone,
  });
  y -= 18;

  page.drawText('Generated at', { x: margin, y, size: 8, font: fontBold, color: clrGray });
  y -= 13;
  page.drawText(generatedLabel, { x: margin, y, size: 9, font: fontRegular, color: clrBlack });
  y -= 18;

  page.drawText(
    'Scan the QR code or open the URL above to independently verify the certificate hash.',
    { x: margin, y, size: 8, font: fontRegular, color: clrGray, maxWidth: textZone },
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
