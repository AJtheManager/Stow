import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsAggregationService } from './analytics-aggregation.service';
import { User } from '../users/entities/user.entity';
import { MetricType, AggregationPeriod } from './entities/analytics-metric.entity';
import { Repository } from 'typeorm';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockUserRepository: jest.Mocked<Repository<User>>;
  let mockAggregationService: jest.Mocked<AnalyticsAggregationService>;

  beforeEach(async () => {
    mockUserRepository = {
      findOne: jest.fn(),
    } as any;

    mockAggregationService = {
      recordMetric: jest.fn(),
      getAggregatedMetrics: jest.fn(),
      getMetricSummary: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: AnalyticsAggregationService, useValue: mockAggregationService },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardKpis', () => {
    it('should return dashboard KPIs for a valid user', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 100,
        correct_predictions: 75,
        total_winnings_stroops: '5000000',
        reputation_score: 500,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      expect(result).toMatchObject({
        total_predictions: 100,
        accuracy_rate: '75.0',
        current_rank: expect.any(Number),
        total_rewards_earned_stroops: '5000000',
        active_predictions_count: expect.any(Number),
        current_streak: expect.any(Number),
        reputation_score: 500,
        tier: 'Silver Predictor',
      });
    });

    it('should throw NotFoundException for non-existent user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getDashboardKpis('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should calculate accuracy rate correctly', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 50,
        correct_predictions: 25,
        total_winnings_stroops: '0',
        reputation_score: 100,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      expect(result.accuracy_rate).toBe('50.0');
    });

    it('should return 0.0 accuracy rate when user has no predictions', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 0,
        correct_predictions: 0,
        total_winnings_stroops: '0',
        reputation_score: 0,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      expect(result.accuracy_rate).toBe('0.0');
    });

    it('should determine correct tier based on reputation score', async () => {
      const testCases = [
        { reputation_score: 1000, expectedTier: 'Diamond Predictor' },
        { reputation_score: 750, expectedTier: 'Gold Predictor' },
        { reputation_score: 500, expectedTier: 'Silver Predictor' },
        { reputation_score: 250, expectedTier: 'Bronze Predictor' },
        { reputation_score: 100, expectedTier: 'Novice Predictor' },
      ];

      for (const testCase of testCases) {
        const mockUser: Partial<User> = {
          id: 'user-123',
          total_predictions: 10,
          correct_predictions: 5,
          total_winnings_stroops: '1000000',
          reputation_score: testCase.reputation_score,
        };

        mockUserRepository.findOne.mockResolvedValue(mockUser as User);

        const result = await service.getDashboardKpis('user-123');

        expect(result.tier).toBe(testCase.expectedTier);
      }
    });

    it('should include all required KPI fields', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 100,
        correct_predictions: 80,
        total_winnings_stroops: '10000000',
        reputation_score: 750,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      expect(result).toHaveProperty('total_predictions');
      expect(result).toHaveProperty('accuracy_rate');
      expect(result).toHaveProperty('current_rank');
      expect(result).toHaveProperty('total_rewards_earned_stroops');
      expect(result).toHaveProperty('active_predictions_count');
      expect(result).toHaveProperty('current_streak');
      expect(result).toHaveProperty('reputation_score');
      expect(result).toHaveProperty('tier');
    });
  });

  describe('trackApiRequest', () => {
    it('should record API request metric', async () => {
      await service.trackApiRequest(
        '/api/predictions',
        'GET',
        200,
        150,
        'user-123',
      );

      expect(mockAggregationService.recordMetric).toHaveBeenCalledWith(
        MetricType.API_REQUEST,
        1,
        expect.objectContaining({
          endpoint: '/api/predictions',
          method: 'GET',
          statusCode: 200,
          responseTime: 150,
        }),
        'user-123',
      );
    });

    it('should record response time metric', async () => {
      await service.trackApiRequest(
        '/api/predictions',
        'GET',
        200,
        150,
        'user-123',
      );

      expect(mockAggregationService.recordMetric).toHaveBeenCalledWith(
        MetricType.RESPONSE_TIME,
        150,
        expect.objectContaining({
          endpoint: '/api/predictions',
          method: 'GET',
        }),
        'user-123',
      );
    });

    it('should record error metric for 4xx status codes', async () => {
      await service.trackApiRequest(
        '/api/predictions',
        'POST',
        400,
        100,
        'user-123',
      );

      const errorCall = mockAggregationService.recordMetric.mock.calls.find(
        call => call[0] === MetricType.ERROR_RATE,
      );

      expect(errorCall).toBeDefined();
      expect(errorCall?.[1]).toBe(1);
      expect(errorCall?.[2].statusCode).toBe(400);
    });

    it('should record error metric for 5xx status codes', async () => {
      await service.trackApiRequest(
        '/api/predictions',
        'DELETE',
        500,
        200,
        'user-123',
      );

      const errorCall = mockAggregationService.recordMetric.mock.calls.find(
        call => call[0] === MetricType.ERROR_RATE,
      );

      expect(errorCall).toBeDefined();
      expect(errorCall?.[1]).toBe(1);
      expect(errorCall?.[2].statusCode).toBe(500);
    });

    it('should not record error metric for 2xx status codes', async () => {
      await service.trackApiRequest(
        '/api/predictions',
        'GET',
        200,
        150,
        'user-123',
      );

      const errorCall = mockAggregationService.recordMetric.mock.calls.find(
        call => call[0] === MetricType.ERROR_RATE,
      );

      expect(errorCall).toBeUndefined();
    });

    it('should not record error metric for 3xx status codes', async () => {
      await service.trackApiRequest(
        '/api/predictions',
        'GET',
        301,
        150,
        'user-123',
      );

      const errorCall = mockAggregationService.recordMetric.mock.calls.find(
        call => call[0] === MetricType.ERROR_RATE,
      );

      expect(errorCall).toBeUndefined();
    });

    it('should record API request without user ID', async () => {
      await service.trackApiRequest(
        '/api/public/data',
        'GET',
        200,
        100,
      );

      expect(mockAggregationService.recordMetric).toHaveBeenCalled();
      const calls = mockAggregationService.recordMetric.mock.calls;
      expect(calls[0][3]).toBeUndefined(); // userId should be undefined
    });

    it('should record all three metrics for error response', async () => {
      await service.trackApiRequest(
        '/api/predictions',
        'POST',
        500,
        300,
        'user-123',
      );

      expect(mockAggregationService.recordMetric).toHaveBeenCalledTimes(3);
      const calls = mockAggregationService.recordMetric.mock.calls;
      
      expect(calls[0][0]).toBe(MetricType.API_REQUEST);
      expect(calls[1][0]).toBe(MetricType.RESPONSE_TIME);
      expect(calls[2][0]).toBe(MetricType.ERROR_RATE);
    });
  });

  describe('trackUserActivity', () => {
    it('should record user activity metric', async () => {
      const metadata = { action: 'prediction_created', market_id: 'market-123' };

      await service.trackUserActivity('user-123', 'prediction_created', metadata);

      expect(mockAggregationService.recordMetric).toHaveBeenCalledWith(
        MetricType.USER_ACTIVITY,
        1,
        expect.objectContaining({
          activityType: 'prediction_created',
          action: 'prediction_created',
          market_id: 'market-123',
        }),
        'user-123',
      );
    });

    it('should record user activity without metadata', async () => {
      await service.trackUserActivity('user-123', 'login');

      expect(mockAggregationService.recordMetric).toHaveBeenCalledWith(
        MetricType.USER_ACTIVITY,
        1,
        expect.objectContaining({
          activityType: 'login',
        }),
        'user-123',
      );
    });

    it('should include all metadata fields in recording', async () => {
      const metadata = {
        amount: 1000000,
        currency: 'XLM',
        deposit_method: 'stellar_federation',
      };

      await service.trackUserActivity('user-123', 'deposit', metadata);

      expect(mockAggregationService.recordMetric).toHaveBeenCalledWith(
        MetricType.USER_ACTIVITY,
        1,
        expect.objectContaining({
          activityType: 'deposit',
          amount: 1000000,
          currency: 'XLM',
          deposit_method: 'stellar_federation',
        }),
        'user-123',
      );
    });
  });

  describe('getMetrics', () => {
    it('should retrieve aggregated metrics for specified parameters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getMetrics(
        MetricType.API_REQUEST,
        AggregationPeriod.DAILY,
        startDate,
        endDate,
        'user-123',
      );

      expect(mockAggregationService.getAggregatedMetrics).toHaveBeenCalledWith(
        MetricType.API_REQUEST,
        AggregationPeriod.DAILY,
        startDate,
        endDate,
        'user-123',
      );
    });

    it('should retrieve metrics without user ID for platform-wide metrics', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getMetrics(
        MetricType.RESPONSE_TIME,
        AggregationPeriod.HOURLY,
        startDate,
        endDate,
      );

      expect(mockAggregationService.getAggregatedMetrics).toHaveBeenCalledWith(
        MetricType.RESPONSE_TIME,
        AggregationPeriod.HOURLY,
        startDate,
        endDate,
        undefined,
      );
    });

    it('should support different aggregation periods', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const periods = [
        AggregationPeriod.HOURLY,
        AggregationPeriod.DAILY,
        AggregationPeriod.WEEKLY,
        AggregationPeriod.MONTHLY,
      ];

      for (const period of periods) {
        await service.getMetrics(
          MetricType.USER_ACTIVITY,
          period,
          startDate,
          endDate,
        );

        expect(mockAggregationService.getAggregatedMetrics).toHaveBeenCalledWith(
          MetricType.USER_ACTIVITY,
          period,
          startDate,
          endDate,
          undefined,
        );
      }
    });
  });

  describe('getMetricSummary', () => {
    it('should retrieve metric summary for specified parameters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getMetricSummary(
        MetricType.ERROR_RATE,
        startDate,
        endDate,
        'user-123',
      );

      expect(mockAggregationService.getMetricSummary).toHaveBeenCalledWith(
        MetricType.ERROR_RATE,
        startDate,
        endDate,
        'user-123',
      );
    });

    it('should retrieve metric summary without user ID', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getMetricSummary(
        MetricType.API_REQUEST,
        startDate,
        endDate,
      );

      expect(mockAggregationService.getMetricSummary).toHaveBeenCalledWith(
        MetricType.API_REQUEST,
        startDate,
        endDate,
        undefined,
      );
    });

    it('should support all metric types for summary', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const metricTypes = [
        MetricType.API_REQUEST,
        MetricType.RESPONSE_TIME,
        MetricType.ERROR_RATE,
        MetricType.USER_ACTIVITY,
      ];

      for (const metricType of metricTypes) {
        await service.getMetricSummary(metricType, startDate, endDate);

        expect(mockAggregationService.getMetricSummary).toHaveBeenCalledWith(
          metricType,
          startDate,
          endDate,
          undefined,
        );
      }
    });
  });

  describe('Tier Determination', () => {
    const tierTestCases = [
      { score: 1500, expectedTier: 'Diamond Predictor' },
      { score: 1000, expectedTier: 'Diamond Predictor' },
      { score: 999, expectedTier: 'Gold Predictor' },
      { score: 750, expectedTier: 'Gold Predictor' },
      { score: 749, expectedTier: 'Silver Predictor' },
      { score: 500, expectedTier: 'Silver Predictor' },
      { score: 499, expectedTier: 'Bronze Predictor' },
      { score: 250, expectedTier: 'Bronze Predictor' },
      { score: 249, expectedTier: 'Novice Predictor' },
      { score: 0, expectedTier: 'Novice Predictor' },
    ];

    tierTestCases.forEach(testCase => {
      it(`should assign ${testCase.expectedTier} for reputation score ${testCase.score}`, async () => {
        const mockUser: Partial<User> = {
          id: 'user-123',
          total_predictions: 10,
          correct_predictions: 5,
          total_winnings_stroops: '0',
          reputation_score: testCase.score,
        };

        mockUserRepository.findOne.mockResolvedValue(mockUser as User);

        const result = await service.getDashboardKpis('user-123');

        expect(result.tier).toBe(testCase.expectedTier);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very high accuracy rate', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 1000,
        correct_predictions: 1000,
        total_winnings_stroops: '0',
        reputation_score: 100,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      expect(result.accuracy_rate).toBe('100.0');
    });

    it('should handle large reward amounts', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 100,
        correct_predictions: 50,
        total_winnings_stroops: '999999999999999999',
        reputation_score: 1000,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      expect(result.total_rewards_earned_stroops).toBe('999999999999999999');
    });

    it('should handle zero predictions gracefully', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 0,
        correct_predictions: 0,
        total_winnings_stroops: '0',
        reputation_score: 0,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      expect(result.total_predictions).toBe(0);
      expect(result.accuracy_rate).toBe('0.0');
      expect(result.tier).toBe('Novice Predictor');
    });

    it('should handle boundary accuracy rates', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        total_predictions: 3,
        correct_predictions: 1,
        total_winnings_stroops: '0',
        reputation_score: 100,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await service.getDashboardKpis('user-123');

      const accuracy = parseFloat(result.accuracy_rate);
      expect(accuracy).toBeCloseTo(33.3, 1);
    });
  });
});
