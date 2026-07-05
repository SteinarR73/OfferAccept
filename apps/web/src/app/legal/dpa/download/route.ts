// Next.js Route Handler — generates and serves the DPA as a downloadable PDF.
// Accessible at GET /legal/dpa/download
//
// Uses pdf-lib (already in package.json) — no new dependencies required.

import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const ACCENT = rgb(0.02, 0.59, 0.41);   // #059669 — emerald-600
const BLACK  = rgb(0.06, 0.09, 0.16);   // #0f172a — slate-950
const MUTED  = rgb(0.28, 0.34, 0.41);   // #475569 — slate-600
const BORDER = rgb(0.89, 0.91, 0.94);   // #e2e8f0 — slate-200

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 56;
const LINE_W = A4_W - MARGIN * 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawHRule(page: ReturnType<PDFDocument['addPage']>, y: number) {
  page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: MARGIN + LINE_W, y },
    thickness: 0.5,
    color: BORDER,
  });
}

// ── PDF builder ───────────────────────────────────────────────────────────────

async function buildDpaPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('OfferAccept Data Processing Agreement');
  doc.setAuthor('OfferAccept AS');
  doc.setCreator('OfferAccept');
  doc.setSubject('DPA v1.1');

  const helvetica     = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4_W, A4_H]);
  let y = A4_H - MARGIN;

  // Helper: add a new page if insufficient space
  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 40) {
      page = doc.addPage([A4_W, A4_H]);
      y = A4_H - MARGIN;
    }
  }

  // Helper: draw body text with wrapping
  function drawBody(text: string, indent = 0) {
    const lines = wrapText(text, helvetica, 9, LINE_W - indent);
    for (const line of lines) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN + indent, y, size: 9, font: helvetica, color: MUTED });
      y -= 13;
    }
    y -= 3;
  }

  function drawSection(title: string, body: string) {
    ensureSpace(36);
    y -= 8;
    page.drawText(title, { x: MARGIN, y, size: 10, font: helveticaBold, color: BLACK });
    y -= 16;
    drawBody(body);
  }

  // ── Cover header ──────────────────────────────────────────────────────────
  // Green accent bar
  page.drawRectangle({ x: 0, y: A4_H - 6, width: A4_W, height: 6, color: ACCENT });

  // Logo wordmark
  page.drawText('OfferAccept', { x: MARGIN, y: y - 4, size: 14, font: helveticaBold, color: ACCENT });
  y -= 28;

  // Document title
  page.drawText('Data Processing Agreement', { x: MARGIN, y, size: 18, font: helveticaBold, color: BLACK });
  y -= 24;
  page.drawText('DPA Version 1.1  ·  Effective March 2026', { x: MARGIN, y, size: 9, font: helvetica, color: MUTED });
  y -= 6;
  drawHRule(page, y);
  y -= 20;

  // ── Parties ───────────────────────────────────────────────────────────────
  drawSection(
    '1. Parties',
    'This Data Processing Agreement ("DPA") is between OfferAccept AS ("Processor"), a Norwegian ' +
    'company, and the organisation that has accepted the OfferAccept Terms of Service ("Controller"). ' +
    'Together, the parties are referred to as "the parties". By using the OfferAccept service the Controller ' +
    'agrees to the terms of this DPA.',
  );

  // ── Processing purpose ────────────────────────────────────────────────────
  drawSection(
    '2. Processing purpose',
    '(a) The Processor processes personal data solely to provide the OfferAccept service as described in ' +
    'the Terms of Service: sending deal documents to recipients, verifying recipient email via one-time ' +
    'passcode (OTP), recording acceptance or decline events, and issuing tamper-evident acceptance ' +
    'certificates. Processing occurs only on documented instructions from the Controller, per GDPR Art. ' +
    '28(3)(a). (b) Personnel authorised to process personal data under this DPA are subject to ' +
    'confidentiality obligations, per Art. 28(3)(b).',
  );

  // ── Categories of data ────────────────────────────────────────────────────
  drawSection(
    '3. Categories of personal data',
    'The Processor processes the following categories of personal data on behalf of the Controller: ' +
    'name and email address of deal recipients; IP address, browser information, and timestamps recorded ' +
    'during signing events; OTP verification records (hashed codes, not raw values); deal titles and ' +
    'acceptance decisions; and user account details (name, email, hashed password) of the Controller\'s ' +
    'staff accounts.',
  );

  // ── Security obligations ──────────────────────────────────────────────────
  drawSection(
    '4. Security obligations',
    '(c) The Processor implements and maintains appropriate technical and organisational measures to ' +
    'protect personal data, as required by GDPR Art. 32, including: encryption in transit (TLS 1.2+) and ' +
    'at rest; access controls limiting data access to authorised personnel; SHA-256 certificate integrity ' +
    'sealing to detect unauthorised alteration; rate limiting and monitoring on authentication endpoints; ' +
    'HttpOnly, Secure, SameSite=Strict cookies; and immutable append-only acceptance evidence tables. ' +
    '(f) The Processor assists the Controller, insofar as possible, in fulfilling its obligations under ' +
    'Art. 32-36, including via the breach notification commitment in Clause 7.',
  );

  // ── Data retention ────────────────────────────────────────────────────────
  drawSection(
    '5. Data retention',
    'Acceptance certificates and associated evidence records (AcceptanceRecord, OfferSnapshot, ' +
    'SigningEvent, AcceptanceCertificate) are retained for the lifetime of the Controller\'s account and ' +
    'for a minimum of 7 years after acceptance to support legal and compliance use cases. This floor ' +
    'reflects the 5-year bookkeeping retention period under the Norwegian Bookkeeping Act ' +
    '(bokforingsloven) Section 13 and the general 3-year (up to 10-year, in cases with a qualifying legal ' +
    'basis) limitation periods under the Norwegian Limitation Act (foreldelsesloven) Section 2 for ' +
    'contract-related claims. Separate, shorter-lived operational data (such as in-progress email ' +
    'verification sessions) is purged automatically as part of the Processor\'s data minimisation ' +
    'practices, independent of this retention floor. (e)(g) Personal data in mutable records (user ' +
    'accounts, draft offers) may be deleted or returned on request, subject to the erasure procedure ' +
    'described in Clause 9; verified requests are processed within 30 days. Acceptance records cannot be ' +
    'deleted because deletion would invalidate the certificate integrity guarantees.',
  );

  // ── Sub-processors ────────────────────────────────────────────────────────
  drawSection(
    '6. Sub-processors',
    '(d) The Processor uses the following categories of sub-processors to deliver the service, engaged ' +
    'subject to the same data protection obligations set out in this DPA: cloud infrastructure (hosting, ' +
    'database, and object storage); transactional email delivery; payment processing; and error ' +
    'monitoring. See offeraccept.com/legal/subprocessors for the confirmed list. The Processor will ' +
    'notify the Controller with at least 14 days\' notice of material changes to sub-processors.',
  );

  // ── Breach notification ───────────────────────────────────────────────────
  drawSection(
    '7. Breach notification',
    'In the event of a personal data breach, the Processor will notify the Controller without undue delay ' +
    'and in any case within 72 hours of becoming aware of the breach. Notification will include the nature ' +
    'of the breach, categories and approximate number of data subjects affected, likely consequences, and ' +
    'measures taken or proposed.',
  );

  // ── International transfers ───────────────────────────────────────────────
  drawSection(
    '8. International transfers',
    'The Processor is based in Norway. Certain sub-processors used to deliver the service are located ' +
    'outside the EEA (see offeraccept.com/legal/subprocessors for the confirmed list and each ' +
    'sub-processor\'s location). Transfers of personal data to sub-processors located outside the EEA are ' +
    'made under Standard Contractual Clauses (SCCs) as adopted by the European Commission (Commission ' +
    'Decision 2021/914), or another valid transfer mechanism under GDPR Art. 46. A copy of the applicable ' +
    'SCCs is available on request from privacy@offeraccept.com.',
  );

  // ── Data subject rights ───────────────────────────────────────────────────
  drawSection(
    '9. Data subject rights and erasure',
    'The Controller is responsible for managing data subject rights requests from its own staff and ' +
    'customers. The Processor provides: (a) a data export endpoint (GET /api/v1/account/export) returning ' +
    'all personal data held for the requesting user; and (b) an erasure request endpoint ' +
    '(POST /api/v1/account/erasure-request) that initiates the account deletion workflow, processed within ' +
    '30 days of a verified request. Acceptance records and certificate evidence cannot be deleted or ' +
    'pseudonymised because doing so would invalidate the certificate hash and destroy the evidentiary ' +
    'record.',
  );

  // ── Audits and compliance ─────────────────────────────────────────────────
  drawSection(
    '10. Audits and compliance',
    '(h) The Processor makes available to the Controller information reasonably necessary to demonstrate ' +
    'compliance with this DPA, and permits and contributes to audits, including inspections, conducted by ' +
    'the Controller or an auditor mandated by the Controller, subject to reasonable advance notice and ' +
    'confidentiality.',
  );

  // ── Governing law ─────────────────────────────────────────────────────────
  drawSection(
    '11. Governing law',
    'This DPA is governed by Norwegian law, without regard to its conflict of law provisions. Disputes ' +
    'that cannot be resolved amicably shall be brought before Stavanger tingrett (Stavanger District ' +
    'Court) as the exclusive venue of first instance.',
  );

  // ── Signature blocks ──────────────────────────────────────────────────────
  ensureSpace(200);
  y -= 16;
  drawHRule(page, y);
  y -= 20;

  page.drawText('SIGNATURES', { x: MARGIN, y, size: 9, font: helveticaBold, color: MUTED });
  y -= 20;

  // Two columns
  const colW = (LINE_W - 24) / 2;

  // Controller block (left)
  page.drawText('CONTROLLER', { x: MARGIN, y, size: 8, font: helveticaBold, color: ACCENT });
  y -= 16;

  const sigFields = ['Company name', 'Representative name', 'Title', 'Signature', 'Date'];
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 24;
  let fieldY = y;

  for (const label of sigFields) {
    page.drawText(label, { x: leftX, y: fieldY, size: 7.5, font: helvetica, color: MUTED });
    page.drawLine({
      start: { x: leftX, y: fieldY - 10 },
      end:   { x: leftX + colW, y: fieldY - 10 },
      thickness: 0.5,
      color: BORDER,
    });
    fieldY -= 24;
  }

  // Processor block (right)
  fieldY = y;
  page.drawText('PROCESSOR — OfferAccept AS', { x: rightX, y: fieldY + 16, size: 8, font: helveticaBold, color: ACCENT });

  const processorDefaults: Record<string, string> = {
    'Company name': 'OfferAccept AS',
    'Title': 'Chief Executive Officer',
  };

  for (const label of sigFields) {
    const prefill = processorDefaults[label] ?? '';
    page.drawText(label, { x: rightX, y: fieldY, size: 7.5, font: helvetica, color: MUTED });
    if (prefill) {
      page.drawText(prefill, { x: rightX, y: fieldY - 8, size: 8, font: helveticaBold, color: BLACK });
    }
    page.drawLine({
      start: { x: rightX, y: fieldY - 10 },
      end:   { x: rightX + colW, y: fieldY - 10 },
      thickness: 0.5,
      color: BORDER,
    });
    fieldY -= 24;
  }

  y = fieldY - 12;

  // ── Footer ────────────────────────────────────────────────────────────────
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawText(`OfferAccept DPA v1.1  ·  Page ${i + 1} of ${pages.length}  ·  privacy@offeraccept.com`, {
      x: MARGIN,
      y: 28,
      size: 7,
      font: helvetica,
      color: MUTED,
    });
  }

  return doc.save();
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const pdfBytes = await buildDpaPdf();
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="offeraccept-dpa-v1.1.pdf"',
        'Content-Length': String(pdfBytes.byteLength),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[DPA PDF] generation failed', err);
    return new NextResponse('PDF generation failed', { status: 500 });
  }
}
