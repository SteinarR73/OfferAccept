import { inferDealType } from '../DealTypeBadge';

describe('inferDealType', () => {
  it('returns "proposal" when title contains "proposal" (case-insensitive)', () => {
    expect(inferDealType('Q1 Proposal')).toBe('proposal');
    expect(inferDealType('PROPOSAL FOR SERVICES')).toBe('proposal');
    expect(inferDealType('my proposal')).toBe('proposal');
  });

  it('returns "quote" when title contains "quote" (case-insensitive)', () => {
    expect(inferDealType('Service Quote')).toBe('quote');
    expect(inferDealType('QUOTE #1234')).toBe('quote');
  });

  it('returns "onboarding" when title contains "onboarding" (case-insensitive)', () => {
    expect(inferDealType('Customer Onboarding')).toBe('onboarding');
    expect(inferDealType('ONBOARDING PACKAGE')).toBe('onboarding');
  });

  it('returns "offer" as the fallback for unrecognised titles', () => {
    expect(inferDealType('Senior Engineer Contract')).toBe('offer');
    expect(inferDealType('')).toBe('offer');
    expect(inferDealType('New Agreement')).toBe('offer');
  });

  it('proposal takes priority over other keywords', () => {
    // "proposal" appears first in the keyword chain
    expect(inferDealType('Onboarding Proposal')).toBe('proposal');
  });
});
