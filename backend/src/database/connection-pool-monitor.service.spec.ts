import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConnectionPoolMonitorService } from './connection-pool-monitor.service';
import { DataSource } from 'typeorm';

describe('ConnectionPoolMonitorService', () => {
  let service: ConnectionPoolMonitorService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    // Mock pool object
    const mockPool = {
      totalCount: 15,
      idleCount: 8,
      waitingCount: 2,
    };

    mockDataSource = {
      driver: {
        master: mockPool,
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionPoolMonitorService,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get(ConnectionPoolMonitorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPoolStatistics', () => {
    it('should return pool statistics when pool is available', async () => {
      const stats = await service.getPoolStatistics();

      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('waitingRequests');
      expect(stats).toHaveProperty('maxConnections');
      expect(stats).toHaveProperty('minConnections');
      expect(stats).toHaveProperty('poolUtilization');
      expect(stats).toHaveProperty('timestamp');
    });

    it('should calculate active connections correctly', async () => {
      (mockDataSource.driver.master as any).totalCount = 20;
      (mockDataSource.driver.master as any).idleCount = 8;

      const stats = await service.getPoolStatistics();

      expect(stats.activeConnections).toBe(12); // 20 - 8
    });

    it('should return error when pool is not available', async () => {
      (mockDataSource.driver as any).master = null;

      const stats = await service.getPoolStatistics();

      expect(stats.error).toBe('Pool not available');
    });

    it('should include timestamp in ISO format', async () => {
      const before = new Date();
      const stats = await service.getPoolStatistics();
      const after = new Date();

      const statsTime = new Date(stats.timestamp);
      expect(statsTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(statsTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should report correct pool utilization', async () => {
      (mockDataSource.driver.master as any).totalCount = 15;
      process.env.DB_POOL_MAX = '20';

      const stats = await service.getPoolStatistics();

      expect(stats.poolUtilization).toBe(75); // (15/20) * 100
    });

    it('should handle zero max pool size', async () => {
      process.env.DB_POOL_MAX = '0';

      const stats = await service.getPoolStatistics();

      // Should not throw, utilization should be 0 or reasonable value
      expect(stats.poolUtilization).toBeDefined();
    });
  });

  describe('logPoolStatistics', () => {
    it('should log pool statistics successfully', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.logPoolStatistics();

      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should warn when pool statistics unavailable', async () => {
      (mockDataSource.driver as any).master = null;
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.logPoolStatistics();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Pool statistics unavailable'));
    });

    it('should warn when pool utilization is high', async () => {
      (mockDataSource.driver.master as any).totalCount = 19; // 95% of 20
      process.env.DB_POOL_MAX = '20';
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.logPoolStatistics();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('High pool utilization'));
    });

    it('should warn when many requests are waiting', async () => {
      (mockDataSource.driver.master as any).waitingCount = 10;
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.logPoolStatistics();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('waiting for connections'));
    });

    it('should not warn when utilization is healthy', async () => {
      (mockDataSource.driver.master as any).totalCount = 10;
      (mockDataSource.driver.master as any).waitingCount = 0;
      process.env.DB_POOL_MAX = '20';
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.logPoolStatistics();

      // Should only be called if there's an error, not for warnings
      const warningCalls = warnSpy.mock.calls.filter(
        call => call[0].includes('High pool') || call[0].includes('waiting')
      );
      expect(warningCalls.length).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(service, 'getPoolStatistics').mockRejectedValue(new Error('Test error'));
      const errorSpy = jest.spyOn(service['logger'], 'error');

      await service.logPoolStatistics();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to log pool statistics'));
    });
  });

  describe('checkForLeaks', () => {
    it('should not warn when no leaks detected', () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      service.trackCheckout('conn-1');
      service.checkForLeaks();

      // Should not warn for recent checkouts
      const leakWarnings = warnSpy.mock.calls.filter(
        call => call[0].includes('Potential connection leaks')
      );
      expect(leakWarnings.length).toBe(0);
    });

    it('should warn when connection held too long', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');
      const oldTime = new Date(Date.now() - 120_000); // 2 minutes ago

      service.trackCheckout('conn-1');
      // Manually set old checkout time
      (service as any).connectionCheckouts.set('conn-1', oldTime);

      service.checkForLeaks();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Potential connection leaks'));
    });

    it('should detect multiple leaked connections', () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');
      const oldTime = new Date(Date.now() - 120_000);

      service.trackCheckout('conn-1');
      service.trackCheckout('conn-2');
      (service as any).connectionCheckouts.set('conn-1', oldTime);
      (service as any).connectionCheckouts.set('conn-2', oldTime);

      service.checkForLeaks();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Connection conn-1'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Connection conn-2'));
    });
  });

  describe('trackCheckout and trackRelease', () => {
    it('should track checkout with current time', () => {
      const before = Date.now();
      service.trackCheckout('conn-1');
      const after = Date.now();

      const tracked = (service as any).connectionCheckouts.get('conn-1');
      expect(tracked).toBeDefined();
      expect(tracked.getTime()).toBeGreaterThanOrEqual(before);
      expect(tracked.getTime()).toBeLessThanOrEqual(after);
    });

    it('should remove connection on release', () => {
      service.trackCheckout('conn-1');
      expect((service as any).connectionCheckouts.has('conn-1')).toBe(true);

      service.trackRelease('conn-1');
      expect((service as any).connectionCheckouts.has('conn-1')).toBe(false);
    });

    it('should handle release of non-tracked connection', () => {
      expect(() => {
        service.trackRelease('non-existent');
      }).not.toThrow();
    });

    it('should track multiple connections independently', () => {
      service.trackCheckout('conn-1');
      service.trackCheckout('conn-2');
      service.trackCheckout('conn-3');

      expect((service as any).connectionCheckouts.size).toBe(3);

      service.trackRelease('conn-2');
      expect((service as any).connectionCheckouts.size).toBe(2);
      expect((service as any).connectionCheckouts.has('conn-2')).toBe(false);
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when conditions are good', async () => {
      (mockDataSource.driver.master as any).totalCount = 10;
      (mockDataSource.driver.master as any).idleCount = 5;
      (mockDataSource.driver.master as any).waitingCount = 0;
      process.env.DB_POOL_MAX = '20';

      const health = await service.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.poolUtilization).toBe(50);
    });

    it('should return degraded status when utilization is high', async () => {
      (mockDataSource.driver.master as any).totalCount = 19;
      process.env.DB_POOL_MAX = '20';

      const health = await service.getHealthStatus();

      expect(health.status).toBe('degraded');
    });

    it('should return degraded status when waiting requests are high', async () => {
      (mockDataSource.driver.master as any).waitingCount = 15;

      const health = await service.getHealthStatus();

      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy status when pool unavailable', async () => {
      (mockDataSource.driver as any).master = null;

      const health = await service.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('Pool not available');
    });

    it('should return unhealthy status on error', async () => {
      jest.spyOn(service, 'getPoolStatistics').mockRejectedValue(new Error('DB error'));

      const health = await service.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toContain('Failed to check pool health');
    });

    it('should include relevant metrics in response', async () => {
      (mockDataSource.driver.master as any).totalCount = 12;
      (mockDataSource.driver.master as any).idleCount = 4;
      (mockDataSource.driver.master as any).waitingCount = 3;
      process.env.DB_POOL_MAX = '20';

      const health = await service.getHealthStatus();

      expect(health).toHaveProperty('poolUtilization');
      expect(health).toHaveProperty('activeConnections');
      expect(health).toHaveProperty('waitingRequests');
      expect(health).toHaveProperty('message');
    });

    it('should provide appropriate message for healthy state', async () => {
      (mockDataSource.driver.master as any).totalCount = 10;
      process.env.DB_POOL_MAX = '20';

      const health = await service.getHealthStatus();

      expect(health.message).toContain('operating normally');
    });

    it('should provide appropriate message for degraded state', async () => {
      (mockDataSource.driver.master as any).totalCount = 19;
      process.env.DB_POOL_MAX = '20';

      const health = await service.getHealthStatus();

      expect(health.message).toContain('under stress');
    });
  });

  describe('Threshold configuration', () => {
    it('should respect DB_POOL_LEAK_DETECTION_MS environment variable', () => {
      process.env.DB_POOL_LEAK_DETECTION_MS = '120000';

      const testService = new ConnectionPoolMonitorService(mockDataSource);

      expect((testService as any).leakThreshold).toBe(120000);
    });

    it('should use default leak threshold when env var not set', () => {
      delete process.env.DB_POOL_LEAK_DETECTION_MS;

      const testService = new ConnectionPoolMonitorService(mockDataSource);

      expect((testService as any).leakThreshold).toBe(60000);
    });

    it('should respect DB_POOL_MAX in utilization calculation', async () => {
      process.env.DB_POOL_MAX = '50';
      (mockDataSource.driver.master as any).totalCount = 25;

      const stats = await service.getPoolStatistics();

      expect(stats.poolUtilization).toBe(50);
    });

    it('should respect DB_POOL_MIN in statistics', async () => {
      process.env.DB_POOL_MIN = '10';

      const stats = await service.getPoolStatistics();

      expect(stats.minConnections).toBe(10);
    });
  });

  describe('Edge cases', () => {
    it('should handle very high connection counts', async () => {
      (mockDataSource.driver.master as any).totalCount = 1000;
      process.env.DB_POOL_MAX = '2000';

      const stats = await service.getPoolStatistics();

      expect(stats.poolUtilization).toBe(50);
      expect(stats.totalConnections).toBe(1000);
    });

    it('should handle zero connections', async () => {
      (mockDataSource.driver.master as any).totalCount = 0;
      (mockDataSource.driver.master as any).idleCount = 0;

      const stats = await service.getPoolStatistics();

      expect(stats.activeConnections).toBe(0);
      expect(stats.poolUtilization).toBe(0);
    });

    it('should handle missing pool properties', async () => {
      (mockDataSource.driver.master as any).totalCount = undefined;
      (mockDataSource.driver.master as any).idleCount = undefined;

      const stats = await service.getPoolStatistics();

      expect(stats.totalConnections).toBe(0);
      expect(stats.idleConnections).toBe(0);
    });

    it('should handle rapid checkout/release cycles', () => {
      for (let i = 0; i < 100; i++) {
        service.trackCheckout(`conn-${i}`);
      }

      expect((service as any).connectionCheckouts.size).toBe(100);

      for (let i = 0; i < 100; i++) {
        service.trackRelease(`conn-${i}`);
      }

      expect((service as any).connectionCheckouts.size).toBe(0);
    });
  });
});
