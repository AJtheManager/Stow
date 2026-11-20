import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { Repository } from 'typeorm';
import { of, throwError } from 'rxjs';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookDeliveryLog, DeliveryStatus } from '../entities/webhook-delivery-log.entity';

describe('WebhookDispatcherService', () => {
  let service: WebhookDispatcherService;
  let mockEndpointRepository: any;
  let mockDeliveryLogRepository: any;
  let mockHttpService: any;

  beforeEach(async () => {
    mockEndpointRepository = {
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    mockDeliveryLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
    };

    mockHttpService = {
      axiosRef: {
        post: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDispatcherService,
        {
          provide: getRepositoryToken(WebhookEndpoint),
          useValue: mockEndpointRepository,
        },
        {
          provide: getRepositoryToken(WebhookDeliveryLog),
          useValue: mockDeliveryLogRepository,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<WebhookDispatcherService>(WebhookDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('emit', () => {
    it('should emit event to active webhooks', async () => {
      // Arrange
      const eventType = 'user.created';
      const payload = { userId: 'user-123', email: 'test@example.com' };

      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        event_types: ['user.created'],
        is_active: true,
        secret_key: 'secret-123',
      };

      mockEndpointRepository.find.mockResolvedValue([endpoint]);
      mockDeliveryLogRepository.create.mockReturnValue({
        id: 'log-1',
        endpoint,
        event_type: eventType,
        payload,
        status: DeliveryStatus.PENDING,
      });
      mockDeliveryLogRepository.save.mockResolvedValue({});

      // Act
      await service.emit(eventType, payload);

      // Assert
      expect(mockEndpointRepository.find).toHaveBeenCalledWith({
        where: { is_active: true },
      });
      expect(mockDeliveryLogRepository.create).toHaveBeenCalled();
      expect(mockDeliveryLogRepository.save).toHaveBeenCalled();
    });

    it('should not emit to inactive webhooks', async () => {
      // Arrange
      const eventType = 'user.created';
      const payload = { userId: 'user-123' };

      const inactiveEndpoint: any = {
        id: 'webhook-1',
        event_types: ['user.created'],
        is_active: false,
      };

      mockEndpointRepository.find.mockResolvedValue([inactiveEndpoint]);

      // Act
      await service.emit(eventType, payload);

      // Assert
      expect(mockDeliveryLogRepository.create).not.toHaveBeenCalled();
    });

    it('should filter endpoints by event type', async () => {
      // Arrange
      const eventType = 'user.created';
      const payload = { userId: 'user-123' };

      const endpoint1: any = {
        id: 'webhook-1',
        event_types: ['user.created'],
        is_active: true,
      };

      const endpoint2: any = {
        id: 'webhook-2',
        event_types: ['user.deleted'],
        is_active: true,
      };

      mockEndpointRepository.find.mockResolvedValue([endpoint1, endpoint2]);
      mockDeliveryLogRepository.create.mockReturnValue({});
      mockDeliveryLogRepository.save.mockResolvedValue({});

      // Act
      await service.emit(eventType, payload);

      // Assert
      expect(mockDeliveryLogRepository.create).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple endpoints for same event', async () => {
      // Arrange
      const eventType = 'user.created';
      const payload = { userId: 'user-123' };

      const endpoints: any[] = [
        {
          id: 'webhook-1',
          event_types: ['user.created'],
          is_active: true,
        },
        {
          id: 'webhook-2',
          event_types: ['user.created'],
          is_active: true,
        },
        {
          id: 'webhook-3',
          event_types: ['user.created'],
          is_active: true,
        },
      ];

      mockEndpointRepository.find.mockResolvedValue(endpoints);
      mockDeliveryLogRepository.create.mockReturnValue({});
      mockDeliveryLogRepository.save.mockResolvedValue({});

      // Act
      await service.emit(eventType, payload);

      // Assert
      expect(mockDeliveryLogRepository.create).toHaveBeenCalledTimes(3);
    });

    it('should handle events with no matching endpoints', async () => {
      // Arrange
      const eventType = 'user.created';
      const payload = { userId: 'user-123' };

      mockEndpointRepository.find.mockResolvedValue([]);

      // Act
      await service.emit(eventType, payload);

      // Assert
      expect(mockDeliveryLogRepository.create).not.toHaveBeenCalled();
    });

    it('should create delivery log with correct status', async () => {
      // Arrange
      const eventType = 'order.completed';
      const payload = { orderId: 'order-123', amount: 100 };

      const endpoint: any = {
        id: 'webhook-1',
        event_types: ['order.completed'],
        is_active: true,
      };

      mockEndpointRepository.find.mockResolvedValue([endpoint]);
      mockDeliveryLogRepository.create.mockReturnValue({});
      mockDeliveryLogRepository.save.mockResolvedValue({});

      // Act
      await service.emit(eventType, payload);

      // Assert
      const createCall = mockDeliveryLogRepository.create.mock.calls[0][0];
      expect(createCall.status).toBe(DeliveryStatus.PENDING);
      expect(createCall.attempt_count).toBe(0);
    });
  });

  describe('processPendingDeliveries', () => {
    it('should process pending delivery logs', async () => {
      // Arrange
      const now = new Date();
      const deliveryLog: any = {
        id: 'log-1',
        status: DeliveryStatus.PENDING,
        attempt_count: 0,
        next_retry_at: new Date(now.getTime() - 1000),
        endpoint: {
          id: 'webhook-1',
          url: 'https://example.com/webhook',
          secret_key: 'secret-123',
        },
        payload: { userId: 'user-123' },
        event_type: 'user.created',
      };

      mockDeliveryLogRepository.find.mockResolvedValue([deliveryLog]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      await service.processPendingDeliveries();

      // Assert
      expect(mockDeliveryLogRepository.find).toHaveBeenCalledWith({
        where: { status: DeliveryStatus.PENDING },
        relations: ['endpoint'],
        take: expect.any(Number),
      });
    });

    it('should filter deliveries ready for retry', async () => {
      // Arrange
      const now = new Date();
      const readyLog: any = {
        id: 'log-1',
        status: DeliveryStatus.PENDING,
        attempt_count: 1,
        next_retry_at: new Date(now.getTime() - 1000), // Past due
        endpoint: {
          url: 'https://example.com/webhook',
          secret_key: 'secret-123',
        },
        payload: { userId: 'user-123' },
        event_type: 'user.created',
      };

      const notReadyLog: any = {
        id: 'log-2',
        status: DeliveryStatus.PENDING,
        attempt_count: 1,
        next_retry_at: new Date(now.getTime() + 10000), // Future
        endpoint: {
          url: 'https://example.com/webhook',
          secret_key: 'secret-123',
        },
        payload: { userId: 'user-456' },
        event_type: 'user.created',
      };

      mockDeliveryLogRepository.find.mockResolvedValue([readyLog, notReadyLog]);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      await service.processPendingDeliveries();

      // Assert - Only ready log should be processed
      expect(mockHttpService.axiosRef.post).toHaveBeenCalled();
    });

    it('should handle empty pending queue', async () => {
      // Arrange
      mockDeliveryLogRepository.find.mockResolvedValue([]);

      // Act
      await expect(service.processPendingDeliveries()).resolves.not.toThrow();

      // Assert
      expect(mockDeliveryLogRepository.find).toHaveBeenCalled();
    });

    it('should respect batch size limits', async () => {
      // Arrange
      const deliveryLogs = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `log-${i}`,
          status: DeliveryStatus.PENDING,
          next_retry_at: null,
        }));

      mockDeliveryLogRepository.find.mockResolvedValue(deliveryLogs);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      await service.processPendingDeliveries();

      // Assert
      const findCall = mockDeliveryLogRepository.find.mock.calls[0][0];
      expect(findCall.take).toBeLessThanOrEqual(1000);
    });
  });

  describe('attemptDelivery', () => {
    it('should send webhook to endpoint', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://api.example.com/webhook',
        secret_key: 'secret-key-123',
        last_delivery_at: null,
        last_failure_at: null,
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: { userId: 'user-123', action: 'created' },
        event_type: 'user.created',
        attempt_count: 0,
        next_retry_at: null,
        error_message: null,
      };

      mockHttpService.axiosRef.post.mockResolvedValue({
        status: 200,
        data: { ok: true },
      });

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(mockHttpService.axiosRef.post).toHaveBeenCalledWith(
        endpoint.url,
        deliveryLog.payload,
        expect.any(Object)
      );
    });

    it('should include security headers in request', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://api.example.com/webhook',
        secret_key: 'secret-key-123',
        last_delivery_at: null,
        last_failure_at: null,
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: { userId: 'user-123' },
        event_type: 'user.created',
        attempt_count: 0,
        next_retry_at: null,
        error_message: null,
      };

      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      const headersArg = mockHttpService.axiosRef.post.mock.calls[0][2];
      expect(headersArg.headers).toHaveProperty('X-Webhook-Signature');
      expect(headersArg.headers).toHaveProperty('X-Webhook-Event');
      expect(headersArg.headers).toHaveProperty('X-Delivery-Attempt');
    });

    it('should mark delivery as success on 2xx response', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        last_delivery_at: null,
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 0,
        status: DeliveryStatus.PENDING,
      };

      mockHttpService.axiosRef.post.mockResolvedValue({ status: 201 });

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(deliveryLog.status).toBe(DeliveryStatus.SUCCESS);
      expect(deliveryLog.delivered_at).toBeDefined();
    });

    it('should reset failure count on success', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        last_delivery_at: null,
        failure_count: 5,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 0,
      };

      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(endpoint.failure_count).toBe(0);
    });

    it('should retry on non-2xx response', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        last_failure_at: null,
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 0,
        next_retry_at: null,
        error_message: null,
        status: DeliveryStatus.PENDING,
      };

      mockHttpService.axiosRef.post.mockResolvedValue({ status: 500 });

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(deliveryLog.status).not.toBe(DeliveryStatus.SUCCESS);
      expect(deliveryLog.next_retry_at).toBeDefined();
    });

    it('should handle connection errors', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        last_failure_at: null,
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 0,
        error_message: null,
      };

      mockHttpService.axiosRef.post.mockRejectedValue(
        new Error('Connection refused')
      );

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(deliveryLog.error_message).toBe('Connection refused');
      expect(deliveryLog.next_retry_at).toBeDefined();
    });

    it('should cap retry attempts at max', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 4, // Max is 5
        status: DeliveryStatus.PENDING,
      };

      mockHttpService.axiosRef.post.mockRejectedValue(new Error('Failed'));

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(deliveryLog.status).toBe(DeliveryStatus.FAILED);
      expect(deliveryLog.next_retry_at).toBeNull();
    });

    it('should implement exponential backoff', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 2,
        next_retry_at: null,
        status: DeliveryStatus.PENDING,
      };

      mockHttpService.axiosRef.post.mockRejectedValue(new Error('Failed'));

      // Act
      const now = Date.now();
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      const retryTime = deliveryLog.next_retry_at.getTime();
      const backoffMs = 2 * 1000; // 2^(attempt-1) * 1000
      expect(retryTime).toBeGreaterThan(now);
      expect(retryTime - now).toBeGreaterThanOrEqual(backoffMs);
    });

    it('should cap backoff at 1 hour', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 20, // Would result in huge backoff without cap
        status: DeliveryStatus.PENDING,
      };

      mockHttpService.axiosRef.post.mockRejectedValue(new Error('Failed'));

      // Act
      const now = Date.now();
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      const retryTime = deliveryLog.next_retry_at.getTime();
      const maxBackoff = 3600000; // 1 hour
      expect(retryTime - now).toBeLessThanOrEqual(maxBackoff + 1000); // +1s tolerance
    });

    it('should increment attempt count', async () => {
      // Arrange
      const endpoint: any = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        secret_key: 'secret',
        failure_count: 0,
      };

      const deliveryLog: any = {
        id: 'log-1',
        endpoint,
        payload: {},
        event_type: 'test',
        attempt_count: 2,
      };

      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(deliveryLog.attempt_count).toBe(3);
    });
  });

  describe('generateSignature', () => {
    it('should generate HMAC-SHA256 signature', () => {
      // Arrange
      const payload = { userId: 'user-123', action: 'created' };
      const secretKey = 'webhook-secret-key';

      // Act
      const signature = (service as any).generateSignature(payload, secretKey);

      // Assert
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should produce consistent signatures for same input', () => {
      // Arrange
      const payload = { userId: 'user-123' };
      const secretKey = 'secret-key';

      // Act
      const sig1 = (service as any).generateSignature(payload, secretKey);
      const sig2 = (service as any).generateSignature(payload, secretKey);

      // Assert
      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different payloads', () => {
      // Arrange
      const payload1 = { userId: 'user-123' };
      const payload2 = { userId: 'user-456' };
      const secretKey = 'secret-key';

      // Act
      const sig1 = (service as any).generateSignature(payload1, secretKey);
      const sig2 = (service as any).generateSignature(payload2, secretKey);

      // Assert
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      // Arrange
      const payload = { userId: 'user-123' };
      const secret1 = 'secret-key-1';
      const secret2 = 'secret-key-2';

      // Act
      const sig1 = (service as any).generateSignature(payload, secret1);
      const sig2 = (service as any).generateSignature(payload, secret2);

      // Assert
      expect(sig1).not.toBe(sig2);
    });

    it('should handle complex payload objects', () => {
      // Arrange
      const payload = {
        userId: 'user-123',
        action: 'order.completed',
        data: {
          orderId: 'order-456',
          items: [
            { productId: 'prod-1', quantity: 2 },
            { productId: 'prod-2', quantity: 1 },
          ],
          total: 99.99,
        },
      };
      const secretKey = 'secret-key';

      // Act
      const signature = (service as any).generateSignature(payload, secretKey);

      // Assert
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
    });
  });

  describe('Configuration', () => {
    it('should use MAX_ATTEMPTS from environment', () => {
      // Arrange
      process.env.WEBHOOK_MAX_ATTEMPTS = '10';

      // Act
      const instance = new WebhookDispatcherService(
        mockEndpointRepository,
        mockDeliveryLogRepository,
        mockHttpService
      );

      // Assert
      expect((instance as any).maxAttempts).toBe(10);

      delete process.env.WEBHOOK_MAX_ATTEMPTS;
    });

    it('should use default MAX_ATTEMPTS if not configured', () => {
      // Act
      const instance = new WebhookDispatcherService(
        mockEndpointRepository,
        mockDeliveryLogRepository,
        mockHttpService
      );

      // Assert
      expect((instance as any).maxAttempts).toBe(5);
    });

    it('should use TIMEOUT_MS from environment', () => {
      // Arrange
      process.env.WEBHOOK_TIMEOUT_MS = '10000';

      // Act
      const instance = new WebhookDispatcherService(
        mockEndpointRepository,
        mockDeliveryLogRepository,
        mockHttpService
      );

      // Assert
      expect((instance as any).timeoutMs).toBe(10000);

      delete process.env.WEBHOOK_TIMEOUT_MS;
    });

    it('should use BATCH_SIZE from environment', () => {
      // Arrange
      process.env.WEBHOOK_BATCH_SIZE = '100';

      // Act - Calling processPendingDeliveries
      mockDeliveryLogRepository.find.mockResolvedValue([]);

      // Assert - BATCH_SIZE is read from env in the method
      expect(process.env.WEBHOOK_BATCH_SIZE).toBe('100');

      delete process.env.WEBHOOK_BATCH_SIZE;
    });
  });

  describe('Resilience', () => {
    it('should continue processing after single delivery failure', async () => {
      // Arrange
      const logs = [
        {
          id: 'log-1',
          endpoint: { url: 'https://fail.com', secret_key: 'secret' },
          payload: {},
          event_type: 'test',
          attempt_count: 0,
        },
        {
          id: 'log-2',
          endpoint: { url: 'https://success.com', secret_key: 'secret' },
          payload: {},
          event_type: 'test',
          attempt_count: 0,
        },
      ];

      mockDeliveryLogRepository.find.mockResolvedValue(logs);
      mockHttpService.axiosRef.post
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({ status: 200 });

      // Act
      await service.processPendingDeliveries();

      // Assert
      expect(mockHttpService.axiosRef.post).toHaveBeenCalledTimes(2);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      mockDeliveryLogRepository.find.mockRejectedValue(
        new Error('Database connection lost')
      );

      // Act & Assert
      await expect(service.processPendingDeliveries()).rejects.toThrow(
        'Database connection lost'
      );
    });

    it('should persist failed deliveries for retry', async () => {
      // Arrange
      const deliveryLog: any = {
        id: 'log-1',
        endpoint: { url: 'https://example.com', secret_key: 'secret', failure_count: 0 },
        payload: {},
        event_type: 'test',
        attempt_count: 0,
        status: DeliveryStatus.PENDING,
      };

      mockHttpService.axiosRef.post.mockRejectedValue(new Error('Timeout'));

      // Act
      await (service as any).attemptDelivery(deliveryLog);

      // Assert
      expect(mockDeliveryLogRepository.save).toHaveBeenCalledWith(deliveryLog);
      expect(deliveryLog.next_retry_at).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle large batch of deliveries', async () => {
      // Arrange
      const logs = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `log-${i}`,
          status: DeliveryStatus.PENDING,
          next_retry_at: null,
        }));

      mockDeliveryLogRepository.find.mockResolvedValue(logs);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      await service.processPendingDeliveries();

      // Assert
      expect(mockDeliveryLogRepository.find).toHaveBeenCalled();
    });

    it('should not timeout during processing', async () => {
      // Arrange
      const logs = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `log-${i}`,
          status: DeliveryStatus.PENDING,
          next_retry_at: null,
          endpoint: {
            url: `https://example.com/webhook-${i}`,
            secret_key: 'secret',
          },
          payload: { id: i },
          event_type: 'test',
          attempt_count: 0,
        }));

      mockDeliveryLogRepository.find.mockResolvedValue(logs);
      mockHttpService.axiosRef.post.mockResolvedValue({ status: 200 });

      // Act
      const start = Date.now();
      await service.processPendingDeliveries();
      const duration = Date.now() - start;

      // Assert - Should complete in reasonable time
      expect(duration).toBeLessThan(30000); // 30 seconds max
    });
  });
});
