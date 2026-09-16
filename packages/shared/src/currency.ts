/**
 * Multi-currency support (ISO 4217). The platform is NOT NGN-specific:
 * every hotel has its own base currency, and foreign guests may pay in a
 * different currency. Money is ALWAYS stored as integer minor units, but the
 * number of minor units per major unit varies by currency (NGN/USD = 2 decimals,
 * JPY = 0, KWD/BHD = 3), so never hardcode "kobo"/100.
 */

export interface CurrencyMeta {
  code: string;
  /** number of decimal places (minor-unit exponent) */
  decimals: number;
  symbol: string;
  name: string;
}

/**
 * Common currencies. Not exhaustive — any ISO 4217 code is accepted via
 * {@link getCurrency}; unknown codes default to 2 decimals and use the code as
 * the symbol. Add entries here to get correct symbols/decimals.
 */
export const CURRENCIES: Record<string, CurrencyMeta> = {
  NGN: { code: 'NGN', decimals: 2, symbol: '₦', name: 'Nigerian Naira' },
  USD: { code: 'USD', decimals: 2, symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', decimals: 2, symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', decimals: 2, symbol: '£', name: 'Pound Sterling' },
  GHS: { code: 'GHS', decimals: 2, symbol: 'GH₵', name: 'Ghanaian Cedi' },
  KES: { code: 'KES', decimals: 2, symbol: 'KSh', name: 'Kenyan Shilling' },
  ZAR: { code: 'ZAR', decimals: 2, symbol: 'R', name: 'South African Rand' },
  XOF: { code: 'XOF', decimals: 0, symbol: 'CFA', name: 'West African CFA Franc' },
  CAD: { code: 'CAD', decimals: 2, symbol: 'CA$', name: 'Canadian Dollar' },
  AUD: { code: 'AUD', decimals: 2, symbol: 'A$', name: 'Australian Dollar' },
  AED: { code: 'AED', decimals: 2, symbol: 'د.إ', name: 'UAE Dirham' },
  CNY: { code: 'CNY', decimals: 2, symbol: '¥', name: 'Chinese Yuan' },
  INR: { code: 'INR', decimals: 2, symbol: '₹', name: 'Indian Rupee' },
  JPY: { code: 'JPY', decimals: 0, symbol: '¥', name: 'Japanese Yen' },
};

const DEFAULT_DECIMALS = 2;

/** ISO 4217 codes are three uppercase letters. */
export function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export function getCurrency(code: string): CurrencyMeta {
  const upper = (code ?? '').toUpperCase();
  return (
    CURRENCIES[upper] ?? {
      code: upper,
      decimals: DEFAULT_DECIMALS,
      symbol: upper,
      name: upper,
    }
  );
}

/** Minor units per major unit, e.g. 100 for USD, 1 for JPY, 1000 for KWD. */
export function minorUnitFactor(code: string): number {
  return 10 ** getCurrency(code).decimals;
}

/** Convert a major-unit amount (e.g. 150.50) to integer minor units. */
export function toMinorUnits(major: number, code: string): number {
  return Math.round(major * minorUnitFactor(code));
}

/** Convert integer minor units back to a major-unit number. */
export function toMajorUnits(minor: number, code: string): number {
  return minor / minorUnitFactor(code);
}

/**
 * Convert an amount in minor units of `from` into minor units of `to` using a
 * major-unit FX rate (units of `to` per 1 unit of `from`). Used to record a
 * foreign-currency payment against a folio kept in the hotel's base currency.
 */
export function convertMinor(
  amountMinor: number,
  from: string,
  to: string,
  fxRate: number,
): number {
  if (from.toUpperCase() === to.toUpperCase()) return amountMinor;
  const major = toMajorUnits(amountMinor, from) * fxRate;
  return toMinorUnits(major, to);
}

/** Human-readable format, e.g. formatMoney(150050, 'NGN') -> "₦1,500.50". */
export function formatMoney(amountMinor: number, code: string): string {
  const meta = getCurrency(code);
  const major = toMajorUnits(amountMinor, code);
  const formatted = major.toLocaleString('en-US', {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return `${meta.symbol}${formatted}`;
}
