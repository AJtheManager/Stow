import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { FeeEstimationService, MIN_BASE_FEE_STROOPS } from './fee-estimation.service';
import { CacheService } from '../cache/cache.service';
import { SorobanService } from '../soroban/soroban.service';
import { FeeEstimateQueryDto, FeeOperation } from './dto/fee-estimate.dto';

describe('FeeEstimationService', () => {
  let service: FeeEstimationService;
  let mockSorobanService: jest.Mocked<SorobanService>;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockSorobanService = {
      getRpcClient: jest.fn(() => ({
        getFeeStats: jest.fn().mockResolvedValue({
          sorobanInclusionFee: { p50: '1000' },
        }),
      })),
    } as any;

    mockHttpService = {
      get: jest.fn(),
    } as any;

    mockCacheService = {
      wrap: jest.fn((key: string, factory: any) => factory()),
    } as any;

    mockConfigService = {
      get: jest.fn((key: string, fallback?: any) => {
        const config: Record<string, any> = {
          FEE_BASE_FEE_CACHE_TTL_SECONDS: 10,
          FEE_RATE_CACHE_TTL_SECONDS: 60,
          FEE_SPONSORSHIP_DISCOUNT_BPS: 10_000,
          FEE_XLM_USD_PRICE_URL: 'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
        };
        return config[key] ?? fallback;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEstimationService,
        { provide: SorobanService, useValue: mockSorobanService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(FeeEstimationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('estimate', () => {
    it('should return fee estimate for deposit operation', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            stellar: { usd: 0.1 },
          },
        } as any),
      );

      const query: FeeEstimateQueryDto = {
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      };

      const result = await service.estimate(query);

      expect(result).toMatchObject({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
        baseFeeStroops: expect.any(String),
        operationCount: 1,
        grossFee: expect.objectContaining({
          stroops: expect.any(String),
          xlm: expect.any(String),
          usd: expect.any(String),
        }),
        netFee: expect.objectContaining({
          stroops: expect.any(String),
          xlm: expect.any(String),
          usd: expect.any(String),
        }),
        estimatedAt: expect.any(String),
      });
    });

    it('should return fee estimate for withdrawal operation', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const query: FeeEstimateQueryDto = {
        operation: FeeOperation.WITHDRAWAL,
        sponsored: false,
      };

      const result = await service.estimate(query);

      expect(result.operation).toBe(FeeOperation.WITHDRAWAL);
      expect(result.operationCount).toBe(1);
    });

    it('should apply sponsorship discount when sponsored=true', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const query: FeeEstimateQueryDto = {
        operation: FeeOperation.DEPOSIT,
        sponsored: true,
      };

      const result = await service.estimate(query);

      expect(result.sponsored).toBe(true);
      expect(result.discount.bps).toBe(10_000);

      // With 100% discount (10_000 BPS), net should be 0
      const netStroops = BigInt(result.netFee.stroops);
      expect(netStroops).toBe(0n);
    });

    it('should not apply discount when sponsored=false', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const query: FeeEstimateQueryDto = {
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      };

      const result = await service.estimate(query);

      expect(result.discount.bps).toBe(0);
      const discountStroops = BigInt(result.discount.stroops);
      expect(discountStroops).toBe(0n);
    });

    it('should use network fee when available', async () => {
      const networkFee = '2500';
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: networkFee },
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.baseFeeSource).toBe('network');
      expect(result.baseFeeStroops).toBe(networkFee);
    });

    it('should use fallback minimum fee if network fee is lower', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '50' }, // Lower than minimum
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.baseFeeSource).toBe('network');
      // Should use minimum
      expect(BigInt(result.baseFeeStroops)).toBeGreaterThanOrEqual(MIN_BASE_FEE_STROOPS);
    });

    it('should use protocol minimum when network fee fetch fails', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest
        .fn()
        .mockRejectedValue(new Error('RPC unavailable'));

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.baseFeeSource).toBe('fallback');
      expect(BigInt(result.baseFeeStroops)).toBe(MIN_BASE_FEE_STROOPS);
    });

    it('should include USD rate in response when price API succeeds', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.xlmUsdRate).not.toBeNull();
      expect(parseFloat(result.xlmUsdRate as string)).toBeCloseTo(0.1, 5);
    });

    it('should set USD rate to null when price API fails', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Price API error')),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.xlmUsdRate).toBeNull();
      // USD fields should also be null
      expect(result.grossFee.usd).toBeNull();
      expect(result.netFee.usd).toBeNull();
    });

    it('should set USD rate to null when price API returns invalid data', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: null },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.xlmUsdRate).toBeNull();
    });

    it('should include timestamp in ISO format', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const before = new Date();
      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });
      const after = new Date();

      const estimatedAt = new Date(result.estimatedAt);
      expect(estimatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(estimatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Fee Calculations', () => {
    it('should calculate gross fee as base fee × operation count', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '1000' },
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      // 1000 stroops * 1 operation = 1000 stroops
      expect(result.grossFee.stroops).toBe('1000');
    });

    it('should calculate net fee correctly with sponsorship', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '10000' },
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      mockConfigService.get.mockImplementation((key: string, fallback?: any) => {
        if (key === 'FEE_SPONSORSHIP_DISCOUNT_BPS') return 5000; // 50% discount
        return fallback;
      });

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: true,
      });

      // Gross: 10000, Discount: 5000 (50%), Net: 5000
      expect(BigInt(result.grossFee.stroops)).toBe(10000n);
      expect(BigInt(result.discount.stroops)).toBe(5000n);
      expect(BigInt(result.netFee.stroops)).toBe(5000n);
    });

    it('should convert stroops to XLM correctly', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '10000000' }, // 1 XLM in stroops
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      // 10000000 stroops = 1.0 XLM
      expect(result.grossFee.xlm).toMatch(/^1\.0+$/);
    });

    it('should convert stroops to USD using XLM rate', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '10000000' }, // 1 XLM
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.5 } }, // 1 XLM = $0.50
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      // 1 XLM * $0.50 = $0.50
      const usdAmount = parseFloat(result.grossFee.usd as string);
      expect(usdAmount).toBeCloseTo(0.5, 5);
    });
  });

  describe('Caching', () => {
    it('should cache base fee for configured TTL', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(mockCacheService.wrap).toHaveBeenCalledWith(
        expect.stringContaining('base-fee'),
        expect.any(Function),
        10, // TTL seconds
      );
    });

    it('should cache XLM/USD rate for configured TTL', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(mockCacheService.wrap).toHaveBeenCalledWith(
        expect.stringContaining('xlm-usd'),
        expect.any(Function),
        60, // TTL seconds
      );
    });

    it('should use custom TTL from config if provided', async () => {
      mockConfigService.get.mockImplementation((key: string, fallback?: any) => {
        if (key === 'FEE_BASE_FEE_CACHE_TTL_SECONDS') return 30;
        if (key === 'FEE_RATE_CACHE_TTL_SECONDS') return 120;
        return fallback;
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      const cacheCalls = mockCacheService.wrap.mock.calls;
      expect(cacheCalls).toContainEqual(
        expect.arrayContaining([expect.any(String), expect.any(Function), 30]),
      );
      expect(cacheCalls).toContainEqual(
        expect.arrayContaining([expect.any(String), expect.any(Function), 120]),
      );
    });
  });

  describe('Configuration', () => {
    it('should use custom sponsorship discount from config', async () => {
      mockConfigService.get.mockImplementation((key: string, fallback?: any) => {
        if (key === 'FEE_SPONSORSHIP_DISCOUNT_BPS') return 3333; // ~33.33% discount
        return fallback;
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '9000' },
      });

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: true,
      });

      expect(result.discount.bps).toBe(3333);
    });

    it('should clamp sponsorship discount to valid range (0-10000)', async () => {
      mockConfigService.get.mockImplementation((key: string, fallback?: any) => {
        if (key === 'FEE_SPONSORSHIP_DISCOUNT_BPS') return 20_000; // > 100%
        return fallback;
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: true,
      });

      // Should be clamped to 10000 (100%)
      expect(result.discount.bps).toBeLessThanOrEqual(10_000);
    });

    it('should use custom price API URL from config', async () => {
      const customUrl = 'https://custom-price-api.com/price';
      mockConfigService.get.mockImplementation((key: string, fallback?: any) => {
        if (key === 'FEE_XLM_USD_PRICE_URL') return customUrl;
        return fallback;
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(customUrl, expect.any(Object));
    });

    it('should use default price API URL if not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('coingecko'),
        expect.any(Object),
      );
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle RPC timeout', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest
        .fn()
        .mockRejectedValue(new Error('Request timeout'));

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.baseFeeSource).toBe('fallback');
      expect(BigInt(result.baseFeeStroops)).toBe(MIN_BASE_FEE_STROOPS);
    });

    it('should handle price API timeout', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Timeout')),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.xlmUsdRate).toBeNull();
      expect(result.grossFee.usd).toBeNull();
    });

    it('should handle negative price from API', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: -0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.xlmUsdRate).toBeNull();
    });

    it('should handle NaN price from API', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: NaN } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.xlmUsdRate).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large fee amounts', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '999999999999999999' },
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 1000000 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(BigInt(result.grossFee.stroops)).toBeGreaterThan(0n);
      expect(result.grossFee.xlm).toBeDefined();
    });

    it('should handle zero fee edge case', async () => {
      mockSorobanService.getRpcClient().getFeeStats = jest.fn().mockResolvedValue({
        sorobanInclusionFee: { p50: '0' },
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0.1 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      // Should use minimum fee
      expect(BigInt(result.baseFeeStroops)).toBe(MIN_BASE_FEE_STROOPS);
    });

    it('should handle price of zero', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { stellar: { usd: 0 } },
        } as any),
      );

      const result = await service.estimate({
        operation: FeeOperation.DEPOSIT,
        sponsored: false,
      });

      expect(result.xlmUsdRate).toBeNull();
    });
  });
});
