# Contract Service Implementation Guide

## Overview

The Contract Service provides a unified interface for interacting with Soroban smart contracts on the Stellar blockchain. It handles contract view calls, data serialization/deserialization, and error handling with automatic retry logic.

The service is designed to:
- **Encapsulate contract logic**: Hide Soroban SDK complexity
- **Type-safe**: Provide TypeScript interfaces for all contract data
- **Resilient**: Automatic retry logic for transient failures
- **Flexible**: Support multiple contract instances and networks

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Configuration](#configuration)
3. [Methods Reference](#methods-reference)
4. [Data Structures](#data-structures)
5. [Usage Examples](#usage-examples)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Core Concepts

### View Calls vs State-Mutating Calls

**View Calls** (Read-Only):
- Query contract state without modifying it
- No transaction fee required (simulated locally)
- Instant results
- Used by this service's public methods

**State-Mutating Calls** (Write):
- Modify contract state
- Require transaction submission and network confirmation
- Not implemented in this service (handled separately)
- Examples: create_event, submit_prediction, resolve_match

### Simulation Model

The Contract Service simulates all operations locally via `simulateTransaction()`:

```
1. Create throwaway keypair (no real keys needed)
2. Build transaction with contract call operation
3. Submit to RPC for simulation (no network broadcast)
4. Extract return value from simulation result
5. Convert XDR to native TypeScript types
```

### Retry Strategy

Automatic retry with exponential backoff:
- **Max attempts**: 3
- **Delay**: 500ms × attempt_number
- **Total max delay**: ~2 seconds
- **Retryable errors**: Network timeouts, transient RPC failures

---

## Configuration

### Environment Variables

```env
# Soroban contract address
SOROBAN_CONTRACT_ID=CBZW6ZYDVBK2RMZPGQ7YJP62NQGQWFLTB3SQOQDYQVHCNZ3YVWZLXXT

# Stellar network (testnet or mainnet)
STELLAR_NETWORK=testnet                    # Default: testnet

# Soroban RPC endpoint
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Logging
LOG_LEVEL=debug                            # Adjust verbosity
```

### Network Configuration

**Testnet**:
```env
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

**Mainnet**:
```env
STELLAR_NETWORK=mainnet
SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
```

---

## Methods Reference

### getEvent(eventId: string)

**Purpose**: Retrieve event details by ID

**Parameters**:
- `eventId` - Event identifier (string)

**Returns**: `ContractEvent | null`

**ContractEvent Structure**:
```typescript
{
  eventId: string;                    // Unique event ID
  inviteCode: string;                 // Code for event invitations
  creator: string;                    // Creator's Stellar address
  title: string;                      // Event name
  description: string;                // Event description
  startTime: number;                  // Unix timestamp
  endTime: number;                    // Unix timestamp
  maxParticipants: number;            // Max allowed participants
  participantCount: number;           // Current participants
  isActive: boolean;                  // Event is currently active
  prizePool?: string;                 // Total prize amount
  rewardDistribution?: number[];      // Payout percentages
  entryFee?: string;                  // Entry fee in stroops
  category?: string;                  // Event category
  bannerUrl?: string | null;          // Event banner image URL
  isFinalized?: boolean;              // Event completed
}
```

**Example**:
```typescript
const event = await contractService.getEvent('event-123');

if (event) {
  console.log(`Event: ${event.title}`);
  console.log(`Participants: ${event.participantCount}/${event.maxParticipants}`);
  console.log(`Active: ${event.isActive}`);
}
```

**Error Handling**:
- Returns `null` if event not found or contract call fails
- Check for `null` before accessing properties

---

### getEventByCode(inviteCode: string)

**Purpose**: Retrieve event by invitation code (user-friendly lookup)

**Parameters**:
- `inviteCode` - Invitation code (short string)

**Returns**: `ContractEvent | null`

**Example**:
```typescript
// User enters code: "STOW2024"
const event = await contractService.getEventByCode('STOW2024');

if (event) {
  console.log(`Found event: ${event.title}`);
} else {
  console.log('Invalid invitation code');
}
```

---

### getMatch(matchId: string)

**Purpose**: Retrieve match details

**Parameters**:
- `matchId` - Match identifier

**Returns**: `ContractMatch | null`

**ContractMatch Structure**:
```typescript
{
  matchId: string;           // Unique match ID
  eventId: string;           // Parent event ID
  homeTeam: string;          // Home team name
  awayTeam: string;          // Away team name
  homeScore: number | null;  // Home team score (null if unresolved)
  awayScore: number | null;  // Away team score (null if unresolved)
  startTime: number;         // Unix timestamp
  resolved: boolean;         // Match result is final
  outcome: string | null;    // 'HOME' | 'AWAY' | 'DRAW' (null if unresolved)
}
```

**Example**:
```typescript
const match = await contractService.getMatch('match-456');

if (match?.resolved) {
  console.log(`Final: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`);
} else {
  console.log(`Match starts at: ${new Date(match?.startTime * 1000)}`);
}
```

---

### getEventMatches(eventId: string)

**Purpose**: Get all matches for an event

**Parameters**:
- `eventId` - Event identifier

**Returns**: `ContractMatch[]` (empty array if none)

**Example**:
```typescript
const matches = await contractService.getEventMatches('event-123');

console.log(`Event has ${matches.length} matches`);
const resolved = matches.filter(m => m.resolved).length;
console.log(`${resolved} resolved, ${matches.length - resolved} pending`);
```

---

### getPrediction(predictionId: string)

**Purpose**: Retrieve a specific prediction

**Parameters**:
- `predictionId` - Prediction identifier

**Returns**: `ContractPrediction | null`

**ContractPrediction Structure**:
```typescript
{
  predictionId?: string;          // Prediction ID
  matchId?: string;               // Associated match
  eventId?: string;               // Associated event
  predictor?: string;             // Predictor's address
  predictedOutcome?: string;      // Predicted outcome ('HOME' | 'AWAY' | 'DRAW')
  predictedAt?: number;           // Prediction timestamp
  stakeAmount?: string;           // Staked amount (stroops)
  claimed?: boolean;              // Reward claimed
  isCorrect?: boolean | null;     // Prediction accuracy (null if unresolved)
}
```

**Note**: Fields may use snake_case or camelCase depending on contract implementation

**Example**:
```typescript
const prediction = await contractService.getPrediction('pred-789');

if (prediction?.isCorrect === true) {
  console.log('✓ Correct prediction!');
} else if (prediction?.isCorrect === false) {
  console.log('✗ Incorrect prediction');
} else {
  console.log('Match not yet resolved');
}
```

---

### getUserPredictions(user: string, eventId: string)

**Purpose**: Get all predictions by a user for an event

**Parameters**:
- `user` - Stellar address (public key)
- `eventId` - Event identifier

**Returns**: `ContractPrediction[]`

**Example**:
```typescript
const predictions = await contractService.getUserPredictions(
  'GBPLMHTOXICABHL6SI6AAUDHXJZJDDILJLJJCQQ7BQEDN5KQORRJJSD',
  'event-123'
);

const correctCount = predictions.filter(p => p.isCorrect === true).length;
console.log(`User accuracy: ${correctCount}/${predictions.length}`);
```

---

### getEventParticipants(eventId: string)

**Purpose**: Get list of event participants

**Parameters**:
- `eventId` - Event identifier

**Returns**: `ContractParticipant[]`

**ContractParticipant Structure**:
```typescript
{
  address: string;         // Participant's Stellar address
  joinedAt: number;        // Join timestamp
  predictionCount: number; // Predictions made
}
```

**Example**:
```typescript
const participants = await contractService.getEventParticipants('event-123');

const avgPredictions = participants.length > 0
  ? participants.reduce((sum, p) => sum + p.predictionCount, 0) / participants.length
  : 0;

console.log(`${participants.length} participants, avg ${avgPredictions} predictions each`);
```

---

### getEventWinners(eventId: string)

**Purpose**: Get winning participants and payouts

**Parameters**:
- `eventId` - Event identifier

**Returns**: `ContractWinner[]`

**ContractWinner Structure**:
```typescript
{
  address: string;      // Winner's address
  totalStake: string;   // Total staked amount
  payout: string;       // Prize payout amount (stroops)
}
```

**Example**:
```typescript
const winners = await contractService.getEventWinners('event-123');

for (const winner of winners) {
  const xlm = parseInt(winner.payout) / 10_000_000;
  console.log(`${winner.address}: ${xlm} XLM`);
}
```

---

### getEventLeaderboard(eventId: string)

**Purpose**: Get ranked leaderboard for event

**Parameters**:
- `eventId` - Event identifier

**Returns**: `ContractLeaderboardEntry[]`

**ContractLeaderboardEntry Structure**:
```typescript
{
  rank: number;              // 1, 2, 3, etc.
  address: string;           // Participant address
  total_predictions: number; // Total predictions made
  correct_predictions: number; // Correct predictions
  accuracy_percentage: number; // 0-100
  is_winner: boolean;        // Won prizes
  completion_time: string | null; // When user finished (ISO or null)
}
```

**Example**:
```typescript
const leaderboard = await contractService.getEventLeaderboard('event-123');

// Top 10 performers
const top10 = leaderboard.slice(0, 10);
for (const entry of top10) {
  console.log(`#${entry.rank}: ${entry.accuracy_percentage}% accuracy`);
}
```

---

### getConfig()

**Purpose**: Retrieve global contract configuration

**Returns**: `ContractConfig | null`

**ContractConfig Structure**:
```typescript
{
  admin: string;         // Admin address
  aiAgent: string;       // AI oracle address
  treasury: string;      // Treasury address for fees
  celoToken: string;     // Token contract address
  creationFee: string;   // Fee to create event (stroops)
  paused: boolean;       // Contract paused
}
```

**Example**:
```typescript
const config = await contractService.getConfig();

if (config?.paused) {
  console.log('Contract is paused for maintenance');
} else {
  const fee = parseInt(config?.creationFee ?? '0') / 10_000_000;
  console.log(`Event creation fee: ${fee} XLM`);
}
```

---

### getCreationFee()

**Purpose**: Get event creation fee

**Returns**: `string` (stroops)

**Example**:
```typescript
const feeStroops = await contractService.getCreationFee();
const feeXlm = parseInt(feeStroops) / 10_000_000;
console.log(`Create event fee: ${feeXlm} XLM`);
```

---

### isVerified(address: string)

**Purpose**: Check if user is verified in contract

**Parameters**:
- `address` - Stellar address

**Returns**: `boolean`

**Example**:
```typescript
const verified = await contractService.isVerified('GBPLMHTOXICABHL6SI6AAUDHXJZJDDILJLJJCQQ7BQEDN5KQORRJJSD');

if (verified) {
  console.log('User is a verified predictor');
}
```

---

### getEventStatistics(eventId: string)

**Purpose**: Get comprehensive event statistics

**Parameters**:
- `eventId` - Event identifier (numeric string or number)

**Returns**: `ContractEventStatistics | null`

**ContractEventStatistics Structure**:
```typescript
{
  eventId: string;           // Event identifier
  participantCount: number;  // Total participants
  matchCount: number;        // Total matches
  totalPredictions: number;  // Total predictions made
  allMatchesResolved: boolean; // All matches have outcomes
  winnersVerified: boolean;  // Winners have been finalized
  winnerCount: number;       // Number of winners
}
```

**Example**:
```typescript
const stats = await contractService.getEventStatistics('event-123');

if (stats?.allMatchesResolved && stats?.winnersVerified) {
  console.log(`Event complete: ${stats.winnerCount} winners identified`);
} else {
  console.log(`Event in progress: ${stats?.participantCount} participants`);
}
```

---

### getPredictionDistribution(matchId: string)

**Purpose**: Get prediction distribution for a match

**Parameters**:
- `matchId` - Match identifier (numeric string or number)

**Returns**: `ContractPredictionDistribution`

**Structure**:
```typescript
{
  teamA: number;  // Predictions for home team
  teamB: number;  // Predictions for away team
  draw: number;   // Predictions for draw
}
```

**Example**:
```typescript
const distribution = await contractService.getPredictionDistribution('match-456');

const total = distribution.teamA + distribution.teamB + distribution.draw;
const aPercent = (distribution.teamA / total * 100).toFixed(1);
const bPercent = (distribution.teamB / total * 100).toFixed(1);
const drawPercent = (distribution.draw / total * 100).toFixed(1);

console.log(`Home: ${aPercent}% | Away: ${bPercent}% | Draw: ${drawPercent}%`);
```

---

## Data Structures

### Event Flow

```
Event Created
├─ eventId, inviteCode, creator, title
├─ startTime, endTime
└─ isActive = true

During Event
├─ Participants join
├─ Matches occur
└─ Users place predictions

Event Resolution
├─ All matches resolved
├─ Winners calculated
├─ Payouts determined
└─ isFinalized = true
```

### Match Lifecycle

```
Match Scheduled
├─ matchId, eventId, teams
├─ startTime (future)
└─ resolved = false

Match Occurring
├─ startTime passed
└─ awaiting outcome

Match Resolved
├─ homeScore, awayScore set
├─ outcome determined ('HOME'|'AWAY'|'DRAW')
└─ resolved = true
```

### Prediction Status

```
Pending Resolution
├─ User stakes XLM
├─ Match not yet resolved
└─ isCorrect = null

Resolved (Correct)
├─ Match resolved
├─ Prediction matches outcome
├─ isCorrect = true
└─ User eligible for payout

Resolved (Incorrect)
├─ Match resolved
├─ Prediction doesn't match
├─ isCorrect = false
└─ Stake forfeited
```

---

## Usage Examples

### Example 1: Check Event Status

```typescript
async function checkEventStatus(eventId: string) {
  const event = await contractService.getEvent(eventId);
  if (!event) {
    console.log('Event not found');
    return;
  }

  console.log(`Event: ${event.title}`);
  console.log(`Status: ${event.isActive ? 'Active' : 'Inactive'}`);
  console.log(`Participants: ${event.participantCount}/${event.maxParticipants}`);
  
  const stats = await contractService.getEventStatistics(eventId);
  if (stats) {
    console.log(`Matches: ${stats.matchCount} (${stats.allMatchesResolved ? 'all resolved' : 'pending'})`);
  }
}
```

### Example 2: Display Leaderboard

```typescript
async function displayLeaderboard(eventId: string) {
  const leaderboard = await contractService.getEventLeaderboard(eventId);
  
  console.log('Leaderboard:');
  console.log('Rank | Address | Accuracy | Correct/Total');
  console.log('-----|---------|----------|---------------');
  
  for (const entry of leaderboard.slice(0, 5)) {
    const shortAddr = entry.address.substring(0, 8) + '...';
    console.log(
      `#${entry.rank} | ${shortAddr} | ${entry.accuracy_percentage}% | ${entry.correct_predictions}/${entry.total_predictions}`
    );
  }
}
```

### Example 3: Analyze Prediction Distribution

```typescript
async function analyzePredictions(matchId: string) {
  const dist = await contractService.getPredictionDistribution(matchId);
  const total = dist.teamA + dist.teamB + dist.draw;
  
  if (total === 0) {
    console.log('No predictions yet');
    return;
  }
  
  console.log('Prediction Distribution:');
  console.log(`Home: ${dist.teamA} (${(dist.teamA/total*100).toFixed(1)}%)`);
  console.log(`Away: ${dist.teamB} (${(dist.teamB/total*100).toFixed(1)}%)`);
  console.log(`Draw: ${dist.draw} (${(dist.draw/total*100).toFixed(1)}%)`);
  
  // Sentiment analysis
  if (dist.teamA > dist.teamB * 1.5) {
    console.log('→ Strong bullish sentiment on home team');
  }
}
```

### Example 4: Check User Performance

```typescript
async function checkUserPerformance(userAddress: string, eventId: string) {
  const predictions = await contractService.getUserPredictions(userAddress, eventId);
  
  if (predictions.length === 0) {
    console.log('User has not made predictions');
    return;
  }
  
  const resolved = predictions.filter(p => p.isCorrect !== null);
  const correct = resolved.filter(p => p.isCorrect).length;
  const accuracy = (correct / resolved.length * 100).toFixed(1);
  
  console.log(`Predictions: ${predictions.length}`);
  console.log(`Resolved: ${resolved.length}`);
  console.log(`Correct: ${correct}/${resolved.length} (${accuracy}%)`);
}
```

---

## Error Handling

### Graceful Degradation

```typescript
const event = await contractService.getEvent(eventId);

if (!event) {
  // Fallback: use cached data or show placeholder
  console.warn('Could not fetch event from contract');
  return getCachedEvent(eventId) || getPlaceholderEvent();
}

// Proceed with event data
```

### Null Checks

```typescript
const leaderboard = await contractService.getEventLeaderboard(eventId);

// Safe iteration
for (const entry of leaderboard ?? []) {
  // Process entry
}
```

### Network Failures

The service automatically retries with exponential backoff:
- If RPC is temporarily unavailable, it retries up to 3 times
- Each retry waits longer (500ms → 1s → 1.5s)
- If all retries fail, returns `null`

---

## Best Practices

### 1. **Cache Contract Results**

```typescript
// Don't call frequently, cache for 1-5 minutes
const cacheKey = `event:${eventId}`;
const cached = await cache.get(cacheKey);

if (cached) return cached;

const event = await contractService.getEvent(eventId);
await cache.set(cacheKey, event, 300); // 5 minutes
return event;
```

### 2. **Null Safety**

```typescript
// Always check for null
const event = await contractService.getEvent(eventId);
if (!event) {
  return { error: 'Event not found' };
}
// Use event safely
```

### 3. **Type Safety**

```typescript
// Use TypeScript interfaces
const event: ContractEvent | null = await contractService.getEvent(eventId);
const prediction: ContractPrediction | null = await contractService.getPrediction(predictionId);
```

### 4. **Batch Calls Efficiently**

```typescript
// Run in parallel when independent
const [event, stats, leaderboard] = await Promise.all([
  contractService.getEvent(eventId),
  contractService.getEventStatistics(eventId),
  contractService.getEventLeaderboard(eventId),
]);
```

---

## Troubleshooting

### Issue: Contract ID Not Configured

**Symptoms**: Methods always return `null`

**Cause**: `SOROBAN_CONTRACT_ID` env var missing

**Solution**:
```env
SOROBAN_CONTRACT_ID=CBZW6ZYDVBK2RMZPGQ7YJP62NQGQWFLTB3SQOQDYQVHCNZ3YVWZLXXT
```

### Issue: RPC Connection Fails

**Symptoms**: Timeouts, "connection refused"

**Cause**: Incorrect RPC URL or network down

**Solution**:
```bash
# Test RPC connectivity
curl -X POST https://soroban-testnet.stellar.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}'

# Should return {"result":"{"status":"ok"}"}
```

### Issue: Contract Call Errors

**Symptoms**: Simulation errors in logs

**Cause**: Invalid contract, wrong network, or method doesn't exist

**Solution**:
1. Verify contract ID matches the network
2. Check contract is deployed on that network
3. Verify method names match contract ABI

---

## Related Documentation

- [Soroban SDK](https://github.com/stellar/ts-stellar-sdk)
- [Stellar Documentation](https://developers.stellar.org/)
- [Contract Events](./entities/contract-event.entity.ts)
- [Soroban Service](../soroban/README.md)
