# Interest Rate Service Guide

## Overview

The `InterestRateService` manages dynamic interest rate calculations for the Stow savings platform. It integrates utilization data, oracle prices, and rate smoothing algorithms to determine yield rates based on supply and demand dynamics.

## Architecture

### Core Components

```
InterestRateService
├── Configuration Management (getActiveConfig, createConfig, updateConfig, listConfigs)
├── Rate Calculation (calculateCurrentRate, getCurrentRate, projectRate)
├── Utilization Metrics (getUtilizationMetrics)
├── Historical Data (getRateHistory)
└── Oracle Integration (updateOraclePrice, getLatestOraclePrice)
```

### Dependencies

- **RateCalculatorService**: Performs mathematical calculations for rates and utilization
- **Repositories**:
  - `InterestRateConfig`: Stores configuration parameters
  - `InterestRateHistory`: Tracks historical rate changes
  - `OracleData`: Stores price feed data
  - `Balance`: Provides deposit amount data

## Configuration Model

### InterestRateConfig Entity

The configuration entity stores all parameters needed to calculate interest rates:

```typescript
{
  id: string;                    // Unique identifier
  name: string;                  // Configuration name (e.g., "USDC Weekly")
  description: string;           // Human-readable description
  asset: string;                 // Token asset (e.g., "USDC")
  base_rate: string;            // Starting base rate (in decimal, e.g., "0.02")
  min_rate: string;             // Minimum rate floor (e.g., "0.01")
  max_rate: string;             // Maximum rate ceiling (e.g., "0.10")
  optimal_utilization: string;  // Target utilization (e.g., "0.80" for 80%)
  slope_up: string;             // Rate increase slope above optimal utilization
  slope_down: string;           // Rate decrease slope below optimal utilization
  smoothing_factor: string;     // Exponential smoothing factor (0-1, e.g., "0.1")
  is_active: boolean;           // Whether this config is currently active
  notes: string;                // Administrative notes
  created_at: Date;             // Creation timestamp
  updated_at: Date;             // Last update timestamp
}
```

### Rate Calculation Parameters

The service uses the following parameters in rate calculations:

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `base_rate` | Starting annual percentage rate | 2% |
| `min_rate` | Absolute minimum rate | 1% |
| `max_rate` | Absolute maximum rate | 10% |
| `optimal_utilization` | Target capital utilization | 80% |
| `slope_up` | Rate increase per 1% above optimal | 2% |
| `slope_down` | Rate decrease per 1% below optimal | 0.5% |
| `smoothing_factor` | Weight for exponential moving average | 0.1 (10% new, 90% old) |

## API Reference

### Configuration Management

#### `getActiveConfig(): Promise<InterestRateConfig>`

Retrieves the currently active interest rate configuration.

**Returns**: Active `InterestRateConfig` or throws `NotFoundException`

**Example**:
```typescript
const activeConfig = await interestRateService.getActiveConfig();
console.log(activeConfig.name); // "USDC Weekly"
```

---

#### `getConfig(configId: string): Promise<InterestRateConfig>`

Retrieves a specific configuration by ID.

**Parameters**:
- `configId`: UUID of the configuration

**Returns**: `InterestRateConfig` or throws `NotFoundException`

**Example**:
```typescript
const config = await interestRateService.getConfig('550e8400-e29b-41d4-a716-446655440000');
```

---

#### `listConfigs(activeOnly?: boolean): Promise<InterestRateConfig[]>`

Lists all configurations, optionally filtered by active status.

**Parameters**:
- `activeOnly`: (Optional) If `true`, only returns active configurations (default: `false`)

**Returns**: Array of `InterestRateConfig` objects sorted by creation date (newest first)

**Example**:
```typescript
// Get all configurations
const allConfigs = await interestRateService.listConfigs();

// Get only active configurations
const activeConfigs = await interestRateService.listConfigs(true);
```

---

#### `createConfig(data: CreateInterestRateConfigDto): Promise<InterestRateConfig>`

Creates a new interest rate configuration.

**Parameters**:
- `data.name`: Configuration name
- `data.description`: Description
- `data.asset`: Token asset (default: "USDC")
- `data.base_rate`: Starting rate as number
- `data.min_rate`: Minimum rate as number
- `data.max_rate`: Maximum rate as number
- `data.optimal_utilization`: Target utilization as number (0-1)
- `data.slope_up`: Upslope coefficient
- `data.slope_down`: Downslope coefficient
- `data.smoothing_factor`: Smoothing weight (0-1)
- `data.notes`: (Optional) Administrative notes

