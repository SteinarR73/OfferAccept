import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFImage, rgb, StandardFonts, AFRelationship } from 'pdf-lib';
import QRCode from 'qrcode';
import type { CertificatePayload } from './certificate-payload.builder';
import { MetricsService } from '../../common/metrics/metrics.service';

// ─── CertificatePdfService ─────────────────────────────────────────────────────
// Generates a downloadable PDF version of an acceptance certificate.
//
// Design constraints:
//   - No signature graphics. Do not present as a legally binding document.
//   - Clearly labelled "Acceptance Certificate" (not "Agreement" or "Contract").
//   - Footer explicitly states this is a tamper-evident acceptance record.
//   - Certificate hash is included so the PDF retains cryptographic proof.
//   - Uses the stored certificateHash — never recomputes it.
//   - QR code and brand logo are visual-only and excluded from the canonical hash.
//
// Layout (A4 portrait, 595 × 842 pt):
//   Header bar (green)           — branding
//   A — Certificate identity     — ID, issued at, verification method
//   B — Parties                  — accepted by / sender
//   C — What was accepted        — deal title, statement, documents
//   D — Integrity proof          — SHA-256 hash, verify URL, QR code
//   Offline verification         — embedded JSON instructions
//   Footer                       — eIDAS disclaimer

const APP_URL = process.env['APP_URL'] ?? 'https://app.offeraccept.com';

@Injectable()
export class CertificatePdfService {
  constructor(private readonly metrics: MetricsService) {}

  async generate(params: {
    certificateId: string;
    certificateHash: string;
    issuedAt: string;
    payload: CertificatePayload;
    canonicalJson?: string;
  }): Promise<Uint8Array> {
    const { certificateId, certificateHash, payload } = params;

    const doc = await PDFDocument.create();
    doc.setTitle(`Acceptance Certificate — ${payload.offer.title}`);
    doc.setAuthor('OfferAccept');
    doc.setSubject('Deal Acceptance Certificate');
    doc.setCreationDate(new Date(params.issuedAt));

    const page = doc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontMono    = await doc.embedFont(StandardFonts.Courier);

    const margin       = 52;
    const contentWidth = width - margin * 2;

    // ── Palette ──────────────────────────────────────────────────────────────────
    const green      = rgb(0.086, 0.502, 0.239);  // #167A3D
    const greenLight = rgb(0.184, 0.627, 0.451);  // #2fa073
    const white      = rgb(1, 1, 1);
    const black      = rgb(0.098, 0.098, 0.098);
    const gray       = rgb(0.42, 0.42, 0.42);
    const border     = rgb(0.87, 0.87, 0.87);
    const bg         = rgb(0.976, 0.992, 0.984);

    // ── QR code ───────────────────────────────────────────────────────────────────
    // Generated before drawing; excluded from canonical payload and hash.
    const verifyUrl  = `${APP_URL}/verify/${certificateId}`;
    const qrDataUrl  = await QRCode.toDataURL(verifyUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#167A3D', light: '#ffffff' },
    });
    const qrBase64   = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrBytes    = Buffer.from(qrBase64, 'base64');
    const qrImage    = await doc.embedPng(qrBytes);

    // ── Brand icon ────────────────────────────────────────────────────────────────
    // Visual-only — excluded from canonical payload and hash.
    let logoPng: PDFImage | null = null;
    try {
      const logoBytes = readFileSync(join(process.cwd(), 'assets', 'offeraccept-logopic.png'));
      logoPng = await doc.embedPng(logoBytes);
    } catch { /* asset absent — fall back to text */ }

    // ── Helpers ───────────────────────────────────────────────────────────────────

    let y = height - margin;

    function drawDivider() {
      y -= 8;
      page.drawLine({
        start: { x: margin, y },
        end:   { x: width - margin, y },
        thickness: 0.4,
        color: border,
      });
      y -= 8;
    }

    function drawLabel(text: string) {
      page.drawText(text.toUpperCase(), {
        x: margin, y,
        size: 6.5, font: fontBold, color: gray,
      });
      y -= 12;
    }

