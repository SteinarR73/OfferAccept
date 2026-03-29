// ─── DealAcceptedEvent ────────────────────────────────────────────────────────
// Emitted after an offer is accepted and the certificate is generated.
// Carries all data required to notify both the sender and the recipient.

export class DealAcceptedEvent {
  constructor(
    public readonly offerId: string,
    public readonly offerTitle: string,
    public readonly senderEmail: string,
    public readonly senderName: string,
    public readonly recipientEmail: string,
    public readonly recipientName: string,
    public readonly acceptedAt: Date,
    public readonly certificateId: string,
    public readonly certificateHash: string = '',
    public readonly verifyUrl: string = '',
  ) {}
}
