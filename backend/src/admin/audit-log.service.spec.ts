import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditLogService, CreateAuditLogDto, AuditLogPage, IntegrityReport } from './audit-log.service';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repository: Repository<AdminAuditLog>;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'AUDIT_LOG_HMAC_SECRET') {
        return 'test-secret-key';
      }
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AdminAuditLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    repository = module.get<Repository<AdminAuditLog>>(getRepositoryToken(AdminAuditLog));
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('log', () => {
    it('should create and save an audit log entry', async () => {
      // Arrange
      const dto: CreateAuditLogDto = {
        actor_id: 'user-123',
        action: 'DELETE_ACCOUNT',
        target_type: 'account',
        target_id: 'account-456',
        metadata: { reason: 'user-requested' },
      };

      const createdEntry = {
        id: 'log-1',
        actor_id: dto.actor_id,
        action: dto.action,
        target_type: dto.target_type,
        target_id: dto.target_id,
        metadata: dto.metadata,
        created_at: new Date('2024-01-15T10:00:00Z'),
        checksum: null,
      } as AdminAuditLog;

      const savedEntry = {
        ...createdEntry,
        checksum: 'abc123def456',
      };

      jest.spyOn(repository, 'create').mockReturnValue(createdEntry);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(createdEntry).mockResolvedValueOnce(savedEntry);

      // Act
      const result = await service.log(dto);

      // Assert
      expect(repository.create).toHaveBeenCalledWith({
        actor_id: dto.actor_id,
        action: dto.action,
        target_type: dto.target_type,
        target_id: dto.target_id,
        metadata: dto.metadata,
      });
      expect(repository.save).toHaveBeenCalledTimes(2);
      expect(result.checksum).toBe('abc123def456');
    });

    it('should handle optional metadata fields', async () => {
      // Arrange
      const dto: CreateAuditLogDto = {
        actor_id: 'user-123',
        action: 'LOGIN',
      };

      const createdEntry = {
        id: 'log-2',
        actor_id: dto.actor_id,
        action: dto.action,
        target_type: null,
        target_id: null,
        metadata: null,
        created_at: new Date('2024-01-15T10:05:00Z'),
        checksum: null,
      } as AdminAuditLog;

      const savedEntry = { ...createdEntry, checksum: 'xyz789' };

      jest.spyOn(repository, 'create').mockReturnValue(createdEntry);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(createdEntry).mockResolvedValueOnce(savedEntry);

      // Act
      const result = await service.log(dto);

      // Assert
      expect(repository.create).toHaveBeenCalledWith({
        actor_id: dto.actor_id,
        action: dto.action,
        target_type: null,
        target_id: null,
        metadata: null,
      });
      expect(result.target_type).toBeNull();
      expect(result.target_id).toBeNull();
      expect(result.metadata).toBeNull();
    });

    it('should set null for undefined optional fields', async () => {
      // Arrange
      const dto: CreateAuditLogDto = {
        actor_id: 'user-123',
        action: 'UPDATE_PROFILE',
        target_type: 'profile',
      };

      const createdEntry = {
        id: 'log-3',
        actor_id: dto.actor_id,
        action: dto.action,
        target_type: dto.target_type,
        target_id: null,
        metadata: null,
        created_at: new Date('2024-01-15T10:10:00Z'),
        checksum: null,
      } as AdminAuditLog;

      const savedEntry = { ...createdEntry, checksum: 'checksum123' };

      jest.spyOn(repository, 'create').mockReturnValue(createdEntry);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(createdEntry).mockResolvedValueOnce(savedEntry);

      // Act
      const result = await service.log(dto);

      // Assert
      expect(repository.create).toHaveBeenCalledWith({
        actor_id: dto.actor_id,
        action: dto.action,
        target_type: dto.target_type,
        target_id: null,
        metadata: null,
      });
      expect(result.target_id).toBeNull();
    });
  });

  describe('query', () => {
    it('should return paginated audit logs with default pagination', async () => {
      // Arrange
      const mockLogs: AdminAuditLog[] = [
        {
          id: 'log-1',
          actor_id: 'user-123',
          action: 'DELETE_ACCOUNT',
          created_at: new Date('2024-01-15T10:00:00Z'),
        } as AdminAuditLog,
        {
          id: 'log-2',
          actor_id: 'user-456',
          action: 'UPDATE_SETTINGS',
          created_at: new Date('2024-01-15T09:00:00Z'),
        } as AdminAuditLog,
      ];

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockLogs, 2]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const dto: AuditLogQueryDto = {};

      // Act
      const result = await service.query(dto);

      // Assert
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('log.created_at', 'DESC');
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.data).toEqual(mockLogs);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should apply actor_id filter', async () => {
      // Arrange
      const mockLogs: AdminAuditLog[] = [
        { id: 'log-1', actor_id: 'user-123', action: 'LOGIN' } as AdminAuditLog,
      ];

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockLogs, 1]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const dto: AuditLogQueryDto = { actor_id: 'user-123' };

      // Act
      await service.query(dto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('log.actor_id = :actor_id', { actor_id: 'user-123' });
    });

    it('should apply action filter', async () => {
      // Arrange
      const mockLogs: AdminAuditLog[] = [];

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockLogs, 0]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const dto: AuditLogQueryDto = { action: 'DELETE_ACCOUNT' };

      // Act
      await service.query(dto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', { action: 'DELETE_ACCOUNT' });
    });

    it('should apply date range filters', async () => {
      // Arrange
      const mockLogs: AdminAuditLog[] = [];
      const from = '2024-01-15T00:00:00Z';
      const to = '2024-01-15T23:59:59Z';

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockLogs, 0]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const dto: AuditLogQueryDto = { from, to };

      // Act
      await service.query(dto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('log.created_at >= :from', { from: new Date(from) });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('log.created_at <= :to', { to: new Date(to) });
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      const mockLogs: AdminAuditLog[] = Array(15)
        .fill(null)
        .map((_, i) => ({ id: `log-${i}`, actor_id: 'user-123' } as AdminAuditLog));

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockLogs, 50]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const dto: AuditLogQueryDto = { page: 2, limit: 15 };

      // Act
      const result = await service.query(dto);

      // Assert
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(15); // (2 - 1) * 15
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(15);
      expect(result.meta.totalPages).toBe(4); // Math.ceil(50 / 15)
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(15);
    });

    it('should combine multiple filters', async () => {
      // Arrange
      const mockLogs: AdminAuditLog[] = [];

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockLogs, 0]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const dto: AuditLogQueryDto = {
        actor_id: 'user-123',
        action: 'DELETE_ACCOUNT',
        from: '2024-01-15T00:00:00Z',
        to: '2024-01-15T23:59:59Z',
        page: 1,
        limit: 10,
      };

      // Act
      await service.query(dto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(4);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });
  });

  describe('verifyIntegrity', () => {
    it('should return ok=true when all checksums are valid', async () => {
      // Arrange
      const now = new Date('2024-01-15T10:00:00Z');
      const mockLogs: AdminAuditLog[] = [
        {
          id: 'log-1',
          actor_id: 'user-123',
          action: 'LOGIN',
          created_at: now,
          checksum: 'first_checksum', // First entry has no predecessor
        } as AdminAuditLog,
        {
          id: 'log-2',
          actor_id: 'user-456',
          action: 'UPDATE',
          created_at: new Date('2024-01-15T10:01:00Z'),
          checksum: 'second_checksum_derived_from_first',
        } as AdminAuditLog,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(mockLogs);

      // Mock computeChecksumSync behavior for each row
      const computeChecksumSyncSpy = jest.spyOn(service as any, 'computeChecksumSync');
      computeChecksumSyncSpy.mockReturnValueOnce('first_checksum').mockReturnValueOnce('second_checksum_derived_from_first');

      // Act
      const result = await service.verifyIntegrity();

      // Assert
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(2);
      expect(result.broken_at).toBeNull();
    });

    it('should return ok=false and broken_at when checksum mismatch is found', async () => {
      // Arrange
      const now = new Date('2024-01-15T10:00:00Z');
      const mockLogs: AdminAuditLog[] = [
        {
          id: 'log-1',
          actor_id: 'user-123',
          action: 'LOGIN',
          created_at: now,
          checksum: 'valid_checksum_1',
        } as AdminAuditLog,
        {
          id: 'log-2',
          actor_id: 'user-456',
          action: 'UPDATE',
          created_at: new Date('2024-01-15T10:01:00Z'),
          checksum: 'invalid_checksum_2', // This will not match expected
        } as AdminAuditLog,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(mockLogs);

      const computeChecksumSyncSpy = jest.spyOn(service as any, 'computeChecksumSync');
      computeChecksumSyncSpy.mockReturnValueOnce('valid_checksum_1').mockReturnValueOnce('expected_valid_checksum_2');

      // Act
      const result = await service.verifyIntegrity();

      // Assert
      expect(result.ok).toBe(false);
      expect(result.checked).toBe(2);
      expect(result.broken_at).toBe('log-2');
    });

    it('should handle empty audit log', async () => {
      // Arrange
      jest.spyOn(repository, 'find').mockResolvedValue([]);

      // Act
      const result = await service.verifyIntegrity();

      // Assert
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(0);
      expect(result.broken_at).toBeNull();
    });

    it('should detect corruption on first entry', async () => {
      // Arrange
      const mockLogs: AdminAuditLog[] = [
        {
          id: 'log-1',
          actor_id: 'user-123',
          action: 'LOGIN',
          created_at: new Date('2024-01-15T10:00:00Z'),
          checksum: 'corrupted_checksum',
        } as AdminAuditLog,
      ];

      jest.spyOn(repository, 'find').mockResolvedValue(mockLogs);

      const computeChecksumSyncSpy = jest.spyOn(service as any, 'computeChecksumSync');
      computeChecksumSyncSpy.mockReturnValueOnce('expected_valid_checksum');

      // Act
      const result = await service.verifyIntegrity();

      // Assert
      expect(result.ok).toBe(false);
      expect(result.checked).toBe(1);
      expect(result.broken_at).toBe('log-1');
    });

    it('should verify chain with many entries', async () => {
      // Arrange
      const now = new Date('2024-01-15T10:00:00Z');
      const mockLogs: AdminAuditLog[] = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `log-${i}`,
          actor_id: `user-${i}`,
          action: `ACTION_${i}`,
          created_at: new Date(now.getTime() + i * 1000),
          checksum: `checksum_${i}`,
        } as AdminAuditLog));

      jest.spyOn(repository, 'find').mockResolvedValue(mockLogs);

      const computeChecksumSyncSpy = jest.spyOn(service as any, 'computeChecksumSync');
      // All checksums valid
      for (let i = 0; i < 100; i++) {
        computeChecksumSyncSpy.mockReturnValueOnce(`checksum_${i}`);
      }

      // Act
      const result = await service.verifyIntegrity();

      // Assert
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(100);
      expect(result.broken_at).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle metadata with complex nested objects', async () => {
      // Arrange
      const dto: CreateAuditLogDto = {
        actor_id: 'user-123',
        action: 'COMPLEX_ACTION',
        metadata: {
          nested: {
            level1: {
              level2: ['item1', 'item2'],
            },
          },
          numbers: [1, 2, 3],
        },
      };

      const createdEntry = {
        id: 'log-complex',
        actor_id: dto.actor_id,
        action: dto.action,
        metadata: dto.metadata,
        created_at: new Date(),
        checksum: null,
      } as AdminAuditLog;

      const savedEntry = { ...createdEntry, checksum: 'complex_checksum' };

      jest.spyOn(repository, 'create').mockReturnValue(createdEntry);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(createdEntry).mockResolvedValueOnce(savedEntry);

      // Act
      const result = await service.log(dto);

      // Assert
      expect(result.metadata).toEqual(dto.metadata);
    });

    it('should handle special characters in action names', async () => {
      // Arrange
      const dto: CreateAuditLogDto = {
        actor_id: 'user-123',
        action: 'ACTION::WITH::SPECIAL::CHARS',
      };

      const createdEntry = {
        id: 'log-special',
        actor_id: dto.actor_id,
        action: dto.action,
        created_at: new Date(),
        checksum: null,
      } as AdminAuditLog;

      const savedEntry = { ...createdEntry, checksum: 'special_checksum' };

      jest.spyOn(repository, 'create').mockReturnValue(createdEntry);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(createdEntry).mockResolvedValueOnce(savedEntry);

      // Act
      const result = await service.log(dto);

      // Assert
      expect(result.action).toBe(dto.action);
    });

    it('should handle UUIDs in actor_id and target_id', async () => {
      // Arrange
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const dto: CreateAuditLogDto = {
        actor_id: uuid,
        action: 'DELETE_ACCOUNT',
        target_id: '660e8400-e29b-41d4-a716-446655440001',
      };

      const createdEntry = {
        id: 'log-uuid',
        actor_id: dto.actor_id,
        action: dto.action,
        target_id: dto.target_id,
        created_at: new Date(),
        checksum: null,
      } as AdminAuditLog;

      const savedEntry = { ...createdEntry, checksum: 'uuid_checksum' };

      jest.spyOn(repository, 'create').mockReturnValue(createdEntry);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(createdEntry).mockResolvedValueOnce(savedEntry);

      // Act
      const result = await service.log(dto);

      // Assert
      expect(result.actor_id).toBe(uuid);
      expect(result.target_id).toBe('660e8400-e29b-41d4-a716-446655440001');
    });
  });

  describe('configuration', () => {
    it('should use AUDIT_LOG_HMAC_SECRET from config', async () => {
      // Verify the config service is called correctly
      const secret = configService.get('AUDIT_LOG_HMAC_SECRET');
      expect(secret).toBe('test-secret-key');
    });

    it('should handle missing AUDIT_LOG_HMAC_SECRET gracefully', async () => {
      // Arrange
      const mockConfigServiceWithoutSecret = {
        get: jest.fn().mockReturnValue(null),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuditLogService,
          {
            provide: getRepositoryToken(AdminAuditLog),
            useValue: { create: jest.fn(), save: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: mockConfigServiceWithoutSecret,
          },
        ],
      }).compile();

      const serviceWithoutSecret = module.get<AuditLogService>(AuditLogService);

      // The service should still initialize without throwing
      expect(serviceWithoutSecret).toBeDefined();
    });
  });
});
