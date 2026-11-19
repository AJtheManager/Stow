# Savings Leaderboard API - Integration Test Documentation - Issue #577

## Overview
This document describes the integration test strategy for the Savings Leaderboard API, which ranks users by savings performance metrics.

## Test Coverage

### 1. Top Savers Ranking
**Test Name:** `should rank users by total balance correctly`

**Setup:**
- Create 5 test users with varying balances:
  - User A: $10,000
  - User B: $25,000
  - User C: $5,000
  - User D: $15,000
  - User E: $20,000

**Execution:**
- Call GET `/api/leaderboard/top-savers`
- Verify response contains users ranked by balance descending

**Expected Output:**
```json
{
  "leaderboard": [
    { "rank": 1, "userId": "B", "totalBalance": 25000 },
    { "rank": 2, "userId": "E", "totalBalance": 20000 },
    { "rank": 3, "userId": "D", "totalBalance": 15000 },
    { "rank": 4, "userId": "A", "totalBalance": 10000 },
    { "rank": 5, "userId": "C", "totalBalance": 5000 }
  ]
}
```

### 2. Deposit Consistency Streak Calculation
**Test Name:** `should calculate consecutive deposit days streak accurately`

**Setup:**
- Create user with deposit dates:
  - Days 1-5: Deposits recorded
  - Day 6: No deposit (streak breaks)
  - Days 7-10: Deposits recorded
  - Current streak: 4 days

**Execution:**
- Call GET `/api/leaderboard/by-streak`
- Verify current streak and personal record calculations

**Expected Output:**
- Current streak: 4 consecutive days
- Personal record: 5 consecutive days

### 3. Month-over-Month Growth Calculation
**Test Name:** `should calculate growth percentage accurately`

**Setup:**
- User balance last month: $5,000
- User balance this month: $6,500
- Growth: +30%

**Execution:**
- Call GET `/api/leaderboard/most-improved`
- Verify growth percentage calculation

**Expected Output:**
```json
{
  "userId": "user-1",
  "lastMonthBalance": 5000,
  "thisMonthBalance": 6500,
  "growthPercent": 30
}
```

### 4. Timeframe Filtering
**Test Name:** `should filter leaderboard by timeframe correctly`

**Supported Timeframes:**
- `week` - Last 7 days
- `month` - Last 30 days
- `year` - Last 365 days
- `all-time` - All historical data

**Execution:**
- Call GET `/api/leaderboard/top-savers?timeframe=month`
- Verify only deposits from last 30 days are included

**Expected Behavior:**
- Different timeframes produce different rankings
- Year-to-date includes all deposits in calendar year
- All-time includes entire user history

### 5. Pagination
**Test Name:** `should paginate results correctly with 20 items per page`

**Execution:**
- Create 65 test users
- Call GET `/api/leaderboard/top-savers?page=1&pageSize=20`
- Call GET `/api/leaderboard/top-savers?page=2&pageSize=20`
- Call GET `/api/leaderboard/top-savers?page=3&pageSize=20`

**Expected Behavior:**
- Page 1: 20 users
- Page 2: 20 users
- Page 3: 5 users (remaining)
- Total count returned in response metadata

### 6. Opt-Out Exclusion
**Test Name:** `should exclude opted-out users from leaderboard`

**Setup:**
- User A: Opted out, balance $50,000
- User B: Opted in, balance $30,000
- User C: Opted in, balance $20,000

**Execution:**
- Call GET `/api/leaderboard/top-savers`
- Verify User A is not included in results

**Expected Output:**
- Ranking shows User B (rank 1), User C (rank 2)
- User A completely excluded

### 7. Cache Invalidation
**Test Name:** `should invalidate cache on new deposits`

**Setup:**
- Initial leaderboard state cached
- New deposit added by User A

**Execution:**
- Record first leaderboard call time
- Add new deposit for User A
- Call leaderboard endpoint again
- Verify cache was invalidated and new data is served

**Expected Behavior:**
- First call returns cached data
- Second call returns updated rankings reflecting new deposit

### 8. Edge Cases

#### Empty Leaderboard
**Test:** Leaderboard with no users or deposits
- Expected: Returns empty array with 0 total count

#### Tie-Breaking
**Test:** Multiple users with identical balances
- Expected: Consistent ordering (e.g., by userId or timestamp)

#### Single User
**Test:** Leaderboard with only one user
- Expected: User ranks as 1

## Test Database Setup

Create seed data in test database:
- 50+ test users with various balances
- Deposit history spanning 12 months
- Mix of opted-in and opted-out users
- Users with varying streak lengths

## Performance Benchmarks

- Large dataset (10,000 users): Response time < 500ms
- Standard dataset (1,000 users): Response time < 200ms
- Cache hit: Response time < 50ms

## Related Files
- `backend/src/leaderboard/savings-leaderboard.service.ts` - Service implementation
- `backend/src/leaderboard/dto/leaderboard.dto.ts` - Data transfer objects
- `backend/test/leaderboard/savings-leaderboard.spec.ts` - Integration tests

## Acceptance Criteria
✓ Leaderboard API returns ranked savers with accurate data
✓ All ranking calculations (balance, streak, growth) are correct
✓ Opt-out functionality properly excludes users
✓ Pagination works correctly
✓ Cache invalidation on new deposits
✓ Timeframe filtering functions as specified
✓ Validated by integration test suite
