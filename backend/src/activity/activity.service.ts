import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Goal } from '../goals/entities/goal.entity';
import {
  ContractEvent,
  ContractEventStatus,
} from '../indexer/entities/contract-event.entity';
import {
  ACTIVITY_TYPES,
  ActivityQueryDto,
  ActivityType,
  DEFAULT_ACTIVITY_LIMIT,
} from './dto/activity-query.dto';

/** Upper bound on rows written to a single CSV export. */
export const MAX_EXPORT_ROWS = 10_000;

/** Contract event topic backing each activity type. */
const EVENT_TOPIC_BY_TYPE: Record<ActivityType, string> = {
  deposit: 'deposit',
  withdrawal: 'withdraw',
  goal_created: 'goal_created',
  goal_contribution: 'goal_contribution',
  goal_reached: 'goal_reached',
};

const TYPE_BY_EVENT_TOPIC: Record<string, ActivityType> = Object.fromEntries(
  Object.entries(EVENT_TOPIC_BY_TYPE).map(([type, topic]) => [topic, type]),
) as Record<string, ActivityType>;

/** Goal events carry the goal id, not the owner, so they're matched by id. */
const GOAL_TOPICS = ['goal_contribution', 'goal_reached'];

const STROOPS_PER_UNIT = BigInt(10_000_000);

export interface ActivityItem {
  id: string;
  type: ActivityType;
  /** Amount in stroops, or null for events without one (e.g. goal_reached). */
  amount: string | null;
  goal_id: string | null;
  goal_name: string | null;
  tx_hash: string | null;
  ledger: number;
  occurred_at: string;
}

const CSV_COLUMNS = [
  'date',
  'type',
  'amount',
  'amount_stroops',
  'goal_id',
  'goal_name',
  'tx_hash',
  'ledger',
  'event_id',
] as const;

/**
 * Builds an address's activity timeline (deposits, withdrawals and goal
 * milestones) from indexed contract events, and serialises it to CSV for
 * transaction-history exports.
 */
@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
  ) {}

  async list(
    query: ActivityQueryDto,
    limit = query.limit ?? DEFAULT_ACTIVITY_LIMIT,
  ): Promise<ActivityItem[]> {
    const { address } = query;
    const types = query.types?.length ? query.types : [...ACTIVITY_TYPES];
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from > to) {
      throw new BadRequestException('from must be before to');
    }

    const goals = await this.goalRepository.find({
      where: { owner: address },
      select: ['on_chain_id', 'name'],
    });
    const goalNames = new Map(goals.map((g) => [g.on_chain_id, g.name]));
    const goalIds = [...goalNames.keys()];

    const topics = types.map((type) => EVENT_TOPIC_BY_TYPE[type]);
    const goalTopics = topics.filter((topic) => GOAL_TOPICS.includes(topic));

    const qb = this.contractEventRepository
      .createQueryBuilder('event')
      .where('event.event_type IN (:...topics)', { topics })
      .andWhere('event.status = :status', {
        status: ContractEventStatus.PROCESSED,
      })
      .andWhere(
        new Brackets((sub) => {
          sub.where(
            "COALESCE(event.data->>'owner', event.data->>'user', event.data->>'account') = :address",
            { address },
          );
          if (goalTopics.length && goalIds.length) {
            sub.orWhere(
              "(event.event_type IN (:...goalTopics) AND COALESCE(event.data->>'id', event.data->>'goal_id') IN (:...goalIds))",
              { goalTopics, goalIds },
            );
          }
        }),
      );

    if (from) qb.andWhere('event.created_at >= :from', { from });
    if (to) qb.andWhere('event.created_at <= :to', { to });

    const events = await qb
      .orderBy('event.created_at', 'DESC')
      .addOrderBy('event.ledger', 'DESC')
      .addOrderBy('event.log_index', 'DESC')
      .take(limit)
      .getMany();

    return events.map((event) => this.toActivityItem(event, goalNames));
  }

  async exportCsv(query: ActivityQueryDto): Promise<string> {
    const items = await this.list(query, MAX_EXPORT_ROWS);
    const rows = items.map((item) => [
      item.occurred_at,
      item.type,
      item.amount === null ? '' : formatStroops(item.amount),
      item.amount ?? '',
      item.goal_id ?? '',
      item.goal_name ?? '',
      item.tx_hash ?? '',
      String(item.ledger),
      item.id,
    ]);

    return [CSV_COLUMNS, ...rows]
      .map((row) => row.map(escapeCsvField).join(','))
      .join('\r\n');
  }

  private toActivityItem(
    event: ContractEvent,
    goalNames: Map<string, string>,
  ): ActivityItem {
    const data = event.data ?? {};
    const type = TYPE_BY_EVENT_TOPIC[event.event_type];
    const isGoalEvent = type.startsWith('goal_');
    const rawGoalId = isGoalEvent ? (data.id ?? data.goal_id) : undefined;
    const goalId = rawGoalId === undefined ? null : String(rawGoalId);
    const rawAmount =
      type === 'goal_created' ? data.target_amount : data.amount;

    return {
      id: event.id,
      type,
      amount:
        rawAmount === undefined || rawAmount === null
          ? null
          : String(rawAmount),
      goal_id: goalId,
      goal_name:
        goalId === null
          ? null
          : (goalNames.get(goalId) ??
            (typeof data.name === 'string' ? data.name : null)),
      tx_hash: event.tx_hash,
      ledger: Number(event.ledger),
      occurred_at: new Date(event.created_at).toISOString(),
    };
  }
}

/** Formats a stroop integer string as a plain 7-decimal amount. */
function formatStroops(stroops: string): string {
  if (!/^-?\d+$/.test(stroops)) return stroops;
  const value = BigInt(stroops);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const whole = abs / STROOPS_PER_UNIT;
  const fraction = (abs % STROOPS_PER_UNIT).toString().padStart(7, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/**
 * Quotes a CSV field when needed and neutralises spreadsheet formula
 * injection for user-controlled values like goal names.
 */
export function escapeCsvField(value: string): string {
  let field = value;
  if (/^[=+\-@\t\r]/.test(field) && !/^-?\d+(\.\d+)?$/.test(field)) {
    field = `'${field}`;
  }
  if (/[",\r\n]/.test(field)) {
    field = `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
