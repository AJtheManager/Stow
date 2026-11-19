import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { NftRewardsService } from './nft-rewards.service';
import { MilestoneEvaluatorService } from './milestone-evaluator.service';
import { NftMetadataService } from './nft-metadata.service';
import { UserNftReward, NftRewardStatus } from '../entities/user-nft-reward.entity';
import { NftRewardMilestone, MilestoneType } from '../entities/nft-reward-milestone.entity';
import { User } from '../../users/entities/user.entity';

describe('NftRewardsService', () => {
  let service: NftRewardsService;
  let rewardRepository: any;
  let milestoneRepository: any;
  let userRepository: any;
  let milestoneEvaluatorService: any;
  let nftMetadataService: any;

  beforeEach(async () => {
    rewardRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    milestoneRepository = {
      find: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    milestoneEvaluatorService = {
      getProgress: jest.fn(),
    };

    nftMetadataService = {
      generateAndPinMetadata: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftRewardsService,
        {
          provide: getRepositoryToken(UserNftReward),
          useValue: rewardRepository,
        },
        {
          provide: getRepositoryToken(NftRewardMilestone),
          useValue: milestoneRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: MilestoneEvaluatorService,
          useValue: milestoneEvaluatorService,
        },
        {
          provide: NftMetadataService,
          useValue: nftMetadataService,
        },
      ],
    }).compile();

    service = module.get<NftRewardsService>(NftRewardsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateAndMintRewards', () => {
    it('should evaluate milestones for a user and mint new rewards', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        threshold: 1000000,
        is_active: true,
        rarity_tier: 2,
        is_soulbound: false,
        nft_title: 'Savings Master',
        image_ipfs_cid: 'QmTest123',
      };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.findOne.mockResolvedValue(null);
      milestoneEvaluatorService.getProgress.mockResolvedValue(1500000);
      nftMetadataService.generateAndPinMetadata.mockResolvedValue({ cid: 'QmMetadata123' });
      rewardRepository.create.mockReturnValue({
        id: 'reward-1',
        user_id: userId,
        milestone_id: milestone.id,
        status: NftRewardStatus.EARNED,
      });
      rewardRepository.save.mockResolvedValue({
        id: 'reward-1',
        user_id: userId,
        milestone_id: milestone.id,
        status: NftRewardStatus.MINTED,
        metadata_ipfs_cid: 'QmMetadata123',
        minted_at: expect.any(Date),
      });

      // Act
      await service.evaluateAndMintRewards(userId);

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(milestoneRepository.find).toHaveBeenCalled();
      expect(milestoneEvaluatorService.getProgress).toHaveBeenCalledWith(
        user.stellar_address,
        milestone.milestone_type
      );
      expect(nftMetadataService.generateAndPinMetadata).toHaveBeenCalled();
    });

    it('should throw when user does not exist', async () => {
      // Arrange
      const userId = 'non-existent-user';
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.evaluateAndMintRewards(userId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should skip already earned milestones', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        threshold: 1000000,
        is_active: true,
      };

      const existingReward = { id: 'reward-1', user_id: userId, milestone_id: milestone.id };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.findOne.mockResolvedValue(existingReward);

      // Act
      await service.evaluateAndMintRewards(userId);

      // Assert
      expect(nftMetadataService.generateAndPinMetadata).not.toHaveBeenCalled();
    });

    it('should skip milestones below threshold', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        threshold: 1000000,
        is_active: true,
      };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.findOne.mockResolvedValue(null);
      milestoneEvaluatorService.getProgress.mockResolvedValue(500000); // Below threshold

      // Act
      await service.evaluateAndMintRewards(userId);

      // Assert
      expect(nftMetadataService.generateAndPinMetadata).not.toHaveBeenCalled();
    });

    it('should process multiple milestones', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestones = [
        {
          id: 'milestone-1',
          milestone_type: MilestoneType.SAVINGS_AMOUNT,
          threshold: 1000000,
          is_active: true,
        },
        {
          id: 'milestone-2',
          milestone_type: MilestoneType.GOALS_REACHED,
          threshold: 5,
          is_active: true,
        },
      ];

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue(milestones);
      rewardRepository.findOne.mockResolvedValue(null);
      milestoneEvaluatorService.getProgress.mockResolvedValue(1500000);
      nftMetadataService.generateAndPinMetadata.mockResolvedValue({ cid: 'QmMetadata123' });
      rewardRepository.create.mockReturnValue({
        status: NftRewardStatus.EARNED,
      });
      rewardRepository.save.mockResolvedValue({
        status: NftRewardStatus.MINTED,
        metadata_ipfs_cid: 'QmMetadata123',
      });

      // Act
      await service.evaluateAndMintRewards(userId);

      // Assert
      expect(milestoneEvaluatorService.getProgress).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUserMilestoneProgress', () => {
    it('should return progress for all active milestones', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestones = [
        {
          id: 'milestone-1',
          milestone_type: MilestoneType.SAVINGS_AMOUNT,
          name: 'Savings Master',
          description: 'Save 1M stroops',
          threshold: 1000000,
          is_active: true,
          rarity_tier: 2,
          is_soulbound: false,
        },
        {
          id: 'milestone-2',
          milestone_type: MilestoneType.GOALS_REACHED,
          name: 'Goal Setter',
          description: 'Reach 5 goals',
          threshold: 5,
          is_active: true,
          rarity_tier: 1,
          is_soulbound: false,
        },
      ];

      const earnedRewards = [
        { id: 'reward-1', milestone_id: 'milestone-1', earned_at: new Date() },
      ];

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue(milestones);
      rewardRepository.find.mockResolvedValue(earnedRewards);
      milestoneEvaluatorService.getProgress
        .mockResolvedValueOnce(1500000)
        .mockResolvedValueOnce(3);

      // Act
      const result = await service.getUserMilestoneProgress(userId);

      // Assert
      expect(result.total_milestones).toBe(2);
      expect(result.earned_count).toBe(1);
      expect(result.completed.length).toBe(1);
      expect(result.in_progress.length).toBe(1);
    });

    it('should throw when user does not exist', async () => {
      // Arrange
      const userId = 'non-existent-user';
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUserMilestoneProgress(userId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should calculate correct progress percentage', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        name: 'Savings',
        description: 'Save 1M stroops',
        threshold: 1000000,
        is_active: true,
        rarity_tier: 1,
        is_soulbound: false,
      };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.find.mockResolvedValue([]);
      milestoneEvaluatorService.getProgress.mockResolvedValue(500000); // 50% progress

      // Act
      const result = await service.getUserMilestoneProgress(userId);

      // Assert
      expect(result.in_progress[0].progress_percentage).toBe(50);
    });

    it('should cap progress percentage at 100', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        name: 'Savings',
        description: 'Save 1M stroops',
        threshold: 1000000,
        is_active: true,
        rarity_tier: 1,
        is_soulbound: false,
      };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.find.mockResolvedValue([]);
      milestoneEvaluatorService.getProgress.mockResolvedValue(2000000); // 200% progress

      // Act
      const result = await service.getUserMilestoneProgress(userId);

      // Assert
      expect(result.completed[0].progress_percentage).toBeLessThanOrEqual(100);
    });

    it('should sort milestones by threshold', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestones = [
        {
          id: 'milestone-1',
          milestone_type: MilestoneType.SAVINGS_AMOUNT,
          name: 'High',
          threshold: 10000000,
          is_active: true,
          rarity_tier: 5,
          is_soulbound: false,
        },
        {
          id: 'milestone-2',
          milestone_type: MilestoneType.GOALS_REACHED,
          name: 'Low',
          threshold: 100,
          is_active: true,
          rarity_tier: 1,
          is_soulbound: false,
        },
      ];

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue(milestones);
      rewardRepository.find.mockResolvedValue([]);
      milestoneEvaluatorService.getProgress.mockResolvedValue(0);

      // Act
      const result = await service.getUserMilestoneProgress(userId);

      // Assert
      expect(milestoneRepository.find).toHaveBeenCalledWith({
        where: { is_active: true },
        order: { threshold: 'ASC' },
      });
    });
  });

  describe('getReward', () => {
    it('should return reward with milestone details', async () => {
      // Arrange
      const rewardId = 'reward-1';
      const reward = {
        id: rewardId,
        milestone: { id: 'milestone-1', name: 'Savings Master' },
      };

      rewardRepository.findOne.mockResolvedValue(reward);

      // Act
      const result = await service.getReward(rewardId);

      // Assert
      expect(result).toEqual(reward);
      expect(rewardRepository.findOne).toHaveBeenCalledWith({
        where: { id: rewardId },
        relations: ['milestone'],
      });
    });

    it('should throw when reward does not exist', async () => {
      // Arrange
      const rewardId = 'non-existent';
      rewardRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getReward(rewardId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserRewards', () => {
    it('should return user rewards ordered by date', async () => {
      // Arrange
      const userId = 'user-123';
      const rewards = [
        { id: 'reward-1', earned_at: new Date('2024-01-15') },
        { id: 'reward-2', earned_at: new Date('2024-01-10') },
      ];

      rewardRepository.find.mockResolvedValue(rewards);

      // Act
      const result = await service.getUserRewards(userId);

      // Assert
      expect(result).toEqual(rewards);
      expect(rewardRepository.find).toHaveBeenCalledWith({
        where: { user_id: userId },
        relations: ['milestone'],
        order: { earned_at: 'DESC' },
      });
    });

    it('should return empty array when user has no rewards', async () => {
      // Arrange
      const userId = 'user-no-rewards';
      rewardRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.getUserRewards(userId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle multiple rewards for one user', async () => {
      // Arrange
      const userId = 'user-123';
      const rewards = Array(10).fill(null).map((_, i) => ({
        id: `reward-${i}`,
        user_id: userId,
        earned_at: new Date(2024, 0, 15 - i),
      }));

      rewardRepository.find.mockResolvedValue(rewards);

      // Act
      const result = await service.getUserRewards(userId);

      // Assert
      expect(result.length).toBe(10);
    });
  });

  describe('updateRewardStatus', () => {
    it('should update reward status', async () => {
      // Arrange
      const rewardId = 'reward-1';
      const reward = {
        id: rewardId,
        status: NftRewardStatus.MINTED,
        milestone: { is_soulbound: false },
      };

      rewardRepository.findOne.mockResolvedValue(reward);
      rewardRepository.save.mockResolvedValue({
        ...reward,
        status: NftRewardStatus.TRANSFERRED,
        transferred_at: expect.any(Date),
      });

      // Act
      const result = await service.updateRewardStatus(rewardId, NftRewardStatus.TRANSFERRED);

      // Assert
      expect(result.status).toBe(NftRewardStatus.TRANSFERRED);
      expect(result.transferred_at).toBeDefined();
    });

    it('should throw when attempting to transfer soulbound NFT', async () => {
      // Arrange
      const rewardId = 'reward-1';
      const reward = {
        id: rewardId,
        status: NftRewardStatus.MINTED,
        milestone: { is_soulbound: true },
      };

      rewardRepository.findOne.mockResolvedValue(reward);

      // Act & Assert
      await expect(
        service.updateRewardStatus(rewardId, NftRewardStatus.TRANSFERRED)
      ).rejects.toThrow('Cannot transfer soulbound NFT');
    });

    it('should throw when reward does not exist', async () => {
      // Arrange
      rewardRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateRewardStatus('non-existent', NftRewardStatus.TRANSFERRED)
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow status change without transfer for soulbound', async () => {
      // Arrange
      const rewardId = 'reward-1';
      const reward = {
        id: rewardId,
        status: NftRewardStatus.MINTED,
        milestone: { is_soulbound: true },
      };

      rewardRepository.findOne.mockResolvedValue(reward);
      rewardRepository.save.mockResolvedValue({
        ...reward,
        status: NftRewardStatus.CLAIMED,
      });

      // Act
      const result = await service.updateRewardStatus(rewardId, NftRewardStatus.CLAIMED);

      // Assert
      expect(result.status).toBe(NftRewardStatus.CLAIMED);
    });

    it('should set transferred_at timestamp when transferring', async () => {
      // Arrange
      const rewardId = 'reward-1';
      const before = new Date();

      const reward = {
        id: rewardId,
        status: NftRewardStatus.MINTED,
        milestone: { is_soulbound: false },
      };

      rewardRepository.findOne.mockResolvedValue(reward);
      const savedReward = {
        ...reward,
        status: NftRewardStatus.TRANSFERRED,
        transferred_at: new Date(),
      };
      rewardRepository.save.mockResolvedValue(savedReward);

      // Act
      const result = await service.updateRewardStatus(rewardId, NftRewardStatus.TRANSFERRED);

      // Assert
      const after = new Date();
      expect(result.transferred_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.transferred_at.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('reward creation and metadata generation', () => {
    it('should generate metadata for new rewards', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        threshold: 1000000,
        is_active: true,
        nft_title: 'Savings Master',
        image_ipfs_cid: 'QmTest123',
        rarity_tier: 2,
        is_soulbound: false,
      };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.findOne.mockResolvedValue(null);
      milestoneEvaluatorService.getProgress.mockResolvedValue(1500000);
      nftMetadataService.generateAndPinMetadata.mockResolvedValue({ cid: 'QmMetadata123' });
      rewardRepository.create.mockReturnValue({
        status: NftRewardStatus.EARNED,
      });
      rewardRepository.save.mockResolvedValue({
        status: NftRewardStatus.MINTED,
        metadata_ipfs_cid: 'QmMetadata123',
      });

      // Act
      await service.evaluateAndMintRewards(userId);

      // Assert
      expect(nftMetadataService.generateAndPinMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          user_address: user.stellar_address,
          milestone_name: milestone.nft_title,
          milestone_type: milestone.milestone_type,
          image_ipfs_cid: milestone.image_ipfs_cid,
          earned_date: expect.any(Date),
          rarity_tier: milestone.rarity_tier,
          is_soulbound: milestone.is_soulbound,
        })
      );
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle service errors gracefully', async () => {
      // Arrange
      const userId = 'user-123';
      userRepository.findOne.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.evaluateAndMintRewards(userId)).rejects.toThrow('Database error');
    });

    it('should handle milestone evaluator failures', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        threshold: 1000000,
        is_active: true,
      };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.findOne.mockResolvedValue(null);
      milestoneEvaluatorService.getProgress.mockRejectedValue(
        new Error('Evaluation failed')
      );

      // Act & Assert
      await expect(service.evaluateAndMintRewards(userId)).rejects.toThrow('Evaluation failed');
    });

    it('should handle metadata generation failures', async () => {
      // Arrange
      const userId = 'user-123';
      const user = { id: userId, stellar_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ' };

      const milestone = {
        id: 'milestone-1',
        milestone_type: MilestoneType.SAVINGS_AMOUNT,
        threshold: 1000000,
        is_active: true,
        nft_title: 'Test',
      };

      userRepository.findOne.mockResolvedValue(user);
      milestoneRepository.find.mockResolvedValue([milestone]);
      rewardRepository.findOne.mockResolvedValue(null);
      milestoneEvaluatorService.getProgress.mockResolvedValue(1500000);
      nftMetadataService.generateAndPinMetadata.mockRejectedValue(
        new Error('IPFS pin failed')
      );

      // Act & Assert
      await expect(service.evaluateAndMintRewards(userId)).rejects.toThrow('IPFS pin failed');
    });
  });
});
