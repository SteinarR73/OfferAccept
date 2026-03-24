// ─── DealDeclinedEvent ────────────────────────────────────────────────────────
// Emitted after an offer is declined by the recipient.
// Carries the data required to notify the sender.

export class DealDeclinedEvent {
  constructor(
    public readonly offerId: string,
    public readonly offerTitle: string,
    public readonly senderEmail: string,
    public readonly senderName: string,
    public readonly recipientEmail: string,
    public readonly recipientName: string,
    public readonly declinedAt: Date,
  ) {}
}
