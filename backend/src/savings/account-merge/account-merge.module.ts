import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from '../../goals/entities/goal.entity';
import { ContractEvent } from '../../indexer/entities/contract-event.entity';
import { LockedPlan } from '../entities/locked-plan.entity';
import { SavingsAccount } from '../entities/savings-account.entity';
import { AccountMergeController } from './account-merge.controller';
import { AccountMergeService } from './account-merge.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingsAccount, Goal, LockedPlan, ContractEvent]),
  ],
  controllers: [AccountMergeController],
  providers: [AccountMergeService],
})
export class AccountMergeModule {}
