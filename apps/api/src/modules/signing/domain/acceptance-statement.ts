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
//   - No timestamp in the statement text. acceptedAt is stored separately in
//     AcceptanceRecord.acceptedAt and appears in the certificate payload. Embedding
//     the timestamp here would require knowing it at display time, which is
//     impossible; any approximation would silently diverge from the stored value.
//   - The statement is server-generated — the client cannot control any part of it.
//     All inputs come from OfferSnapshot and OfferRecipient (frozen at send time).
//   - This function is pure and has no I/O so it can be tested in isolation.

export interface AcceptanceStatementParams {
  recipientName: string;
  offerTitle: string;
  senderName: string;
  senderEmail: string;
}

export function buildAcceptanceStatement(params: AcceptanceStatementParams): string {
  return (
    `I, ${params.recipientName}, confirm that I have reviewed and accept the offer ` +
    `"${params.offerTitle}" presented by ${params.senderName} (${params.senderEmail}). ` +
    `By confirming this acceptance, I acknowledge this action as my binding agreement ` +
    `to the terms presented.`
  );
}