**Returns**: Created `InterestRateConfig`

**Example**:
```typescript
const newConfig = await interestRateService.createConfig({
  name: 'USDC Dynamic',
  description: 'High-yield USDC configuration',
  asset: 'USDC',
  base_rate: 0.03,
  min_rate: 0.01,
  max_rate: 0.15,
  optimal_utilization: 0.75,
  slope_up: 0.05,
  slope_down: 0.02,
  smoothing_factor: 0.1,
});
```

---

#### `updateConfig(configId: string, data: Partial<CreateInterestRateConfigDto>): Promise<InterestRateConfig>`

Updates an existing configuration.

**Parameters**:
- `configId`: UUID of configuration to update
- `data`: Partial configuration object with fields to update

**Returns**: Updated `InterestRateConfig`

**Example**:
```typescript
const updated = await interestRateService.updateConfig(configId, {
  base_rate: 0.035,
  is_active: true,
});
```

---

### Rate Calculation

#### `calculateCurrentRate(configId: string): Promise<CurrentInterestRateDto>`

Calculates the current interest rate for a given configuration based on current utilization.

**Parameters**:
- `configId`: UUID of the configuration

**Returns**: 
```typescript
{
  apy: string;              // Annual percentage yield (e.g., "0.045")
  utilization: string;      // Current utilization ratio (e.g., "0.73")
  total_liquidity: string;  // Total deposits in base units
  total_utilization: string;// Total borrowed in base units
  config_id: string;        // Configuration ID
  config_name: string;      // Configuration name
  calculated_at: Date;      // Calculation timestamp
}
```

**Process**:
1. Retrieves current total deposits and borrowed amounts
2. Calculates utilization ratio: `borrowed / (deposits + borrowed)`
3. Retrieves previous rate from history
4. Applies smoothing: `new_rate = (1 - smoothing_factor) * old_rate + smoothing_factor * raw_rate`
5. Saves result to history for auditing
6. Returns calculated rate and metrics

**Example**:
```typescript
const rate = await interestRateService.calculateCurrentRate(configId);
console.log(`Current APY: ${(parseFloat(rate.apy) * 100).toFixed(2)}%`);
console.log(`Utilization: ${(parseFloat(rate.utilization) * 100).toFixed(2)}%`);
```

---

#### `getCurrentRate(): Promise<CurrentInterestRateDto>`

Convenience method that calculates the current rate for the active configuration.

**Returns**: `CurrentInterestRateDto` for the active configuration

**Example**:
```typescript
const currentRate = await interestRateService.getCurrentRate();
```

---

#### `projectRate(configId: string, utilization: number): Promise<string>`

Projects what the interest rate would be at a given utilization level.

**Parameters**:
- `configId`: UUID of the configuration
- `utilization`: Projected utilization ratio (0-1)

**Returns**: Projected annual rate as a string decimal

**Note**: This is a hypothetical calculation without updating history

**Example**:
```typescript
const projectedRate = await interestRateService.projectRate(configId, 0.85);
console.log(`Projected rate at 85% utilization: ${projectedRate}`);
```

---

### Metrics

#### `getUtilizationMetrics(): Promise<UtilizationMetricsDto>`

Retrieves current utilization metrics for the system.

**Returns**:
```typescript
{
  current_utilization: string;        // Current utilization (e.g., "0.7234")
  available_liquidity: string;        // Total deposits
  borrowed_amount: string;            // Total borrowed
  optimal_utilization: string;        // Target from config
  utilization_above_optimal: string | null; // Excess above target or null
  headroom_to_max: string;            // Percentage headroom to 100% (e.g., "27.66")
}
```

**Example**:
```typescript
const metrics = await interestRateService.getUtilizationMetrics();
console.log(`System at ${(parseFloat(metrics.current_utilization) * 100).toFixed(2)}% utilization`);
console.log(`Headroom: ${metrics.headroom_to_max}%`);
```

---

### Historical Data

#### `getRateHistory(configId: string, limit?: number): Promise<InterestRateHistoryDto[]>`

Retrieves historical rate calculations for a configuration.

**Parameters**:
- `configId`: UUID of the configuration
- `limit`: (Optional) Maximum number of records to return (default: 100)

**Returns**: Array of historical rate records sorted by timestamp (newest first)

