# Indexer Service Implementation Guide

## Overview

The Indexer Service is responsible for monitoring Soroban smart contract events from the Stellar blockchain and indexing them into the database for query and analysis. It provides event polling, persistence, processing, reconciliation, and health monitoring.

The service is designed to:
- **Event Capture**: Poll contract events from Soroban RPC
- **Persistence**: Store events with ledger height and transaction hash
- **Processing**: Apply event side effects (update projections, resolve pending operations)
- **Recovery**: Retry failed events with exponential backoff
- **Health Monitoring**: Track indexer lag and synchronization status

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Event Lifecycle](#event-lifecycle)
3. [Configuration](#configuration)
4. [Main Methods](#main-methods)
5. [Event Types](#event-types)
6. [Data Entities](#data-entities)
7. [Polling & Processing](#polling--processing)
8. [Health & Monitoring](#health--monitoring)
9. [Reconciliation](#reconciliation)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Core Concepts

### What is Event Indexing?

Event indexing creates an off-chain database of on-chain events for efficient querying:

```
Blockchain Contract
   │
   ├─ Emits: harvest_claimed, deposit_made, withdrawal_requested
   │
   ▼
Soroban RPC (Event Archive)
   │
   ├─ Poll every 30 seconds
   │
   ▼
Indexer Service
   │
   ├─ Fetch new events from ledger 456810 onwards
   ├─ Store in contract_events table
   ├─ Apply side effects (update balances, etc.)
   ├─ Mark as PROCESSED
   │
   ▼
Application Database
   └─ Query historical events
   └─ Serve user dashboards
   └─ Run analytics
```

### Event Checkpoint Model

The indexer tracks progress using checkpoints:

```env
# Last successfully processed ledger
indexer:last_processed_ledger = 456810

# Latest ledger with contract events
indexer:latest_contract_ledger = 456825

# Lag = 456825 - 456810 = 15 ledgers
```

### Pending Operations

Some operations span multiple events:

```
Withdrawal Request (Day 1)
│
├─ Event: withdraw_requested
├─ Action: Create PendingWithdrawal record
├─ Status: PENDING
│
├─ (User must wait 7 days)
│
▼ (Day 8)
├─ Event: withdraw_claimed
├─ Action: Update PendingWithdrawal to CLAIMED
└─ Status: CLAIMED
```

---

## Event Lifecycle

### State Transitions

```
Event fetched from RPC
        │
        ▼
┌──────────────────┐
│  PENDING         │  ← Event stored, waiting to process
│  (initial state) │
└──────────────────┘
        │
        ├─ applyEvent() succeeds
        │
        ▼
┌──────────────────┐
│  PROCESSED       │  ← Event applied, side effects complete
│  (success)       │
└──────────────────┘


        OR

        ├─ applyEvent() fails (transient)
        │
        ▼
┌──────────────────┐
│  FAILED          │  ← Error applying event, will retry
│  (retry < max)   │
└──────────────────┘
        │
        ├─ (next batch picks it up)
        │
        ▼
┌──────────────────┐
│  PROCESSED       │  ← Succeeded on retry
│  (recovered)     │
└──────────────────┘


        OR

        ├─ applyEvent() fails MAX_RETRIES times
        │
        ▼
┌──────────────────┐
│  DLQ             │  ← Dead Letter Queue (manual review needed)
│  (unrecoverable) │
└──────────────────┘
```

---

## Configuration

### Environment Variables

```env
# Soroban contract to index
SOROBAN_CONTRACT_ID=CBZW6ZYDVBK2RMZPGQ7YJP62NQGQWFLTB3SQOQDYQVHCNZ3YVWZLXXT

# RPC endpoint
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Event polling interval
INDEXER_POLL_INTERVAL_SECONDS=30          # Default: 30 seconds

# Batch processing
INDEXER_BATCH_SIZE=100                    # Events per batch
INDEXER_MAX_RETRIES=5                     # Before moving to DLQ

# Health monitoring
INDEXER_LAG_THRESHOLD_LEDGERS=100         # Warning threshold
```

### Checkpoints Storage

Checkpoints are stored as key-value pairs in the database:

```sql
-- Checkpoint table structure (example)
CREATE TABLE indexer_checkpoint (
  key VARCHAR(255) PRIMARY KEY,
  value BIGINT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Current state
SELECT * FROM indexer_checkpoint;
/*
key                              | value
---------------------------------+--------
indexer:last_processed_ledger    | 456810
indexer:latest_contract_ledger   | 456825
*/
```

---

## Main Methods

### fetchAndPersistEvents()

**Purpose**: Fetch new events from RPC and persist to database

**Called by**: `pollContractEvents()` (every 30 seconds)

**Returns**: Number of events persisted

**Process**:
1. Get last processed ledger checkpoint
2. Query RPC for events starting from `lastProcessed + 1`
3. For each event not already in DB:
   - Create `ContractEvent` record
   - Set status to `PENDING`
   - Store with ledger height and transaction hash
4. Update checkpoint with latest ledger

**Example**:
```typescript
const count = await indexerService.fetchAndPersistEvents();
console.log(`Persisted ${count} new events`);
```

### pollContractEvents()

**Purpose**: Main polling loop (cron job)

**Schedule**: Every 30 seconds via `@Cron(CronExpression.EVERY_30_SECONDS)`

**Behavior**:
- Guard: Skip if contract not configured
- Guard: Skip if already running (prevents overlapping executions)
- Fetch and persist new events
- Process pending events in batches
- Handle errors gracefully

**Monitoring**:
```
30s interval
├─ fetchAndPersistEvents()
├─ processPendingBatch()
└─ Update metrics
```

### processPendingBatch()

**Purpose**: Process events with `PENDING` status

**Batch Size**: 100 events per poll cycle

**Process**:
1. Query `contract_events` where `status = PENDING`
2. For each event (up to batch size):
   - `applyEvent()`
   - Update status to `PROCESSED` on success
   - Update status to `FAILED` or `DLQ` on failure
3. Record metrics (events processed, timing, etc.)

**Example**:
```
Poll #1: Process 100 PENDING events
Poll #2: Process next 100
...
Once all PENDING events processed, wait for next batch
```

### applyEvent(event: ContractEvent)

**Purpose**: Execute the business logic for an event

**Process**:
1. Call `decodeAndApply(event)`
2. On success:
   - Set status to `PROCESSED`
   - Save to database
   - Record metric
3. On failure:
   - Increment `retry_count`
   - Set status to `FAILED` (if retries remain)
   - Set status to `DLQ` (if max retries exceeded)
   - Log warning

**Error Handling**:
```typescript
try {
  await this.decodeAndApply(event);
  event.status = 'PROCESSED';
} catch (err) {
  event.retry_count++;
  event.status = event.retry_count >= MAX_RETRIES ? 'DLQ' : 'FAILED';
  logger.warn(`Event ${event.id} failed: ${err.message}`);
}
```

### getCheckpoint(key: string)

**Purpose**: Retrieve a checkpoint value

**Parameters**:
- `key` - Checkpoint key (e.g., `'indexer:last_processed_ledger'`)

**Returns**: Number (checkpoint value), or 0 if not found

**Example**:
```typescript
const lastLedger = await indexerService.getCheckpoint(
  'indexer:last_processed_ledger'
);
console.log(`Last processed: ledger ${lastLedger}`);
```

### setCheckpoint(key: string, value: number)

**Purpose**: Update a checkpoint value

**Parameters**:
- `key` - Checkpoint key
- `value` - New value (ledger height)

**Example**:
```typescript
await indexerService.setCheckpoint('indexer:last_processed_ledger', 456820);
```

### registerPendingWithdrawal(withdrawalId: string, record: Record)

**Purpose**: Track a withdrawal request before claim event arrives

**Use Case**: Maintain pending withdrawal state across events

**Example**:
```typescript
// Called when 'withdraw_requested' event processed
await indexerService.registerPendingWithdrawal('withdrawal-123', {
  owner: 'GXXX...',
  shares: '1000000',
  claimable_at: new Date()
});

// Later, when 'withdraw_claimed' arrives, it resolves this
```

### isWithdrawalPending(withdrawalId: string)

**Purpose**: Check if withdrawal is awaiting claim

**Returns**: `boolean`

**Example**:
```typescript
const pending = await indexerService.isWithdrawalPending('withdrawal-123');
if (pending) {
  console.log('Withdrawal still waiting for claim event');
}
```

### getMetrics()

**Purpose**: Get indexer performance metrics

**Returns**: `IndexerMetricsDto`

**Data**:
```typescript
{
  uptime_seconds: 3600,
  last_processed_ledger: 456810,
  latest_contract_ledger: 456825,
  lag_ledgers: 15,
  events_processed_total: 5000,
  events_pending: 3,
  events_failed: 1,
  events_dlq: 0,
  avg_event_processing_ms: 2.5,
  pending_withdrawals: 12
}
```

---

## Event Types

### Yield Adapter Events (Savings Vault)

Handled directly by IndexerService:

| Event | Topic | Payload | Action |
|-------|-------|---------|--------|
| **Withdrawal Requested** | `withdraw_requested` | `{id, owner, shares, claimable_at}` | Create `PendingWithdrawal` |
| **Withdrawal Claimed** | `withdraw_claimed` | `{withdrawal_id, amount}` | Mark `PendingWithdrawal` as CLAIMED |
| **Withdrawal Cancelled** | `withdraw_cancelled` | `{withdrawal_id, owner}` | Delete `PendingWithdrawal` |
| **Harvest Completed** | `harvested` | `{total_assets, total_shares, delta, fee}` | Record in `HarvestHistory` |

### Savings Projection Events

Routed to `SavingsProjectionService` for business logic:

| Event | Purpose |
|-------|---------|
| `deposit` | Update user balance, goal progress |
| `withdrawal` | Update balance, check goal milestones |
| `goal_created` | Track new savings goal |
| `goal_reached` | Mark goal as completed |
| `group_settlement` | Distribute group roundup savings |

---

## Data Entities

### ContractEvent

Stores raw events from the blockchain:

```typescript
{
  id: string;                     // UUID
  ledger: number;                 // Ledger height
  log_index: number;              // Event position in ledger
  event_type: string;             // Topic name
  data: Record<string, unknown>;  // Decoded event payload
  tx_hash: string | null;         // Transaction hash
  status: ContractEventStatus;    // PENDING | PROCESSED | FAILED | DLQ
  retry_count: number;            // Retry attempts
  created_at: Date;
  updated_at: Date;
}
```

### PendingWithdrawal

Tracks multi-event withdrawal operations:

```typescript
{
  id: string;
  request_id: string;                           // Unique identifier
  owner: string;                                // Stellar address
  shares: string;                               // Amount in stroops
  claimable_at: Date;                           // When eligible to claim
  status: PendingWithdrawalStatus;              // PENDING | CLAIMED | CANCELLED
  created_at: Date;
  updated_at: Date;
}
```

### HarvestHistory

Tracks yield distribution events:

```typescript
{
  id: string;
  ledger: number;
  total_assets: string;           // Total assets managed
  total_shares: string;           // Total shares outstanding
  delta: string;                  // Yield earned
  fee: string;                    // Protocol fee
  net_yield: string;              // delta - fee
  timestamp: Date;
}
```

### IndexerCheckpoint

Stores progress markers:

```typescript
{
  key: string;                    // 'indexer:last_processed_ledger', etc.
  value: number;                  // Ledger height or timestamp
  updated_at: Date;
}
```

---

## Polling & Processing

### Polling Loop

```
Timer: Every 30 seconds
│
├─ pollContractEvents()
│  ├─ Guard: Contract configured?
│  ├─ Guard: Not already running?
│  ├─ fetchAndPersistEvents()
│  │  └─ Fetch new events from RPC
│  ├─ processPendingBatch()
│  │  └─ Process up to 100 PENDING events
│  └─ Handle errors
│
└─ Repeat
```

### Batch Processing Strategy

**Rationale**: Process in small batches to avoid overwhelming database and avoid blocking:

```
PENDING events: 500
Batch size: 100

Poll 1: Process events 1-100   → PROCESSED
Poll 2: Process events 101-200 → PROCESSED
Poll 3: Process events 201-300 → PROCESSED
Poll 4: Process events 301-400 → PROCESSED
Poll 5: Process events 401-500 → PROCESSED

Total time: 5 × 30 seconds = 2.5 minutes to clear backlog
```

### Retry Strategy

**Exponential Backoff**:

```
Attempt 1: Process event
  ├─ Fail: retry_count = 1, status = FAILED
  
Attempt 2 (next batch): Retry event
  ├─ Fail: retry_count = 2, status = FAILED
  
Attempt 3: Retry event
  ├─ Fail: retry_count = 3, status = FAILED
  
Attempt 4: Retry event
  ├─ Fail: retry_count = 4, status = FAILED
  
Attempt 5: Retry event (MAX_RETRIES = 5)
  ├─ Fail: retry_count = 5, status = DLQ
  └─ Alert: Manual review needed
```

---

## Health & Monitoring

### Indexer Health Checks

**Liveness**: Is the indexer running?
```typescript
const metrics = await indexerService.getMetrics();
if (!metrics || metrics.uptime_seconds === 0) {
  console.log('Indexer not running');
}
```

**Readiness**: Is the indexer caught up?
```typescript
const metrics = await indexerService.getMetrics();
if (metrics.lag_ledgers > 100) {
  console.log('Indexer lagging, not ready for queries');
  // May return 503 Service Unavailable
}
```

**Lag Monitoring**:
```
lag_ledgers = latest_contract_ledger - last_processed_ledger

lag < 10    → Healthy (recent data)
lag 10-100  → Degraded (slightly behind)
lag > 100   → Unhealthy (stale data)
```

### Metrics Exposed

| Metric | Meaning |
|--------|---------|
| `uptime_seconds` | Seconds since last restart |
| `last_processed_ledger` | Most recent ledger fully processed |
| `latest_contract_ledger` | Latest ledger with contract events |
| `lag_ledgers` | Difference (latest - processed) |
| `events_processed_total` | Total events successfully processed |
| `events_pending` | Events awaiting processing |
| `events_failed` | Events with transient errors (retryable) |
| `events_dlq` | Events in dead-letter queue (manual review) |
| `avg_event_processing_ms` | Average time to process one event |

---

## Reconciliation

The `ReconciliationService` detects and fixes inconsistencies:

### Common Issues

1. **Duplicate Events**: Same event indexed twice
   - **Detection**: `ledger` + `log_index` duplicates
   - **Fix**: Deduplicate, keep one

2. **Orphaned Events**: Event processed but business state not updated
   - **Detection**: Compare event data with actual state
   - **Fix**: Replay event to update state

3. **Missing Events**: Network glitch skipped events
   - **Detection**: Gap in ledger sequence
   - **Fix**: Backfill from RPC

### Running Reconciliation

```typescript
const backfillResponse = await indexerService.backfill(
  fromLedger: 450000,
  toLedger: 456810,
  maxPages: 1000
);

console.log(`Backfilled ${backfillResponse.events_found} events`);
console.log(`Duplicates removed: ${backfillResponse.duplicates_removed}`);
```

---

## Best Practices

### 1. **Monitor Lag Continuously**

```typescript
setInterval(async () => {
  const metrics = await indexerService.getMetrics();
  if (metrics.lag_ledgers > 100) {
    alertOps(`Indexer lagging: ${metrics.lag_ledgers} ledgers behind`);
  }
}, 60_000); // Every minute
```

### 2. **Handle DLQ Events**

```typescript
// Periodically check for DLQ events
@Cron(CronExpression.EVERY_HOUR)
async checkDeadLetterQueue() {
  const dlqEvents = await this.contractEventRepository.find({
    where: { status: ContractEventStatus.DLQ }
  });
  
  for (const event of dlqEvents) {
    logger.error(`DLQ event ${event.id}: ${event.event_type}`);
    // Manual review or alerting
  }
}
```

### 3. **Cache Indexer Metrics**

```typescript
// Cache for 5 seconds to reduce database queries
const cached = await cache.wrap('indexer-metrics', () => 
  indexerService.getMetrics(), 
  5000
);
```

### 4. **Track Processing Time**

```typescript
const start = Date.now();
await indexerService.applyEvent(event);
const duration = Date.now() - start;

if (duration > 1000) {
  logger.warn(`Slow event processing: ${duration}ms for ${event.event_type}`);
}
```

---

## Troubleshooting

### Issue: Indexer Lag Growing

**Symptoms**: `lag_ledgers` increasing over time

**Causes**:
1. Database is slow (index missing)
2. Event processing failures
3. RPC rate limiting

**Solution**:
```sql
-- Check event processing rate
SELECT status, COUNT(*) 
FROM contract_events 
GROUP BY status;

-- Add missing indexes
CREATE INDEX idx_contract_event_status 
ON contract_events(status);
```

### Issue: DLQ Events Accumulating

**Symptoms**: Events stuck with status = 'DLQ'

**Causes**:
1. Contract ABI changed
2. Persistent database error
3. Invalid event data

**Solution**:
```sql
-- Investigate event
SELECT * FROM contract_events 
WHERE status = 'DLQ' 
LIMIT 1;

-- Manually fix data or contract, then reset
UPDATE contract_events 
SET status = 'FAILED', retry_count = 0 
WHERE id = 'event-id';
```

### Issue: Checkpoint Mismatch

**Symptoms**: Last processed != DB state

**Cause**: Crashed during event processing

**Solution**:
```typescript
// Reset to safe checkpoint
const lastProcessed = 456800;
await indexerService.setCheckpoint(
  'indexer:last_processed_ledger', 
  lastProcessed
);

// Backfill to catch up
await indexerService.backfill(456800, 456825);
```

---

## Related Documentation

- [Soroban Events](https://developers.stellar.org/docs/learn/soroban/events)
- [Stellar Ledger Concepts](https://developers.stellar.org/docs/learn/basics/ledger)
- [Savings Projection Service](../savings-projection/README.md)
- [Reconciliation Service](./reconciliation.service.ts)
