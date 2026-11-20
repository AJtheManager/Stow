# Referral System Implementation Guide

## Overview

The Referral System is a growth mechanism that incentivizes users to invite others to the Stow platform. It tracks referral relationships, monitors qualification actions, and issues rewards automatically when referred users complete qualifying actions (e.g., first deposit).

The system is designed to be:
- **Idempotent**: Safe to retry operations without side effects
- **Flexible**: Configurable reward amounts and types
- **Auditable**: Complete tracking of referral status and reward issuance
- **Scalable**: Efficient queries with proper indexing

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Entities & Data Model](#entities--data-model)
3. [API Methods](#api-methods)
4. [User Workflows](#user-workflows)
5. [Reward Mechanics](#reward-mechanics)
6. [Configuration](#configuration)
7. [Query Examples](#query-examples)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Core Concepts

### Referral Flow

```
Step 1: Referrer shares code
  └─ User A's referral code = "user-a-id"

Step 2: Referred user claims referral
  └─ User B enters code "user-a-id"
  └─ UserReferral created: { referrer_id: "user-a-id", referred_id: "user-b-id", status: PENDING }

Step 3: Referred user qualifies
  └─ User B completes first deposit (qualifying action)
  └─ UserReferral status → QUALIFIED
  └─ Rewards created: 
     ├─ ReferralReward for User A (referrer bonus)
     └─ ReferralReward for User B (referee bonus)

Step 4: Rewards processed
  └─ Admin/system processes rewards
  └─ Rewards distributed on-chain or in-app
  └─ ReferralReward status → ISSUED
```

### Key Definitions

| Term | Meaning |
|------|---------|
| **Referrer** | User who shares their referral code |
| **Referred** | User who enters the referral code |
| **Referral Code** | User's own ID (e.g., "user-abc123") |
| **Qualifying Action** | Action that triggers reward (e.g., first deposit of $10+) |
| **PENDING** | Referral created, waiting for referred user to qualify |
| **QUALIFIED** | Referred user completed qualifying action, rewards issued |
| **Reward Claim** | User receives issued reward (off-chain or on-chain) |

---

## Entities & Data Model

### UserReferral

Tracks the referral relationship between two users.

```typescript
{
  id: string;                          // UUID
  referrer_id: string;                 // FK to User (who shares code)
  referred_id: string;                 // FK to User (who enters code)
  status: 'PENDING' | 'QUALIFIED';     // Referral status
  created_at: Date;                    // When referral was claimed
  qualified_at: Date | null;           // When first qualifying action completed
  updated_at: Date;
}
```

**Constraints**:
- Unique `referred_id` (one referral per referred user)
- Prevents self-referral (`referrer_id ≠ referred_id`)

**Indexes**:
```sql
CREATE INDEX idx_referral_referrer ON user_referral(referrer_id);
CREATE INDEX idx_referral_referred ON user_referral(referred_id);
CREATE INDEX idx_referral_status ON user_referral(status);
```

### ReferralReward

Represents a reward issued for a qualified referral.

```typescript
{
  id: string;                          // UUID
  referral_id: string;                 // FK to UserReferral
  recipient_id: string;                // FK to User (who receives reward)
  type: 'REFERRER_BONUS' | 'REFEREE_BONUS';
  amount: string;                      // In stroops (BigInt as string)
  asset_code: string;                  // 'XLM', 'USDC', etc.
  status: 'PENDING' | 'ISSUED';        // 'PENDING' until claimed/distributed
  issued_at: Date | null;              // When reward was distributed
  created_at: Date;
  updated_at: Date;
}
```

**Rewards Lifecycle**:
```
PENDING → [Manual admin action] → ISSUED → [User claims] → Wallet
```

**Indexes**:
```sql
CREATE INDEX idx_reward_recipient ON referral_reward(recipient_id);
CREATE INDEX idx_reward_status ON referral_reward(status);
CREATE INDEX idx_reward_referral ON referral_reward(referral_id);
```

---

## API Methods

### claimReferral(userId: string, referralCode: string)

**Purpose**: Record that a user was referred by the code holder

**Parameters**:
- `userId` - User who is being referred
- `referralCode` - Referrer's user ID (the code to enter)

**Returns**: `UserReferral` object

**Throws**:
- `BadRequestException` - User tries to refer themselves
- `NotFoundException` - Invalid referral code (referrer doesn't exist)
- `ConflictException` - User already has a referral on record

**Behavior**:
- Creates `UserReferral` with status `PENDING`
- One referral per user (enforced by unique constraint)
- Idempotent: Can safely retry without side effects (conflict error if duplicate)

**Example**:
```typescript
const referral = await referralService.claimReferral(
  'user-bob-id',
  'user-alice-id'  // Alice's referral code
);

// Returns:
// {
//   id: 'ref-123',
//   referrer_id: 'user-alice-id',
//   referred_id: 'user-bob-id',
//   status: 'PENDING',
//   created_at: '2024-01-15T10:00:00Z',
//   qualified_at: null
// }
```

**Use Cases**:
- User enters referral code during signup
- User adds referral code later
- Frontend form submission

---

### recordQualifyingAction(userId: string)

**Purpose**: Mark a referred user as qualified and issue rewards

**Parameters**:
- `userId` - User who completed qualifying action

**Returns**: `void`

**Behavior**:
- Finds pending referral for this user
- Updates referral status to `QUALIFIED`
- Creates reward records for both referrer and referred
- Logs the action

**Idempotent**:
- No-op if user has no pending referral
- Safe to call multiple times

**Example**:
```typescript
// Called when user completes first deposit
await referralService.recordQualifyingAction('user-bob-id');

// Updates UserReferral: status PENDING → QUALIFIED
// Creates ReferralReward entries:
// ├─ { recipient_id: 'user-alice-id', type: 'REFERRER_BONUS', ... }
// └─ { recipient_id: 'user-bob-id', type: 'REFEREE_BONUS', ... }
```

**Integration Points**:
```typescript
// In DepositService or SavingsService
async deposit(userId: string, amount: number) {
  // ... deposit logic ...
  
  // Record qualifying action
  await this.referralService.recordQualifyingAction(userId);
}
```

---

### getMyReferrals(userId: string)

**Purpose**: Get referral stats and list for a referrer

**Parameters**:
- `userId` - Referrer's user ID

**Returns**:
```typescript
{
  referral_code: string;        // The user's own ID
  total: number;                // Total referrals made
  pending: number;              // Still pending qualification
  qualified: number;            // Already qualified
  total_rewards_issued: number; // Total rewards this user received
  referrals: UserReferral[];    // Full referral list (with referred user details)
}
```

**Example Response**:
```json
{
  "referral_code": "user-alice-id",
  "total": 5,
  "pending": 2,
  "qualified": 3,
  "total_rewards_issued": 3,
  "referrals": [
    {
      "id": "ref-123",
      "referrer_id": "user-alice-id",
      "referred_id": "user-bob-id",
      "referred": { "username": "bob", "avatar_url": "..." },
      "status": "QUALIFIED",
      "created_at": "2024-01-01T00:00:00Z",
      "qualified_at": "2024-01-03T00:00:00Z"
    },
    ...
  ]
}
```

**Use Cases**:
- User views referral dashboard
- User checks referral statistics
- Frontend displays earned rewards

---

### getMyRewards(userId: string, query: PaginationQueryDto)

**Purpose**: Get paginated list of rewards earned by a user

**Parameters**:
- `userId` - User receiving rewards
- `query.page` - Page number (1-indexed)
- `query.limit` - Items per page (default: 20)

**Returns**:
```typescript
{
  data: ReferralReward[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }
}
```

**Example Response**:
```json
{
  "data": [
    {
      "id": "reward-123",
      "referral_id": "ref-123",
      "recipient_id": "user-alice-id",
      "type": "REFERRER_BONUS",
      "amount": "1000000",
      "asset_code": "XLM",
      "status": "ISSUED",
      "issued_at": "2024-01-03T12:00:00Z",
      "created_at": "2024-01-03T00:00:00Z"
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

**Use Cases**:
- User views reward history
- User checks reward status
- Pagination for large reward lists

---

### listReferrals(query: PaginationQueryDto & { status?: ReferralStatus })

**Purpose**: Admin method to list all referrals with optional filtering

**Parameters**:
- `query.page` - Page number (default: 1)
- `query.limit` - Items per page (default: 20)
- `query.status` - Optional filter ('PENDING' or 'QUALIFIED')

**Returns**: Paginated list of referrals with referrer and referred user details

**Example**:
```typescript
// Get all pending referrals
const pending = await referralService.listReferrals({
  page: 1,
  limit: 50,
  status: 'PENDING'
});
```

**Use Cases**:
- Admin dashboard
- Referral monitoring
- Bulk reward processing

---

### getAdminOverview()

**Purpose**: Get platform-wide referral statistics

**Returns**:
```typescript
{
  total_referrals: number;      // All referrals (pending + qualified)
  pending: number;              // Waiting for first action
  qualified: number;            // Completed qualifying action
  total_rewards_pending: number; // Rewards not yet issued
  total_rewards_issued: number;  // Rewards already distributed
  computed_at: string;          // Timestamp of calculation
}
```

**Example Response**:
```json
{
  "total_referrals": 150,
  "pending": 45,
  "qualified": 105,
  "total_rewards_pending": 45,
  "total_rewards_issued": 105,
  "computed_at": "2024-01-15T10:00:00Z"
}
```

**Use Cases**:
- Admin dashboard
- Referral program metrics
- Growth tracking

---

## User Workflows

### Workflow 1: New User Referred During Signup

```
Frontend
├─ User enters referral code in signup form
├─ Backend validates code format
└─ POST /users/referrals/claim with referralCode

Backend (AuthController)
├─ AuthService.register(email, password, referralCode?)
├─ Create User record
├─ If referralCode provided:
│  └─ ReferralService.claimReferral(newUserId, referralCode)
│     └─ Creates UserReferral with status PENDING
└─ Return user with referral info

User Dashboard
├─ User sees "Referred by: Alice"
└─ Can view referrer's profile if desired
```

### Workflow 2: User Qualifies and Gets Rewards

```
User deposits $10
└─ DepositService.deposit(userId, amount)
   ├─ Process deposit
   ├─ If first significant deposit:
   │  └─ ReferralService.recordQualifyingAction(userId)
   │     ├─ Find UserReferral where referred_id=userId, status=PENDING
   │     ├─ Update status → QUALIFIED
   │     ├─ Create ReferralReward for referrer (REFERRER_BONUS)
   │     └─ Create ReferralReward for referred user (REFEREE_BONUS)
   └─ Return deposit confirmation

Admin Reward Processing (Daily Batch Job)
├─ Query all ReferralRewards with status=PENDING
├─ Batch distribute rewards (on-chain or in-app)
├─ Update status → ISSUED
└─ Log distribution summary
```

### Workflow 3: User Views Referral Dashboard

```
Frontend
└─ GET /users/referrals/my-referrals

Backend (ReferralController)
├─ ReferralService.getMyReferrals(userId)
│  ├─ Query UserReferral where referrer_id=userId
│  ├─ Count PENDING vs QUALIFIED
│  ├─ Count issued rewards
│  └─ Return stats + referral list
└─ Return response to frontend

Frontend Display
├─ Show referral code: "Share code: user-alice-id"
├─ Display stats:
│  ├─ Total referrals: 5
│  ├─ Pending: 2
│  ├─ Qualified: 3
│  └─ Rewards issued: 3 XLM
└─ List of referred users with status
```

---

## Reward Mechanics

### Reward Amounts

**Configuration**:
```env
# Reward per qualified referral (in stroops, 1 XLM = 10,000,000 stroops)
REFERRAL_REWARD_AMOUNT_STROOPS=1000000       # Default: 1 XLM

# Asset code for rewards
REFERRAL_REWARD_ASSET_CODE=XLM               # Default: XLM (can be USDC, etc.)
```

**Reward Distribution**:

| Scenario | Referrer Gets | Referred Gets |
|----------|---------------|---------------|
| Referred completes first deposit | 1 XLM | 1 XLM |
| Referrer refers 10 users, all qualify | 10 XLM | (each gets 1 XLM) |
| Zero qualifying action | No reward | No reward |

### Reward Status Lifecycle

```
Creation (PENDING)
├─ Referral qualifies
├─ recordQualifyingAction() creates ReferralReward with status=PENDING
├─ RewardStatus.PENDING state

Distribution (ISSUED)
├─ Admin runs batch reward distribution
├─ Update ReferralReward status → ISSUED
├─ Set issued_at timestamp
├─ RewardStatus.ISSUED state

Claim (Application-specific)
├─ Optional: User claims reward to wallet
├─ Optional: Automatic transfer to user's account
└─ Reward available for use on platform
```

### Preventing Reward Abuse

**Anti-Fraud Measures**:

1. **One Referral Per User**: Unique constraint on `referred_id`
2. **No Self-Referral**: Validation in `claimReferral()`
3. **Qualifying Action Required**: Rewards only on first significant action
4. **Idempotent Recording**: `recordQualifyingAction()` is safe to retry

**Configuration Options**:
```env
# Minimum deposit for qualification
REFERRAL_QUALIFYING_DEPOSIT_AMOUNT_STROOPS=50000000  # 5 XLM

# Qualification TTL (max days after referral claim to qualify)
REFERRAL_QUALIFICATION_TTL_DAYS=365

# Maximum rewards per user per period (prevent abuse)
REFERRAL_MAX_ANNUAL_REWARDS=100000000  # 10 XLM
```

---

## Configuration

### Environment Variables

```env
# Reward amounts
REFERRAL_REWARD_AMOUNT_STROOPS=1000000          # Default: 1 XLM
REFERRAL_REWARD_ASSET_CODE=XLM                  # Default: XLM

# Qualification requirements
REFERRAL_QUALIFYING_DEPOSIT_AMOUNT_STROOPS=50000000
REFERRAL_QUALIFICATION_TTL_DAYS=365

# Reward caps (fraud prevention)
REFERRAL_MAX_ANNUAL_REWARDS=100000000           # 10 XLM per year

# Logging
REFERRAL_LOG_LEVEL=info
```

### Database Migrations

```sql
-- Create UserReferral table
CREATE TABLE user_referral (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id),
  referred_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUALIFIED')),
  created_at TIMESTAMP DEFAULT NOW(),
  qualified_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create ReferralReward table
CREATE TABLE referral_reward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES user_referral(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('REFERRER_BONUS', 'REFEREE_BONUS')),
  amount VARCHAR(78) NOT NULL,  -- BigInt as string (supports up to 78 digits)
  asset_code VARCHAR(10) NOT NULL DEFAULT 'XLM',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ISSUED')),
  issued_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_referral_referrer ON user_referral(referrer_id);
CREATE INDEX idx_referral_referred ON user_referral(referred_id);
CREATE INDEX idx_referral_status ON user_referral(status);
CREATE INDEX idx_reward_recipient ON referral_reward(recipient_id);
CREATE INDEX idx_reward_status ON referral_reward(status);
CREATE INDEX idx_reward_referral ON referral_reward(referral_id);
```

---

## Query Examples

### Get referral stats for user

```typescript
const stats = await referralService.getMyReferrals('user-alice-id');

console.log(`Alice has referred ${stats.total} users`);
console.log(`${stats.pending} are still pending`);
console.log(`${stats.qualified} have qualified`);
console.log(`Alice earned ${stats.total_rewards_issued} rewards`);
```

### Check all pending rewards (admin)

```typescript
const allRewards = await referralService.getMyRewards('admin-user-id', {
  page: 1,
  limit: 1000
});

const pending = allRewards.data.filter(r => r.status === 'PENDING');
console.log(`${pending.length} rewards pending distribution`);
```

### Get platform metrics

```typescript
const overview = await referralService.getAdminOverview();

console.log(`Total referrals: ${overview.total_referrals}`);
console.log(`Conversion: ${(overview.qualified / overview.total_referrals * 100).toFixed(2)}%`);
console.log(`Pending rewards: ${overview.total_rewards_pending}`);
console.log(`Distributed: ${overview.total_rewards_issued}`);
```

### List pending referrals for follow-up

```typescript
const pending = await referralService.listReferrals({
  page: 1,
  limit: 50,
  status: 'PENDING'
});

for (const ref of pending.data) {
  console.log(`${ref.referred.username} referred by ${ref.referrer.username} on ${ref.created_at}`);
}
```

---

## Best Practices

### 1. **Idempotent Operations**

```typescript
// Safe to retry multiple times
await referralService.recordQualifyingAction(userId);
await referralService.recordQualifyingAction(userId);  // No-op the second time
```

### 2. **Batch Reward Processing**

```typescript
// Process rewards in daily batch
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async processRewards() {
  const pending = await rewardRepo.find({ status: 'PENDING' });
  
  for (const reward of pending) {
    try {
      await distributeReward(reward);
      reward.status = 'ISSUED';
      reward.issued_at = new Date();
      await rewardRepo.save(reward);
    } catch (error) {
      logger.error(`Failed to distribute reward ${reward.id}: ${error}`);
    }
  }
}
```

### 3. **Validation Before Claiming**

```typescript
// Validate referral code early in signup
async validateReferralCode(code: string): Promise<boolean> {
  const user = await userRepo.findOne({ where: { id: code } });
  return !!user;
}
```

### 4. **Prevent Self-Referral**

```typescript
// Built into claimReferral(), but double-check in UI
if (referralCode === currentUserId) {
  showError('You cannot refer yourself');
  return;
}
```

### 5. **Monitor Reward Distribution**

```typescript
// Track distribution metrics
const metrics = {
  pending: await rewardRepo.count({ status: 'PENDING' }),
  issued: await rewardRepo.count({ status: 'ISSUED' }),
  totalValue: await rewardRepo.sum({ amount: ... })
};

logger.info(`Reward status: ${metrics.pending} pending, ${metrics.issued} issued`);
```

---

## Troubleshooting

### Issue: User Cannot Claim Referral

**Error**: `ConflictException: A referral has already been recorded`

**Causes**:
- User already has a referral on file
- Duplicate claim attempt

**Solution**:
```typescript
// Check existing referral
const existing = await referralRepo.findOne({
  where: { referred_id: userId }
});

if (existing) {
  console.log(`User already referred by: ${existing.referrer_id}`);
}
```

### Issue: Invalid Referral Code

**Error**: `NotFoundException: Referral code is invalid`

**Causes**:
- Referrer user doesn't exist
- Typo in code

**Solution**:
```typescript
// Validate code format and existence
const referrer = await userRepo.findOne({ where: { id: referralCode } });
if (!referrer) {
  throw new Error('Code not found. Verify the code is correct.');
}
```

### Issue: Rewards Not Issued

**Symptoms**: User completed qualifying action but no reward created

**Causes**:
- `recordQualifyingAction()` not called
- Referral wasn't pending (already qualified)

**Solution**:
```typescript
// Check referral status
const referral = await referralRepo.findOne({
  where: { referred_id: userId }
});

if (referral?.status === 'QUALIFIED') {
  console.log('Already qualified, no new rewards');
}
```

### Issue: Admin Reward Processing Failed

**Symptoms**: Batch distribution hung or crashed

**Solution**:
```typescript
// Implement safe retry with transaction
const processWithRetry = async (rewardId: string) => {
  try {
    await dataSource.transaction(async (manager) => {
      const reward = await manager.findOne(ReferralReward, { where: { id: rewardId } });
      await distributeReward(reward);
      reward.status = 'ISSUED';
      await manager.save(reward);
    });
  } catch (error) {
    logger.error(`Retry needed for ${rewardId}`, error);
    // Log for manual retry later
  }
};
```

---

## Related Documentation

- [Users Module](../users/README.md)
- [Rewards System](../rewards/README.md)
- [Growth Metrics](../analytics/GROWTH_METRICS.md)
