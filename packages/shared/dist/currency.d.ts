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
export declare const CURRENCIES: Record<string, CurrencyMeta>;
/** ISO 4217 codes are three uppercase letters. */
export declare function isValidCurrencyCode(code: string): boolean;
export declare function getCurrency(code: string): CurrencyMeta;
/** Minor units per major unit, e.g. 100 for USD, 1 for JPY, 1000 for KWD. */
export declare function minorUnitFactor(code: string): number;
/** Convert a major-unit amount (e.g. 150.50) to integer minor units. */
export declare function toMinorUnits(major: number, code: string): number;
/** Convert integer minor units back to a major-unit number. */
export declare function toMajorUnits(minor: number, code: string): number;
/**
 * Convert an amount in minor units of `from` into minor units of `to` using a
 * major-unit FX rate (units of `to` per 1 unit of `from`). Used to record a
 * foreign-currency payment against a folio kept in the hotel's base currency.
 */
export declare function convertMinor(amountMinor: number, from: string, to: string, fxRate: number): number;
/** Human-readable format, e.g. formatMoney(150050, 'NGN') -> "₦1,500.50". */
export declare function formatMoney(amountMinor: number, code: string): string;
