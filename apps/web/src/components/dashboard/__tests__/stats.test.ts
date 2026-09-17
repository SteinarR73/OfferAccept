import { computeStats } from '../stats';
import type { OfferItem } from '@offeraccept/types';

describe('computeStats', () => {
  beforeAll(() => {
    // Mock date to ensure consistent startOfMonth
    jest.useFakeTimers().setSystemTime(new Date('2023-10-15T12:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const createMockOffer = (status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED', date: string): OfferItem => ({
    id: '1',
    title: 'Test',
    status,
    createdAt: date,
    updatedAt: date,
    senderId: 'user1',
    locale: 'no',
    timezone: 'Europe/Oslo',
    themeColor: '#000000',
    expiresAt: null,
    recipient: null,
  });

  it('computes correct stats for an empty list', () => {
    const stats = computeStats([]);
    expect(stats).toEqual({
      sentThisMonth: 0,
      accepted: 0,
      rate: 0,
      needsAttention: 0,
    });
  });

  it('computes correct stats for mixed offers', () => {
    const offers: OfferItem[] = [
      createMockOffer('ACCEPTED', '2023-10-10T10:00:00Z'), // This month, Accepted
      createMockOffer('SENT', '2023-10-14T10:00:00Z'),     // This month, Needs Attention
      createMockOffer('SENT', '2023-09-20T10:00:00Z'),     // Last month, Needs Attention
      createMockOffer('DECLINED', '2023-10-01T10:00:00Z'), // This month, Declined
    ];

    const stats = computeStats(offers);
    
    expect(stats).toEqual({
      sentThisMonth: 3, // 10th, 14th, 1st are in Oct 2023
      accepted: 1,      // Only the first one is accepted
      rate: 25,         // 1 accepted / 4 total = 25%
      needsAttention: 2, // The two SENT offers
    });
  });

  it('handles rate perfectly when all accepted', () => {
    const offers: OfferItem[] = [
      createMockOffer('ACCEPTED', '2023-10-10T10:00:00Z'),
      createMockOffer('ACCEPTED', '2023-10-14T10:00:00Z'),
    ];

    const stats = computeStats(offers);
    expect(stats.rate).toBe(100);
  });
});
