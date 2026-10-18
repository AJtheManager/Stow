import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ThrottleTier } from '../common/decorators/throttle-tier.decorator';
import { ActivityItem, ActivityService } from './activity.service';
import { ActivityQueryDto } from './dto/activity-query.dto';

@ApiTags('savings')
@Controller('savings/activity')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  /**
   * GET /savings/activity?address=&from=&to=&types=&limit=
   *
   * Returns the address's activity timeline (deposits, withdrawals, goal
   * milestones), newest first, optionally filtered by date range and type.
   */
  @Get()
  @Public()
  @ThrottleTier('read')
  @ApiOperation({ summary: "List an address's account activity timeline" })
  @ApiResponse({ status: 200, description: 'Activity entries, newest first' })
  @ApiResponse({ status: 400, description: 'Invalid filter value' })
  list(@Query() query: ActivityQueryDto): Promise<ActivityItem[]> {
    return this.activityService.list(query);
  }

  /**
   * GET /savings/activity/export?address=&from=&to=&types=
   *
   * Downloads the address's transaction history as CSV, honouring the same
   * date range and type filters as the timeline.
   */
  @Get('export')
  @Public()
  @ThrottleTier('read')
  @ApiOperation({ summary: "Export an address's transaction history as CSV" })
  @ApiResponse({ status: 200, description: 'CSV file' })
  @ApiResponse({ status: 400, description: 'Invalid filter value' })
  async export(
    @Query() query: ActivityQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.activityService.exportCsv(query);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="stow-transactions-${date}.csv"`,
    });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }
}
