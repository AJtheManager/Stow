import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RateLimitService } from './rate-limit.service';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockThrottlerStorage: jest.Mocked<ThrottlerStorage>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockThrottlerStorage = {
      increment: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn((key: string) => {
        const defaults: Record<string, number> = {
          RATE_LIMIT_DEFAULT_LIMIT: 100,
          RATE_LIMIT_DEFAULT_TTL_MS: 60_000,
          RATE_LIMIT_AUTH_LIMIT: 10,
          RATE_LIMIT_AUTH_TTL_MS: 60_000,
          RATE_LIMIT_READ_LIMIT: 200,
          RATE_LIMIT_READ_TTL_MS: 60_000,
          RATE_LIMIT_WRITE_LIMIT: 30,
          RATE_LIMIT_WRITE_TTL_MS: 60_000,
        };
        return defaults[key];
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: 'THROTTLER_STORAGE', useValue: mockThrottlerStorage },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(RateLimitService);
  });

  describe('getStatus', () => {
    it('should return rate limit status for all tiers', async () => {
      const identifier = 'user-123';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 5,
      } as any);

      const result = await service.getStatus(identifier);

      expect(result).toHaveProperty('default');
      expect(result).toHaveProperty('auth');
      expect(result).toHaveProperty('read');
      expect(result).toHaveProperty('write');
      expect(mockThrottlerStorage.increment).toHaveBeenCalledTimes(4);
    });

    it('should calculate remaining requests correctly', async () => {
      const identifier = 'user-456';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 30,
      } as any);

      const result = await service.getStatus(identifier);

      expect(result.default.remaining).toBe(70); // 100 - 30
      expect(result.auth.remaining).toBe(0); // 0 would be Math.max(0, 10 - 30)
      expect(result.read.remaining).toBe(170); // 200 - 30
      expect(result.write.remaining).toBe(0); // 0 would be Math.max(0, 30 - 30)
    });

    it('should include reset_at timestamp', async () => {
      const identifier = 'user-789';
      const beforeCall = Date.now();
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 10,
      } as any);

      const result = await service.getStatus(identifier);

      expect(result.default.reset_at).toBeInstanceOf(Date);
      expect(result.default.reset_at.getTime()).toBeGreaterThanOrEqual(
        beforeCall + 60_000,
      );
    });

    it('should handle storage increment errors gracefully', async () => {
      const identifier = 'user-error';
      mockThrottlerStorage.increment.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await service.getStatus(identifier);

      expect(result.default.remaining).toBe(100); // Full limit available
      expect(result.auth.remaining).toBe(10);
      expect(result.read.remaining).toBe(200);
      expect(result.write.remaining).toBe(30);
    });

    it('should ensure remaining is never negative', async () => {
      const identifier = 'user-limit';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 500, // Exceeds all limits
      } as any);

      const result = await service.getStatus(identifier);

      expect(result.default.remaining).toBe(0);
      expect(result.auth.remaining).toBe(0);
      expect(result.read.remaining).toBe(0);
      expect(result.write.remaining).toBe(0);
    });
  });

  describe('getTierStatus', () => {
    it('should return rate limit status for a specific tier', async () => {
      const identifier = 'user-tier-test';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 5,
      } as any);

      const result = await service.getTierStatus(identifier, 'auth');

      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(5);
      expect(result.reset_at).toBeInstanceOf(Date);
    });

    it('should handle non-existent tier by falling back to default', async () => {
      const identifier = 'user-default-fallback';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 20,
      } as any);

      const result = await service.getTierStatus(identifier, 'nonexistent');

      expect(result.limit).toBe(100); // Default limit
      expect(result.remaining).toBe(80);
      expect(mockThrottlerStorage.increment).toHaveBeenCalledWith(
        expect.stringContaining('throttle:nonexistent'),
        60_000,
        100,
        100,
        'nonexistent',
      );
    });

    it('should respect tier-specific configuration', async () => {
      const identifier = 'user-config-test';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 5,
      } as any);

      await service.getTierStatus(identifier, 'write');

      expect(mockThrottlerStorage.increment).toHaveBeenCalledWith(
        'throttle:write:user:user-config-test',
        60_000,
        30, // Write tier limit
        30,
        'write',
      );
    });

    it('should handle storage errors for specific tier', async () => {
      const identifier = 'user-tier-error';
      mockThrottlerStorage.increment.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await service.getTierStatus(identifier, 'read');

      expect(result.remaining).toBe(200); // Full limit available
      expect(result.limit).toBe(200);
    });

    it('should use correct cache key format', async () => {
      const identifier = 'user-key-format';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 0,
      } as any);

      await service.getTierStatus(identifier, 'default');

      expect(mockThrottlerStorage.increment).toHaveBeenCalledWith(
        'throttle:default:user:user-key-format',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        'default',
      );
    });
  });

  describe('Rate limit tiers configuration', () => {
    it('should load tier configuration from ConfigService', async () => {
      const identifier = 'config-test';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 1,
      } as any);

      await service.getStatus(identifier);

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'RATE_LIMIT_DEFAULT_LIMIT',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'RATE_LIMIT_AUTH_LIMIT',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'RATE_LIMIT_READ_LIMIT',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'RATE_LIMIT_WRITE_LIMIT',
      );
    });

    it('should have separate TTL configurations per tier', async () => {
      const identifier = 'ttl-test';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 0,
      } as any);

      await service.getStatus(identifier);

      const calls = mockThrottlerStorage.increment.mock.calls;
      // Each tier should have its TTL in the second parameter
      expect(calls.every((call) => call[1] === 60_000)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle very large hit counts', async () => {
      const identifier = 'user-large-hits';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 999_999_999,
      } as any);

      const result = await service.getStatus(identifier);

      expect(result.default.remaining).toBe(0);
      expect(result.auth.remaining).toBe(0);
    });

    it('should handle empty identifier', async () => {
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 0,
      } as any);

      const result = await service.getStatus('');

      expect(result.default.remaining).toBe(100);
      expect(mockThrottlerStorage.increment).toHaveBeenCalledWith(
        expect.stringContaining('throttle:default:user:'),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        'default',
      );
    });

    it('should handle special characters in identifier', async () => {
      const identifier = 'user:123@domain.com';
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 0,
      } as any);

      const result = await service.getStatus(identifier);

      expect(result.default).toBeDefined();
      expect(mockThrottlerStorage.increment).toHaveBeenCalled();
    });
  });
});
