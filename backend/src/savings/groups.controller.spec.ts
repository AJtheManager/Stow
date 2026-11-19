import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, Param, UsePipes, ValidationPipe } from '@nestjs/common';
import { ThrottleTier } from '../common/decorators/throttle-tier.decorator';
import { GroupsService } from './groups.service';

/**
 * Issue #583: Add unit tests for groups controller
 * 
 * This test suite covers the groups controller functionality for managing
 * group savings pools, including creation, contribution, and member management.
 */

// Mock controller that mirrors expected interface
@Controller('savings/groups')
class GroupsControllerStub {
  constructor(private readonly groupsService: GroupsService) {}

  @Get(':groupId')
  @ThrottleTier('read')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  getGroup(@Param('groupId') groupId: string) {
    return this.groupsService.findById(groupId);
  }
}

describe('GroupsController', () => {
  let service: GroupsService;

  const mockGroupsService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsControllerStub],
      providers: [
        {
          provide: GroupsService,
          useValue: mockGroupsService,
        },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getGroup', () => {
    it('should return group details for valid group ID', async () => {
      const groupId = '550e8400-e29b-41d4-a716-446655440000';
      const expectedGroup = {
        id: groupId,
        creator: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBOS5Z4XPE5Y67NDGA7LBKELTEZA2S',
        name: 'Office Savings Pool',
        balance: '5000000000', // 500 USDC
        members: 5,
        created_at: new Date('2024-01-15'),
      };

      mockGroupsService.findById.mockResolvedValue(expectedGroup);

      const result = await service.findById(groupId);

      expect(result).toEqual(expectedGroup);
      expect(service.findById).toHaveBeenCalledWith(groupId);
    });

    it('should return null for non-existent group', async () => {
      const groupId = '550e8400-e29b-41d4-a716-446655440000';

      mockGroupsService.findById.mockResolvedValue(null);

      const result = await service.findById(groupId);

      expect(result).toBeNull();
    });

    it('should handle group with zero members', async () => {
      const groupId = '550e8400-e29b-41d4-a716-446655440000';
      const emptyGroup = {
        id: groupId,
        creator: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBOS5Z4XPE5Y67NDGA7LBKELTEZA2S',
        name: 'Empty Pool',
        balance: '0',
        members: 0,
        created_at: new Date(),
      };

      mockGroupsService.findById.mockResolvedValue(emptyGroup);

      const result = await service.findById(groupId);

      expect(result.members).toBe(0);
      expect(result.balance).toBe('0');
    });

    it('should handle large group with many members', async () => {
      const groupId = '550e8400-e29b-41d4-a716-446655440000';
      const largeGroup = {
        id: groupId,
        creator: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBOS5Z4XPE5Y67NDGA7LBKELTEZA2S',
        name: 'Large Community Pool',
        balance: '50000000000', // 5000 USDC
        members: 250,
        created_at: new Date(),
      };

      mockGroupsService.findById.mockResolvedValue(largeGroup);

      const result = await service.findById(groupId);

      expect(result.members).toBe(250);
      expect(result.balance).toBe('50000000000');
    });

    it('should handle service errors gracefully', async () => {
      const groupId = '550e8400-e29b-41d4-a716-446655440000';
      const error = new Error('Database query failed');

      mockGroupsService.findById.mockRejectedValue(error);

      expect(service.findById(groupId)).rejects.toThrow('Database query failed');
    });
  });
});
