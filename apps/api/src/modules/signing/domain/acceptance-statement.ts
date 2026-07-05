// ─── Acceptance statement builder ─────────────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH for the acceptance statement text.
//
// Both the display path (SigningFlowService.getOfferContext) and the storage path
// (AcceptanceService.accept → AcceptanceRecord.acceptanceStatement) MUST use this
// function so the text shown to the recipient is byte-for-byte identical to the
// text stored as evidence.
//
// Design decisions:
//   - No LIVE timestamp in the statement text. acceptedAt is stored separately
//     in AcceptanceRecord.acceptedAt and appears in the certificate payload.
//     Embedding the moment-of-acceptance here would require knowing it at
//     display time, which is impossible; any approximation would silently
//     diverge from the stored value. offerDate is different and safe to embed:
//     it comes from OfferSnapshot.frozenAt, a value that is already fixed
//     before either the display or storage call happens, so both paths always
//     read the same static value.
//   - The statement is server-generated — the client cannot control any part of it.
//     All inputs come from OfferSnapshot and OfferRecipient (frozen at send time).
//   - This function is pure and has no I/O so it can be tested in isolation.

export interface AcceptanceStatementParams {
  recipientName: string;
  recipientEmail: string;
  offerTitle: string;
  offerVersion: number;
  offerDate: Date;
  senderName: string;
  senderEmail: string;
}

// Identifies which wording template generated a given statement — distinct from
// offerVersion (which offer content was accepted). Stored on
// AcceptanceRecord.acceptanceStatementVersion. Bump this whenever the wording
// below changes, and update the two legal pages that mirror this text:
// apps/web/src/app/legal/terms/page.tsx (§4.1) and
// apps/web/src/app/legal/acceptance-statement/page.tsx.
export const ACCEPTANCE_STATEMENT_TEMPLATE_VERSION = '2.0';

function formatOfferDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function buildAcceptanceStatement(params: AcceptanceStatementParams): string {
  return (
    `I, ${params.recipientName}, confirm that I have reviewed and accept the offer ` +
    `"${params.offerTitle}" (version ${params.offerVersion}, dated ${formatOfferDate(params.offerDate)}) ` +
    `presented by ${params.senderName} (${params.senderEmail}). This acceptance is made via my ` +
    `verified email address ${params.recipientEmail}. By confirming this acceptance, I acknowledge ` +
    `this action as my binding agreement to the terms presented, and I confirm that I have authority ` +
    `to bind myself or, where applicable, the legal entity I represent. This confirmation constitutes ` +
    `an advanced electronic signature under the Norwegian Act on Electronic Commerce and Other ` +
    `Information Society Services (ehandelsloven), and not a qualified electronic signature under EU ` +
    `Regulation No 910/2014 (eIDAS). The exact date and time of this confirmation is recorded in the ` +
    `certificate issued for this acceptance.`
  );
}
