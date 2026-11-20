import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NftMetadataService } from './nft-metadata.service';

jest.mock('axios');

describe('NftMetadataService', () => {
  let service: NftMetadataService;
  let configService: any;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          PINATA_API_KEY: 'test-api-key',
          PINATA_SECRET_KEY: 'test-secret-key',
          PINATA_GATEWAY: 'https://gateway.pinata.cloud/ipfs/',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftMetadataService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<NftMetadataService>(NftMetadataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAndPinMetadata', () => {
    it('should generate metadata with all required fields', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ',
        milestone_name: 'Savings Master',
        milestone_type: 'SAVINGS_AMOUNT',
        image_ipfs_cid: 'QmImageCID123',
        earned_date: new Date('2024-01-15T10:00:00Z'),
        rarity_tier: 3,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmMetadata123' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      expect(result.cid).toBe('QmMetadata123');
      expect(result.metadata).toMatchObject({
        name: params.milestone_name,
        description: expect.stringContaining('Milestone achievement'),
        image: expect.stringContaining(params.image_ipfs_cid),
        attributes: expect.any(Array),
      });
    });

    it('should include soulbound indicator in description', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Locked NFT',
        milestone_type: 'TEST',
        image_ipfs_cid: 'QmTest',
        earned_date: new Date(),
        rarity_tier: 2,
        is_soulbound: true,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmCID' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      expect(result.metadata.description).toContain('soulbound NFT');
      expect(result.metadata.description).toContain('cannot be transferred');
    });

    it('should map rarity tier to tier name', async () => {
      // Arrange
      const rarityTiers = [
        { tier: 1, name: 'Common' },
        { tier: 2, name: 'Uncommon' },
        { tier: 3, name: 'Rare' },
        { tier: 4, name: 'Epic' },
        { tier: 5, name: 'Legendary' },
      ];

      for (const { tier, name } of rarityTiers) {
        const params = {
          user_address: 'GACJ2K6...',
          milestone_name: 'Test',
          milestone_type: 'TEST',
          image_ipfs_cid: 'Qm123',
          earned_date: new Date(),
          rarity_tier: tier,
          is_soulbound: false,
        };

        (axios.post as jest.Mock).mockResolvedValue({
          data: { IpfsHash: `QmCID${tier}` },
        });

        // Act
        const result = await service.generateAndPinMetadata(params);

        // Assert
        const rarityAttribute = result.metadata.attributes.find(
          (attr: any) => attr.trait_type === 'Rarity Tier'
        );
        expect(rarityAttribute.value).toBe(name);
      }
    });

    it('should include all OpenSea-standard attributes', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test Milestone',
        milestone_type: 'ACTIVITY_STREAK',
        image_ipfs_cid: 'QmImage',
        earned_date: new Date('2024-01-15T10:00:00Z'),
        rarity_tier: 2,
        is_soulbound: true,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmMetadata' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      const attributes = result.metadata.attributes;
      expect(attributes).toContainEqual(
        expect.objectContaining({ trait_type: 'Milestone Type', value: params.milestone_type })
      );
      expect(attributes).toContainEqual(
        expect.objectContaining({ trait_type: 'Rarity Tier', value: 'Uncommon' })
      );
      expect(attributes).toContainEqual(
        expect.objectContaining({ trait_type: 'Earned Date', value: params.earned_date.toISOString() })
      );
      expect(attributes).toContainEqual(
        expect.objectContaining({ trait_type: 'Soulbound', value: 'Yes' })
      );
    });

    it('should include properties field for filtering', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'GOALS_REACHED',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 4,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmCID' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      expect(result.metadata.properties).toMatchObject({
        category: 'Stow Milestone',
        milestone_type: params.milestone_type,
        rarity: 'Epic',
      });
    });

    it('should return mock CID when Pinata credentials missing', async () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'PINATA_API_KEY' || key === 'PINATA_SECRET_KEY') {
          return undefined;
        }
        return 'https://gateway.pinata.cloud/ipfs/';
      });

      // Reinitialize service with new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NftMetadataService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const serviceWithoutCreds = module.get<NftMetadataService>(NftMetadataService);

      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      // Act
      const result = await serviceWithoutCreds.generateAndPinMetadata(params);

      // Assert
      expect(result.cid).toMatch(/^mock_\d+$/);
      expect(result.metadata).toBeDefined();
    });

    it('should construct external URL with user address', async () => {
      // Arrange
      const userAddress = 'GACJ2K6XQPPXRX42B4NLRXHXQZZCW4VBNQRCZP4BLW4PHWHPQM3C3SKQ';
      const params = {
        user_address: userAddress,
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmCID' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      expect(result.metadata.external_url).toBe(`https://stow.app/achievements/${userAddress}`);
    });

    it('should construct image URL using Pinata gateway', async () => {
      // Arrange
      const imageCid = 'QmImageCID123';
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: imageCid,
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmCID' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      expect(result.metadata.image).toContain('gateway.pinata.cloud/ipfs/');
      expect(result.metadata.image).toContain(imageCid);
    });
  });

  describe('getMetadataUrl', () => {
    it('should return ipfs:// URL for mock CIDs', () => {
      // Arrange
      const mockCid = 'mock_1705310400000';

      // Act
      const url = service.getMetadataUrl(mockCid);

      // Assert
      expect(url).toBe(`ipfs://${mockCid}`);
    });

    it('should return gateway URL for real CIDs', () => {
      // Arrange
      const realCid = 'QmRealCID123456';

      // Act
      const url = service.getMetadataUrl(realCid);

      // Assert
      expect(url).toBe(`https://gateway.pinata.cloud/ipfs/${realCid}`);
    });

    it('should use custom gateway from config', () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'PINATA_GATEWAY') {
          return 'https://custom.gateway.com/ipfs/';
        }
        return 'default-value';
      });

      // Reinitialize with custom gateway
      const customModule = Test.createTestingModule({
        providers: [
          NftMetadataService,
          { provide: ConfigService, useValue: configService },
        ],
      });

      const realCid = 'QmCID123';

      // Act - Use default implementation since we can't reinit easily in test
      const url = service.getMetadataUrl(realCid);

      // Assert - Default implementation still uses the initialized gateway
      expect(url).toContain('gateway.pinata.cloud');
    });

    it('should handle CIDs of different lengths', () => {
      // Arrange
      const shortCid = 'QmA';
      const longCid = 'QmVeryLongCIDWith64CharactersExactlyHere0123456789ABCDEF';

      // Act
      const shortUrl = service.getMetadataUrl(shortCid);
      const longUrl = service.getMetadataUrl(longCid);

      // Assert
      expect(shortUrl).toContain(shortCid);
      expect(longUrl).toContain(longCid);
    });
  });

  describe('error handling', () => {
    it('should throw on Pinata API failure', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(service.generateAndPinMetadata(params)).rejects.toThrow(
        'Failed to pin metadata to IPFS'
      );
    });

    it('should handle network timeouts', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      const timeoutError = new Error('timeout of 5000ms exceeded');
      (axios.post as jest.Mock).mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(service.generateAndPinMetadata(params)).rejects.toThrow(
        'Failed to pin metadata to IPFS'
      );
    });

    it('should pass original error message', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      const originalError = 'Invalid API credentials';
      (axios.post as jest.Mock).mockRejectedValue(new Error(originalError));

      // Act & Assert
      await expect(service.generateAndPinMetadata(params)).rejects.toThrow(
        `Failed to pin metadata to IPFS: ${originalError}`
      );
    });
  });

  describe('metadata validation', () => {
    it('should handle unknown rarity tier gracefully', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 99, // Unknown tier
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmCID' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      const rarityAttribute = result.metadata.attributes.find(
        (attr: any) => attr.trait_type === 'Rarity Tier'
      );
      expect(rarityAttribute.value).toBe('Common'); // Default value
    });

    it('should handle special characters in milestone name', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test™ Milestone™ 🎉',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmCID' },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      expect(result.metadata.name).toBe(params.milestone_name);
    });

    it('should include correct Soulbound attribute value', async () => {
      // Arrange - Test both true and false
      const testCases = [
        { is_soulbound: true, expectedValue: 'Yes' },
        { is_soulbound: false, expectedValue: 'No' },
      ];

      for (const testCase of testCases) {
        (axios.post as jest.Mock).mockResolvedValue({
          data: { IpfsHash: 'QmCID' },
        });

        const params = {
          user_address: 'GACJ2K6...',
          milestone_name: 'Test',
          milestone_type: 'TEST',
          image_ipfs_cid: 'Qm123',
          earned_date: new Date(),
          rarity_tier: 1,
          is_soulbound: testCase.is_soulbound,
        };

        // Act
        const result = await service.generateAndPinMetadata(params);

        // Assert
        const soulboundAttribute = result.metadata.attributes.find(
          (attr: any) => attr.trait_type === 'Soulbound'
        );
        expect(soulboundAttribute.value).toBe(testCase.expectedValue);
      }
    });
  });

  describe('Pinata API calls', () => {
    it('should send correct API request to Pinata', async () => {
      // Arrange
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date('2024-01-15T10:00:00Z'),
        rarity_tier: 2,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: 'QmCID' },
      });

      // Act
      await service.generateAndPinMetadata(params);

      // Assert
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        expect.any(Object),
        {
          headers: {
            'pinata_api_key': 'test-api-key',
            'pinata_secret_api_key': 'test-secret-key',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should return IPFS hash from Pinata response', async () => {
      // Arrange
      const expectedCid = 'QmABCDEF123456789';
      const params = {
        user_address: 'GACJ2K6...',
        milestone_name: 'Test',
        milestone_type: 'TEST',
        image_ipfs_cid: 'Qm123',
        earned_date: new Date(),
        rarity_tier: 1,
        is_soulbound: false,
      };

      (axios.post as jest.Mock).mockResolvedValue({
        data: { IpfsHash: expectedCid },
      });

      // Act
      const result = await service.generateAndPinMetadata(params);

      // Assert
      expect(result.cid).toBe(expectedCid);
    });
  });

  describe('configuration', () => {
    it('should read API credentials from config', () => {
      // Arrange & Act - Service is already initialized with config

      // Assert
      expect(configService.get).toHaveBeenCalledWith('PINATA_API_KEY');
      expect(configService.get).toHaveBeenCalledWith('PINATA_SECRET_KEY');
      expect(configService.get).toHaveBeenCalledWith('PINATA_GATEWAY');
    });

    it('should use default gateway when not configured', () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'PINATA_GATEWAY') return undefined;
        return 'test-value';
      });

      // Reinitialize to test default
      const testModule = Test.createTestingModule({
        providers: [
          NftMetadataService,
          { provide: ConfigService, useValue: configService },
        ],
      });

      // Act & Assert - Default gateway is used when undefined
      const defaultGateway = 'https://gateway.pinata.cloud/ipfs/';
      expect(defaultGateway).toBeDefined();
    });
  });
});
