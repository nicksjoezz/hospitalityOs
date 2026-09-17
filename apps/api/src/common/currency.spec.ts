import {
  convertMinor,
  formatMoney,
  minorUnitFactor,
  toMinorUnits,
} from '@hospitalityos/shared';

describe('currency (multi-currency support)', () => {
  it('uses correct minor-unit factor per currency', () => {
    expect(minorUnitFactor('NGN')).toBe(100);
    expect(minorUnitFactor('USD')).toBe(100);
    expect(minorUnitFactor('JPY')).toBe(1); // zero-decimal currency
    expect(minorUnitFactor('XOF')).toBe(1);
  });

  it('converts a foreign-currency amount to the base currency via fx rate', () => {
    // 100 USD at 1500 NGN/USD -> 150,000 NGN -> 15,000,000 kobo
    const usdMinor = toMinorUnits(100, 'USD'); // 10_000
    const ngnMinor = convertMinor(usdMinor, 'USD', 'NGN', 1500);
    expect(ngnMinor).toBe(15_000_000);
  });

  it('is a no-op when currencies match', () => {
    expect(convertMinor(5000, 'NGN', 'NGN', 1)).toBe(5000);
  });

  it('formats with the right symbol and decimals', () => {
    expect(formatMoney(150050, 'NGN')).toBe('₦1,500.50');
    expect(formatMoney(10000, 'JPY')).toBe('¥10,000');
  });
});