    function drawRow(label: string, value: string, mono = false) {
      const labelWidth = 126;
      page.drawText(label, { x: margin, y, size: 8.5, font: fontRegular, color: gray });
      const vFont    = mono ? fontMono : fontRegular;
      const vSize    = mono ? 7.5 : 8.5;
      const maxChars = Math.floor((contentWidth - labelWidth) / (vSize * 0.58));
      const lines    = wrapText(value, maxChars);
      for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i], {
          x: margin + labelWidth,
          y: y - i * (vSize + 2),
          size: vSize, font: vFont, color: black,
        });
      }
      y -= (lines.length * (vSize + 2)) + 5;
    }

    // ── HEADER ────────────────────────────────────────────────────────────────────
    const hdrH = 44;
    page.drawRectangle({ x: 0, y: height - hdrH, width, height: hdrH, color: green });
    page.drawRectangle({ x: 0, y: height - hdrH - 4, width, height: 4, color: greenLight });

    // Brand — icon (if available) + name
    const brandText = 'OfferAccept';
    const brandTextW = fontBold.widthOfTextAtSize(brandText, 10);
    const brandTextX = margin + (logoPng ? 30 : 0);
    if (logoPng) {
      page.drawRectangle({ x: margin - 1, y: height - hdrH + 6, width: 24, height: 24, color: white });
      page.drawImage(logoPng, { x: margin + 1, y: height - hdrH + 8, width: 20, height: 20 });
    }
    page.drawText(brandText, {
      x: brandTextX + (logoPng ? 6 : 0), y: height - hdrH + 17,
      size: 10, font: fontBold, color: white,
    });

    // Certificate title — right-aligned
    const titleText = 'Acceptance Certificate';
    const titleW    = fontBold.widthOfTextAtSize(titleText, 13);
    page.drawText(titleText, {
      x: width - margin - titleW, y: height - hdrH + 15,
      size: 13, font: fontBold, color: white,
    });

    y = height - hdrH - 4 - 22; // below accent stripe

    // ── A — CERTIFICATE IDENTITY ─────────────────────────────────────────────────
    drawLabel('Certificate identity');
    drawRow('Certificate ID',    certificateId, true);
    drawRow('Issued at',         formatDate(new Date(params.issuedAt)) + ' UTC');
    drawRow('Verification',      'OTP-verified email');

    drawDivider();

    // ── B — PARTIES ───────────────────────────────────────────────────────────────
    drawLabel('Parties');

    const col2x      = width / 2 + 4;
    const partyYTop  = y;

    // Accepted by
    page.drawText('Accepted by', { x: margin, y: partyYTop, size: 6.5, font: fontBold, color: gray });
    page.drawText('Sender',      { x: col2x,  y: partyYTop, size: 6.5, font: fontBold, color: gray });
    y -= 12;
    page.drawText(truncate(payload.recipient.name, 30),        { x: margin, y, size: 9.5, font: fontBold, color: black });
    page.drawText(truncate(payload.sender.name, 30),           { x: col2x,  y, size: 9.5, font: fontBold, color: black });
    y -= 13;
    page.drawText(truncate(payload.recipient.verifiedEmail, 34), { x: margin, y, size: 8, font: fontRegular, color: gray });
    page.drawText(truncate(payload.sender.email, 34),            { x: col2x,  y, size: 8, font: fontRegular, color: gray });
    y -= 10;

    drawDivider();

    // ── C — WHAT WAS ACCEPTED ─────────────────────────────────────────────────────
    drawLabel('What was accepted');

    page.drawText('Deal', { x: margin, y, size: 6.5, font: fontBold, color: gray });
    y -= 12;
    page.drawText(truncate(payload.offer.title, 70), { x: margin, y, size: 10, font: fontBold, color: black });
    y -= 16;

    if (payload.acceptance.statement) {
      page.drawText('Acceptance Statement', { x: margin, y, size: 6.5, font: fontBold, color: gray });
      y -= 12;
      const stmtMaxChars = Math.floor(contentWidth / (7.5 * 0.58));
      const stmtLines = wrapText(payload.acceptance.statement, stmtMaxChars);
      const maxLines  = 6;
      const shown     = stmtLines.slice(0, maxLines);
      for (let i = 0; i < shown.length; i++) {
        page.drawText(shown[i], { x: margin, y: y - i * 10, size: 7.5, font: fontRegular, color: black, maxWidth: contentWidth });
      }
      if (stmtLines.length > maxLines) {
        page.drawText('[statement continues — see embedded JSON attachment]', {
          x: margin, y: y - maxLines * 10, size: 7, font: fontRegular, color: gray,
        });
        y -= (maxLines + 1) * 10 + 4;
      } else {
        y -= shown.length * 10 + 4;
      }
    }

    if (payload.documents.length > 0) {
      y -= 6;
      page.drawText('Documents', { x: margin, y, size: 6.5, font: fontBold, color: gray });
      y -= 12;
      for (const d of payload.documents) {
        const nameW    = fontBold.widthOfTextAtSize(truncate(d.filename, 36), 8);
        page.drawText(truncate(d.filename, 36), { x: margin, y, size: 8, font: fontBold, color: black });
        page.drawText(`SHA-256: ${d.sha256Hash}`, {
          x: margin, y: y - 10,
          size: 6.5, font: fontMono, color: gray,
          maxWidth: contentWidth,
        });
        void nameW;
        y -= 22;
      }
    }

    drawDivider();

    // ── TRUST EXPLANATION ─────────────────────────────────────────────────────────
    const trustBoxTop = y;
    const trustText   = [
      'This certificate records that the recipient:',
      '  •  verified control of their email address via a one-time code,',
      '  •  reviewed the acceptance statement above, and',
      '  •  confirmed acceptance of the attached document(s).',
      '',
      'Document integrity is protected using SHA-256 hashing. Any modification to the',
      'accepted files or this certificate payload would produce a different hash and',
      'fail independent verification.',
    ];
    page.drawRectangle({
      x: margin, y: trustBoxTop - 2 - trustText.length * 10,
      width: contentWidth, height: trustText.length * 10 + 8,
      color: bg, borderColor: border, borderWidth: 0.4,
    });
    y -= 8;
    for (const line of trustText) {
      page.drawText(line, { x: margin + 8, y, size: 7.5, font: fontRegular, color: black });
      y -= 10;
    }
    y -= 6;

    drawDivider();

    // ── D — INTEGRITY PROOF ───────────────────────────────────────────────────────
    drawLabel('Integrity proof');

    page.drawText('SHA-256 certificate hash', { x: margin, y, size: 7, font: fontBold, color: gray });
    y -= 12;
    const half = Math.ceil(certificateHash.length / 2);
    page.drawText(certificateHash.slice(0, half), { x: margin, y, size: 8, font: fontMono, color: black });
    y -= 11;
    page.drawText(certificateHash.slice(half),    { x: margin, y, size: 8, font: fontMono, color: black });
    y -= 18;

    // Verify independently — URL left, QR right
    const qrSize  = 68;
    const qrX     = width - margin - qrSize;
    const textZone = qrX - margin - 12;

    page.drawText('Verify this certificate independently', {
      x: margin, y, size: 7, font: fontBold, color: gray,
    });
    y -= 13;

    const qrTopY = y + 2;
    page.drawImage(qrImage, { x: qrX, y: qrTopY - qrSize, width: qrSize, height: qrSize });

    page.drawText('Any third party can verify this record at:', {
      x: margin, y, size: 8, font: fontRegular, color: black, maxWidth: textZone,
    });
    y -= 12;
    page.drawText(verifyUrl, {
      x: margin, y, size: 7.5, font: fontMono, color: greenLight, maxWidth: textZone,
    });
    y -= 14;
    page.drawText('Scan the QR code or open the URL above to confirm this record', {
      x: margin, y, size: 7, font: fontRegular, color: gray, maxWidth: textZone,
    });
    y -= 11;
    page.drawText('has not been modified since it was issued.', {
      x: margin, y, size: 7, font: fontRegular, color: gray, maxWidth: textZone,
    });

    // Ensure y is below the QR code
    const qrBottom = qrTopY - qrSize - 6;
    if (y > qrBottom) y = qrBottom;

    // ── OFFLINE VERIFICATION ─────────────────────────────────────────────────────
    if (params.canonicalJson) {
      drawDivider();
      drawLabel('Offline verification');

      const offlineText = [
        'This certificate includes an embedded JSON payload (certificate-payload.json).',
        'Anyone can independently verify this record without internet access:',
        '',
        '  1.  Extract certificate-payload.json from this PDF using any PDF reader.',
        '  2.  Compute the SHA-256 hash of the file contents.',
        '  3.  Compare it to the "SHA-256 certificate hash" printed above.',
        '',
        'Matching hashes confirm the record has not been modified.',
      ];
      for (const line of offlineText) {
        page.drawText(line, { x: margin, y, size: 7.5, font: fontRegular, color: black, maxWidth: contentWidth });
        y -= 10;
      }
      y -= 4;
      drawRow('Attachment', 'certificate-payload.json (embedded in this PDF)');

      // Embed canonical JSON as PDF attachment
      const jsonBytes = Buffer.from(params.canonicalJson, 'utf8');
      await doc.attach(jsonBytes, 'certificate-payload.json', {
        mimeType:          'application/json',
        description:       'Certificate payload — SHA-256(this file) must equal the certificate hash above',
        creationDate:      new Date(params.issuedAt),
        modificationDate:  new Date(params.issuedAt),
        afRelationship:    AFRelationship.Data,
      });
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────────
    const footerY = 36;
    page.drawLine({
      start: { x: margin, y: footerY + 20 },
      end:   { x: width - margin, y: footerY + 20 },
      thickness: 0.4,
      color: border,
    });
    page.drawText(
      'This certificate is not a qualified electronic signature within the meaning of EU Regulation No 910/2014 (eIDAS). ' +
      'It constitutes verifiable acceptance evidence and may be adduced in legal or commercial proceedings. ' +
      'Generated by OfferAccept.',
      {
        x: margin, y: footerY,
        size: 6.5, font: fontRegular, color: gray,
        maxWidth: contentWidth, lineHeight: 9.5,
      },
    );

    const bytes = await doc.save();
    this.metrics.recordCertificatePdfGenerated();
    return bytes;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let breakAt = remaining.lastIndexOf(' ', maxChars);
    if (breakAt <= 0) breakAt = maxChars;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

function formatDate(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  });
}
