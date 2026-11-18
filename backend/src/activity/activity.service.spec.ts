import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Goal } from '../goals/entities/goal.entity';
import { ContractEvent } from '../indexer/entities/contract-event.entity';
import {
  ActivityService,
  MAX_EXPORT_ROWS,
  formatCsvDate,
} from './activity.service';
import { ActivityQueryDto } from './dto/activity-query.dto';

const ADDRESS = 'GABC';
const EXPORTED_AT = new Date('2026-11-18T09:30:15.000Z');

function event(
  overrides: Partial<ContractEvent> & { data: Record<string, unknown> },
): ContractEvent {
  return {
    id: 'evt',
    event_type: 'deposit',
    tx_hash: 'hash',
    ledger: 100,
    created_at: new Date('2026-11-10T12:00:00.000Z'),
    ...overrides,
  } as unknown as ContractEvent;
}

describe('ActivityService', () => {
  let events: ContractEvent[];
  let qb: Record<string, jest.Mock>;
  let service: ActivityService;

  const query = (overrides: Partial<ActivityQueryDto> = {}) => ({
    address: ADDRESS,
    ...overrides,
  });

  beforeEach(() => {
    events = [];
    qb = {};
    for (const method of [
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'take',
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.getMany = jest.fn(async () => events);

    service = new ActivityService(
      {
        createQueryBuilder: jest.fn(() => qb),
      } as unknown as Repository<ContractEvent>,
      {
        find: jest.fn(async () => [{ on_chain_id: '7', name: 'Holiday' }]),
      } as unknown as Repository<Goal>,
    );
  });

  describe('list', () => {
    it('reports the post-event balance for deposits and withdrawals only', async () => {
      events = [
        event({
          id: 'w',
          event_type: 'withdraw',
          data: { amount: '30', new_balance: '70' },
        }),
        event({
          id: 'd',
          event_type: 'deposit',
          data: { amount: '100', new_balance: '100' },
        }),
        event({
          id: 'g',
          event_type: 'goal_contribution',
          data: { id: '7', amount: '5' },
        }),
      ];

      const items = await service.list(query());

      expect(items.map((i) => [i.type, i.balance])).toEqual([
        ['withdrawal', '70'],
        ['deposit', '100'],
        ['goal_contribution', null],
      ]);
    });

    it('rejects a start date after the end date', async () => {
      await expect(
        service.list(
          query({
            from: '2026-11-10T00:00:00.000Z',
            to: '2026-11-01T00:00:00.000Z',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('exportCsv', () => {
    const lines = (csv: string) => csv.split('\r\n');

    it('starts with metadata: account address and export date', async () => {
      const csv = await service.exportCsv(query(), EXPORTED_AT);

      expect(lines(csv).slice(0, 3)).toEqual([
        'Account address,GABC',
        'Export date,2026-11-18 09:30:15 UTC',
        '',
      ]);
    });

    it('records the date range and types when filtered', async () => {
      const csv = await service.exportCsv(
        query({
          from: '2026-11-01T00:00:00.000Z',
          to: '2026-11-30T23:59:59.999Z',
          types: ['deposit', 'withdrawal'],
        }),
        EXPORTED_AT,
      );

      expect(lines(csv).slice(0, 6)).toEqual([
        'Account address,GABC',
        'Export date,2026-11-18 09:30:15 UTC',
        'From,2026-11-01 00:00:00 UTC',
        'To,2026-11-30 23:59:59 UTC',
        'Types,deposit withdrawal',
        '',
      ]);
    });

    it('has date, type, amount and balance columns', async () => {
      const csv = await service.exportCsv(query(), EXPORTED_AT);
      const header = lines(csv)[3].split(',');

      expect(header.slice(0, 6)).toEqual([
        'date',
        'type',
        'amount',
        'amount_stroops',
        'balance',
        'balance_stroops',
      ]);
    });

    it('includes every transaction with human-readable dates and balances', async () => {
      events = [
        event({
          id: 'w',
          event_type: 'withdraw',
          created_at: new Date('2026-11-12T08:05:09.123Z'),
          data: { amount: '15000000', new_balance: '85000000' },
        }),
        event({
          id: 'd',
          event_type: 'deposit',
          data: { amount: '100000000', new_balance: '100000000' },
        }),
      ];

      const rows = lines(await service.exportCsv(query(), EXPORTED_AT)).slice(
        4,
      );

      expect(rows).toHaveLength(2);
      expect(rows[0].split(',').slice(0, 6)).toEqual([
        '2026-11-12 08:05:09 UTC',
        'withdrawal',
        '1.5000000',
        '15000000',
        '8.5000000',
        '85000000',
      ]);
      expect(rows[1].split(',').slice(0, 6)).toEqual([
        '2026-11-10 12:00:00 UTC',
        'deposit',
        '10.0000000',
        '100000000',
        '10.0000000',
        '100000000',
      ]);
    });

    it('leaves balance blank for goal events', async () => {
      events = [
        event({
          id: 'g',
          event_type: 'goal_contribution',
          data: { id: '7', amount: '5' },
        }),
      ];

      const [row] = lines(await service.exportCsv(query(), EXPORTED_AT)).slice(
        4,
      );
      const cells = row.split(',');

      expect(cells[1]).toBe('goal_contribution');
      expect(cells[4]).toBe('');
      expect(cells[5]).toBe('');
      expect(cells[6]).toBe('7');
      expect(cells[7]).toBe('Holiday');
    });

    it('applies the date range to the query', async () => {
      await service.exportCsv(
        query({
          from: '2026-11-01T00:00:00.000Z',
          to: '2026-11-30T23:59:59.999Z',
        }),
        EXPORTED_AT,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('event.created_at >= :from', {
        from: new Date('2026-11-01T00:00:00.000Z'),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('event.created_at <= :to', {
        to: new Date('2026-11-30T23:59:59.999Z'),
      });
    });

    it('is not truncated to the timeline page size', async () => {
      await service.exportCsv(query(), EXPORTED_AT);

      expect(qb.take).toHaveBeenCalledWith(MAX_EXPORT_ROWS);
    });

    it('neutralises spreadsheet formulas in goal names', async () => {
      const injected = new ActivityService(
        {
          createQueryBuilder: jest.fn(() => qb),
        } as unknown as Repository<ContractEvent>,
        {
          find: jest.fn(async () => [
            { on_chain_id: '7', name: '=HYPERLINK("x")' },
          ]),
        } as unknown as Repository<Goal>,
      );
      events = [event({ event_type: 'goal_reached', data: { id: '7' } })];

      const csv = await injected.exportCsv(query(), EXPORTED_AT);

      expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    });
  });

  describe('formatCsvDate', () => {
    it('formats as YYYY-MM-DD HH:mm:ss UTC, dropping milliseconds', () => {
      expect(formatCsvDate('2026-01-02T03:04:05.678Z')).toBe(
        '2026-01-02 03:04:05 UTC',
      );
      expect(formatCsvDate(new Date('2026-12-31T23:59:59.000Z'))).toBe(
        '2026-12-31 23:59:59 UTC',
      );
    });
  });
});
