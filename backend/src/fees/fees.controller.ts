import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ThrottleTier } from '../common/decorators/throttle-tier.decorator';
import {
  FeeEstimateQueryDto,
  FeeEstimateResponseDto,
} from './dto/fee-estimate.dto';
import { FeeEstimationService } from './fee-estimation.service';

@ApiTags('fees')
@Controller('fees')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class FeesController {
  constructor(private readonly feeEstimation: FeeEstimationService) {}

  /**
   * GET /fees/estimate?operation=deposit|withdrawal&sponsored=true|false
   *
   * Previews the network fee, in stroops, XLM and USD, before the user
   * commits to an operation.
   */
  @Get('estimate')
  @Public()
  @ThrottleTier('read')
  @ApiOperation({
    summary: 'Estimate the network fee for a deposit or withdrawal',
  })
  @ApiResponse({ status: 200, type: FeeEstimateResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid operation or sponsored value',
  })
  estimate(
    @Query() query: FeeEstimateQueryDto,
  ): Promise<FeeEstimateResponseDto> {
    return this.feeEstimation.estimate(query);
  }
}
