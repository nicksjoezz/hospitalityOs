import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

interface RateCacheEntry {
  rates: Record<string, number>;
  fetchedAt: number;
}

/**
 * Live foreign-exchange rates from a free public source (no API key, covers NGN
 * and most currencies). Rates are cached in memory with a TTL so we don't hit
 * the network on every payment and so conversions still work briefly during an
 * outage (plan.md "offline / power-tolerant"). An explicit fxRate on a payment
 * always overrides this.
 *
 * Default source: https://open.er-api.com/v6/latest/{BASE}
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly cache = new Map<string, RateCacheEntry>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get baseUrl(): string {
    return this.config.get('FX_API_URL', { infer: true });
  }
  private get ttlMs(): number {
    return this.config.get('FX_CACHE_TTL_MS', { infer: true });
  }

  /**
   * Major-unit rate: how many units of `to` per 1 unit of `from`.
   * Returns 1 for identical currencies. Throws if the rate can't be obtained
   * and no cached value exists.
   */
  async getRate(from: string, to: string): Promise<number> {
    const a = from.toUpperCase();
    const b = to.toUpperCase();
    if (a === b) return 1;
    const rates = await this.getRates(a);
    const rate = rates[b];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new ServiceUnavailableException({
        error: {
          code: 'FX_RATE_UNAVAILABLE',
          message: `No exchange rate available for ${a}->${b}`,
        },
      });
    }
    return rate;
  }

  /** Fetch (or serve cached) the rate table for a base currency. */
  private async getRates(base: string): Promise<Record<string, number>> {
    const cached = this.cache.get(base);
    const fresh =
      cached && Date.now() - cached.fetchedAt < this.ttlMs ? cached : null;
    if (fresh) return fresh.rates;

    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/${base}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`FX source returned ${res.status}`);
      const payload = (await res.json()) as {
        result?: string;
        rates?: Record<string, number>;
      };
      if (payload.result && payload.result !== 'success') {
        throw new Error(`FX source error: ${payload.result}`);
      }
      if (!payload.rates) throw new Error('FX source returned no rates');
      this.cache.set(base, { rates: payload.rates, fetchedAt: Date.now() });
      return payload.rates;
    } catch (e) {
      // Network/power outage: fall back to the last known table if we have one.
      if (cached) {
        this.logger.warn(
          `FX fetch failed for ${base}, serving stale cache: ${e}`,
        );
        return cached.rates;
      }
      this.logger.error(`FX fetch failed for ${base} with no cache: ${e}`);
      throw new ServiceUnavailableException({
        error: {
          code: 'FX_RATE_UNAVAILABLE',
          message: `Could not fetch exchange rates for ${base}`,
        },
      });
    }
  }
}
