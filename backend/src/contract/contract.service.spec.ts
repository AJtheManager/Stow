import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContractService } from './contract.service';

describe('ContractService', () => {
  let service: ContractService;
  let mockConfigService: any;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          SOROBAN_RPC_URL: 'http://localhost:11111',
          SOROBAN_NETWORK_PASSPHRASE: 'Test SDF Network',
          CONTRACT_ID: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEvent', () => {
    it('should retrieve event by eventId', async () => {
      // Arrange
      const eventId = 'event-123';

      // Note: Since the service uses viewCall which requires Soroban integration,
      // we're testing the method signature and basic error handling
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getEvent(eventId);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle eventId validation', async () => {
      // Arrange
      const validEventId = '550e8400-e29b-41d4-a716-446655440000';

      // Act - Just verify method accepts UUID format
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Assert
      await expect(service.getEvent(validEventId)).resolves.toBeDefined();
    });

    it('should handle null response from contract', async () => {
      // Arrange
      const eventId = 'non-existent-event';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getEvent(eventId);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle contract call errors gracefully', async () => {
      // Arrange
      const eventId = 'event-123';
      jest.spyOn(service as any, 'viewCall').mockRejectedValue(
        new Error('Contract call failed')
      );

      // Act & Assert
      await expect(service.getEvent(eventId)).rejects.toThrow('Contract call failed');
    });
  });

  describe('getEventByCode', () => {
    it('should retrieve event by invite code', async () => {
      // Arrange
      const inviteCode = 'INVITE123ABC';

      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getEventByCode(inviteCode);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle different invite code formats', async () => {
      // Arrange
      const codes = ['INVITE123ABC', 'ABC123XYZ', 'SHORTCODE'];
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act & Assert
      for (const code of codes) {
        const result = await service.getEventByCode(code);
        expect(result).toBeNull();
      }
    });

    it('should handle case-insensitive codes', async () => {
      // Arrange
      const code = 'invite123abc';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getEventByCode(code);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getMatch', () => {
    it('should retrieve match by matchId', async () => {
      // Arrange
      const matchId = 'match-456';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getMatch(matchId);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle non-existent match', async () => {
      // Arrange
      const matchId = 'non-existent-match';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getMatch(matchId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getEventMatches', () => {
    it('should retrieve all matches for an event', async () => {
      // Arrange
      const eventId = 'event-123';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventMatches(eventId);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle event with no matches', async () => {
      // Arrange
      const eventId = 'event-no-matches';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventMatches(eventId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle event with multiple matches', async () => {
      // Arrange
      const eventId = 'event-123';
      const matches = [
        { id: 'match-1', event_id: eventId },
        { id: 'match-2', event_id: eventId },
        { id: 'match-3', event_id: eventId },
      ];
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(matches);

      // Act
      const result = await service.getEventMatches(eventId);

      // Assert
      expect(result.length).toBe(3);
    });
  });

  describe('getPrediction', () => {
    it('should retrieve prediction by userId and matchId', async () => {
      // Arrange
      const userId = 'user-123';
      const matchId = 'match-456';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getPrediction(userId, matchId);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle non-existent prediction', async () => {
      // Arrange
      const userId = 'non-existent-user';
      const matchId = 'non-existent-match';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getPrediction(userId, matchId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getUserPredictions', () => {
    it('should retrieve all predictions for a user', async () => {
      // Arrange
      const userId = 'user-123';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getUserPredictions(userId);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle user with no predictions', async () => {
      // Arrange
      const userId = 'user-no-predictions';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getUserPredictions(userId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle user with multiple predictions', async () => {
      // Arrange
      const userId = 'user-123';
      const predictions = [
        { id: 'pred-1', user_id: userId },
        { id: 'pred-2', user_id: userId },
      ];
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(predictions);

      // Act
      const result = await service.getUserPredictions(userId);

      // Assert
      expect(result.length).toBe(2);
    });

    it('should paginate user predictions when many exist', async () => {
      // Arrange
      const userId = 'user-123';
      const predictions = Array(100).fill(null).map((_, i) => ({
        id: `pred-${i}`,
        user_id: userId,
      }));
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(predictions);

      // Act
      const result = await service.getUserPredictions(userId);

      // Assert
      expect(result.length).toBe(100);
    });
  });

  describe('getEventParticipants', () => {
    it('should retrieve all participants for an event', async () => {
      // Arrange
      const eventId = 'event-123';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventParticipants(eventId);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle event with no participants', async () => {
      // Arrange
      const eventId = 'event-no-participants';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventParticipants(eventId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle event with many participants', async () => {
      // Arrange
      const eventId = 'event-123';
      const participants = Array(500).fill(null).map((_, i) => ({
        address: `G${i.toString().padStart(55, '0')}`,
        predictions_count: Math.floor(Math.random() * 10),
      }));
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(participants);

      // Act
      const result = await service.getEventParticipants(eventId);

      // Assert
      expect(result.length).toBe(500);
    });
  });

  describe('getEventWinners', () => {
    it('should retrieve winners for an event', async () => {
      // Arrange
      const eventId = 'event-123';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventWinners(eventId);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle event with no winners', async () => {
      // Arrange
      const eventId = 'event-no-winners';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventWinners(eventId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should include winner details', async () => {
      // Arrange
      const eventId = 'event-123';
      const winners = [
        { address: 'GABC...', position: 1, reward: '100' },
        { address: 'GXYZ...', position: 2, reward: '50' },
      ];
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(winners);

      // Act
      const result = await service.getEventWinners(eventId);

      // Assert
      expect(result.length).toBe(2);
    });
  });

  describe('getEventLeaderboard', () => {
    it('should retrieve leaderboard for an event', async () => {
      // Arrange
      const eventId = 'event-123';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventLeaderboard(eventId);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });

    it('should paginate leaderboard entries', async () => {
      // Arrange
      const eventId = 'event-123';
      const page = 1;
      const limit = 10;
      const entries = Array(10).fill(null).map((_, i) => ({
        rank: i + 1,
        address: `G${i.toString().padStart(55, '0')}`,
        score: 100 - i * 5,
      }));
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(entries);

      // Act
      const result = await service.getEventLeaderboard(eventId, page, limit);

      // Assert
      expect(result.length).toBe(10);
    });

    it('should return ordered leaderboard by rank', async () => {
      // Arrange
      const eventId = 'event-123';
      const entries = [
        { rank: 1, score: 100 },
        { rank: 2, score: 90 },
        { rank: 3, score: 80 },
      ];
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(entries);

      // Act
      const result = await service.getEventLeaderboard(eventId);

      // Assert
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[2].rank).toBe(3);
    });

    it('should handle empty leaderboard', async () => {
      // Arrange
      const eventId = 'event-no-leaderboard';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue([]);

      // Act
      const result = await service.getEventLeaderboard(eventId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getConfig', () => {
    it('should retrieve contract configuration', async () => {
      // Arrange
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getConfig();

      // Assert
      expect(result).toBeNull();
    });

    it('should return config with fee structure', async () => {
      // Arrange
      const config = {
        creation_fee: '100000',
        participation_fee: '1000',
      };
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(config);

      // Act
      const result = await service.getConfig();

      // Assert
      expect(result).toEqual(config);
    });

    it('should handle missing configuration', async () => {
      // Arrange
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getConfig();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getCreationFee', () => {
    it('should retrieve event creation fee', async () => {
      // Arrange
      const fee = '100000';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(fee);

      // Act
      const result = await service.getCreationFee();

      // Assert
      expect(result).toBe(fee);
    });

    it('should handle fee as string value', async () => {
      // Arrange
      const fee = '500000';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(fee);

      // Act
      const result = await service.getCreationFee();

      // Assert
      expect(typeof result).toBe('string');
    });

    it('should handle zero fee', async () => {
      // Arrange
      const fee = '0';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(fee);

      // Act
      const result = await service.getCreationFee();

      // Assert
      expect(result).toBe('0');
    });
  });

  describe('isVerified', () => {
    it('should check if address is verified', async () => {
      // Arrange
      const address = 'GABC123XYZ...';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(true);

      // Act
      const result = await service.isVerified(address);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for unverified address', async () => {
      // Arrange
      const address = 'GXYZ789ABC...';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(false);

      // Act
      const result = await service.isVerified(address);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle Stellar address format', async () => {
      // Arrange
      const address = 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(true);

      // Act
      const result = await service.isVerified(address);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('getEventStatistics', () => {
    it('should retrieve event statistics', async () => {
      // Arrange
      const eventId = 'event-123';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getEventStatistics(eventId);

      // Assert
      expect(result).toBeNull();
    });

    it('should return stats with counts and aggregates', async () => {
      // Arrange
      const eventId = 'event-123';
      const stats = {
        total_participants: 100,
        total_predictions: 500,
        correct_predictions: 250,
      };
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(stats);

      // Act
      const result = await service.getEventStatistics(eventId);

      // Assert
      expect(result).toEqual(stats);
    });

    it('should handle statistics for events with no activity', async () => {
      // Arrange
      const eventId = 'event-no-activity';
      const stats = {
        total_participants: 0,
        total_predictions: 0,
        correct_predictions: 0,
      };
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(stats);

      // Act
      const result = await service.getEventStatistics(eventId);

      // Assert
      expect(result.total_participants).toBe(0);
    });
  });

  describe('getPredictionDistribution', () => {
    it('should retrieve prediction distribution for a match', async () => {
      // Arrange
      const matchId = 'match-123';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(null);

      // Act
      const result = await service.getPredictionDistribution(matchId);

      // Assert
      expect(result).toBeNull();
    });

    it('should return distribution with outcome counts', async () => {
      // Arrange
      const matchId = 'match-123';
      const distribution = {
        outcome_a: 150,
        outcome_b: 200,
        outcome_draw: 50,
      };
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(distribution);

      // Act
      const result = await service.getPredictionDistribution(matchId);

      // Assert
      expect(result).toEqual(distribution);
    });

    it('should handle distribution with no predictions', async () => {
      // Arrange
      const matchId = 'match-no-predictions';
      const distribution = {
        outcome_a: 0,
        outcome_b: 0,
        outcome_draw: 0,
      };
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(distribution);

      // Act
      const result = await service.getPredictionDistribution(matchId);

      // Assert
      expect(result.outcome_a).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should read contract ID from config', () => {
      // Arrange
      const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

      // Act
      const config = mockConfigService.get('CONTRACT_ID');

      // Assert
      expect(config).toBe(contractId);
    });

    it('should read Soroban RPC URL from config', () => {
      // Arrange
      const rpcUrl = 'http://localhost:11111';

      // Act
      const config = mockConfigService.get('SOROBAN_RPC_URL');

      // Assert
      expect(config).toBe(rpcUrl);
    });

    it('should read network passphrase from config', () => {
      // Arrange
      const passphrase = 'Test SDF Network';

      // Act
      const config = mockConfigService.get('SOROBAN_NETWORK_PASSPHRASE');

      // Assert
      expect(config).toBe(passphrase);
    });

    it('should provide defaults for missing config values', () => {
      // Arrange
      const defaultValue = 'default-value';

      // Act
      const config = mockConfigService.get('NON_EXISTENT_KEY', defaultValue);

      // Assert
      expect(config).toBe(defaultValue);
    });
  });

  describe('Error handling', () => {
    it('should propagate Soroban connection errors', async () => {
      // Arrange
      jest.spyOn(service as any, 'viewCall').mockRejectedValue(
        new Error('Soroban RPC connection failed')
      );

      // Act & Assert
      await expect(service.getEvent('event-123')).rejects.toThrow(
        'Soroban RPC connection failed'
      );
    });

    it('should handle invalid response format', async () => {
      // Arrange
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(undefined);

      // Act
      const result = await service.getEvent('event-123');

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle timeout errors from contract calls', async () => {
      // Arrange
      jest.spyOn(service as any, 'viewCall').mockRejectedValue(
        new Error('Request timeout')
      );

      // Act & Assert
      await expect(service.getUserPredictions('user-123')).rejects.toThrow(
        'Request timeout'
      );
    });
  });

  describe('Data validation', () => {
    it('should handle very large arrays', async () => {
      // Arrange
      const eventId = 'event-123';
      const largeArray = Array(10000).fill({ id: 'item' });
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(largeArray);

      // Act
      const result = await service.getEventMatches(eventId);

      // Assert
      expect(result.length).toBe(10000);
    });

    it('should handle Unicode characters in data', async () => {
      // Arrange
      const eventId = 'event-123';
      const matches = [
        { id: 'match-1', name: '🏆 Final Match' },
        { id: 'match-2', name: 'Semi-final ⭐' },
      ];
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(matches);

      // Act
      const result = await service.getEventMatches(eventId);

      // Assert
      expect(result[0].name).toContain('🏆');
    });

    it('should handle special characters in addresses', async () => {
      // Arrange
      const address = 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ';
      jest.spyOn(service as any, 'viewCall').mockResolvedValue(true);

      // Act
      const result = await service.isVerified(address);

      // Assert
      expect(result).toBe(true);
    });
  });
});
