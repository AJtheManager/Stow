import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let mockCacheManager: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return cached value when key exists', async () => {
      // Arrange
      const key = 'test-key';
      const expectedValue = { data: 'test' };
      mockCacheManager.get.mockResolvedValue(expectedValue);

      // Act
      const result = await service.get(key);

      // Assert
      expect(result).toEqual(expectedValue);
      expect(mockCacheManager.get).toHaveBeenCalledWith(key);
    });

    it('should return undefined when key does not exist', async () => {
      // Arrange
      const key = 'non-existent-key';
      mockCacheManager.get.mockResolvedValue(undefined);

      // Act
      const result = await service.get(key);

      // Assert
      expect(result).toBeUndefined();
      expect(mockCacheManager.get).toHaveBeenCalledWith(key);
    });

    it('should handle different data types', async () => {
      // Arrange
      const testCases = [
        { key: 'string-key', value: 'string-value' },
        { key: 'number-key', value: 42 },
        { key: 'boolean-key', value: true },
        { key: 'array-key', value: [1, 2, 3] },
        { key: 'object-key', value: { nested: { data: true } } },
        { key: 'null-key', value: null },
      ];

      for (const testCase of testCases) {
        mockCacheManager.get.mockResolvedValue(testCase.value);

        // Act
        const result = await service.get(testCase.key);

        // Assert
        expect(result).toEqual(testCase.value);
      }
    });

    it('should call cache manager with correct key', async () => {
      // Arrange
      const key = 'specific-key';
      mockCacheManager.get.mockResolvedValue(undefined);

      // Act
      await service.get(key);

      // Assert
      expect(mockCacheManager.get).toHaveBeenCalledWith(key);
      expect(mockCacheManager.get).toHaveBeenCalledTimes(1);
    });

    it('should handle string keys with special characters', async () => {
      // Arrange
      const key = 'user:123:profile:data:v2';
      const value = { name: 'John' };
      mockCacheManager.get.mockResolvedValue(value);

      // Act
      const result = await service.get(key);

      // Assert
      expect(result).toEqual(value);
      expect(mockCacheManager.get).toHaveBeenCalledWith(key);
    });
  });

  describe('set', () => {
    it('should set cache value without TTL', async () => {
      // Arrange
      const key = 'test-key';
      const value = { data: 'test' };
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await service.set(key, value);

      // Assert
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, {});
    });

    it('should set cache value with TTL in seconds', async () => {
      // Arrange
      const key = 'test-key';
      const value = { data: 'test' };
      const ttl = 60;
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await service.set(key, value, ttl);

      // Assert
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, { ttl: 60000 });
    });

    it('should convert TTL from seconds to milliseconds', async () => {
      // Arrange
      const testCases = [
        { ttl: 1, expectedMs: 1000 },
        { ttl: 10, expectedMs: 10000 },
        { ttl: 3600, expectedMs: 3600000 },
      ];

      for (const testCase of testCases) {
        mockCacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.set('key', 'value', testCase.ttl);

        // Assert
        expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'value', {
          ttl: testCase.expectedMs,
        });
      }
    });

    it('should store different data types', async () => {
      // Arrange
      const testCases = [
        { key: 'str', value: 'string' },
        { key: 'num', value: 123 },
        { key: 'bool', value: false },
        { key: 'arr', value: [1, 2, 3] },
        { key: 'obj', value: { a: 1, b: 2 } },
      ];

      mockCacheManager.set.mockResolvedValue(undefined);

      for (const testCase of testCases) {
        // Act
        await service.set(testCase.key, testCase.value);

        // Assert
        expect(mockCacheManager.set).toHaveBeenCalledWith(testCase.key, testCase.value, {});
      }
    });

    it('should handle TTL of 0', async () => {
      // Arrange
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await service.set('key', 'value', 0);

      // Assert
      expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'value', { ttl: 0 });
    });

    it('should handle very large TTL values', async () => {
      // Arrange
      const ttl = 31536000; // 1 year in seconds
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await service.set('key', 'value', ttl);

      // Assert
      expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'value', { ttl: 31536000000 });
    });
  });

  describe('del', () => {
    it('should delete key from cache', async () => {
      // Arrange
      const key = 'test-key';
      mockCacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.del(key);

      // Assert
      expect(mockCacheManager.del).toHaveBeenCalledWith(key);
    });

    it('should handle deletion of non-existent key', async () => {
      // Arrange
      const key = 'non-existent-key';
      mockCacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.del(key);

      // Assert
      expect(mockCacheManager.del).toHaveBeenCalledWith(key);
    });

    it('should handle multiple key deletions', async () => {
      // Arrange
      const keys = ['key1', 'key2', 'key3'];
      mockCacheManager.del.mockResolvedValue(undefined);

      // Act
      for (const key of keys) {
        await service.del(key);
      }

      // Assert
      expect(mockCacheManager.del).toHaveBeenCalledTimes(3);
      keys.forEach(key => expect(mockCacheManager.del).toHaveBeenCalledWith(key));
    });

    it('should handle special characters in key', async () => {
      // Arrange
      const key = 'user:123:session:abc-def';
      mockCacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.del(key);

      // Assert
      expect(mockCacheManager.del).toHaveBeenCalledWith(key);
    });
  });

  describe('reset', () => {
    it('should clear all cache entries', async () => {
      // Arrange
      mockCacheManager.reset.mockResolvedValue(undefined);

      // Act
      await service.reset();

      // Assert
      expect(mockCacheManager.reset).toHaveBeenCalled();
      expect(mockCacheManager.reset).toHaveBeenCalledTimes(1);
    });

    it('should handle reset when cache is already empty', async () => {
      // Arrange
      mockCacheManager.reset.mockResolvedValue(undefined);

      // Act
      await service.reset();

      // Assert
      expect(mockCacheManager.reset).toHaveBeenCalled();
    });
  });

  describe('wrap', () => {
    it('should return cached value when it exists', async () => {
      // Arrange
      const key = 'wrap-key';
      const cachedValue = { data: 'cached' };
      const factory = jest.fn();
      mockCacheManager.get.mockResolvedValue(cachedValue);

      // Act
      const result = await service.wrap(key, factory);

      // Assert
      expect(result).toEqual(cachedValue);
      expect(factory).not.toHaveBeenCalled();
      expect(mockCacheManager.get).toHaveBeenCalledWith(key);
    });

    it('should call factory function when cache misses', async () => {
      // Arrange
      const key = 'wrap-key';
      const factoryValue = { data: 'from-factory' };
      const factory = jest.fn().mockResolvedValue(factoryValue);
      mockCacheManager.get.mockResolvedValue(undefined);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await service.wrap(key, factory);

      // Assert
      expect(result).toEqual(factoryValue);
      expect(factory).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, factoryValue, {});
    });

    it('should cache factory result with TTL', async () => {
      // Arrange
      const key = 'wrap-key';
      const ttl = 60;
      const factoryValue = { data: 'value' };
      const factory = jest.fn().mockResolvedValue(factoryValue);
      mockCacheManager.get.mockResolvedValue(undefined);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await service.wrap(key, factory, ttl);

      // Assert
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, factoryValue, { ttl: 60000 });
    });

    it('should not call factory when cached value is falsy but defined', async () => {
      // Arrange
      const key = 'wrap-key';
      const cachedValue = 0; // Falsy but not undefined
      const factory = jest.fn();
      mockCacheManager.get.mockResolvedValue(cachedValue);

      // Act
      const result = await service.wrap(key, factory);

      // Assert
      expect(result).toBe(0);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory multiple times for different keys', async () => {
      // Arrange
      const factory1 = jest.fn().mockResolvedValue({ data: 1 });
      const factory2 = jest.fn().mockResolvedValue({ data: 2 });
      mockCacheManager.get.mockResolvedValue(undefined);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await service.wrap('key1', factory1);
      await service.wrap('key2', factory2);

      // Assert
      expect(factory1).toHaveBeenCalled();
      expect(factory2).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalledTimes(2);
    });

    it('should handle factory function errors', async () => {
      // Arrange
      const key = 'wrap-key';
      const error = new Error('Factory error');
      const factory = jest.fn().mockRejectedValue(error);
      mockCacheManager.get.mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.wrap(key, factory)).rejects.toThrow('Factory error');
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should handle async factory functions', async () => {
      // Arrange
      const key = 'async-key';
      const asyncValue = { async: true };
      const factory = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return asyncValue;
      });
      mockCacheManager.get.mockResolvedValue(undefined);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await service.wrap(key, factory);

      // Assert
      expect(result).toEqual(asyncValue);
      expect(factory).toHaveBeenCalled();
    });

    it('should cache complex objects correctly', async () => {
      // Arrange
      const key = 'complex-key';
      const complexValue = {
        nested: {
          deep: {
            array: [1, 2, 3],
            data: 'value',
          },
        },
      };
      const factory = jest.fn().mockResolvedValue(complexValue);
      mockCacheManager.get.mockResolvedValue(undefined);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await service.wrap(key, factory);

      // Assert
      expect(result).toEqual(complexValue);
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, complexValue, {});
    });
  });

  describe('getUserCacheKey', () => {
    it('should generate user cache key with userId and resource', () => {
      // Arrange
      const userId = 'user-123';
      const resource = 'profile';

      // Act
      const key = service.getUserCacheKey(userId, resource);

      // Assert
      expect(key).toBe('user:user-123:profile');
    });

    it('should handle different resource types', () => {
      // Arrange
      const userId = 'user-456';
      const resources = ['profile', 'settings', 'balance', 'history'];

      // Act & Assert
      resources.forEach(resource => {
        const key = service.getUserCacheKey(userId, resource);
        expect(key).toBe(`user:${userId}:${resource}`);
      });
    });

    it('should handle special characters in userId', () => {
      // Arrange
      const userId = 'user-123-456';
      const resource = 'data';

      // Act
      const key = service.getUserCacheKey(userId, resource);

      // Assert
      expect(key).toBe('user:user-123-456:data');
    });

    it('should be consistent for same inputs', () => {
      // Arrange
      const userId = 'user-789';
      const resource = 'cache-key';

      // Act
      const key1 = service.getUserCacheKey(userId, resource);
      const key2 = service.getUserCacheKey(userId, resource);

      // Assert
      expect(key1).toBe(key2);
    });
  });

  describe('getSessionCacheKey', () => {
    it('should generate session cache key with sessionId', () => {
      // Arrange
      const sessionId = 'session-abc123';

      // Act
      const key = service.getSessionCacheKey(sessionId);

      // Assert
      expect(key).toBe('session:session-abc123');
    });

    it('should handle UUIDs as session IDs', () => {
      // Arrange
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      // Act
      const key = service.getSessionCacheKey(sessionId);

      // Assert
      expect(key).toMatch(/^session:/);
      expect(key).toContain(sessionId);
    });

    it('should be consistent for same inputs', () => {
      // Arrange
      const sessionId = 'session-xyz789';

      // Act
      const key1 = service.getSessionCacheKey(sessionId);
      const key2 = service.getSessionCacheKey(sessionId);

      // Assert
      expect(key1).toBe(key2);
    });
  });

  describe('getRealtimeCacheKey', () => {
    it('should generate realtime cache key with dataType and identifier', () => {
      // Arrange
      const dataType = 'balance';
      const identifier = 'user-123';

      // Act
      const key = service.getRealtimeCacheKey(dataType, identifier);

      // Assert
      expect(key).toBe('realtime:balance:user-123');
    });

    it('should handle different data types', () => {
      // Arrange
      const dataTypes = ['balance', 'rate', 'fee', 'price'];
      const identifier = 'identifier-123';

      // Act & Assert
      dataTypes.forEach(dataType => {
        const key = service.getRealtimeCacheKey(dataType, identifier);
        expect(key).toBe(`realtime:${dataType}:${identifier}`);
      });
    });

    it('should handle complex identifiers', () => {
      // Arrange
      const dataType = 'market-data';
      const identifier = 'XLM/USDC:GCZST7W6NPQX7HBVPGNP5F65DQCVTXNXVK5X5PH6H5VPX7XQPX5VX';

      // Act
      const key = service.getRealtimeCacheKey(dataType, identifier);

      // Assert
      expect(key).toContain('realtime:');
      expect(key).toContain(dataType);
      expect(key).toContain(identifier);
    });

    it('should be consistent for same inputs', () => {
      // Arrange
      const dataType = 'rate';
      const identifier = 'id-456';

      // Act
      const key1 = service.getRealtimeCacheKey(dataType, identifier);
      const key2 = service.getRealtimeCacheKey(dataType, identifier);

      // Assert
      expect(key1).toBe(key2);
    });
  });

  describe('deletePattern', () => {
    it('should log warning for pattern deletion', async () => {
      // Arrange
      const pattern = 'user:*';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      await service.deletePattern(pattern);

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pattern deletion'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(pattern),
      );

      warnSpy.mockRestore();
    });

    it('should handle various pattern types', async () => {
      // Arrange
      const patterns = ['user:*', 'session:*', 'realtime:*', 'cache:*'];
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      for (const pattern of patterns) {
        await service.deletePattern(pattern);
      }

      // Assert
      expect(warnSpy).toHaveBeenCalledTimes(patterns.length);

      warnSpy.mockRestore();
    });

    it('should not throw error when called', async () => {
      // Arrange
      const pattern = 'user:*';

      // Act & Assert
      await expect(service.deletePattern(pattern)).resolves.not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('should set, get, and delete a value', async () => {
      // Arrange
      const key = 'integration-key';
      const value = { data: 'test' };
      mockCacheManager.set.mockResolvedValue(undefined);
      mockCacheManager.get.mockResolvedValue(value);
      mockCacheManager.del.mockResolvedValue(undefined);

      // Act
      await service.set(key, value);
      const retrieved = await service.get(key);
      await service.del(key);

      // Assert
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, {});
      expect(retrieved).toEqual(value);
      expect(mockCacheManager.del).toHaveBeenCalledWith(key);
    });

    it('should handle cache-aside pattern correctly', async () => {
      // Arrange
      const key = 'user:123:profile';
      const cachedData = { name: 'John', age: 30 };
      const factory = jest.fn().mockResolvedValue(cachedData);
      mockCacheManager.get.mockResolvedValue(undefined);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act - First call should populate cache
      const result1 = await service.wrap(key, factory);
      // Second call should return cached value
      mockCacheManager.get.mockResolvedValue(cachedData);
      const result2 = await service.wrap(key, factory);

      // Assert
      expect(result1).toEqual(cachedData);
      expect(result2).toEqual(cachedData);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should reset cache and allow fresh data', async () => {
      // Arrange
      mockCacheManager.reset.mockResolvedValue(undefined);
      mockCacheManager.get.mockResolvedValue(undefined);

      // Act
      await service.reset();
      const result = await service.get('any-key');

      // Assert
      expect(mockCacheManager.reset).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });
});
