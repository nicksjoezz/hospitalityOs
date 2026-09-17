/**
 * Deterministic pricing (plan.md §7.1 — prices that become commitments come
 * from code, never the AI). Phase 0 uses flat nightly base price; PricingRules
 * and AI price suggestions arrive in Phase 4.
 */

/** Whole nights between two dates (checkout date excluded). Minimum 1. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const dIn = Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate());
  const dOut = Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate());
  const nights = Math.round((dOut - dIn) / (24 * 3600 * 1000));
  return Math.max(1, nights);
}

export interface QuoteBreakdown {
  nights: number;
  nightlyRate: number;
  total: number;
  currency: string;
}

export function computeQuote(
  basePrice: number,
  currency: string,
  checkIn: Date,
  checkOut: Date,
): QuoteBreakdown {
  const nights = nightsBetween(checkIn, checkOut);
  return {
    nights,
    nightlyRate: basePrice,
    total: basePrice * nights,
    currency,
  };
}
