import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReferralService } from './referral.service';
import { User } from './entities/user.entity';
import { UserReferral, ReferralStatus } from './entities/user-referral.entity';
import { ReferralReward, RewardStatus, RewardType } from './entities/referral-reward.entity';

describe('ReferralService', () => {
  let service: ReferralService;
  let userRepository: any;
  let referralRepository: any;
  let rewardRepository: any;
  let configService: any;

  beforeEach(async () => {
    userRepository = {
      findOneBy: jest.fn(),
    };

    referralRepository = {
      save: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };

    rewardRepository = {
      save: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REFERRAL_REWARD_AMOUNT_STROOPS: '1000000',
          REFERRAL_REWARD_ASSET_CODE: 'XLM',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(UserReferral), useValue: referralRepository },
        { provide: getRepositoryToken(ReferralReward), useValue: rewardRepository },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('claimReferral', () => {
    it('should create referral relationship', async () => {
      // Arrange
      const userId = 'user-123';
      const referrerId = 'referrer-456';
      const referrer = { id: referrerId };

      userRepository.findOneBy.mockResolvedValue(referrer);
      referralRepository.findOne.mockResolvedValue(null);
      referralRepository.create.mockReturnValue({
        referrer_id: referrerId,
        referred_id: userId,
      });
      referralRepository.save.mockResolvedValue({
        id: 'referral-1',
        referrer_id: referrerId,
        referred_id: userId,
        status: ReferralStatus.PENDING,
      });

      // Act
      const result = await service.claimReferral(userId, referrerId);

      // Assert
      expect(result.referrer_id).toBe(referrerId);
      expect(result.referred_id).toBe(userId);
      expect(referralRepository.save).toHaveBeenCalled();
    });

    it('should reject self-referral', async () => {
      // Arrange
      const userId = 'user-123';

      // Act & Assert
      await expect(service.claimReferral(userId, userId)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw when referral code invalid', async () => {
      // Arrange
      const userId = 'user-123';
      const invalidCode = 'invalid-code';

      userRepository.findOneBy.mockResolvedValue(null);

      // Act & Assert
      await expect(service.claimReferral(userId, invalidCode)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw when user already has referral', async () => {
      // Arrange
      const userId = 'user-123';
      const referrerId = 'referrer-456';
      const referrer = { id: referrerId };

      userRepository.findOneBy.mockResolvedValue(referrer);
      referralRepository.findOne.mockResolvedValue({
        id: 'existing-referral',
        referred_id: userId,
      });

      // Act & Assert
      await expect(service.claimReferral(userId, referrerId)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('recordQualifyingAction', () => {
    it('should mark referral as qualified', async () => {
      // Arrange
      const userId = 'user-123';
      const referral = {
        id: 'referral-1',
        referred_id: userId,
        referrer_id: 'referrer-456',
        status: ReferralStatus.PENDING,
        qualified_at: null,
      };

      referralRepository.findOne.mockResolvedValue(referral);
      referralRepository.save.mockResolvedValue({
        ...referral,
        status: ReferralStatus.QUALIFIED,
        qualified_at: expect.any(Date),
      });
      rewardRepository.save.mockResolvedValue([
        { id: 'reward-1', status: RewardStatus.PENDING },
        { id: 'reward-2', status: RewardStatus.PENDING },
      ]);

      // Act
      await service.recordQualifyingAction(userId);

      // Assert
      expect(referral.status).toBe(ReferralStatus.QUALIFIED);
      expect(rewardRepository.save).toHaveBeenCalled();
    });

    it('should be idempotent for non-pending referrals', async () => {
      // Arrange
      const userId = 'user-123';
      referralRepository.findOne.mockResolvedValue(null);

      // Act
      await service.recordQualifyingAction(userId);

      // Assert
      expect(rewardRepository.save).not.toHaveBeenCalled();
    });

    it('should issue rewards when qualifying', async () => {
      // Arrange
      const userId = 'user-123';
      const referrerId = 'referrer-456';
      const referral = {
        id: 'referral-1',
        referred_id: userId,
        referrer_id: referrerId,
        status: ReferralStatus.PENDING,
      };

      referralRepository.findOne.mockResolvedValue(referral);
      referralRepository.save.mockResolvedValue({
        ...referral,
        status: ReferralStatus.QUALIFIED,
      });
      rewardRepository.create.mockImplementation((data) => data);
      rewardRepository.save.mockResolvedValue([
        { recipient_id: referrerId, type: RewardType.REFERRER_BONUS },
        { recipient_id: userId, type: RewardType.REFEREE_BONUS },
      ]);

      // Act
      await service.recordQualifyingAction(userId);

      // Assert
      expect(rewardRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            recipient_id: referrerId,
            type: RewardType.REFERRER_BONUS,
          }),
          expect.objectContaining({
            recipient_id: userId,
            type: RewardType.REFEREE_BONUS,
          }),
        ])
      );
    });
  });

  describe('getMyReferrals', () => {
    it('should return user referral stats', async () => {
      // Arrange
      const userId = 'user-123';
      const referrals = [
        { status: ReferralStatus.QUALIFIED, referred: { id: 'referred-1' } },
        { status: ReferralStatus.QUALIFIED, referred: { id: 'referred-2' } },
        { status: ReferralStatus.PENDING, referred: { id: 'referred-3' } },
      ];

      referralRepository.find.mockResolvedValue(referrals);
      rewardRepository.count.mockResolvedValue(2);

      // Act
      const result = await service.getMyReferrals(userId);

      // Assert
      expect(result.referral_code).toBe(userId);
      expect(result.total).toBe(3);
      expect(result.qualified).toBe(2);
      expect(result.pending).toBe(1);
      expect(result.total_rewards_issued).toBe(2);
    });

    it('should return empty list for new users', async () => {
      // Arrange
      const userId = 'new-user';
      referralRepository.find.mockResolvedValue([]);
      rewardRepository.count.mockResolvedValue(0);

      // Act
      const result = await service.getMyReferrals(userId);

      // Assert
      expect(result.total).toBe(0);
      expect(result.qualified).toBe(0);
      expect(result.pending).toBe(0);
    });

    it('should order referrals by creation date', async () => {
      // Arrange
      const userId = 'user-123';
      referralRepository.find.mockResolvedValue([]);
      rewardRepository.count.mockResolvedValue(0);

      // Act
      await service.getMyReferrals(userId);

      // Assert
      expect(referralRepository.find).toHaveBeenCalledWith({
        where: { referrer_id: userId },
        relations: ['referred'],
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('getMyRewards', () => {
    it('should return paginated rewards for user', async () => {
      // Arrange
      const userId = 'user-123';
      const query = { page: 1, limit: 10 };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'reward-1' }, { id: 'reward-2' }],
          25,
        ]),
      };

      rewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getMyRewards(userId, query);

      // Assert
      expect(result.data.length).toBe(2);
      expect(result.meta.total).toBe(25);
      expect(result.meta.totalPages).toBe(3);
    });

    it('should calculate correct pagination', async () => {
      // Arrange
      const userId = 'user-123';
      const query = { page: 2, limit: 20 };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 100]),
      };

      rewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      await service.getMyRewards(userId, query);

      // Assert
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('should use default pagination', async () => {
      // Arrange
      const userId = 'user-123';
      const query = {};

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 50]),
      };

      rewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      await service.getMyRewards(userId, query);

      // Assert
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });
  });

  describe('listReferrals', () => {
    it('should list all referrals with pagination', async () => {
      // Arrange
      const query = { page: 1, limit: 50 };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'ref-1' }, { id: 'ref-2' }],
          200,
        ]),
      };

      referralRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.listReferrals(query);

      // Assert
      expect(result.data.length).toBe(2);
      expect(result.meta.total).toBe(200);
    });

    it('should filter by status when provided', async () => {
      // Arrange
      const query = { page: 1, limit: 50, status: ReferralStatus.QUALIFIED };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 100]),
      };

      referralRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      await service.listReferrals(query);

      // Assert
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ref.status = :status',
        { status: ReferralStatus.QUALIFIED }
      );
    });
  });

  describe('getAdminOverview', () => {
    it('should return platform-wide referral metrics', async () => {
      // Arrange
      referralRepository.count
        .mockResolvedValueOnce(1000) // total
        .mockResolvedValueOnce(200) // pending
        .mockResolvedValueOnce(800); // qualified

      rewardRepository.count
        .mockResolvedValueOnce(1000) // pending
        .mockResolvedValueOnce(800); // issued

      // Act
      const result = await service.getAdminOverview();

      // Assert
      expect(result.total_referrals).toBe(1000);
      expect(result.pending).toBe(200);
      expect(result.qualified).toBe(800);
      expect(result.total_rewards_pending).toBe(1000);
      expect(result.total_rewards_issued).toBe(800);
      expect(result.computed_at).toBeDefined();
    });

    it('should return 0 for new platform', async () => {
      // Arrange
      referralRepository.count.mockResolvedValue(0);
      rewardRepository.count.mockResolvedValue(0);

      // Act
      const result = await service.getAdminOverview();

      // Assert
      expect(result.total_referrals).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.qualified).toBe(0);
    });
  });

  describe('reward issuance', () => {
    it('should issue both referrer and referee rewards', async () => {
      // Arrange
      const userId = 'user-123';
      const referrerId = 'referrer-456';
      const referral = {
        id: 'referral-1',
        referred_id: userId,
        referrer_id: referrerId,
        status: ReferralStatus.PENDING,
      };

      referralRepository.findOne.mockResolvedValue(referral);
      referralRepository.save.mockResolvedValue({
        ...referral,
        status: ReferralStatus.QUALIFIED,
      });

      const rewards = [
        {
          referral_id: referral.id,
          recipient_id: referrerId,
          type: RewardType.REFERRER_BONUS,
          amount: '1000000',
          asset_code: 'XLM',
          status: RewardStatus.PENDING,
        },
        {
          referral_id: referral.id,
          recipient_id: userId,
          type: RewardType.REFEREE_BONUS,
          amount: '1000000',
          asset_code: 'XLM',
          status: RewardStatus.PENDING,
        },
      ];

      rewardRepository.create.mockImplementation((data) => data);
      rewardRepository.save.mockResolvedValue(rewards);

      // Act
      await service.recordQualifyingAction(userId);

      // Assert
      expect(rewardRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: RewardType.REFERRER_BONUS }),
          expect.objectContaining({ type: RewardType.REFEREE_BONUS }),
        ])
      );
    });

    it('should use config values for rewards', async () => {
      // Arrange
      const userId = 'user-123';
      const referral = {
        id: 'referral-1',
        referred_id: userId,
        referrer_id: 'referrer-456',
        status: ReferralStatus.PENDING,
      };

      referralRepository.findOne.mockResolvedValue(referral);
      referralRepository.save.mockResolvedValue({
        ...referral,
        status: ReferralStatus.QUALIFIED,
      });
      rewardRepository.create.mockImplementation((data) => data);
      rewardRepository.save.mockResolvedValue([]);

      // Act
      await service.recordQualifyingAction(userId);

      // Assert
      expect(configService.get).toHaveBeenCalledWith('REFERRAL_REWARD_AMOUNT_STROOPS');
      expect(configService.get).toHaveBeenCalledWith('REFERRAL_REWARD_ASSET_CODE');
    });
  });

  describe('error handling', () => {
    it('should handle database errors', async () => {
      // Arrange
      userRepository.findOneBy.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.claimReferral('user-123', 'referrer-456')).rejects.toThrow(
        'Database error'
      );
    });

    it('should handle query builder errors', async () => {
      // Arrange
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockRejectedValue(new Error('Query error')),
      };

      referralRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act & Assert
      await expect(service.listReferrals({})).rejects.toThrow('Query error');
    });
  });

  describe('edge cases', () => {
    it('should handle zero rewards', async () => {
      // Arrange
      const userId = 'user-123';
      referralRepository.find.mockResolvedValue([]);
      rewardRepository.count.mockResolvedValue(0);

      // Act
      const result = await service.getMyReferrals(userId);

      // Assert
      expect(result.total_rewards_issued).toBe(0);
    });

    it('should handle very large referral networks', async () => {
      // Arrange
      const userId = 'user-123';
      const referrals = Array(10000).fill({
        status: ReferralStatus.QUALIFIED,
      });

      referralRepository.find.mockResolvedValue(referrals);
      rewardRepository.count.mockResolvedValue(20000);

      // Act
      const result = await service.getMyReferrals(userId);

      // Assert
      expect(result.total).toBe(10000);
      expect(result.qualified).toBe(10000);
    });
  });
});
