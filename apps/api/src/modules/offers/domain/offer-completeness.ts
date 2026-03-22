import { Offer, OfferDocument, OfferRecipient } from '@offeraccept/database';
import { OfferIncompleteError } from '../../../common/errors/domain.errors';

// ─── Offer Completeness Rules ─────────────────────────────────────────────────
// An offer is considered complete and ready to send when ALL of the following
// are true:
//
//   1. title — non-empty string
//   2. recipient — exists with a non-empty email and non-empty name
//
// Documents are optional in v1. An offer with no attached documents is still
// sendable — the offer content may be communicated through title + message alone.
//
// These rules are the single authoritative source. They are checked in
// SendOfferService before the send transaction begins.

export function assertOfferIsComplete(
  offer: Pick<Offer, 'title'>,
  recipient: Pick<OfferRecipient, 'email' | 'name'> | null,
  _documents: OfferDocument[],  // reserved — future validation may require docs
): void {
  const missing: string[] = [];

  if (!offer.title?.trim()) {
    missing.push('title');
  }

  if (!recipient) {
    missing.push('recipient');
  } else {
    if (!recipient.email?.trim()) missing.push('recipient.email');
    if (!recipient.name?.trim()) missing.push('recipient.name');
  }

  if (missing.length > 0) {
    throw new OfferIncompleteError(missing);
  }
}
