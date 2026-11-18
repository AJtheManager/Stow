import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../cache/cache.service';
import { SorobanService } from '../soroban/soroban.service';
import {
  FeeAmountDto,
  FeeEstimateQueryDto,
  FeeEstimateResponseDto,
  FeeOperation,
} from './dto/fee-estimate.dto';

/** Stroops per XLM. */
const STROOPS_PER_XLM = 10_000_000n;
/** Protocol minimum inclusion fee per operation, in stroops. */
export const MIN_BASE_FEE_STROOPS = 100n;
/** USD rates are carried as integers scaled by 10^8. */
const RATE_SCALE = 100_000_000n;
const BPS_DENOMINATOR = 10_000n;

export const BASE_FEE_CACHE_KEY = 'fees:base-fee-stroops';
export const XLM_USD_CACHE_KEY = 'fees:xlm-usd-rate';

const DEFAULT_BASE_FEE_TTL_SECONDS = 10;
const DEFAULT_RATE_TTL_SECONDS = 60;
const DEFAULT_SPONSORSHIP_DISCOUNT_BPS = 10_000;
const DEFAULT_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd';

/**
 * Operations covered by each estimate. Deposits and withdrawals are each a
 * single contract invocation, so the inclusion fee is `baseFee * count`.
 */
const OPERATION_COUNT: Record<FeeOperation, number> = {
  deposit: 1,
  withdrawal: 1,
};

/**
 * Estimates the network fee for deposit and withdrawal operations.
 *
 * The estimate is the current network inclusion fee (Soroban fee stats, p50)
 * multiplied by the operation count, with an optional sponsorship discount,
 * reported in stroops, XLM and USD. It does not include the Soroban resource
 * fee, which depends on a transaction simulation.
 *
 * The network fee and the XLM/USD rate are cached briefly so repeated
 * previews do not hit the RPC node or the price API each time.
 */
@Injectable()
export class FeeEstimationService {
  private readonly logger = new Logger(FeeEstimationService.name);

  constructor(
    private readonly soroban: SorobanService,
    private readonly http: HttpService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  async estimate(query: FeeEstimateQueryDto): Promise<FeeEstimateResponseDto> {
    const sponsored = query.sponsored ?? false;
    const [{ stroops: baseFee, source }, rate] = await Promise.all([
      this.getBaseFee(),
      this.getXlmUsdRate(),
    ]);

    const operationCount = OPERATION_COUNT[query.operation];
    const gross = baseFee * BigInt(operationCount);
    const discountBps = sponsored ? this.getSponsorshipDiscountBps() : 0;
    const discount = (gross * BigInt(discountBps)) / BPS_DENOMINATOR;
    const net = gross - discount;

    return {
      operation: query.operation,
      sponsored,
      baseFeeStroops: baseFee.toString(),
      baseFeeSource: source,
      operationCount,
      grossFee: this.toAmount(gross, rate),
      discount: { ...this.toAmount(discount, rate), bps: discountBps },
      netFee: this.toAmount(net, rate),
      xlmUsdRate: rate === null ? null : formatScaled(rate, 8),
      estimatedAt: new Date().toISOString(),
    };
  }

  /**
   * Current per-operation inclusion fee in stroops. Falls back to the
   * protocol minimum (not cached) if the network fee can't be fetched.
   */
  private async getBaseFee(): Promise<{
    stroops: bigint;
    source: 'network' | 'fallback';
  }> {
    try {
      const value = await this.cache.wrap<string>(
        BASE_FEE_CACHE_KEY,
        async () => (await this.fetchNetworkBaseFee()).toString(),
        this.intConfig(
          'FEE_BASE_FEE_CACHE_TTL_SECONDS',
          DEFAULT_BASE_FEE_TTL_SECONDS,
        ),
      );
      return { stroops: BigInt(value), source: 'network' };
    } catch (error) {
      this.logger.warn(
        `Could not fetch network fee, using protocol minimum: ${errorMessage(error)}`,
      );
      return { stroops: MIN_BASE_FEE_STROOPS, source: 'fallback' };
    }
  }

  private async fetchNetworkBaseFee(): Promise<bigint> {
    const stats = await this.soroban.getRpcClient().getFeeStats();
    const p50 = BigInt(stats.sorobanInclusionFee.p50);
    return p50 > MIN_BASE_FEE_STROOPS ? p50 : MIN_BASE_FEE_STROOPS;
  }

  /**
   * XLM/USD rate scaled by 10^8, or `null` when the price API is
   * unavailable (USD figures are then omitted rather than guessed).
   */
  private async getXlmUsdRate(): Promise<bigint | null> {
    try {
      const value = await this.cache.wrap<string>(
        XLM_USD_CACHE_KEY,
        async () => (await this.fetchXlmUsdRate()).toString(),
        this.intConfig('FEE_RATE_CACHE_TTL_SECONDS', DEFAULT_RATE_TTL_SECONDS),
      );
      return BigInt(value);
    } catch (error) {
      this.logger.warn(`Could not fetch XLM/USD rate: ${errorMessage(error)}`);
      return null;
    }
  }

  private async fetchXlmUsdRate(): Promise<bigint> {
    const url =
      this.config.get<string>('FEE_XLM_USD_PRICE_URL') ?? DEFAULT_PRICE_URL;
    const response = await firstValueFrom(
      this.http.get<{ stellar?: { usd?: number } }>(url, { timeout: 5_000 }),
    );
    const usd = response.data?.stellar?.usd;
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
      throw new Error('price API returned no valid XLM/USD rate');
    }
    return BigInt(Math.round(usd * Number(RATE_SCALE)));
  }

  private getSponsorshipDiscountBps(): number {
    const bps = this.intConfig(
      'FEE_SPONSORSHIP_DISCOUNT_BPS',
      DEFAULT_SPONSORSHIP_DISCOUNT_BPS,
    );
    // Clamp: a misconfigured value must never yield a negative or >100% fee.
    return Math.min(Math.max(bps, 0), Number(BPS_DENOMINATOR));
  }

  private toAmount(stroops: bigint, rate: bigint | null): FeeAmountDto {
    return {
      stroops: stroops.toString(),
      xlm: formatScaled(stroops, 7),
      // stroops * rate(1e8) / 1e7 stroops-per-XLM = USD scaled by 1e8.
      usd:
        rate === null
          ? null
          : formatScaled((stroops * rate) / STROOPS_PER_XLM, 8),
    };
  }

  private intConfig(key: string, fallback: number): number {
    const raw = this.config.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : fallback;
  }
}

/** Format an integer scaled by `10^decimals` as a fixed-point decimal string. */
function formatScaled(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const frac = (value % scale).toString().padStart(decimals, '0');
  return `${whole}.${frac}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
