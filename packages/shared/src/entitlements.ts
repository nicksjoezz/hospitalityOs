/**
 * Tenant entitlements: resolve which product features a hotel can actually use,
 * given its plan's bundled features and any per-hotel overrides. Shared between
 * the API (enforcement) and the web (nav gating) so both compute identically.
 */
import { CORE_FEATURES, Feature, type HotelStatus } from './enums';

/** Per-hotel overrides: explicitly turn a feature on (true) or off (false). */
export type FeatureOverrides = Partial<Record<Feature, boolean>>;

/**
 * Effective feature set = (plan features ∪ core) then apply overrides.
 * Core features can never be removed. Returns a de-duplicated, stable list.
 */
export function resolveFeatures(
  planFeatures: string[] | null | undefined,
  overrides: FeatureOverrides | null | undefined,
): Feature[] {
  const enabled = new Set<Feature>(CORE_FEATURES);
  for (const f of planFeatures ?? []) {
    if (isFeature(f)) enabled.add(f);
  }
  for (const [key, on] of Object.entries(overrides ?? {})) {
    if (!isFeature(key)) continue;
    if (on) enabled.add(key);
    else if (!CORE_FEATURES.includes(key)) enabled.delete(key);
  }
  return Object.values(Feature).filter((f) => enabled.has(f));
}

export function hasFeature(
  features: Feature[] | undefined,
  feature: Feature,
): boolean {
  if (CORE_FEATURES.includes(feature)) return true;
  return !!features?.includes(feature);
}

function isFeature(v: string): v is Feature {
  return (Object.values(Feature) as string[]).includes(v);
}

/** Statuses for which a tenant may use the app (read/write hotel data). */
export function isOperational(status: HotelStatus | string | null | undefined): boolean {
  return status === 'TRIAL' || status === 'ACTIVE';
}
