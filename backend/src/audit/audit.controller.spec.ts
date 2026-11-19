import { ValidationPipe } from '@nestjs/common';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuditController } from './audit.controller';
import { AuditLoggerService } from './audit-logger.service';
import { AccessPatternsDto, AuditSearchDto } from './dto/audit-query.dto';

function setup() {
  const auditLogger = {
    search: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
    exportCsv: jest.fn().mockResolvedValue('id,timestamp\r\n'),
    getAccessPatterns: jest.fn().mockResolvedValue([]),
  };
  const controller = new AuditController(
    auditLogger as unknown as AuditLoggerService,
  );
  return { controller, auditLogger };
}

const pipe = new ValidationPipe({ whitelist: true, transform: true });

async function parse<T>(type: new () => T, value: Record<string, unknown>) {
  return (await pipe.transform(value, { type: 'query', metatype: type })) as T;
}

describe('AuditController', () => {
  it('is restricted to admins', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AuditController)).toEqual([
      Role.Admin,
    ]);
  });

  describe('search', () => {
    it('passes filters, page and limit to the service separately', async () => {
      const { controller, auditLogger } = setup();
      const from = new Date('2026-01-01');

      await controller.search({
        userId: 'alice',
        action: 'goals',
        page: 2,
        limit: 25,
        from,
      } as AuditSearchDto);

      expect(auditLogger.search).toHaveBeenCalledWith(
        { userId: 'alice', action: 'goals', from },
        2,
        25,
      );
    });

    it('returns the service result unchanged', async () => {
      const { controller, auditLogger } = setup();
      const result = { items: [{ id: '1' }], total: 1, page: 1, limit: 50 };
      auditLogger.search.mockResolvedValue(result);

      await expect(controller.search({} as AuditSearchDto)).resolves.toBe(
        result,
      );
    });
  });

  describe('export', () => {
    it('returns the CSV and sets a dated attachment filename', async () => {
      const { controller, auditLogger } = setup();
      const res = { setHeader: jest.fn() };

      const csv = await controller.export({ userId: 'alice' }, res as never);

      expect(csv).toBe('id,timestamp\r\n');
      expect(auditLogger.exportCsv).toHaveBeenCalledWith({ userId: 'alice' });
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(
          /^attachment; filename="audit-logs-\d{4}-\d{2}-\d{2}T[\d-]+Z\.csv"$/,
        ),
      );
    });

    it('declares the response as CSV', () => {
      const headers = Reflect.getMetadata(
        '__headers__',
        AuditController.prototype.export,
      ) as Array<{ name: string; value: string }>;

      expect(headers).toContainEqual({
        name: 'Content-Type',
        value: 'text/csv; charset=utf-8',
      });
    });
  });

  describe('access patterns', () => {
    it('passes filters and the top-N limit separately', async () => {
      const { controller, auditLogger } = setup();

      await controller.accessPatterns({
        userId: 'alice',
        top: 5,
      } as AccessPatternsDto);

      expect(auditLogger.getAccessPatterns).toHaveBeenCalledWith(
        { userId: 'alice' },
        5,
      );
    });
  });

  describe('query validation', () => {
    it('turns query strings into numbers and dates', async () => {
      const query = await parse(AuditSearchDto, {
        page: '3',
        limit: '20',
        statusCode: '403',
        from: '2026-01-01T00:00:00Z',
      });

      expect(query.page).toBe(3);
      expect(query.limit).toBe(20);
      expect(query.statusCode).toBe(403);
      expect(query.from).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it.each([
      ['a page below 1', { page: '0' }],
      ['a limit above the maximum', { limit: '201' }],
      ['a non-numeric limit', { limit: 'many' }],
      ['a status code out of range', { statusCode: '99' }],
      ['an unreadable date', { from: 'yesterday-ish' }],
    ])('rejects %s', async (_label, value) => {
      await expect(parse(AuditSearchDto, value)).rejects.toThrow();
    });

    it('rejects an oversize filter value', async () => {
      await expect(
        parse(AuditSearchDto, { userId: 'u'.repeat(65) }),
      ).rejects.toThrow();
    });

    it('caps the access pattern list at 100', async () => {
      await expect(parse(AccessPatternsDto, { top: '101' })).rejects.toThrow();
      await expect(
        parse(AccessPatternsDto, { top: '100' }),
      ).resolves.toBeDefined();
    });

    it('drops unknown query parameters', async () => {
      const query = await parse(AuditSearchDto, { userId: 'a', sneaky: 'x' });

      expect(query).not.toHaveProperty('sneaky');
    });
  });
});
