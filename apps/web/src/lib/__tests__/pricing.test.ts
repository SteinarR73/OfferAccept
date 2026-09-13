import { formatPrice, getPlanPricing } from '../pricing';

describe('pricing', () => {
  describe('formatPrice', () => {
    it('formats price in NOK correctly', () => {
      expect(formatPrice(199, 'no')).toBe('199 NOK');
      expect(formatPrice(1099, 'no')).toMatch(/1\s?099 NOK/); // Handles non-breaking spaces in different envs
    });

    it('formats price in USD correctly', () => {
      expect(formatPrice(19, 'en')).toBe('$19');
      expect(formatPrice(99, 'en')).toBe('$99');
    });
  });

  describe('getPlanPricing', () => {
    it('returns correct pricing for starter plan in NOK', () => {
      const pricing = getPlanPricing('starter', 'no');
      expect(pricing).toEqual({
        monthly: 199,
        yearly: 149,
        currency: 'NOK',
        currencySymbol: 'NOK',
      });
    });

    it('returns correct pricing for team plan in USD', () => {
      const pricing = getPlanPricing('team', 'en');
      expect(pricing).toEqual({
        monthly: 49,
        yearly: 39,
        currency: 'USD',
        currencySymbol: '$',
      });
    });

    it('returns null for unknown plan', () => {
      expect(getPlanPricing('unknown', 'en')).toBeNull();
    });
  });
});
