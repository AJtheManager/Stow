import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Goal } from '../../goals/entities/goal.entity';
import { ContractEvent } from '../../indexer/entities/contract-event.entity';
import { LockedPlan } from '../entities/locked-plan.entity';
import { SavingsAccount } from '../entities/savings-account.entity';

export interface MergeSavingsAccountsResult {
  source_owner: string;
  target_owner: string;
  balance_moved: string;
  target_balance: string;
  goals_moved: number;
  locked_plans_moved: number;
  events_updated: number;
  archived_at: Date;
}

@Injectable()
export class AccountMergeService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Merges `sourceOwner` into `targetOwner` in one transaction: the balance,
   * goals and locked plans move to the target, indexed events that name the
   * source are rewritten to the target, and the source row is archived.
   * Only the projection changes; on-chain balances are not touched.
   */
  async merge(
    sourceOwner: string,
    targetOwner: string,
  ): Promise<MergeSavingsAccountsResult> {
    if (sourceOwner === targetOwner) {
      throw new BadRequestException(
        'Source and target accounts must be different',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const accounts = await manager.find(SavingsAccount, {
        where: [{ owner: sourceOwner }, { owner: targetOwner }],
        lock: { mode: 'pessimistic_write' },
      });
      const source = accounts.find((a) => a.owner === sourceOwner);
      const target = accounts.find((a) => a.owner === targetOwner);
      if (!source || !target) {
        throw new NotFoundException('Savings account not found');
      }
      if (source.archived_at || target.archived_at) {
        throw new ConflictException(
          'Archived savings accounts cannot be merged',
        );
      }

      const balanceMoved = BigInt(source.balance);
      target.balance = (BigInt(target.balance) + balanceMoved).toString();
      const archivedAt = new Date();
      source.balance = '0';
      source.archived_at = archivedAt;
      source.merged_into = targetOwner;
      await manager.save([target, source]);

      const goals = await manager.update(
        Goal,
        { owner: sourceOwner },
        { owner: targetOwner },
      );
      const plans = await manager.update(
        LockedPlan,
        { owner: sourceOwner },
        { owner: targetOwner },
      );
      const events = await manager
        .createQueryBuilder()
        .update(ContractEvent)
        .set({
          data: () => 'REPLACE("data"::text, :source, :target)::jsonb',
        })
        .where('"data"::text LIKE :pattern', { pattern: `%${sourceOwner}%` })
        .setParameters({ source: sourceOwner, target: targetOwner })
        .execute();

      return {
        source_owner: sourceOwner,
        target_owner: targetOwner,
        balance_moved: balanceMoved.toString(),
        target_balance: target.balance,
        goals_moved: goals.affected ?? 0,
        locked_plans_moved: plans.affected ?? 0,
        events_updated: events.affected ?? 0,
        archived_at: archivedAt,
      };
    });
  }
}
