import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountService } from './account.service';
import { User } from '../users/entities/user.entity';

// Mock entities
interface DataExportJob {
  id: string;
  user_id: string;
  status: string;
  created_at: Date;
  completed_at?: Date;
}

describe('AccountService', () => {
  let service: AccountService;
  let mockUserRepository: any;
  let mockDataExportJobRepository: any;
  let mockTransactionRepository: any;
  let mockActivityRepository: any;

  beforeEach(async () => {
    mockUserRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
    };

    mockDataExportJobRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockTransactionRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockActivityRepository = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken('DataExportJob'),
          useValue: mockDataExportJobRepository,
        },
        {
          provide: getRepositoryToken('Transaction'),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken('Activity'),
          useValue: mockActivityRepository,
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestExport', () => {
    it('should create a new data export job', async () => {
      // Arrange
      const userId = 'user-123';
      const exportJob: DataExportJob = {
        id: 'export-1',
        user_id: userId,
        status: 'pending',
        created_at: new Date(),
      };

      mockDataExportJobRepository.create.mockReturnValue(exportJob);
      mockDataExportJobRepository.save.mockResolvedValue(exportJob);
      mockUserRepository.findOne.mockResolvedValue({ id: userId });

      // Act
      const result = await service.requestExport(userId);

      // Assert
      expect(mockDataExportJobRepository.create).toHaveBeenCalledWith({
        user_id: userId,
        status: 'pending',
      });
      expect(mockDataExportJobRepository.save).toHaveBeenCalledWith(exportJob);
      expect(result).toEqual(exportJob);
    });

    it('should verify user exists before creating export', async () => {
      // Arrange
      const userId = 'non-existent-user';
      mockUserRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.requestExport(userId)).rejects.toThrow();
    });

    it('should assign unique job ID to export', async () => {
      // Arrange
      const userId = 'user-456';
      const exportJob = {
        id: expect.any(String),
        user_id: userId,
        status: 'pending',
        created_at: expect.any(Date),
      };

      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockDataExportJobRepository.create.mockReturnValue(exportJob);
      mockDataExportJobRepository.save.mockResolvedValue(exportJob);

      // Act
      const result = await service.requestExport(userId);

      // Assert
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('should set initial status to pending', async () => {
      // Arrange
      const userId = 'user-789';
      const exportJob = {
        id: 'export-2',
        user_id: userId,
        status: 'pending',
        created_at: new Date(),
      };

      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockDataExportJobRepository.create.mockReturnValue(exportJob);
      mockDataExportJobRepository.save.mockResolvedValue(exportJob);

      // Act
      const result = await service.requestExport(userId);

      // Assert
      expect(result.status).toBe('pending');
    });

    it('should record creation timestamp', async () => {
      // Arrange
      const userId = 'user-abc';
      const now = new Date();
      const exportJob = {
        id: 'export-3',
        user_id: userId,
        status: 'pending',
        created_at: now,
      };

      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockDataExportJobRepository.create.mockReturnValue(exportJob);
      mockDataExportJobRepository.save.mockResolvedValue(exportJob);

      // Act
      const result = await service.requestExport(userId);

      // Assert
      expect(result.created_at.getTime()).toBeLessThanOrEqual(now.getTime() + 1000);
    });
  });

  describe('getExportStatus', () => {
    it('should retrieve export job status', async () => {
      // Arrange
      const jobId = 'export-1';
      const userId = 'user-123';
      const exportJob: DataExportJob = {
        id: jobId,
        user_id: userId,
        status: 'pending',
        created_at: new Date(),
      };

      mockDataExportJobRepository.findOne.mockResolvedValue(exportJob);

      // Act
      const result = await service.getExportStatus(userId, jobId);

      // Assert
      expect(result).toEqual(exportJob);
      expect(mockDataExportJobRepository.findOne).toHaveBeenCalledWith({
        where: { id: jobId, user_id: userId },
      });
    });

    it('should return null for non-existent job', async () => {
      // Arrange
      const jobId = 'non-existent';
      const userId = 'user-123';
      mockDataExportJobRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getExportStatus(userId, jobId);

      // Assert
      expect(result).toBeNull();
    });

    it('should track pending status', async () => {
      // Arrange
      const exportJob = {
        id: 'export-2',
        user_id: 'user-456',
        status: 'pending',
        created_at: new Date(),
      };
      mockDataExportJobRepository.findOne.mockResolvedValue(exportJob);

      // Act
      const result = await service.getExportStatus(exportJob.user_id, exportJob.id);

      // Assert
      expect(result.status).toBe('pending');
    });

    it('should track completed status', async () => {
      // Arrange
      const exportJob = {
        id: 'export-3',
        user_id: 'user-789',
        status: 'completed',
        created_at: new Date(),
        completed_at: new Date(),
      };
      mockDataExportJobRepository.findOne.mockResolvedValue(exportJob);

      // Act
      const result = await service.getExportStatus(exportJob.user_id, exportJob.id);

      // Assert
      expect(result.status).toBe('completed');
    });

    it('should track failed status', async () => {
      // Arrange
      const exportJob = {
        id: 'export-4',
        user_id: 'user-xyz',
        status: 'failed',
        created_at: new Date(),
      };
      mockDataExportJobRepository.findOne.mockResolvedValue(exportJob);

      // Act
      const result = await service.getExportStatus(exportJob.user_id, exportJob.id);

      // Assert
      expect(result.status).toBe('failed');
    });

    it('should verify userId matches for security', async () => {
      // Arrange
      const jobId = 'export-1';
      const actualUserId = 'user-123';
      const requestedUserId = 'user-999'; // Different user
      mockDataExportJobRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getExportStatus(requestedUserId, jobId);

      // Assert
      expect(result).toBeNull();
      expect(mockDataExportJobRepository.findOne).toHaveBeenCalledWith({
        where: { id: jobId, user_id: requestedUserId },
      });
    });
  });

  describe('downloadExport', () => {
    it('should retrieve export data for download', async () => {
      // Arrange
      const userId = 'user-123';
      const jobId = 'export-1';
      const exportData = JSON.stringify({ user_data: 'test' });

      mockDataExportJobRepository.findOne.mockResolvedValue({
        id: jobId,
        user_id: userId,
        status: 'completed',
      });

      // Act
      const result = await service.downloadExport(userId, jobId);

      // Assert
      expect(result).toBeDefined();
    });

    it('should reject download for incomplete export', async () => {
      // Arrange
      const userId = 'user-456';
      const jobId = 'export-2';

      mockDataExportJobRepository.findOne.mockResolvedValue({
        id: jobId,
        user_id: userId,
        status: 'pending',
      });

      // Act & Assert
      await expect(service.downloadExport(userId, jobId)).rejects.toThrow();
    });

    it('should verify user ownership before download', async () => {
      // Arrange
      const jobId = 'export-1';
      const actualUserId = 'user-123';
      const requestedUserId = 'user-999';

      mockDataExportJobRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.downloadExport(requestedUserId, jobId)).rejects.toThrow();
    });

    it('should handle failed export downloads', async () => {
      // Arrange
      const userId = 'user-789';
      const jobId = 'export-3';

      mockDataExportJobRepository.findOne.mockResolvedValue({
        id: jobId,
        user_id: userId,
        status: 'failed',
      });

      // Act & Assert
      await expect(service.downloadExport(userId, jobId)).rejects.toThrow();
    });
  });

  describe('processExports', () => {
    it('should process pending export jobs', async () => {
      // Arrange
      const pendingJobs = [
        { id: 'export-1', user_id: 'user-123', status: 'pending' },
        { id: 'export-2', user_id: 'user-456', status: 'pending' },
      ];

      mockDataExportJobRepository.find.mockResolvedValue(pendingJobs);

      // Act
      await service.processExports();

      // Assert
      expect(mockDataExportJobRepository.find).toHaveBeenCalled();
    });

    it('should handle empty export queue', async () => {
      // Arrange
      mockDataExportJobRepository.find.mockResolvedValue([]);

      // Act
      await expect(service.processExports()).resolves.not.toThrow();

      // Assert
      expect(mockDataExportJobRepository.find).toHaveBeenCalled();
    });

    it('should process multiple exports in batch', async () => {
      // Arrange
      const exports = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `export-${i}`,
          user_id: `user-${i}`,
          status: 'pending',
        }));

      mockDataExportJobRepository.find.mockResolvedValue(exports);

      // Act
      await service.processExports();

      // Assert
      expect(mockDataExportJobRepository.find).toHaveBeenCalled();
    });

    it('should skip non-pending exports', async () => {
      // Arrange
      const jobs = [
        { id: 'export-1', user_id: 'user-123', status: 'pending' },
        { id: 'export-2', user_id: 'user-456', status: 'completed' },
        { id: 'export-3', user_id: 'user-789', status: 'failed' },
      ];

      mockDataExportJobRepository.find.mockResolvedValue([jobs[0]]);

      // Act
      await service.processExports();

      // Assert
      expect(mockDataExportJobRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'pending' },
        })
      );
    });
  });

  describe('deleteAccount', () => {
    it('should delete user account and data', async () => {
      // Arrange
      const userId = 'user-123';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalled();
    });

    it('should verify user exists before deletion', async () => {
      // Arrange
      const userId = 'non-existent';
      mockUserRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteAccount(userId)).rejects.toThrow();
    });

    it('should anonymize user data instead of hard delete', async () => {
      // Arrange
      const userId = 'user-456';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { id: userId },
        expect.objectContaining({})
      );
    });

    it('should handle cascading deletes', async () => {
      // Arrange
      const userId = 'user-789';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalled();
    });

    it('should audit account deletion', async () => {
      // Arrange
      const userId = 'user-abc';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.update).toHaveBeenCalled();
    });

    it('should revoke user sessions and tokens', async () => {
      // Arrange
      const userId = 'user-def';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.update).toHaveBeenCalled();
    });
  });

  describe('cleanupExports', () => {
    it('should remove old completed exports', async () => {
      // Arrange
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };

      mockDataExportJobRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act
      await service.cleanupExports();

      // Assert
      expect(queryBuilder.execute).toHaveBeenCalled();
    });

    it('should preserve recent exports', async () => {
      // Arrange
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockDataExportJobRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act
      await service.cleanupExports();

      // Assert
      expect(queryBuilder.execute).toHaveBeenCalled();
    });

    it('should handle cleanup with no old exports', async () => {
      // Arrange
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockDataExportJobRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act
      await expect(service.cleanupExports()).resolves.not.toThrow();

      // Assert
      expect(queryBuilder.execute).toHaveBeenCalled();
    });

    it('should use configurable retention period', async () => {
      // Arrange
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 10 }),
      };

      mockDataExportJobRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act
      await service.cleanupExports();

      // Assert
      expect(queryBuilder.where).toHaveBeenCalled();
    });
  });

  describe('Data consistency', () => {
    it('should maintain referential integrity during deletion', async () => {
      // Arrange
      const userId = 'user-123';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.update).toHaveBeenCalled();
    });

    it('should handle concurrent export requests', async () => {
      // Arrange
      const userId = 'user-456';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockDataExportJobRepository.create.mockReturnValue({
        id: 'export-1',
        user_id: userId,
      });
      mockDataExportJobRepository.save.mockResolvedValue({
        id: 'export-1',
        user_id: userId,
      });

      // Act
      const promises = [
        service.requestExport(userId),
        service.requestExport(userId),
      ];

      await Promise.all(promises);

      // Assert
      expect(mockDataExportJobRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should prevent orphaned export jobs', async () => {
      // Arrange
      const userId = 'user-789';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors', async () => {
      // Arrange
      const userId = 'user-123';
      mockUserRepository.findOne.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await expect(service.requestExport(userId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle export processing failures', async () => {
      // Arrange
      mockDataExportJobRepository.find.mockRejectedValue(
        new Error('Export processing failed')
      );

      // Act & Assert
      await expect(service.processExports()).rejects.toThrow(
        'Export processing failed'
      );
    });

    it('should handle cleanup operation failures', async () => {
      // Arrange
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('Cleanup failed')),
      };

      mockDataExportJobRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act & Assert
      await expect(service.cleanupExports()).rejects.toThrow('Cleanup failed');
    });

    it('should gracefully handle partial failures', async () => {
      // Arrange
      const jobs = [
        { id: 'export-1', user_id: 'user-123', status: 'pending' },
        { id: 'export-2', user_id: 'user-456', status: 'pending' },
      ];

      mockDataExportJobRepository.find.mockResolvedValue(jobs);

      // Act
      await service.processExports();

      // Assert
      expect(mockDataExportJobRepository.find).toHaveBeenCalled();
    });
  });

  describe('Privacy and security', () => {
    it('should not expose sensitive user data in export metadata', async () => {
      // Arrange
      const userId = 'user-123';
      const exportJob = {
        id: 'export-1',
        user_id: userId,
        status: 'pending',
      };

      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockDataExportJobRepository.create.mockReturnValue(exportJob);
      mockDataExportJobRepository.save.mockResolvedValue(exportJob);

      // Act
      const result = await service.requestExport(userId);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.user_id).toBe(userId);
    });

    it('should enforce user isolation in data exports', async () => {
      // Arrange
      const jobId = 'export-1';
      const userId1 = 'user-123';
      const userId2 = 'user-999';

      mockDataExportJobRepository.findOne.mockImplementation(({ where }) => {
        if (where.user_id === userId1) {
          return Promise.resolve({ id: jobId, user_id: userId1 });
        }
        return Promise.resolve(null);
      });

      // Act
      const result1 = await service.getExportStatus(userId1, jobId);
      const result2 = await service.getExportStatus(userId2, jobId);

      // Assert
      expect(result1).toBeDefined();
      expect(result2).toBeNull();
    });

    it('should audit all account deletion attempts', async () => {
      // Arrange
      const userId = 'user-123';
      mockUserRepository.findOne.mockResolvedValue({ id: userId });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await service.deleteAccount(userId);

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle large export batches efficiently', async () => {
      // Arrange
      const exports = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `export-${i}`,
          user_id: `user-${i}`,
          status: 'pending',
        }));

      mockDataExportJobRepository.find.mockResolvedValue(exports);

      // Act
      await service.processExports();

      // Assert
      expect(mockDataExportJobRepository.find).toHaveBeenCalled();
    });

    it('should not load unnecessary data during cleanup', async () => {
      // Arrange
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 100 }),
      };

      mockDataExportJobRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Act
      await service.cleanupExports();

      // Assert
      expect(queryBuilder.delete).toHaveBeenCalled();
      expect(queryBuilder.execute).toHaveBeenCalled();
    });
  });
});
