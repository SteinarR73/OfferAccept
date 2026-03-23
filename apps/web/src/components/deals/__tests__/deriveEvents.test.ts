import { deriveEvents } from '../DealActivityLog';
import type { OfferItem } from '@offeraccept/types';

function makeOffer(overrides: Partial<OfferItem> = {}): OfferItem {
  return {
    id: 'offer-1',
    organizationId: 'org-1',
    title: 'Test Deal',
    message: null,
    status: 'DRAFT',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-02T10:00:00Z',
    expiresAt: null,
    recipient: null,
    documents: [],
    ...overrides,
  } as OfferItem;
}

// Helper: data fields only, skip the React icon node.
function eventData(offer: OfferItem) {
  return deriveEvents(offer).map(({ id, label, variant }) => ({ id, label, variant }));
}

describe('deriveEvents', () => {
  it('DRAFT: single "Deal created" event', () => {
    expect(eventData(makeOffer())).toEqual([
      { id: 'created', label: 'Deal created', variant: 'neutral' },
    ]);
  });

  it('SENT: created + sent events', () => {
    const events = eventData(makeOffer({ status: 'SENT' }));
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ id: 'sent', label: 'Sent to customer', variant: 'blue' });
  });

  it('SENT with recipient email: sent label includes email', () => {
    const offer = makeOffer({
      status: 'SENT',
      recipient: { email: 'alice@acme.com', name: 'Alice' } as OfferItem['recipient'],
    });
    const events = eventData(offer);
    expect(events[1].label).toBe('Sent to alice@acme.com');
  });

  it('ACCEPTED: created + sent + accepted events', () => {
    const events = eventData(makeOffer({ status: 'ACCEPTED' }));
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({
      id: 'accepted',
      label: 'Deal accepted — certificate issued',
      variant: 'green',
    });
  });

  it('DECLINED: created + sent + declined events', () => {
    const events = eventData(makeOffer({ status: 'DECLINED' }));
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({
      id: 'declined',
      label: 'Customer declined the deal',
      variant: 'red',
    });
  });

  it('REVOKED: created + sent + revoked events', () => {
    const events = eventData(makeOffer({ status: 'REVOKED' }));
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({ id: 'revoked', label: 'Deal revoked', variant: 'purple' });
  });

  it('EXPIRED: created + sent + expired events', () => {
    const events = eventData(makeOffer({ status: 'EXPIRED' }));
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({
      id: 'expired',
      label: 'Deal expired without acceptance',
      variant: 'amber',
    });
  });

  it('EXPIRED: uses expiresAt as timestamp when available', () => {
    const offer = makeOffer({
      status: 'EXPIRED',
      expiresAt: '2026-01-15T00:00:00Z',
    });
    const expiredEvent = deriveEvents(offer).find((e) => e.id === 'expired')!;
    expect(expiredEvent.timestamp).toBe('2026-01-15T00:00:00Z');
  });

  it('EXPIRED: falls back to updatedAt when expiresAt is null', () => {
    const offer = makeOffer({ status: 'EXPIRED', expiresAt: null });
    const expiredEvent = deriveEvents(offer).find((e) => e.id === 'expired')!;
    expect(expiredEvent.timestamp).toBe(offer.updatedAt);
  });

  it('events are returned in chronological insertion order', () => {
    const events = deriveEvents(makeOffer({ status: 'ACCEPTED' }));
    expect(events.map((e) => e.id)).toEqual(['created', 'sent', 'accepted']);
  });
});
