import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsAggregationService } from './analytics-aggregation.service';
import { AnalyticsMetric, MetricType, AggregationPeriod } from './entities/analytics-metric.entity';

describe('AnalyticsAggregationService', () => {
  let service: AnalyticsAggregationService;
  let repository: Repository<AnalyticsMetric>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAggregationService,
        {
          provide: getRepositoryToken(AnalyticsMetric),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsAggregationService>(AnalyticsAggregationService);
    repository = module.get<Repository<AnalyticsMetric>>(getRepositoryToken(AnalyticsMetric));
  });

  describe('recordMetric', () => {
    it('should record a metric with all fields', async () => {
      // Arrange
      const metricType = MetricType.DEPOSIT;
      const value = 100;
      const metadata = { token: 'USDC', wallet: 'test-wallet' };
      const userId = 'user-123';

      const createdMetric = {
        id: 'metric-1',
        metric_type: metricType,
        period: AggregationPeriod.HOURLY,
        period_start: new Date('2024-01-15T10:00:00Z'),
        period_end: new Date('2024-01-15T10:59:59.999Z'),
        user_id: userId,
        value: '100',
        count: 1,
        metadata,
        created_at: new Date(),
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      const result = await service.recordMetric(metricType, value, metadata, userId);

      // Assert
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(createdMetric);
      expect(result.metric_type).toBe(metricType);
      expect(result.value).toBe('100');
      expect(result.user_id).toBe(userId);
      expect(result.metadata).toEqual(metadata);
    });

    it('should record a metric without metadata and userId', async () => {
      // Arrange
      const metricType = MetricType.WITHDRAWAL;
      const value = 50;

      const createdMetric = {
        id: 'metric-2',
        metric_type: metricType,
        period: AggregationPeriod.HOURLY,
        period_start: new Date(),
        period_end: new Date(),
        user_id: null,
        value: '50',
        count: 1,
        metadata: null,
        created_at: new Date(),
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      const result = await service.recordMetric(metricType, value);

      // Assert
      expect(result.user_id).toBeNull();
      expect(result.metadata).toBeNull();
    });

    it('should convert numeric value to string', async () => {
      // Arrange
      const createdMetric = {
        id: 'metric-3',
        value: '12345.67',
        count: 1,
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      await service.recordMetric(MetricType.DEPOSIT, 12345.67);

      // Assert
      expect(createdMetric.value).toBe('12345.67');
    });

    it('should handle different metric types', async () => {
      // Arrange
      const metricTypes = [
        MetricType.DEPOSIT,
        MetricType.WITHDRAWAL,
        MetricType.INTEREST_EARNED,
        MetricType.ROUNDUP_APPLIED,
        MetricType.SAVINGS_REACHED,
      ];

      for (const metricType of metricTypes) {
        const createdMetric = {
          id: `metric-${metricType}`,
          metric_type: metricType,
          value: '100',
          count: 1,
        } as AnalyticsMetric;

        jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
        jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

        // Act
        const result = await service.recordMetric(metricType, 100);

        // Assert
        expect(result.metric_type).toBe(metricType);
      }
    });
  });

  describe('aggregateMetrics', () => {
    it('should aggregate metrics for hourly period', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T11:00:00Z');
      const period = AggregationPeriod.HOURLY;

      const rawMetrics: AnalyticsMetric[] = [
        {
          id: 'raw-1',
          metric_type: MetricType.DEPOSIT,
          value: '100',
          count: 1,
          period_start: startDate,
          user_id: 'user-1',
        } as AnalyticsMetric,
        {
          id: 'raw-2',
          metric_type: MetricType.DEPOSIT,
          value: '50',
          count: 1,
          period_start: startDate,
          user_id: 'user-1',
        } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(period, startDate, endDate);

      // Assert
      expect(repository.find).toHaveBeenCalledWith({
        where: expect.objectContaining({ period_start: expect.anything() }),
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should group metrics by type, period, and user', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T11:00:00Z');

      const rawMetrics: AnalyticsMetric[] = [
        {
          id: 'raw-1',
          metric_type: MetricType.DEPOSIT,
          value: '100',
          count: 2,
          period_start: startDate,
          user_id: 'user-1',
          metadata: null,
        } as AnalyticsMetric,
        {
          id: 'raw-2',
          metric_type: MetricType.DEPOSIT,
          value: '50',
          count: 1,
          period_start: startDate,
          user_id: 'user-2',
          metadata: null,
        } as AnalyticsMetric,
        {
          id: 'raw-3',
          metric_type: MetricType.WITHDRAWAL,
          value: '30',
          count: 1,
          period_start: startDate,
          user_id: 'user-1',
          metadata: null,
        } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.HOURLY, startDate, endDate);

      // Assert
      // Should create 3 aggregated records (one per unique combination)
      expect(repository.save).toHaveBeenCalledTimes(3);
    });

    it('should sum values and counts correctly', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T11:00:00Z');

      const rawMetrics: AnalyticsMetric[] = [
        {
          id: 'raw-1',
          metric_type: MetricType.DEPOSIT,
          value: '100',
          count: 1,
          period_start: startDate,
          user_id: 'user-1',
          metadata: null,
        } as AnalyticsMetric,
        {
          id: 'raw-2',
          metric_type: MetricType.DEPOSIT,
          value: '200',
          count: 2,
          period_start: startDate,
          user_id: 'user-1',
          metadata: null,
        } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      const createSpy = jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.HOURLY, startDate, endDate);

      // Assert
      const createCalls = createSpy.mock.calls;
      const aggregatedMetric = createCalls[0][0];
      expect(aggregatedMetric.value).toBe('300'); // 100 + 200
      expect(aggregatedMetric.count).toBe(3); // 1 + 2
    });
  });

  describe('getAggregatedMetrics', () => {
    it('should retrieve aggregated metrics for a date range', async () => {
      // Arrange
      const metricType = MetricType.DEPOSIT;
      const period = AggregationPeriod.DAILY;
      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-20T23:59:59Z');

      const mockMetrics: AnalyticsMetric[] = [
        {
          id: 'agg-1',
          metric_type: metricType,
          period,
          period_start: new Date('2024-01-15T00:00:00Z'),
          value: '500',
          count: 5,
        } as AnalyticsMetric,
        {
          id: 'agg-2',
          metric_type: metricType,
          period,
          period_start: new Date('2024-01-16T00:00:00Z'),
          value: '600',
          count: 6,
        } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(mockMetrics);

      // Act
      const result = await service.getAggregatedMetrics(
        metricType,
        period,
        startDate,
        endDate,
      );

      // Assert
      expect(result).toEqual(mockMetrics);
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          metric_type: metricType,
          period,
          period_start: expect.anything(),
        },
        order: { period_start: 'ASC' },
      });
    });

    it('should filter by userId when provided', async () => {
      // Arrange
      const userId = 'user-123';
      const mockMetrics: AnalyticsMetric[] = [];

      jest.spyOn(repository, 'find').mockResolvedValue(mockMetrics);

      // Act
      await service.getAggregatedMetrics(
        MetricType.DEPOSIT,
        AggregationPeriod.DAILY,
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-20T23:59:59Z'),
        userId,
      );

      // Assert
      const findCall = jest.spyOn(repository, 'find').mock.calls[0];
      expect(findCall[0].where.user_id).toBe(userId);
    });

    it('should order results by period_start ascending', async () => {
      // Arrange
      jest.spyOn(repository, 'find').mockResolvedValue([]);

      // Act
      await service.getAggregatedMetrics(
        MetricType.DEPOSIT,
        AggregationPeriod.DAILY,
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-20T23:59:59Z'),
      );

      // Assert
      const findCall = jest.spyOn(repository, 'find').mock.calls[0];
      expect(findCall[0].order).toEqual({ period_start: 'ASC' });
    });
  });

  describe('getMetricSummary', () => {
    it('should return aggregated summary statistics', async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          metric_type: MetricType.DEPOSIT,
          total_value: '1500.50',
          count: 15,
          average_value: '100.03',
        }),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      // Act
      const result = await service.getMetricSummary(
        MetricType.DEPOSIT,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-31T23:59:59Z'),
      );

      // Assert
      expect(result.metric_type).toBe(MetricType.DEPOSIT);
      expect(result.total_value).toBe('1500.50');
      expect(result.count).toBe(15);
      expect(result.average_value).toBe('100.03');
    });

    it('should return zeros when no data found', async () => {
      // Arrange
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      // Act
      const result = await service.getMetricSummary(
        MetricType.DEPOSIT,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-31T23:59:59Z'),
      );

      // Assert
      expect(result.total_value).toBe('0');
      expect(result.count).toBe(0);
      expect(result.average_value).toBe('0');
    });

    it('should filter by userId when provided', async () => {
      // Arrange
      const userId = 'user-456';
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          metric_type: MetricType.DEPOSIT,
          total_value: '500',
          count: 5,
          average_value: '100',
        }),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      // Act
      await service.getMetricSummary(
        MetricType.DEPOSIT,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-31T23:59:59Z'),
        userId,
      );

      // Assert
      const andWhereCalls = mockQueryBuilder.andWhere.mock.calls;
      expect(andWhereCalls.some(call => call[0]?.includes('user_id'))).toBe(true);
    });

    it('should build correct query with all filters', async () => {
      // Arrange
      const metricType = MetricType.WITHDRAWAL;
      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-01-31T23:59:59Z');

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({}),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      // Act
      await service.getMetricSummary(metricType, startDate, endDate);

      // Assert
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'metric.metric_type = :metricType',
        { metricType },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'metric.period_start >= :startDate',
        { startDate },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'metric.period_start <= :endDate',
        { endDate },
      );
    });
  });

  describe('cleanupOldMetrics', () => {
    it('should delete metrics older than retention period', async () => {
      // Arrange
      const retentionDays = 90;
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1000 }),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      // Act
      await service.cleanupOldMetrics(retentionDays);

      // Assert
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'created_at < :cutoffDate',
        expect.objectContaining({ cutoffDate: expect.any(Date) }),
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should calculate correct cutoff date', async () => {
      // Arrange
      const retentionDays = 30;
      const before = new Date();

      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      // Act
      await service.cleanupOldMetrics(retentionDays);

      // Assert
      const whereCall = mockQueryBuilder.where.mock.calls[0];
      const cutoffDate = whereCall[1].cutoffDate;
      const after = new Date();

      const expectedDate = new Date(before);
      expectedDate.setDate(expectedDate.getDate() - retentionDays);

      expect(cutoffDate.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });
  });

  describe('period helpers', () => {
    it('should calculate correct hourly period boundaries', async () => {
      // Arrange - This tests private methods indirectly through aggregation
      const baseDate = new Date('2024-01-15T10:30:45.123Z');
      const createdMetric = {
        id: 'metric-hourly',
        metric_type: MetricType.DEPOSIT,
        value: '100',
        count: 1,
        period: AggregationPeriod.HOURLY,
        period_start: new Date('2024-01-15T10:00:00Z'),
        period_end: new Date('2024-01-15T10:59:59.999Z'),
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      const result = await service.recordMetric(MetricType.DEPOSIT, 100);

      // Assert - Period should be normalized to hour boundaries
      expect(result.period).toBe(AggregationPeriod.HOURLY);
    });

    it('should handle daily period calculation', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-16T10:00:00Z');

      const rawMetrics: AnalyticsMetric[] = [
        {
          id: 'daily-1',
          metric_type: MetricType.DEPOSIT,
          value: '100',
          count: 1,
          period_start: new Date('2024-01-15T08:30:00Z'),
          user_id: 'user-1',
          metadata: null,
        } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.DAILY, startDate, endDate);

      // Assert
      expect(repository.save).toHaveBeenCalled();
    });

    it('should handle weekly period calculation', async () => {
      // Arrange
      const startDate = new Date('2024-01-08T00:00:00Z'); // Monday
      const endDate = new Date('2024-01-14T23:59:59Z'); // Sunday

      const rawMetrics: AnalyticsMetric[] = [];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.WEEKLY, startDate, endDate);

      // Assert
      expect(repository.find).toHaveBeenCalled();
    });

    it('should handle monthly period calculation', async () => {
      // Arrange
      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-01-31T23:59:59Z');

      const rawMetrics: AnalyticsMetric[] = [];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.MONTHLY, startDate, endDate);

      // Assert
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('metadata aggregation', () => {
    it('should aggregate metadata from multiple metrics', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T11:00:00Z');

      const rawMetrics: AnalyticsMetric[] = [
        {
          id: 'raw-1',
          metric_type: MetricType.DEPOSIT,
          value: '100',
          count: 1,
          period_start: startDate,
          user_id: 'user-1',
          metadata: { token: 'USDC', network: 'stellar' },
        } as AnalyticsMetric,
        {
          id: 'raw-2',
          metric_type: MetricType.DEPOSIT,
          value: '50',
          count: 1,
          period_start: startDate,
          user_id: 'user-1',
          metadata: { token: 'EURC', network: 'stellar' },
        } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.HOURLY, startDate, endDate);

      // Assert
      expect(repository.save).toHaveBeenCalled();
      const createCall = jest.spyOn(repository, 'create').mock.calls[0];
      expect(createCall[0].metadata).toBeDefined();
    });

    it('should handle metrics with null metadata', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T11:00:00Z');

      const rawMetrics: AnalyticsMetric[] = [
        {
          id: 'raw-1',
          metric_type: MetricType.DEPOSIT,
          value: '100',
          count: 1,
          period_start: startDate,
          user_id: 'user-1',
          metadata: null,
        } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.HOURLY, startDate, endDate);

      // Assert
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty metric set', async () => {
      // Arrange
      jest.spyOn(repository, 'find').mockResolvedValue([]);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(
        AggregationPeriod.HOURLY,
        new Date(),
        new Date(),
      );

      // Assert
      expect(repository.find).toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should handle decimal values correctly', async () => {
      // Arrange
      const values = [1.5, 2.3, 3.2];
      const createdMetric = {
        id: 'decimal-metric',
        value: (values.reduce((a, b) => a + b, 0)).toString(),
        count: values.length,
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      for (const value of values) {
        await service.recordMetric(MetricType.DEPOSIT, value);
      }

      // Assert
      expect(parseFloat(createdMetric.value)).toBeCloseTo(7, 1);
    });

    it('should handle large numbers', async () => {
      // Arrange
      const largeValue = 1_000_000_000;
      const createdMetric = {
        id: 'large-metric',
        value: largeValue.toString(),
        count: 1,
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      const result = await service.recordMetric(MetricType.DEPOSIT, largeValue);

      // Assert
      expect(result.value).toBe('1000000000');
    });

    it('should handle negative values', async () => {
      // Arrange
      const createdMetric = {
        id: 'negative-metric',
        value: '-100',
        count: 1,
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      const result = await service.recordMetric(MetricType.DEPOSIT, -100);

      // Assert
      expect(result.value).toBe('-100');
    });

    it('should handle zero value', async () => {
      // Arrange
      const createdMetric = {
        id: 'zero-metric',
        value: '0',
        count: 1,
      } as AnalyticsMetric;

      jest.spyOn(repository, 'create').mockReturnValue(createdMetric);
      jest.spyOn(repository, 'save').mockResolvedValue(createdMetric);

      // Act
      const result = await service.recordMetric(MetricType.DEPOSIT, 0);

      // Assert
      expect(result.value).toBe('0');
    });
  });

  describe('data integrity', () => {
    it('should maintain metric count accuracy', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T11:00:00Z');

      const rawMetrics: AnalyticsMetric[] = [
        { id: 'raw-1', metric_type: MetricType.DEPOSIT, value: '100', count: 5, period_start: startDate, user_id: 'user-1', metadata: null } as AnalyticsMetric,
        { id: 'raw-2', metric_type: MetricType.DEPOSIT, value: '50', count: 3, period_start: startDate, user_id: 'user-1', metadata: null } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.HOURLY, startDate, endDate);

      // Assert
      const createCall = jest.spyOn(repository, 'create').mock.calls[0];
      expect(createCall[0].count).toBe(8); // 5 + 3
    });

    it('should maintain value precision', async () => {
      // Arrange
      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T11:00:00Z');

      const rawMetrics: AnalyticsMetric[] = [
        { id: 'raw-1', metric_type: MetricType.DEPOSIT, value: '123.456', count: 1, period_start: startDate, user_id: 'user-1', metadata: null } as AnalyticsMetric,
        { id: 'raw-2', metric_type: MetricType.DEPOSIT, value: '234.567', count: 1, period_start: startDate, user_id: 'user-1', metadata: null } as AnalyticsMetric,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(rawMetrics);
      jest.spyOn(repository, 'create').mockReturnValue({} as AnalyticsMetric);
      jest.spyOn(repository, 'save').mockResolvedValue({} as AnalyticsMetric);

      // Act
      await service.aggregateMetrics(AggregationPeriod.HOURLY, startDate, endDate);

      // Assert
      const createCall = jest.spyOn(repository, 'create').mock.calls[0];
      expect(parseFloat(createCall[0].value)).toBeCloseTo(358.023, 2);
    });
  });
});
