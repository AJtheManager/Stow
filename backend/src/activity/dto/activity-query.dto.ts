import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { STELLAR_ACCOUNT_ADDRESS_PATTERN } from '../../savings/dto/stellar-address.dto';

export const ACTIVITY_TYPES = [
  'deposit',
  'withdrawal',
  'goal_created',
  'goal_contribution',
  'goal_reached',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DEFAULT_ACTIVITY_LIMIT = 100;
export const MAX_ACTIVITY_LIMIT = 500;

/**
 * Query for `GET /savings/activity` and `GET /savings/activity/export`.
 *
 * `types` accepts a comma-separated list (`?types=deposit,withdrawal`);
 * omitting it returns every activity type. `from`/`to` bound the event's
 * indexed timestamp and are both optional.
 */
export class ActivityQueryDto {
  @ApiProperty({ description: 'Stellar public account address' })
  @IsString()
  @Matches(STELLAR_ACCOUNT_ADDRESS_PATTERN, {
    message: 'address must be a valid Stellar account address',
  })
  address: string;

  @ApiPropertyOptional({
    description: 'Start of the time window (ISO-8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the time window (ISO-8601)',
    example: '2026-01-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated activity types to include',
    enum: ACTIVITY_TYPES,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value,
  )
  @IsIn(ACTIVITY_TYPES, {
    each: true,
    message: `types must be any of: ${ACTIVITY_TYPES.join(', ')}`,
  })
  types?: ActivityType[];

  @ApiPropertyOptional({
    description: `Maximum number of entries (1-${MAX_ACTIVITY_LIMIT}); ignored by the CSV export`,
    default: DEFAULT_ACTIVITY_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ACTIVITY_LIMIT)
  limit?: number;
}
