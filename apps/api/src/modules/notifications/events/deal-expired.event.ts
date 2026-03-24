// ─── DealExpiredEvent ─────────────────────────────────────────────────────────
// Emitted after an offer is batch-expired by the expiry sweep job.
// Carries the data required to notify the sender.

export class DealExpiredEvent {
  constructor(
    public readonly offerId: string,
    public readonly offerTitle: string,
    public readonly senderEmail: string,
    public readonly senderName: string,
    public readonly expiredAt: Date,
  ) {}
}
