import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts, AFRelationship } from 'pdf-lib';
import type { CertificatePayload } from './certificate-payload.builder';

// ─── CertificatePdfService ─────────────────────────────────────────────────────
// Generates a downloadable PDF version of an acceptance certificate.
//
// Purpose: Allow businesses to archive acceptance records in document management
// systems and email archives. The PDF contains the same factual information as
// the JSON export — it is NOT a legal contract or e-signature document.
//
// Design constraints:
//   - No signature graphics. Do not present as a legally binding document.
//   - Clearly labelled "Acceptance Certificate" (not "Agreement" or "Contract").
//   - Footer explicitly states this is a tamper-evident acceptance record.
//   - Certificate hash is included so the PDF retains cryptographic proof.
//   - Uses the stored certificateHash — never recomputes it.

const APP_URL = process.env['APP_URL'] ?? 'https://app.offeraccept.com';

@Injectable()
export class CertificatePdfService {
  async generate(params: {
    certificateId: string;
    certificateHash: string;
    issuedAt: string;
    payload: CertificatePayload;
    canonicalJson?: string;
  }): Promise<Uint8Array> {
    const { certificateId, certificateHash, payload } = params;

    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontMono = await doc.embedFont(StandardFonts.Courier);

    const margin = 56;
    const contentWidth = width - margin * 2;

    // Colour palette
    const green = rgb(0.086, 0.502, 0.239);   // #167A3D
    const gray = rgb(0.42, 0.42, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const lightGray = rgb(0.9, 0.9, 0.9);

    let y = height - margin;

    // ── Header bar ──────────────────────────────────────────────────────────────
    page.drawRectangle({
      x: margin,
      y: y - 36,
      width: contentWidth,
      height: 36,
      color: green,
    });
    page.drawText('Acceptance Certificate', {
      x: margin + 12,
      y: y - 24,
      size: 14,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('OfferAccept', {
      x: width - margin - 12 - fontBold.widthOfTextAtSize('OfferAccept', 10),
      y: y - 23,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    y -= 36 + 18;

    // ── Purpose statement (Part 8) ───────────────────────────────────────────────
    page.drawText(
      'This document is designed to serve as verifiable acceptance evidence.',
      {
        x: margin,
        y,
        size: 10,
        font: fontBold,
        color: black,
        maxWidth: contentWidth,
      },
    );
    y -= 18;

    // ── Disclaimer ──────────────────────────────────────────────────────────────
    page.drawText(
      'This certificate records that the individual identified below confirmed acceptance of the ' +
      'document identified below at the time recorded herein. This certificate is not a qualified ' +
      'electronic signature. It constitutes acceptance evidence.',
      {
        x: margin,
        y,
        size: 8,
        font: fontRegular,
        color: gray,
        maxWidth: contentWidth,
        lineHeight: 11,
      },
    );
    y -= 30;

    // ── Section helper ──────────────────────────────────────────────────────────
    const drawSectionLabel = (label: string) => {
      y -= 12;
      page.drawText(label.toUpperCase(), {
        x: margin,
        y,
        size: 7,
        font: fontBold,
        color: gray,
      });
      y -= 14;
    };

    const drawRow = (label: string, value: string, mono = false) => {
      const labelWidth = 130;
      page.drawText(label, { x: margin, y, size: 9, font: fontRegular, color: gray });
      const valueFont = mono ? fontMono : fontRegular;
      const valueFontSize = mono ? 8 : 9;
      // Wrap long values
      const maxChars = Math.floor((contentWidth - labelWidth) / (valueFontSize * 0.6));
      const lines = wrapText(value, maxChars);
      for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i], {
          x: margin + labelWidth,
          y: y - i * (valueFontSize + 2),
          size: valueFontSize,
          font: valueFont,
          color: black,
        });
      }
      y -= (lines.length * (valueFontSize + 3)) + 4;
    };

    const drawDivider = () => {
      y -= 6;
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.5,
        color: lightGray,
      });
      y -= 8;
    };

    // ── Deal ────────────────────────────────────────────────────────────────────
    drawSectionLabel('Deal');
    drawRow('Title', payload.offer.title);
    drawRow('Sender', `${payload.sender.name} <${payload.sender.email}>`);
    if (payload.offer.expiresAt) {
      drawRow('Expires', formatIso(payload.offer.expiresAt));
    }
    drawDivider();

    // ── Recipient ────────────────────────────────────────────────────────────────
    drawSectionLabel('Recipient');
    drawRow('Name', payload.recipient.name);
    drawRow('Email', payload.recipient.verifiedEmail);
    drawDivider();

    // ── Acceptance ────────────────────────────────────────────────────────────────
    drawSectionLabel('Acceptance');
    drawRow('Accepted at', formatIso(payload.acceptance.acceptedAt));
    drawRow('OTP verified at', formatIso(payload.acceptance.emailVerifiedAt));
    if (payload.acceptance.ipAddress) {
      drawRow('IP address', payload.acceptance.ipAddress);
    }
    drawDivider();

    // ── Acceptance statement ───────────────────────────────────────────────────────
    drawSectionLabel('Acceptance Statement');
    const statementText = payload.acceptance.statement || 'Acceptance statement unavailable.';
    const statementMaxChars = Math.floor(contentWidth / (8 * 0.6));
    const statementLines = wrapText(statementText, statementMaxChars);
    for (let i = 0; i < statementLines.length; i++) {
      page.drawText(statementLines[i], {
        x: margin,
        y: y - i * 11,
        size: 8,
        font: fontRegular,
        color: black,
        maxWidth: contentWidth,
      });
    }
    y -= (statementLines.length * 11) + 8;
    drawDivider();

    // ── Certificate ────────────────────────────────────────────────────────────────
    drawSectionLabel('Certificate');
    drawRow('Certificate ID', certificateId, true);
    drawRow('SHA-256 hash', certificateHash, true);
    drawRow('Issued at', formatIso(params.issuedAt));
    drawRow('Verify online', `${APP_URL}/verify/${certificateId}`);
    // Part 9: independent verification note
    y -= 4;
    page.drawText(
      'This certificate can be independently verified using the embedded data.',
      {
        x: margin,
        y,
        size: 8,
        font: fontRegular,
        color: gray,
        maxWidth: contentWidth,
      },
    );
    y -= 14;
    drawDivider();

    // ── Documents ────────────────────────────────────────────────────────────────
    if (payload.documents.length > 0) {
      drawSectionLabel('Attached documents');
      for (const doc of payload.documents) {
        drawRow(doc.filename, `SHA-256: ${doc.sha256Hash}`, true);
      }
      drawDivider();
    }

    // ── Offline verification ──────────────────────────────────────────────────────
    // The canonical JSON payload is embedded as a file attachment (certificate-payload.json).
    // To verify offline: extract the attachment, compute SHA-256(file contents), compare to the
    // "SHA-256 hash" printed in the Certificate section above. No network access required.
    if (params.canonicalJson) {
      drawSectionLabel('Offline verification');
      page.drawText(
        'To verify this certificate without network access: extract the attached ' +
        'certificate-payload.json file, compute its SHA-256 hash, and compare it to the ' +
        '"SHA-256 hash" value printed above. They must match exactly.',
        {
          x: margin,
          y,
          size: 8,
          font: fontRegular,
          color: gray,
          maxWidth: contentWidth,
          lineHeight: 11,
        },
      );
      y -= 30;
      drawRow('Attachment', 'certificate-payload.json (embedded in this PDF)');
      drawDivider();

      // Embed the canonical JSON as a PDF file attachment.
      const jsonBytes = Buffer.from(params.canonicalJson, 'utf8');
      await doc.attach(jsonBytes, 'certificate-payload.json', {
        mimeType: 'application/json',
        description: 'Certificate payload — SHA-256(this file) must equal the certificate hash above',
        creationDate: new Date(params.issuedAt),
        modificationDate: new Date(params.issuedAt),
        afRelationship: AFRelationship.Data,
      });
    }

    // ── Footer ────────────────────────────────────────────────────────────────────
    const footerText =
      'This certificate is not a qualified electronic signature within the meaning of EU Regulation ' +
      'No 910/2014 (eIDAS). It constitutes verifiable acceptance evidence and may be adduced in legal ' +
      'or commercial proceedings. Generated by OfferAccept.';
    page.drawText(footerText, {
      x: margin,
      y: margin + 10,
      size: 7,
      font: fontRegular,
      color: gray,
      maxWidth: contentWidth,
      lineHeight: 11,
    });

    return doc.save();
  }
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let breakAt = remaining.lastIndexOf(' ', maxChars);
    if (breakAt <= 0) breakAt = maxChars;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

function formatIso(iso: string): string {
  try {
    return new Date(iso).toUTCString();
  } catch {
    return iso;
  }
}
