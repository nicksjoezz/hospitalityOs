"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFeatures = resolveFeatures;
exports.hasFeature = hasFeature;
exports.isOperational = isOperational;
/**
 * Tenant entitlements: resolve which product features a hotel can actually use,
 * given its plan's bundled features and any per-hotel overrides. Shared between
 * the API (enforcement) and the web (nav gating) so both compute identically.
 */
const enums_1 = require("./enums");
/**
 * Effective feature set = (plan features ∪ core) then apply overrides.
 * Core features can never be removed. Returns a de-duplicated, stable list.
 */
function resolveFeatures(planFeatures, overrides) {
    const enabled = new Set(enums_1.CORE_FEATURES);
    for (const f of planFeatures ?? []) {
        if (isFeature(f))
            enabled.add(f);
    }
    for (const [key, on] of Object.entries(overrides ?? {})) {
        if (!isFeature(key))
            continue;
        if (on)
            enabled.add(key);
        else if (!enums_1.CORE_FEATURES.includes(key))
            enabled.delete(key);
    }
    return Object.values(enums_1.Feature).filter((f) => enabled.has(f));
}
function hasFeature(features, feature) {
    if (enums_1.CORE_FEATURES.includes(feature))
        return true;
    return !!features?.includes(feature);
}
function isFeature(v) {
    return Object.values(enums_1.Feature).includes(v);
}
/** Statuses for which a tenant may use the app (read/write hotel data). */
function isOperational(status) {
    return status === 'TRIAL' || status === 'ACTIVE';
}