**DTO Structure**:
```typescript
{
  id: string;                 // History record ID
  calculated_rate: string;    // Rate that was calculated
  utilization_ratio: string;  // Utilization at the time
  previous_rate: string;      // Previous rate used for smoothing
  rate_delta: string;         // Change in rate
  created_at: Date;           // When this was recorded
  config_name: string;        // Configuration name
}
```

**Example**:
```typescript
const history = await interestRateService.getRateHistory(configId, 50);
history.forEach(h => {
  console.log(`${h.created_at}: ${h.calculated_rate} (delta: ${h.rate_delta})`);
});
```

---

### Oracle Integration

#### `updateOraclePrice(data: UpdateOraclePriceDto): Promise<OracleData>`

Stores a new oracle price data point.

**Parameters**:
- `data.asset`: Token asset (e.g., "USDC", "EURC")
- `data.source_type`: Price source identifier (e.g., "stellar-feeds", "pyth")
- `data.price_usd`: Price in USD as number
- `data.price_base`: Price in base currency unit
- `data.confidence`: Confidence interval or margin of error
- `data.price_timestamp`: When the price was recorded
- `data.notes`: (Optional) Additional context

**Returns**: Stored `OracleData` record

**Example**:
```typescript
const oracleData = await interestRateService.updateOraclePrice({
  asset: 'USDC',
  source_type: 'stellar-feeds',
  price_usd: 1.001,
  price_base: '1000000', // In stroop for USDC
  confidence: 0.0005,
  price_timestamp: new Date(),
});
```

---

#### `getLatestOraclePrice(asset: string): Promise<OracleData | null>`

Retrieves the most recent valid oracle price for an asset.

**Parameters**:
- `asset`: Token asset identifier

**Returns**: Latest `OracleData` or `null` if none found

**Example**:
```typescript
const latestPrice = await interestRateService.getLatestOraclePrice('USDC');
if (latestPrice) {
  console.log(`USDC price: $${latestPrice.price_usd}`);
}
```

---

## Rate Calculation Algorithm

### Core Formula

The interest rate calculation follows a piecewise linear model based on utilization:

```
if utilization < optimal_utilization:
  rate = base_rate - (optimal_utilization - utilization) * slope_down
else:
  rate = base_rate + (utilization - optimal_utilization) * slope_up

// Clamp to bounds
rate = max(min_rate, min(rate, max_rate))

// Apply exponential smoothing
final_rate = (1 - smoothing_factor) * previous_rate + smoothing_factor * rate
```

### Example Calculation

Given configuration:
- `base_rate = 0.05` (5%)
- `min_rate = 0.02` (2%)
- `max_rate = 0.12` (12%)
- `optimal_utilization = 0.80` (80%)
- `slope_up = 0.08`
- `slope_down = 0.03`
- `smoothing_factor = 0.1`
- `previous_rate = 0.045` (from history)

**Scenario**: Current utilization = 0.85 (85%)

```
1. Raw rate = 0.05 + (0.85 - 0.80) * 0.08 = 0.05 + 0.004 = 0.054 (5.4%)
2. Clamped = clamp(0.054, 0.02, 0.12) = 0.054
3. Smoothed = (1 - 0.1) * 0.045 + 0.1 * 0.054
            = 0.9 * 0.045 + 0.1 * 0.054
            = 0.0405 + 0.0054
            = 0.0459 (4.59%)
```

### Utilization Calculation

```
utilization = total_borrowed / (total_deposits + total_borrowed)
```

- Values range from 0 (no utilization) to 1 (100% borrowed)
- Used to determine where on the rate curve we are
- Key driver of rate changes

---

## Data Flow Diagram

```
User Deposits                    User Borrowing
     ↓                               ↓
  Balance Repo ←────────────────── Contract Data
     ↓
  getTotalDeposits()    getTotalBorrowed()
     ↓                      ↓
  calculateUtilization()
     ↓
  RateCalculator.calculateRate()
     ↓
  Apply Smoothing (with historical rate)
     ↓
  Save to History
     ↓
  Return CurrentInterestRateDto
```

---

## Common Use Cases

### 1. Display Current System Rate

```typescript
const rate = await interestRateService.getCurrentRate();
console.log(`Current Yield: ${(parseFloat(rate.apy) * 100).toFixed(2)}%`);
```

### 2. Show Projected Rates at Different Utilizations

