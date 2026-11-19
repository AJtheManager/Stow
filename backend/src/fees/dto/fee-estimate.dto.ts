import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export const FEE_OPERATIONS = ['deposit', 'withdrawal'] as const;

export type FeeOperation = (typeof FEE_OPERATIONS)[number];

/**
 * Query for `GET /fees/estimate?operation=&sponsored=`.
 */
export class FeeEstimateQueryDto {
  @ApiProperty({
    description: 'Operation to estimate the network fee for',
    enum: FEE_OPERATIONS,
    example: 'deposit',
  })
  @IsIn(FEE_OPERATIONS, {
    message: `operation must be one of: ${FEE_OPERATIONS.join(', ')}`,
  })
  operation: FeeOperation;

  @ApiPropertyOptional({
    description:
      'Whether the fee is sponsored; applies the configured sponsorship discount',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'sponsored must be true or false' })
  sponsored?: boolean;
}

/**
 * A fee amount expressed in stroops, XLM and USD.
 *
 * All values are strings so large or very small amounts never lose
 * precision as JS numbers. `usd` is `null` when no XLM/USD rate is available.
 */
export class FeeAmountDto {
  @ApiProperty({
    description: 'Amount in stroops (1 XLM = 10^7 stroops)',
    example: '100',
  })
  stroops: string;

  @ApiProperty({
    description: 'Amount in XLM, 7 decimal places',
    example: '0.0000100',
  })
  xlm: string;

  @ApiProperty({
    description: 'USD equivalent at the current rate, 8 decimal places',
    example: '0.00000120',
    nullable: true,
    type: String,
  })
  usd: string | null;
}

export class FeeDiscountDto extends FeeAmountDto {
  @ApiProperty({
    description: 'Sponsorship discount applied, in basis points (10000 = 100%)',
    example: 10000,
  })
  bps: number;
}

export class FeeEstimateResponseDto {
  @ApiProperty({ enum: FEE_OPERATIONS, example: 'deposit' })
  operation: FeeOperation;

  @ApiProperty({ description: 'Whether the sponsorship discount was applied' })
  sponsored: boolean;

  @ApiProperty({
    description: 'Network inclusion fee per operation, in stroops',
    example: '100',
  })
  baseFeeStroops: string;

  @ApiProperty({
    description:
      '`network` when read from the current fee stats, `fallback` when the network fee could not be fetched and the protocol minimum was used',
    enum: ['network', 'fallback'],
  })
  baseFeeSource: 'network' | 'fallback';

  @ApiProperty({
    description: 'Number of operations the fee covers',
    example: 1,
  })
  operationCount: number;

  @ApiProperty({
    description: 'Fee before any sponsorship discount',
    type: FeeAmountDto,
  })
  grossFee: FeeAmountDto;

  @ApiProperty({
    description: 'Sponsorship discount (zero when not sponsored)',
    type: FeeDiscountDto,
  })
  discount: FeeDiscountDto;

  @ApiProperty({
    description: 'Fee the user pays after the discount',
    type: FeeAmountDto,
  })
  netFee: FeeAmountDto;

  @ApiProperty({
    description: 'XLM/USD rate used for the USD figures; null if unavailable',
    example: '0.12000000',
    nullable: true,
    type: String,
  })
  xlmUsdRate: string | null;

  @ApiProperty({ description: 'ISO-8601 time the estimate was computed' })
  estimatedAt: string;
}
