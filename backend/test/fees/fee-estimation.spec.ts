import { HttpService } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { CacheService } from '../../src/cache/cache.service';
import { FeeEstimateQueryDto } from '../../src/fees/dto/fee-estimate.dto';
import { FeeEstimationService } from '../../src/fees/fee-estimation.service';
import { FeesController } from '../../src/fees/fees.controller';
import { SorobanService } from '../../src/soroban/soroban.service';

/** Cache with the same `wrap` semantics as CacheService; `expire()` stands in for TTL expiry. */
class FakeCache {
  private store = new Map<string, unknown>();
  async wrap<T>(key: string, factory: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) return this.store.get(key) as T;
    const value = await factory();
    this.store.set(key, value);
    return value;
  }
  expire(): void {
    this.store.clear();
  }
}

describe('FeeEstimationService', () => {
  let p50: string;
  let getFeeStats: jest.Mock;
  let httpGet: jest.Mock;
  let cache: FakeCache;
  let env: Record<string, string>;
  let service: FeeEstimationService;

  const priceResponse = (usd: number) => of({ data: { stellar: { usd } } });

  beforeEach(() => {
    p50 = '200';
    env = {};
    cache = new FakeCache();
    getFeeStats = jest.fn(async () => ({ sorobanInclusionFee: { p50 } }));
    httpGet = jest.fn(() => priceResponse(0.12));
    service = new FeeEstimationService(
      { getRpcClient: () => ({ getFeeStats }) } as unknown as SorobanService,
      { get: httpGet } as unknown as HttpService,
      cache as unknown as CacheService,
      { get: (key: string) => env[key] } as unknown as ConfigService,
    );
  });

  describe('fee calculation', () => {
    it('deposit fee equals the network base fee times its operation count', async () => {
      const result = await service.estimate({ operation: 'deposit' });

      expect(result.baseFeeStroops).toBe('200');
      expect(result.baseFeeSource).toBe('network');
      expect(result.operationCount).toBe(1);
      expect(result.grossFee.stroops).toBe('200');
      expect(result.grossFee.xlm).toBe('0.0000200');
      expect(result.netFee).toEqual(result.grossFee);
    });

    it('withdrawal fee is calculated the same way', async () => {
      const result = await service.estimate({ operation: 'withdrawal' });

      expect(result.operation).toBe('withdrawal');
      expect(result.grossFee.stroops).toBe('200');
      expect(result.grossFee.xlm).toBe('0.0000200');
    });

    it('never goes below the protocol minimum base fee', async () => {
      p50 = '40';

      const result = await service.estimate({ operation: 'deposit' });

      expect(result.baseFeeStroops).toBe('100');
      expect(result.baseFeeSource).toBe('network');
    });

    it('formats large and tiny amounts without losing precision', async () => {
      p50 = '123456789012';

      const result = await service.estimate({ operation: 'deposit' });

      expect(result.grossFee.stroops).toBe('123456789012');
      expect(result.grossFee.xlm).toBe('12345.6789012');
    });
  });

  describe('sponsored fee discount', () => {
    it('is zero when the estimate is not sponsored', async () => {
      const result = await service.estimate({ operation: 'deposit' });

      expect(result.sponsored).toBe(false);
      expect(result.discount.bps).toBe(0);
      expect(result.discount.stroops).toBe('0');
      expect(result.netFee.stroops).toBe('200');
    });

    it('fully sponsors by default (10000 bps)', async () => {
      const result = await service.estimate({
        operation: 'deposit',
        sponsored: true,
      });

      expect(result.sponsored).toBe(true);
      expect(result.discount.bps).toBe(10_000);
      expect(result.discount.stroops).toBe('200');
      expect(result.netFee.stroops).toBe('0');
      expect(result.netFee.usd).toBe('0.00000000');
      expect(result.grossFee.stroops).toBe('200');
    });

    it('applies the configured discount percentage', async () => {
      env.FEE_SPONSORSHIP_DISCOUNT_BPS = '2500';

      const result = await service.estimate({
        operation: 'deposit',
        sponsored: true,
      });

      expect(result.discount.bps).toBe(2_500);
      expect(result.discount.stroops).toBe('50');
      expect(result.netFee.stroops).toBe('150');
      expect(
        BigInt(result.discount.stroops) + BigInt(result.netFee.stroops),
      ).toBe(BigInt(result.grossFee.stroops));
    });

    it('clamps a misconfigured discount to the 0-100% range', async () => {
      env.FEE_SPONSORSHIP_DISCOUNT_BPS = '25000';
      const over = await service.estimate({
        operation: 'deposit',
        sponsored: true,
      });
      expect(over.discount.bps).toBe(10_000);
      expect(over.netFee.stroops).toBe('0');

      env.FEE_SPONSORSHIP_DISCOUNT_BPS = '-5';
      const under = await service.estimate({
        operation: 'deposit',
        sponsored: true,
      });
      expect(under.discount.bps).toBe(0);
      expect(under.netFee.stroops).toBe('200');
    });
  });

  describe('USD conversion', () => {
    it('converts using the current XLM/USD rate', async () => {
      p50 = '250';

      const result = await service.estimate({ operation: 'deposit' });

      // 250 stroops = 0.000025 XLM; at $0.12 that is $0.0000030.
      expect(result.xlmUsdRate).toBe('0.12000000');
      expect(result.grossFee.usd).toBe('0.00000300');
    });

    it('uses the new rate once the cached rate expires', async () => {
      p50 = '250';
      await service.estimate({ operation: 'deposit' });

      httpGet.mockReturnValue(priceResponse(0.24));
      cache.expire();
      const result = await service.estimate({ operation: 'deposit' });

      expect(result.xlmUsdRate).toBe('0.24000000');
      expect(result.grossFee.usd).toBe('0.00000600');
    });

    it('returns null USD figures when the price API fails', async () => {
      httpGet.mockReturnValue(throwError(() => new Error('timeout')));

      const result = await service.estimate({ operation: 'deposit' });

      expect(result.xlmUsdRate).toBeNull();
      expect(result.grossFee.usd).toBeNull();
      expect(result.discount.usd).toBeNull();
      expect(result.netFee.usd).toBeNull();
      expect(result.grossFee.xlm).toBe('0.0000200');
    });

    it.each([0, -1, Number.NaN])(
      'rejects an invalid rate (%s) instead of reporting it',
      async (bad) => {
        httpGet.mockReturnValue(priceResponse(bad));

        const result = await service.estimate({ operation: 'deposit' });

        expect(result.xlmUsdRate).toBeNull();
        expect(result.grossFee.usd).toBeNull();
      },
    );

    it('rejects a malformed price response', async () => {
      httpGet.mockReturnValue(of({ data: { unexpected: true } }));

      const result = await service.estimate({ operation: 'deposit' });

      expect(result.xlmUsdRate).toBeNull();
    });
  });

  describe('caching', () => {
    it('reuses the cached fee and rate across estimates', async () => {
      await service.estimate({ operation: 'deposit' });
      await service.estimate({ operation: 'withdrawal' });
      await service.estimate({ operation: 'deposit', sponsored: true });

      expect(getFeeStats).toHaveBeenCalledTimes(1);
      expect(httpGet).toHaveBeenCalledTimes(1);
    });

    it('picks up a changed network fee once the cache expires', async () => {
      const before = await service.estimate({ operation: 'deposit' });
      expect(before.grossFee.stroops).toBe('200');

      p50 = '900';
      const stale = await service.estimate({ operation: 'deposit' });
      expect(stale.grossFee.stroops).toBe('200');

      cache.expire();
      const after = await service.estimate({ operation: 'deposit' });
      expect(after.grossFee.stroops).toBe('900');
      expect(getFeeStats).toHaveBeenCalledTimes(2);
    });

    it('does not cache the fallback fee, so the next call retries', async () => {
      getFeeStats.mockRejectedValueOnce(new Error('rpc down'));

      const first = await service.estimate({ operation: 'deposit' });
      expect(first.baseFeeSource).toBe('fallback');
      expect(first.baseFeeStroops).toBe('100');

      const second = await service.estimate({ operation: 'deposit' });
      expect(second.baseFeeSource).toBe('network');
      expect(second.baseFeeStroops).toBe('200');
    });
  });
});

