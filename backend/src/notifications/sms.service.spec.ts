import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { Repository } from 'typeorm';
import { of, throwError } from 'rxjs';
import { SmsService } from './sms.service';
import { SmsNotification, SmsStatus } from './entities/sms-notification.entity';

describe('SmsService', () => {
  let service: SmsService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockSmsRepository: jest.Mocked<Repository<SmsNotification>>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          SMS_PROVIDER: 'twilio',
          SMS_RETRY_MAX_ATTEMPTS: 3,
          SMS_RETRY_BASE_DELAY_MS: 1000,
          TWILIO_ACCOUNT_SID: 'test-sid',
          TWILIO_AUTH_TOKEN: 'test-token',
          TWILIO_PHONE_NUMBER: '+1234567890',
          AFRICASTALKING_API_KEY: 'test-key',
          AFRICASTALKING_USERNAME: 'test-user',
          AFRICASTALKING_SENDER_ID: 'STOW',
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    mockHttpService = {
      post: jest.fn(),
    } as any;

    mockSmsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: getRepositoryToken(SmsNotification), useValue: mockSmsRepository },
      ],
    }).compile();

    service = module.get(SmsService);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sendSms', () => {
    it('should create and save SMS notification with pending status', async () => {
      const phoneNumber = '+1234567890';
      const message = 'Test SMS message';
      const userId = 'user-123';

      const mockSms = {
        id: 'sms-001',
        phone_number: phoneNumber,
        message,
        user_id: userId,
        status: SmsStatus.PENDING,
        provider: 'twilio',
        metadata: null,
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);

      const result = await service.sendSms(phoneNumber, message, userId);

      expect(mockSmsRepository.create).toHaveBeenCalledWith({
        phone_number: phoneNumber,
        message,
        user_id: userId,
        status: SmsStatus.PENDING,
        provider: 'twilio',
        metadata: null,
        attempts: 0,
      });
      expect(mockSmsRepository.save).toHaveBeenCalledWith(mockSms);
      expect(result).toEqual(mockSms);
    });

    it('should include metadata if provided', async () => {
      const phoneNumber = '+1234567890';
      const message = 'Test SMS';
      const metadata = { transactionId: '123', amount: '100' };

      const mockSms = {
        id: 'sms-001',
        phone_number: phoneNumber,
        message,
        user_id: undefined,
        status: SmsStatus.PENDING,
        provider: 'twilio',
        metadata,
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);

      await service.sendSms(phoneNumber, message, undefined, metadata);

      expect(mockSmsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        }),
      );
    });

    it('should trigger async send attempt without waiting', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test',
        status: SmsStatus.PENDING,
        provider: 'twilio',
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);
      mockHttpService.post.mockReturnValue(
        of({
          data: { sid: 'external-123' },
        } as any),
      );

      const promise = service.sendSms('+1234567890', 'Test');

      // Promise should resolve immediately
      const result = await promise;
      expect(result).toEqual(mockSms);

      // Advance timers to trigger the async send
      jest.runAllTimers();
    });
  });

  describe('sendViaTwilio (private method - tested via sendSms)', () => {
    it('should send SMS via Twilio successfully', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test message',
        status: SmsStatus.PENDING,
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);

      const twilioResponse = { data: { sid: 'external-123' } };
      mockHttpService.post.mockReturnValue(of(twilioResponse as any));

      await service.sendSms('+1234567890', 'Test message');

      jest.runAllTimers();

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('api.twilio.com'),
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      );
    });

    it('should return success with externalId when Twilio responds', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test',
        status: SmsStatus.PENDING,
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);

      mockHttpService.post.mockReturnValue(
        of({
          data: { sid: 'SM1234567890' },
        } as any),
      );

      await service.sendSms('+1234567890', 'Test');

      jest.runAllTimers();

      const updateCalls = mockSmsRepository.save.mock.calls;
      expect(updateCalls.some(call => 
        call[0].status === SmsStatus.SENT && call[0].external_id === 'SM1234567890'
      )).toBe(true);
    });

    it('should handle Twilio API errors', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test',
        status: SmsStatus.PENDING,
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);

      const error = new Error('Twilio error');
      (error as any).response = { data: { message: 'Invalid phone number' } };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await service.sendSms('+1234567890', 'Test');

      jest.runAllTimers();

      const saveCalls = mockSmsRepository.save.mock.calls;
      expect(saveCalls.some(call => call[0].status === SmsStatus.FAILED)).toBe(true);
    });
  });

  describe('Retry logic', () => {
    it('should retry on failure with exponential backoff', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test',
        status: SmsStatus.PENDING,
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await service.sendSms('+1234567890', 'Test');

      // Initial attempt
      jest.advanceTimersByTime(0);
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);

      // First retry (delay: 1000 * 4^0 = 1000)
      jest.advanceTimersByTime(1000);
      expect(mockHttpService.post).toHaveBeenCalledTimes(2);

      // Second retry (delay: 1000 * 4^1 = 4000)
      jest.advanceTimersByTime(4000);
      expect(mockHttpService.post).toHaveBeenCalledTimes(3);

      // Third retry (delay: 1000 * 4^2 = 16000)
      jest.advanceTimersByTime(16000);
      expect(mockHttpService.post).toHaveBeenCalledTimes(3); // No more retries after max

      // Final SMS should be marked as failed
      const saveCalls = mockSmsRepository.save.mock.calls;
      expect(saveCalls.some(call => call[0].status === SmsStatus.FAILED)).toBe(true);
    });

    it('should mark SMS as failed after max retries', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test',
        status: SmsStatus.PENDING,
        attempts: 0,
      };

      mockSmsRepository.create.mockReturnValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Persistent error')),
      );

      await service.sendSms('+1234567890', 'Test');

      jest.runAllTimers();

      const lastSaveCall = mockSmsRepository.save.mock.calls[
        mockSmsRepository.save.mock.calls.length - 1
      ];

      expect(lastSaveCall[0].status).toBe(SmsStatus.FAILED);
      expect(lastSaveCall[0].error_message).toContain('Persistent error');
    });
  });

  describe('updateStatus', () => {
    it('should update SMS status by external ID', async () => {
      const mockSms = {
        id: 'sms-001',
        external_id: 'ext-123',
        status: SmsStatus.SENT,
        delivered_at: null,
      };

      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);

      await service.updateStatus('ext-123', SmsStatus.DELIVERED);

      expect(mockSmsRepository.findOne).toHaveBeenCalledWith({
        where: { external_id: 'ext-123' },
      });

      expect(mockSmsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SmsStatus.DELIVERED,
        }),
      );
    });

    it('should update delivered_at timestamp when provided', async () => {
      const mockSms = {
        id: 'sms-001',
        external_id: 'ext-123',
        status: SmsStatus.SENT,
      };

      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);

      const deliveredAt = new Date('2024-01-15T10:30:00Z');
      await service.updateStatus('ext-123', SmsStatus.DELIVERED, deliveredAt);

      expect(mockSmsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          delivered_at: deliveredAt,
        }),
      );
    });

    it('should handle non-existent external ID gracefully', async () => {
      mockSmsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('non-existent', SmsStatus.DELIVERED),
      ).resolves.not.toThrow();

      expect(mockSmsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return SMS statistics', async () => {
      const mockQueryBuilder = {
        getCount: jest.fn(),
        andWhere: jest.fn(),
        clone: jest.fn(),
      };

      mockQueryBuilder.clone.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getCount.mockResolvedValue(100);

      mockSmsRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const stats = await service.getStats();

      expect(stats).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          sent: expect.any(Number),
          delivered: expect.any(Number),
          failed: expect.any(Number),
          pending: expect.any(Number),
          delivery_rate: expect.any(Number),
        }),
      );
    });

    it('should calculate delivery rate correctly', async () => {
      const mockQueryBuilder = {
        getCount: jest.fn()
          .mockResolvedValueOnce(100) // total
          .mockResolvedValueOnce(50)  // sent
          .mockResolvedValueOnce(40)  // delivered
          .mockResolvedValueOnce(5)   // failed
          .mockResolvedValueOnce(5),  // pending
        andWhere: jest.fn(),
        clone: jest.fn(),
      };

      mockQueryBuilder.clone.mockReturnValue(mockQueryBuilder);
      mockSmsRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const stats = await service.getStats();

      expect(stats.delivery_rate).toBe(40); // 40 / 100 = 40%
    });

    it('should filter by date range when provided', async () => {
      const mockQueryBuilder = {
        getCount: jest.fn().mockResolvedValue(50),
        andWhere: jest.fn(),
        clone: jest.fn(),
      };

      mockQueryBuilder.clone.mockReturnValue(mockQueryBuilder);
      mockSmsRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getStats(startDate, endDate);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sms.created_at >= :startDate',
        { startDate },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sms.created_at <= :endDate',
        { endDate },
      );
    });
  });

  describe('getUserSms', () => {
    it('should retrieve paginated SMS for user', async () => {
      const mockSmsData = [
        { id: 'sms-001', phone_number: '+1234567890', status: SmsStatus.SENT },
        { id: 'sms-002', phone_number: '+1234567890', status: SmsStatus.DELIVERED },
      ];

      mockSmsRepository.findAndCount.mockResolvedValue([mockSmsData, 50]);

      const result = await service.getUserSms('user-123', 1, 20);

      expect(result).toEqual({
        data: mockSmsData,
        total: 50,
        page: 1,
        limit: 20,
      });

      expect(mockSmsRepository.findAndCount).toHaveBeenCalledWith({
        where: { user_id: 'user-123' },
        order: { created_at: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should calculate skip correctly for pagination', async () => {
      mockSmsRepository.findAndCount.mockResolvedValue([[], 100]);

      await service.getUserSms('user-123', 3, 25);

      expect(mockSmsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 50, // (3 - 1) * 25
          take: 25,
        }),
      );
    });

    it('should use default pagination values', async () => {
      mockSmsRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.getUserSms('user-123');

      expect(mockSmsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('retrySms', () => {
    it('should allow retrying failed SMS', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test',
        status: SmsStatus.FAILED,
        attempts: 3,
        error_message: 'Network error',
      };

      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);
      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockHttpService.post.mockReturnValue(
        of({ data: { sid: 'new-ext-123' } } as any),
      );

      await service.retrySms('sms-001');

      expect(mockSmsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SmsStatus.PENDING,
          attempts: 0,
          error_message: null,
        }),
      );
    });

    it('should throw error if SMS not found', async () => {
      mockSmsRepository.findOne.mockResolvedValue(null);

      await expect(service.retrySms('non-existent')).rejects.toThrow('SMS not found');
    });

    it('should throw error if SMS is not failed', async () => {
      const mockSms = {
        id: 'sms-001',
        status: SmsStatus.DELIVERED,
      };

      mockSmsRepository.findOne.mockResolvedValue(mockSms as any);

      await expect(service.retrySms('sms-001')).rejects.toThrow('Can only retry failed SMS');
    });

    it('should trigger send after resetting status', async () => {
      const mockSms = {
        id: 'sms-001',
        phone_number: '+1234567890',
        message: 'Test',
        status: SmsStatus.FAILED,
        attempts: 3,
      };

      mockSmsRepository.findOne
        .mockResolvedValueOnce(mockSms as any) // Initial findOne
        .mockResolvedValueOnce(mockSms as any); // In attemptSend

      mockSmsRepository.save.mockResolvedValue(mockSms as any);
      mockHttpService.post.mockReturnValue(
        of({ data: { sid: 'ext-123' } } as any),
      );

      await service.retrySms('sms-001');

      jest.runAllTimers();

      expect(mockHttpService.post).toHaveBeenCalled();
    });
  });

  describe('Provider configuration', () => {
    it('should use configured SMS provider', () => {
      const provider = (service as any).provider;
      expect(provider).toBe('twilio');
    });

    it('should use configured max retries', () => {
      const maxRetries = (service as any).maxRetries;
      expect(maxRetries).toBe(3);
    });

    it('should use configured retry delay', () => {
      const retryDelay = (service as any).retryDelay;
      expect(retryDelay).toBe(1000);
    });
  });
});
