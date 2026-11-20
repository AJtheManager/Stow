import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MilestoneEvaluatorService } from './milestone-evaluator.service';
import { Balance } from '../../savings/entities/balance.entity';
import { Goal, GoalStatus } from '../../goals/entities/goal.entity';
import { ContractEvent, ContractEventStatus } from '../../indexer/entities/contract-event.entity';
import { MilestoneType } from '../entities/nft-reward-milestone.entity';

describe('MilestoneEvaluatorService', () => {
  let service: MilestoneEvaluatorService;
  let balanceRepository: any;
  let goalRepository: any;
  let contractEventRepository: any;

  beforeEach(async () => {
    balanceRepository = {
      findOne: jest.fn(),
    };

    goalRepository = {
      count: jest.fn(),
    };

    contractEventRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MilestoneEvaluatorService,
        {
          provide: getRepositoryToken(Balance),
          useValue: balanceRepository,
        },
        {
          provide: getRepositoryToken(Goal),
          useValue: goalRepository,
        },
        {
          provide: getRepositoryToken(ContractEvent),
          useValue: contractEventRepository,
        },
      ],
    }).compile();

    service = module.get<MilestoneEvaluatorService>(MilestoneEvaluatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProgress', () => {
    it('should route to correct method based on milestone type', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ';

      balanceRepository.findOne.mockResolvedValue({ amount: '1000000' });
      goalRepository.count.mockResolvedValue(5);
      contractEventRepository.find.mockResolvedValue([]);

      // Act
      const savingsProgress = await service.getProgress(stellarAddress, MilestoneType.SAVINGS_AMOUNT);
      const goalsProgress = await service.getProgress(stellarAddress, MilestoneType.GOALS_REACHED);

      // Assert
      expect(savingsProgress).toBe(1000000);
      expect(goalsProgress).toBe(5);
    });

    it('should return 0 for unknown milestone type', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';

      // Act
      const progress = await service.getProgress(stellarAddress, 'UNKNOWN_TYPE' as any);

      // Assert
      expect(progress).toBe(0);
    });
  });

  describe('getSavingsAmount', () => {
    it('should return user balance in stroops', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const balance = { account: stellarAddress, amount: '5000000' };

      balanceRepository.findOne.mockResolvedValue(balance);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.SAVINGS_AMOUNT);

      // Assert
      expect(result).toBe(5000000);
      expect(balanceRepository.findOne).toHaveBeenCalledWith({
        where: { account: stellarAddress },
      });
    });

    it('should return 0 when user has no balance record', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      balanceRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.SAVINGS_AMOUNT);

      // Assert
      expect(result).toBe(0);
    });

    it('should handle large balance amounts', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const largeAmount = '999999999999999999';
      const balance = { amount: largeAmount };

      balanceRepository.findOne.mockResolvedValue(balance);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.SAVINGS_AMOUNT);

      // Assert
      expect(result).toBe(parseInt(largeAmount, 10));
    });

    it('should parse string amounts correctly', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const balance = { amount: '12345' };

      balanceRepository.findOne.mockResolvedValue(balance);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.SAVINGS_AMOUNT);

      // Assert
      expect(typeof result).toBe('number');
      expect(result).toBe(12345);
    });
  });

  describe('getGoalsReached', () => {
    it('should count reached goals for user', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      goalRepository.count.mockResolvedValue(3);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.GOALS_REACHED);

      // Assert
      expect(result).toBe(3);
      expect(goalRepository.count).toHaveBeenCalledWith({
        where: {
          owner: stellarAddress,
          status: GoalStatus.REACHED,
        },
      });
    });

    it('should return 0 when user has no reached goals', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      goalRepository.count.mockResolvedValue(0);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.GOALS_REACHED);

      // Assert
      expect(result).toBe(0);
    });

    it('should handle multiple reached goals', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      goalRepository.count.mockResolvedValue(50);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.GOALS_REACHED);

      // Assert
      expect(result).toBe(50);
    });
  });

  describe('getConsecutiveDeposits', () => {
    it('should count consecutive deposit days', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const now = new Date();

      const deposits = [
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(now.getTime() - 0 * 24 * 60 * 60 * 1000), data: { account: stellarAddress } },
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), data: { account: stellarAddress } },
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), data: { account: stellarAddress } },
      ];

      contractEventRepository.find.mockResolvedValue(deposits);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.CONSECUTIVE_DEPOSITS);

      // Assert
      expect(result).toBe(3);
    });

    it('should break streak on non-consecutive deposits', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const now = new Date();

      const deposits = [
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(now.getTime() - 0 * 24 * 60 * 60 * 1000), data: { account: stellarAddress } },
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), data: { account: stellarAddress } },
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), data: { account: stellarAddress } }, // Gap!
      ];

      contractEventRepository.find.mockResolvedValue(deposits);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.CONSECUTIVE_DEPOSITS);

      // Assert
      expect(result).toBe(2);
    });

    it('should return 0 with no deposits', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      contractEventRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.CONSECUTIVE_DEPOSITS);

      // Assert
      expect(result).toBe(0);
    });

    it('should filter by account in deposit data', async () => {
      // Arrange
      const targetAddress = 'GACJ2K6...';
      const otherAddress = 'GXYZ789...';

      const deposits = [
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(), data: { account: targetAddress } },
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(), data: { account: otherAddress } },
        { event_type: 'deposit', status: ContractEventStatus.PROCESSED, created_at: new Date(), data: { account: targetAddress } },
      ];

      contractEventRepository.find.mockResolvedValue(deposits);

      // Act
      const result = await service.getProgress(targetAddress, MilestoneType.CONSECUTIVE_DEPOSITS);

      // Assert
      expect(result).toBe(1); // Only counts target's deposits
    });

    it('should respect 100-item query limit', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      contractEventRepository.find.mockResolvedValue([]);

      // Act
      await service.getProgress(stellarAddress, MilestoneType.CONSECUTIVE_DEPOSITS);

      // Assert
      expect(contractEventRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('getActivityStreak', () => {
    it('should count consecutive activity days', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      };

      const today = new Date();
      const events = [
        { created_at: today, event_type: 'deposit' },
        { created_at: new Date(today.getTime() - 24 * 60 * 60 * 1000), event_type: 'deposit' },
        { created_at: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), event_type: 'withdraw' },
        { created_at: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000), event_type: 'deposit' },
      ];

      mockQueryBuilder.getMany.mockResolvedValue(events);
      contractEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.ACTIVITY_STREAK);

      // Assert
      expect(result).toBeGreaterThan(0);
    });

    it('should return 0 with no activity', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      contractEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.ACTIVITY_STREAK);

      // Assert
      expect(result).toBe(0);
    });

    it('should include both deposit and withdraw events', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      contractEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      await service.getProgress(stellarAddress, MilestoneType.ACTIVITY_STREAK);

      // Assert
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'event.event_type IN (:...types)',
        { types: ['deposit', 'withdraw'] }
      );
    });

    it('should look back up to 365 days', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      contractEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      await service.getProgress(stellarAddress, MilestoneType.ACTIVITY_STREAK);

      // Assert
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(365);
    });

    it('should handle gap in activity streak', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      };

      const today = new Date();
      const events = [
        { created_at: today, event_type: 'deposit' },
        { created_at: new Date(today.getTime() - 24 * 60 * 60 * 1000), event_type: 'deposit' },
        // Gap of 3 days
        { created_at: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000), event_type: 'deposit' },
      ];

      mockQueryBuilder.getMany.mockResolvedValue(events);
      contractEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.ACTIVITY_STREAK);

      // Assert
      expect(result).toBeLessThanOrEqual(2); // Should only count recent consecutive days
    });
  });

  describe('address filtering', () => {
    it('should handle account field in deposit data', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const deposits = [
        { created_at: new Date(), data: { account: stellarAddress } },
      ];

      contractEventRepository.find.mockResolvedValue(deposits);

      // Act
      await service.getProgress(stellarAddress, MilestoneType.CONSECUTIVE_DEPOSITS);

      // Assert
      expect(contractEventRepository.find).toHaveBeenCalled();
    });

    it('should handle null data gracefully', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const deposits = [
        { created_at: new Date(), data: null },
        { created_at: new Date(), data: { account: stellarAddress } },
      ];

      contractEventRepository.find.mockResolvedValue(deposits);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.CONSECUTIVE_DEPOSITS);

      // Assert
      expect(typeof result).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should propagate repository errors', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      balanceRepository.findOne.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(
        service.getProgress(stellarAddress, MilestoneType.SAVINGS_AMOUNT)
      ).rejects.toThrow('Database error');
    });

    it('should handle goal count errors', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      goalRepository.count.mockRejectedValue(new Error('Count failed'));

      // Act & Assert
      await expect(
        service.getProgress(stellarAddress, MilestoneType.GOALS_REACHED)
      ).rejects.toThrow('Count failed');
    });

    it('should handle deposit query errors', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      contractEventRepository.find.mockRejectedValue(new Error('Query failed'));

      // Act & Assert
      await expect(
        service.getProgress(stellarAddress, MilestoneType.CONSECUTIVE_DEPOSITS)
      ).rejects.toThrow('Query failed');
    });
  });

  describe('data types and parsing', () => {
    it('should handle numeric string parsing', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const balance = { amount: '123456789' };

      balanceRepository.findOne.mockResolvedValue(balance);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.SAVINGS_AMOUNT);

      // Assert
      expect(typeof result).toBe('number');
      expect(result).toBe(123456789);
    });

    it('should handle edge case dates', async () => {
      // Arrange
      const stellarAddress = 'GACJ2K6...';
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      };

      // Events spanning multiple years
      const events = [
        { created_at: new Date('2023-12-31'), event_type: 'deposit' },
        { created_at: new Date('2024-01-01'), event_type: 'deposit' },
      ];

      mockQueryBuilder.getMany.mockResolvedValue(events);
      contractEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getProgress(stellarAddress, MilestoneType.ACTIVITY_STREAK);

      // Assert
      expect(typeof result).toBe('number');
    });
  });
});