describe('FeeEstimateQueryDto', () => {
  const check = (plain: Record<string, unknown>) =>
    validate(plainToInstance(FeeEstimateQueryDto, plain));

  it('accepts deposit and withdrawal', async () => {
    expect(await check({ operation: 'deposit' })).toHaveLength(0);
    expect(await check({ operation: 'withdrawal' })).toHaveLength(0);
  });

  it('rejects an unknown or missing operation', async () => {
    expect(await check({ operation: 'transfer' })).toHaveLength(1);
    expect(await check({})).toHaveLength(1);
  });

  it('rejects a non-boolean sponsored value', async () => {
    expect(
      await check({ operation: 'deposit', sponsored: 'maybe' }),
    ).toHaveLength(1);
  });
});

describe('GET /fees/estimate', () => {
  let app: INestApplication;
  const estimate = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FeesController],
      providers: [{ provide: FeeEstimationService, useValue: { estimate } }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => estimate.mockReset().mockResolvedValue({ ok: true }));

  it('passes a parsed query to the service and returns its result', async () => {
    const res = await request(app.getHttpServer())
      .get('/fees/estimate?operation=withdrawal&sponsored=true')
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(estimate).toHaveBeenCalledWith({
      operation: 'withdrawal',
      sponsored: true,
    });
  });

  it('treats sponsored as optional', async () => {
    await request(app.getHttpServer())
      .get('/fees/estimate?operation=deposit')
      .expect(200);

    expect(estimate).toHaveBeenCalledWith({ operation: 'deposit' });
  });

  it.each([
    '/fees/estimate',
    '/fees/estimate?operation=transfer',
    '/fees/estimate?operation=deposit&sponsored=maybe',
    '/fees/estimate?operation=deposit&extra=1',
  ])('rejects invalid query %s with 400', async (url) => {
    await request(app.getHttpServer()).get(url).expect(400);
    expect(estimate).not.toHaveBeenCalled();
  });
});