```typescript
const config = await interestRateService.getActiveConfig();
const projections = [0.5, 0.7, 0.8, 0.9, 0.95].map(util =>
  interestRateService.projectRate(config.id, util)
);

projections.forEach((proj, i) => {
  const util = [0.5, 0.7, 0.8, 0.9, 0.95][i];
  console.log(`${(util * 100).toFixed(0)}% util → ${(parseFloat(proj) * 100).toFixed(2)}%`);
});
```

### 3. Monitor Rate Changes Over Time

```typescript
const history = await interestRateService.getRateHistory(configId, 1000);
const deltas = history.map(h => parseFloat(h.rate_delta));
const avgChange = deltas.reduce((a, b) => a + b, 0) / deltas.length;
console.log(`Average rate change per calculation: ${(avgChange * 100).toFixed(4)}%`);
```

### 4. Create Alternative Configuration

```typescript
// Conservative configuration for stable yields
const conservative = await interestRateService.createConfig({
  name: 'Conservative USDC',
  description: 'Stable, low-volatility yields',
  base_rate: 0.02,
  min_rate: 0.015,
  max_rate: 0.08,
  optimal_utilization: 0.7,
  slope_up: 0.04,
  slope_down: 0.01,
  smoothing_factor: 0.05, // Very smooth
});
```

---

## Integration Points

### With RateCalculatorService

Delegates mathematical calculations:
- `calculateUtilization(deposits, borrowed)`
- `calculateRate(utilization, config, previousRate)`
- `projectRate(utilization, config)`

### With Database

- Reads deposit amounts from `Balance` entity
- Stores configuration in `InterestRateConfig` entity
- Appends historical records to `InterestRateHistory` entity
- Tracks price feeds in `OracleData` entity

### With Controllers/API

- `/interest-rates/current` - Get current rate
- `/interest-rates/config/:id` - Get configuration
- `/interest-rates/history/:id` - Get rate history
- `/interest-rates/metrics` - Get utilization metrics

---

## Known Limitations

### Current Implementation Notes

1. **Total Borrowed Placeholder**: Currently uses a fixed 35% utilization baseline
   - **TODO**: Integrate with actual YieldPosition or contract data
   - This should pull real borrowed amounts from Soroban contracts
   
2. **Oracle Price Integration**: Oracle data is stored but not directly used in rate calculations
   - Enhancement opportunity: Weight rates based on price confidence intervals
   - Future: Integrate multiple oracle sources for better accuracy

3. **Smoothing Factor**: Fixed per configuration
   - Could be made dynamic based on market conditions
   - Consider volatility-adaptive smoothing

---

## Performance Considerations

- **Rate Calculation**: Queries balances and history (2 DB calls per calculation)
- **History Lookup**: Sorted DESC for fast retrieval (indexed by created_at)
- **Metrics Query**: Aggregates all balances with SUM() function (consider caching for read-heavy workloads)

### Optimization Recommendations

1. Cache `getTotalDeposits()` for 1-5 minutes
2. Denormalize utilization ratio into a metrics table for reporting
3. Archive old history (>6 months) to improve query performance

---

## Testing Strategy

### Unit Tests Should Cover

1. **Configuration CRUD**
   - Create config with all parameters
   - Update specific fields
   - Retrieve active vs all configs
   - Verify validation (e.g., min < max)

2. **Rate Calculations**
   - Raw rate calculation (above/below optimal)
   - Rate clamping to min/max
   - Smoothing formula
   - Edge cases (0% and 100% utilization)

3. **Utilization Metrics**
   - Correct calculation of utilization
   - Headroom calculation
   - Above-optimal detection

4. **History**
   - Records are properly saved
   - Retrieved in DESC order by timestamp
   - Pagination works correctly

5. **Oracle Integration**
   - Prices stored correctly
   - Latest valid price retrieval
   - Handling invalid/stale data

### Integration Tests Should Cover

1. End-to-end rate calculation flow
2. Configuration activation and switchover
3. History accumulation over time
4. Concurrent configuration updates

---

## Future Enhancements

- [ ] Dynamic smoothing factor based on volatility
- [ ] Multi-asset rate curves
- [ ] Stochastic interest rate models
- [ ] Time-decay weighting for historical data
- [ ] Rate alerts and threshold notifications
- [ ] A/B testing framework for rate configurations
- [ ] Predictive rate modeling
- [ ] Integration with external rate benchmarks

