/**
 * Tenant entitlements: resolve which product features a hotel can actually use,
 * given its plan's bundled features and any per-hotel overrides. Shared between
 * the API (enforcement) and the web (nav gating) so both compute identically.
 */
import { Feature, type HotelStatus } from './enums';
/** Per-hotel overrides: explicitly turn a feature on (true) or off (false). */
export type FeatureOverrides = Partial<Record<Feature, boolean>>;
/**
 * Effective feature set = (plan features ∪ core) then apply overrides.
 * Core features can never be removed. Returns a de-duplicated, stable list.
 */
export declare function resolveFeatures(planFeatures: string[] | null | undefined, overrides: FeatureOverrides | null | undefined): Feature[];
export declare function hasFeature(features: Feature[] | undefined, feature: Feature): boolean;
/** Statuses for which a tenant may use the app (read/write hotel data). */
export declare function isOperational(status: HotelStatus | string | null | undefined): boolean;
