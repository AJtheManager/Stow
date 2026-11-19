/**
 * Test helpers for the audit module: an in-memory stand-in for the
 * `Repository<AuditLog>` that understands the TypeORM find operators the
 * service uses, so tests exercise real filtering, ordering and paging.
 */
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { FindOperator } from 'typeorm';
import { AuditLoggerService } from './audit-logger.service';
import { AuditLog } from './entities/audit-log.entity';

export const TEST_KEY_HEX =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

/** Turns a SQL LIKE pattern (with `\` escapes) into an anchored regex. */
function likeToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\' && i + 1 < pattern.length) {
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (char === '%') {
      source += '[\\s\\S]*';
    } else if (char === '_') {
      source += '[\\s\\S]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

function matches(actual: unknown, expected: unknown): boolean {
  if (!(expected instanceof FindOperator)) return actual === expected;

  const value = expected.value as unknown;
  switch (expected.type) {
    case 'ilike':
    case 'like':
      return (
        typeof actual === 'string' && likeToRegExp(value as string).test(actual)
      );
    case 'lessThan':
      return (actual as Date) < (value as Date);
    case 'lessThanOrEqual':
      return (actual as Date) <= (value as Date);
    case 'moreThanOrEqual':
      return (actual as Date) >= (value as Date);
    case 'between': {
      const [from, to] = value as [Date, Date];
      return (actual as Date) >= from && (actual as Date) <= to;
    }
    default:
      throw new Error(`Fake repository does not support "${expected.type}"`);
  }
}

interface FindArgs {
  where?: Record<string, unknown>;
  order?: Record<string, 'ASC' | 'DESC'>;
  skip?: number;
  take?: number;
}

export class FakeAuditRepository {
  rows: AuditLog[] = [];
  /** Calls made to the fake query builder, for asserting on its shape. */
  builderCalls: Array<[string, ...unknown[]]> = [];
  rawResult: unknown[] = [];
  failSaveWith: Error | null = null;
  private clock: () => Date = () => new Date();

  setClock(clock: () => Date): void {
    this.clock = clock;
  }

  create(partial: Partial<AuditLog>): AuditLog {
    return {
      id: randomUUID(),
      createdAt: this.clock(),
      ...partial,
    } as AuditLog;
  }

  save(entry: AuditLog): Promise<AuditLog> {
    if (this.failSaveWith) return Promise.reject(this.failSaveWith);
    this.rows.push(entry);
    return Promise.resolve(entry);
  }

  private select(args: FindArgs): AuditLog[] {
    const where = args.where ?? {};
    let result = this.rows.filter((row) =>
      Object.entries(where).every(([key, expected]) =>
        matches((row as unknown as Record<string, unknown>)[key], expected),
      ),
    );

    const order = Object.entries(args.order ?? {});
    result = [...result].sort((a, b) => {
      for (const [key, direction] of order) {
        const left = (a as unknown as Record<string, unknown>)[key] as
          | Date
          | string;
        const right = (b as unknown as Record<string, unknown>)[key] as
          | Date
          | string;
        if (left < right) return direction === 'ASC' ? -1 : 1;
        if (left > right) return direction === 'ASC' ? 1 : -1;
      }
      return 0;
    });
    return result;
  }

  find(args: FindArgs = {}): Promise<AuditLog[]> {
    const all = this.select(args);
    const skip = args.skip ?? 0;
    return Promise.resolve(
      all.slice(skip, args.take ? skip + args.take : undefined),
    );
  }

  async findAndCount(args: FindArgs = {}): Promise<[AuditLog[], number]> {
    const total = this.select({ ...args, skip: 0, take: undefined }).length;
    return [await this.find(args), total];
  }

  delete(where: Record<string, unknown>): Promise<{ affected: number }> {
    const doomed = new Set(this.select({ where }));
    this.rows = this.rows.filter((row) => !doomed.has(row));
    return Promise.resolve({ affected: doomed.size });
  }

  createQueryBuilder(alias: string) {
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        this.builderCalls.push([name, ...args]);
        return builder;
      };
    const builder = {
      alias,
      select: record('select'),
      addSelect: record('addSelect'),
      where: record('where'),
      andWhere: record('andWhere'),
      groupBy: record('groupBy'),
      addGroupBy: record('addGroupBy'),
      orderBy: record('orderBy'),
      limit: record('limit'),
      getRawMany: () => Promise.resolve(this.rawResult),
    };
    return builder;
  }
}

export interface ServiceHarness {
  service: AuditLoggerService;
  repository: FakeAuditRepository;
}

export function makeAuditService(
  config: Record<string, string | undefined> = {},
): ServiceHarness {
  const values: Record<string, string | undefined> = {
    AUDIT_LOG_ENCRYPTION_KEY: TEST_KEY_HEX,
    ...config,
  };
  const repository = new FakeAuditRepository();
  const service = new AuditLoggerService(
    { get: (key: string) => values[key] } as unknown as ConfigService,
    repository as never,
  );
  return { service, repository };
}
