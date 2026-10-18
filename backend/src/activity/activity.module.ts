import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from '../goals/entities/goal.entity';
import { ContractEvent } from '../indexer/entities/contract-event.entity';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContractEvent, Goal])],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
