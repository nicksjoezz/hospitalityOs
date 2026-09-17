import { computeQuote, nightsBetween } from './pricing';

describe('pricing', () => {
  it('counts whole nights, checkout-exclusive, min 1', () => {
    expect(nightsBetween(new Date('2026-01-01'), new Date('2026-01-04'))).toBe(3);
    expect(nightsBetween(new Date('2026-01-01'), new Date('2026-01-02'))).toBe(1);
    // same day -> still charge 1 night
    expect(nightsBetween(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(1);
  });

  it('computes total as nightly rate * nights (integer minor units)', () => {
    const q = computeQuote(2500000, 'NGN', new Date('2026-01-01'), new Date('2026-01-04'));
    expect(q.nights).toBe(3);
    expect(q.nightlyRate).toBe(2500000);
    expect(q.total).toBe(7500000);
    expect(q.currency).toBe('NGN');
  });
});
