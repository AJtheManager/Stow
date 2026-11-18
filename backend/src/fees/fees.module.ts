import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FeeEstimationService } from './fee-estimation.service';
import { FeesController } from './fees.controller';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [FeesController],
  providers: [FeeEstimationService],
  exports: [FeeEstimationService],
})
export class FeesModule {}
