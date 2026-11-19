import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { BackupService, BackupRecord } from './backup.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
  },
}));
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'test-checksum-hash'),
    })),
  })),
}));

describe('BackupService', () => {
  let service: BackupService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockFsPromises: jest.Mocked<typeof fs>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          BACKUP_DIR: '/backups',
          DATABASE_URL: 'postgres://user:pass@localhost/db',
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    mockFsPromises = fs as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(BackupService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBackup', () => {
    it('should create a backup with checksum and metadata', async () => {
      const mockData = Buffer.from('test backup data');
      mockFsPromises.mkdir.mockResolvedValue(undefined as any);
      mockFsPromises.readFile.mockResolvedValue(mockData);
      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      const result = await service.createBackup();

      expect(result).toMatchObject({
        id: expect.stringContaining('backup-'),
        file: expect.stringContaining('.sql'),
        createdAt: expect.any(String),
        sizeBytes: mockData.length,
        checksum: 'test-checksum-hash',
        verified: false,
      });

      expect(mockFsPromises.mkdir).toHaveBeenCalledWith('/backups', { recursive: true });
      expect(mockFsPromises.readFile).toHaveBeenCalled();
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.meta.json'),
        expect.any(String),
      );
    });

    it('should create metadata file with backup record', async () => {
      mockFsPromises.mkdir.mockResolvedValue(undefined as any);
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('data'));
      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      const result = await service.createBackup();

      const metadataCall = mockFsPromises.writeFile.mock.calls.find(call =>
        call[0].includes('.meta.json'),
      );

      expect(metadataCall).toBeDefined();
      expect(metadataCall?.[1]).toContain(result.id);
      expect(metadataCall?.[1]).toContain('test-checksum-hash');
    });

    it('should handle backup directory creation errors', async () => {
      mockFsPromises.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(service.createBackup()).rejects.toThrow('Permission denied');
    });

    it('should calculate correct file size in backup record', async () => {
      const largeData = Buffer.from('x'.repeat(1024 * 1024)); // 1MB
      mockFsPromises.mkdir.mockResolvedValue(undefined as any);
      mockFsPromises.readFile.mockResolvedValue(largeData);
      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      const result = await service.createBackup();

      expect(result.sizeBytes).toBe(1024 * 1024);
    });

    it('should include ISO timestamp in backup record', async () => {
      mockFsPromises.mkdir.mockResolvedValue(undefined as any);
      mockFsPromises.readFile.mockResolvedValue(Buffer.from('data'));
      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      const before = new Date();
      const result = await service.createBackup();
      const after = new Date();

      const backupDate = new Date(result.createdAt);
      expect(backupDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(backupDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('listBackups', () => {
    it('should return all backup records sorted by creation time descending', async () => {
      const mockRecords: BackupRecord[] = [
        {
          id: 'backup-100',
          file: '/backups/backup-100.sql',
          createdAt: '2024-01-15T10:00:00Z',
          sizeBytes: 1000,
          checksum: 'hash1',
          verified: true,
        },
        {
          id: 'backup-200',
          file: '/backups/backup-200.sql',
          createdAt: '2024-01-15T11:00:00Z',
          sizeBytes: 2000,
          checksum: 'hash2',
          verified: true,
        },
      ];

      mockFsPromises.readdir.mockResolvedValue(['backup-100.sql.meta.json', 'backup-200.sql.meta.json'] as any);
      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecords[0]))
        .mockResolvedValueOnce(JSON.stringify(mockRecords[1]));

      const result = await service.listBackups();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('backup-200'); // Most recent first
      expect(result[1].id).toBe('backup-100');
    });

    it('should filter only metadata files', async () => {
      const mockRecords: BackupRecord[] = [
        {
          id: 'backup-100',
          file: '/backups/backup-100.sql',
          createdAt: '2024-01-15T10:00:00Z',
          sizeBytes: 1000,
          checksum: 'hash1',
          verified: true,
        },
      ];

      mockFsPromises.readdir.mockResolvedValue([
        'backup-100.sql',
        'backup-100.sql.meta.json',
        'other-file.txt',
      ] as any);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockRecords[0]));

      const result = await service.listBackups();

      expect(result).toHaveLength(1);
      expect(mockFsPromises.readFile).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if directory is empty', async () => {
      mockFsPromises.readdir.mockResolvedValue([] as any);

      const result = await service.listBackups();

      expect(result).toEqual([]);
    });

    it('should handle read errors gracefully by returning empty array', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('Directory not found'));

      const result = await service.listBackups();

      expect(result).toEqual([]);
    });

    it('should parse metadata JSON files correctly', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-123',
        file: '/backups/backup-123.sql',
        createdAt: '2024-01-15T12:00:00Z',
        sizeBytes: 5000,
        checksum: 'test-hash',
        verified: true,
      };

      mockFsPromises.readdir.mockResolvedValue(['backup-123.sql.meta.json'] as any);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockRecord));

      const result = await service.listBackups();

      expect(result[0]).toEqual(mockRecord);
    });
  });

  describe('verifyBackup', () => {
    it('should verify backup checksum and file size', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 1000,
        checksum: 'test-checksum-hash',
        verified: false,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord)) // getBackup read
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000))); // verify read

      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      const result = await service.verifyBackup('backup-100');

      expect(result.verified).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.meta.json'),
        expect.stringContaining('"verified":true'),
      );
    });

    it('should throw error if checksum does not match', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 1000,
        checksum: 'different-checksum',
        verified: false,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord))
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000)));

      await expect(service.verifyBackup('backup-100')).rejects.toThrow(
        'Backup backup-100 failed verification',
      );
    });

    it('should throw error if file size does not match', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 5000, // Expected
        checksum: 'test-checksum-hash',
        verified: false,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord))
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000))); // Actual size is 1000

      await expect(service.verifyBackup('backup-100')).rejects.toThrow(
        'Backup backup-100 failed verification',
      );
    });

    it('should throw NotFoundException if backup not found', async () => {
      mockFsPromises.readFile.mockRejectedValue(new Error('File not found'));

      await expect(service.verifyBackup('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update metadata with verified status', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 1000,
        checksum: 'test-checksum-hash',
        verified: false,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord))
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000)));

      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      await service.verifyBackup('backup-100');

      const writeCall = mockFsPromises.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.verified).toBe(true);
    });
  });

  describe('restoreBackup', () => {
    it('should restore backup and verify before restoration', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 1000,
        checksum: 'test-checksum-hash',
        verified: false,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord))
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000)))
        .mockResolvedValueOnce(JSON.stringify({ ...mockRecord, verified: true }));

      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      await service.restoreBackup('backup-100');

      expect(mockFsPromises.readFile).toHaveBeenCalled();
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should throw error if backup is not verified', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 5000,
        checksum: 'different-checksum',
        verified: false,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord))
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000)));

      await expect(service.restoreBackup('backup-100')).rejects.toThrow(
        'Backup backup-100 failed verification',
      );
    });

    it('should support point-in-time recovery if targetTime is provided', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 1000,
        checksum: 'test-checksum-hash',
        verified: false,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord))
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000)))
        .mockResolvedValueOnce(JSON.stringify({ ...mockRecord, verified: true }));

      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      const targetTime = '2024-01-15T11:00:00Z';
      await service.restoreBackup('backup-100', targetTime);

      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should throw error for invalid targetTime format', async () => {
      const mockRecord: BackupRecord = {
        id: 'backup-100',
        file: '/backups/backup-100.sql',
        createdAt: '2024-01-15T10:00:00Z',
        sizeBytes: 1000,
        checksum: 'test-checksum-hash',
        verified: true,
      };

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(mockRecord))
        .mockResolvedValueOnce(Buffer.from('x'.repeat(1000)))
        .mockResolvedValueOnce(JSON.stringify(mockRecord));

      mockFsPromises.writeFile.mockResolvedValue(undefined as any);

      await expect(
        service.restoreBackup('backup-100', 'invalid-date'),
      ).rejects.toThrow('Invalid point-in-time target');
    });
  });

  describe('Configuration', () => {
    it('should use custom backup directory from config', () => {
      const customDir = '/custom/backup/path';
      const customConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'BACKUP_DIR') return customDir;
          if (key === 'DATABASE_URL') return 'postgres://url';
          return defaultValue;
        }),
      } as any;

      const customService = new BackupService(customConfigService);

      // Verify the service uses the custom directory
      expect((customService as any).backupDir).toBe(customDir);
    });

    it('should use default backup directory if not configured', () => {
      const noConfigService = {
        get: jest.fn(() => undefined),
      } as any;

      const defaultService = new BackupService(noConfigService);
      const backupDir = (defaultService as any).backupDir;

      expect(backupDir).toContain('backups');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty backup list gracefully', async () => {
      mockFsPromises.readdir.mockResolvedValue([] as any);

      const result = await service.listBackups();

      expect(result).toEqual([]);
      expect(result).toBeInstanceOf(Array);
    });

    it('should handle concurrent backup metadata reads', async () => {
      const records: BackupRecord[] = [
        {
          id: 'backup-1',
          file: '/backups/backup-1.sql',
          createdAt: '2024-01-15T10:00:00Z',
          sizeBytes: 1000,
          checksum: 'hash1',
          verified: true,
        },
        {
          id: 'backup-2',
          file: '/backups/backup-2.sql',
          createdAt: '2024-01-15T11:00:00Z',
          sizeBytes: 2000,
          checksum: 'hash2',
          verified: true,
        },
      ];

      mockFsPromises.readdir.mockResolvedValue([
        'backup-1.sql.meta.json',
        'backup-2.sql.meta.json',
      ] as any);

      mockFsPromises.readFile
        .mockResolvedValueOnce(JSON.stringify(records[0]))
        .mockResolvedValueOnce(JSON.stringify(records[1]));

      const result = await service.listBackups();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('backup-2');
      expect(result[1].id).toBe('backup-1');
    });
  });
});
