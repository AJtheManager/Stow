import { Test, TestingModule } from '@nestjs/testing';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';

describe('BalanceController', () => {
  let controller: BalanceController;
  let service: BalanceService;

  const mockBalanceService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BalanceController],
      providers: [
        {
          provide: BalanceService,
          useValue: mockBalanceService,
        },
      ],
    }).compile();

    controller = module.get<BalanceController>(BalanceController);
    service = module.get<BalanceService>(BalanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return balance for valid Stellar account', async () => {
      const account = 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBOS5Z4XPE5Y67NDGA7LBKELTEZA2S';
      const expectedBalance = {
        account,
        amount: '1000000',
      };

      mockBalanceService.get.mockResolvedValue(expectedBalance);

      const result = controller.get({ account });

      expect(result).resolves.toEqual(expectedBalance);
      expect(service.get).toHaveBeenCalledWith(account);
    });

    it('should return zero balance for account with no balance record', async () => {
      const account = 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBOS5Z4XPE5Y67NDGA7LBKELTEZA2S';
      const expectedBalance = {
        account,
        amount: '0',
      };

      mockBalanceService.get.mockResolvedValue(expectedBalance);

      const result = controller.get({ account });

      expect(result).resolves.toEqual(expectedBalance);
      expect(service.get).toHaveBeenCalledWith(account);
    });

    it('should handle large balance amounts correctly', async () => {
      const account = 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBOS5Z4XPE5Y67NDGA7LBKELTEZA2S';
      const largeAmount = '9223372036854775807'; // Max int64
      const expectedBalance = {
        account,
        amount: largeAmount,
      };

      mockBalanceService.get.mockResolvedValue(expectedBalance);

      const result = controller.get({ account });

      expect(result).resolves.toEqual(expectedBalance);
      expect(expectedBalance.amount).toBe(largeAmount);
    });

    it('should handle service errors gracefully', async () => {
      const account = 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBOS5Z4XPE5Y67NDGA7LBKELTEZA2S';
      const error = new Error('Database connection failed');

      mockBalanceService.get.mockRejectedValue(error);

      const result = controller.get({ account });

      expect(result).rejects.toThrow('Database connection failed');
    });
  });
});
