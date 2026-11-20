# Account Service Implementation Guide

## Overview

The Account Service manages user data export, deletion, and lifecycle operations for the Stow platform. It provides GDPR-compliant data handling with comprehensive export functionality, automatic cleanup, and transactional data deletion.

## Table of Contents

1. [Key Features](#key-features)
2. [Core Methods](#core-methods)
3. [Data Export Flow](#data-export-flow)
4. [Account Deletion](#account-deletion)
5. [Scheduled Tasks](#scheduled-tasks)
6. [Configuration](#configuration)
7. [API Integration](#api-integration)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Key Features

### 1. **Data Export (GDPR Right to Data Portability)**

- **Asynchronous Processing**: Non-blocking export job creation and background processing
- **Comprehensive Data Gathering**: Collects user profile, predictions, markets, notifications, achievements, and yield data
- **TTL-Based Cleanup**: Automatic expiration and deletion of old exports
- **File Management**: Organized storage with configurable directory location
- **Status Tracking**: Poll-based job status with persistent storage

### 2. **Account Deletion (GDPR Right to be Forgotten)**

- **Transactional Safety**: All-or-nothing deletion with rollback on failure
- **PII Anonymization**: Securely nullifies sensitive personal information
- **Soft Delete Pattern**: Preserves data integrity with `deleted_at` timestamp
- **File Cleanup**: Removes associated export files from disk
- **Cascade Handling**: Automatically handles related data across multiple tables

### 3. **Yield Position Tracking**

- **Harvest Attribution**: Calculates proportional yield attribution per user
- **Share-Based Accounting**: Tracks share ownership and yield distribution
- **Deposit History**: Records all share-minting events for accurate attribution
- **Transaction History**: Maintains complete audit trail of yield events

---

## Core Methods

### requestExport(userId: string)

**Purpose**: Initiate a user data export job

**Parameters**:
- `userId` (string): Unique user identifier

**Returns**:
```typescript
{
  jobId: string;      // Unique job identifier
  status: string;     // 'pending' | 'processing' | 'ready' | 'failed'
}
```

**Behavior**:
- Returns existing pending/processing job if one exists (prevents duplicates)
- Creates new job with 'pending' status
- Does not block on job completion

**Example**:
```typescript
const result = await accountService.requestExport('user-123');
// Returns: { jobId: 'job-xyz', status: 'pending' }
```

**Use Cases**:
- User initiates data download request
- Frontend calls endpoint to start export
- Scheduled periodic exports

---

### getExportStatus(userId: string, jobId: string)

**Purpose**: Check the status of a data export job

**Parameters**:
- `userId` (string): User requesting status
- `jobId` (string): Job identifier returned from `requestExport()`

**Returns**:
```typescript
{
  jobId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  expires_at: Date | null;
}
```

**Behavior**:
- Validates that job belongs to requesting user (security check)
- Returns current job state including expiration time
- Throws `NotFoundException` if job not found or doesn't belong to user

**Example**:
```typescript
const status = await accountService.getExportStatus('user-123', 'job-xyz');
// Returns: { 
//   jobId: 'job-xyz', 
//   status: 'ready', 
//   expires_at: Date(2024-01-17T10:00:00Z) 
// }
```

**Use Cases**:
- Frontend polls for job completion
- Determine if file is ready for download
- Show expiration time to user

---

### downloadExport(userId: string, jobId: string)

**Purpose**: Download completed user data export

**Parameters**:
- `userId` (string): Requesting user
- `jobId` (string): Job identifier

**Returns**: 
- String file path to the export JSON file

**Behavior**:
- Validates job ownership
- Checks export is in 'ready' status
- Verifies file hasn't expired
- Confirms file still exists on disk
- Returns file path for secure download

**Throws**:
- `NotFoundException` - Job not found or doesn't belong to user
- `BadRequestException` - Export not ready or in wrong state
- `GoneException` - Export expired or file deleted

**Example**:
```typescript
const filePath = await accountService.downloadExport('user-123', 'job-xyz');
// Returns: '/exports/job-xyz.json'

// Frontend then serves file to user:
// response.download(filePath, 'my-data.json');
```

**Data Structure** (export JSON):
```json
{
  "exported_at": "2024-01-15T10:00:00Z",
  "profile": {
    "id": "user-123",
    "stellar_address": "GXXX...",
    "username": "john_doe",
    "email": "john@example.com",
    "created_at": "2023-01-01T00:00:00Z"
  },
  "predictions": [...],
  "markets_created": [...],
  "notifications": [...],
  "achievements": [...],
  "bookmarks": [...],
  "follows": [...],
  "competitions": [...],
  "leaderboard_history": [...],
  "yield_position": {
    "owner": "GXXX...",
    "shares": "10000000",
    "exchange_rate_snapshot": "1.5",
    "created_at": "2023-06-01T00:00:00Z"
  },
  "harvest_history": [...]
}
```

---

### deleteAccount(userId: string)

**Purpose**: Permanently delete user account and associated data (GDPR compliance)

**Parameters**:
- `userId` (string): User ID to delete

**Behavior**:
- Runs within database transaction (all-or-nothing)
- Collects export file paths before deletion
- Deletes address-indexed personal data (notifications, digests)
- Deletes export jobs
- Anonymizes PII (email, username, avatar)
- Sets `deleted_at` timestamp (soft delete)
- Removes files from disk after transaction commits

**Transaction Safety**:
```
BEGIN TRANSACTION
├── Query export file paths
├── DELETE notifications
├── DELETE notification_digest_state
├── DELETE data_export_jobs
├── UPDATE users (anonymize PII, set deleted_at)
├── COMMIT
└── After commit: Delete files from disk
```

**Why Soft Delete?**:
- JWT tokens still reference user ID
- Auth middleware validates `deleted_at` → returns null
- Preserves referential integrity
- Allows audit trails and forensics
- Enables grace-period recovery

**Example**:
```typescript
await accountService.deleteAccount('user-123');
// User record still exists but:
// - email = NULL
// - username = NULL
// - avatar_url = NULL
// - deleted_at = NOW()
```

**Important Notes**:
- This is a **destructive operation** - data cannot be recovered
- Should require user confirmation and optional delay period
- Consider implementing grace period (e.g., 30-day deletion delay)
- Log deletion for audit purposes

---

## Data Export Flow

### Sequence Diagram

```
User Request (Frontend)
    ↓
requestExport() 
    ├─ Check for existing pending/processing job
    ├─ Create job with status='pending'
    └─ Return jobId
    ↓
Frontend polls getExportStatus()
    ├─ Status: 'pending' → Keep polling
    ├─ Status: 'processing' → Keep polling
    ├─ Status: 'ready' → Call downloadExport()
    └─ Status: 'failed' → Show error
    ↓
downloadExport()
    ├─ Validate job ownership & status
    ├─ Check expiration
    ├─ Verify file exists
    └─ Return file path for download
```

### Background Processing

**Cron Job**: `processExports()` runs **every minute**

```typescript
@Cron(CronExpression.EVERY_MINUTE)
async processExports(): Promise<void> {
  // 1. Query up to 5 pending jobs
  const jobs = await this.jobRepo.find({
    where: { status: 'pending' },
    take: 5,
  });
  
  // 2. Process each job
  for (const job of jobs) {
    await this.runExport(job).catch(() => {});
  }
}
```

**Processing Steps** (`runExport()`):

1. **Update Status to 'processing'**
   ```sql
   UPDATE data_export_jobs SET status='processing' WHERE id=?
   ```

2. **Gather User Data**
   - Profile information
   - Predictions, markets, achievements
   - Notifications, bookmarks, follows
   - Leaderboard history
   - Yield positions and harvest history

3. **Write to File**
   ```typescript
   await fs.writeFile(
     '/exports/job-id.json',
     JSON.stringify(data, null, 2),
     'utf8'
   );
   ```

4. **Calculate Expiration**
   ```typescript
   const ttl = configService.get('EXPORT_TTL_HOURS', 48); // Default: 48 hours
   const expiresAt = new Date(Date.now() + ttl * 3_600_000);
   ```

5. **Update Database**
   ```sql
   UPDATE data_export_jobs 
   SET status='ready', file_path=?, expires_at=?
   WHERE id=?
   ```

6. **On Error**: Update status to 'failed'

### Performance Considerations

- **Batch Processing**: Max 5 jobs per minute to avoid overload
- **Timeout**: Long-running queries should have timeouts
- **Locks**: Transaction locks prevent concurrent exports for same user
- **Storage**: Monitor `/exports` directory size and cleanup policy
- **TTL**: Shorter TTL reduces disk usage; longer allows more download time

---

## Account Deletion

### Pre-Deletion Checklist

Before calling `deleteAccount()`:

1. **User Confirmation**: Explicit user consent required
2. **Grace Period** (Optional): 7-30 day delay before actual deletion
3. **Final Export**: Offer final data export opportunity
4. **Outstanding Exports**: Consider cleanup
5. **Open Processes**: Cancel pending jobs
6. **Audit Log**: Record deletion request with reason

### Transaction Safety Guarantees

**Atomicity**: All-or-nothing
- Either everything deletes, or nothing does
- No partial deletion state

**Data Integrity**:
- Referential integrity maintained via `deleted_at` field
- JWT tokens remain valid but auth middleware validates deletion
- User lookups return null for deleted accounts

### Deletion Checklist (By Table)

| Operation | Details |
|-----------|---------|
| Notifications | DELETE all notifications by `user_address` |
| Digest State | DELETE notification digest state |
| Export Jobs | DELETE all pending/completed exports |
| Users (PII) | NULL email, username, avatar_url |
| Users (Soft Delete) | SET deleted_at = NOW() |
| Export Files | Remove from `/exports` directory |

### Grace Period Implementation (Recommended)

```typescript
// 1. Mark for deletion (7-day grace period)
await userRepo.update(userId, { 
  scheduled_deletion_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
});

// 2. Scheduled job checks daily and deletes if grace period passed
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async executeScheduledDeletions(): Promise<void> {
  const users = await userRepo.find({
    where: { 
      scheduled_deletion_at: LessThan(new Date()),
      deleted_at: null
    }
  });
  
  for (const user of users) {
    await this.deleteAccount(user.id);
  }
}

// 3. User can cancel deletion before grace period expires
await userRepo.update(userId, { scheduled_deletion_at: null });
```

---

## Scheduled Tasks

### 1. processExports() - Every Minute

**Cron**: `* * * * *` (every minute)

**Purpose**: Process pending export jobs

**Logic**:
- Find up to 5 pending jobs
- Run export for each
- Update status and file paths
- Handle errors gracefully

**Monitoring**:
- Alert if jobs stuck in 'processing' for > 10 minutes
- Monitor export duration (should be < 5 minutes)
- Track success/failure rate

### 2. cleanupExports() - Every Night

**Cron**: `0 0 * * *` (midnight UTC)

**Purpose**: Delete expired export files

**Logic**:
- Query jobs with `status='ready'` and `expires_at < NOW()`
- Delete files from disk
- Delete job records from database

**Monitoring**:
- Alert if cleanup fails
- Monitor disk space freed
- Track number of deleted exports

---

## Configuration

### Environment Variables

```env
# Data export configuration
EXPORT_DIR=/data/exports              # Directory to store export files (default: ./exports)
EXPORT_TTL_HOURS=48                   # Export file time-to-live in hours (default: 48)

# Database configuration
DATABASE_URL=postgres://user:pass@host/db

# Logging
LOG_LEVEL=debug                       # Adjust for production
```

### TypeORM Entities Required

```typescript
// DataExportJob
{
  id: string;                 // UUID
  user_id: string;            // Foreign key to users
  status: 'pending' | 'processing' | 'ready' | 'failed';
  file_path: string | null;   // /exports/job-id.json
  expires_at: Date | null;    // When export will be deleted
  created_at: Date;
  updated_at: Date;
}

// YieldPosition
{
  owner: string;              // Stellar address
  shares: string;             // BigInt as string
  exchange_rate_snapshot: string;
  created_at: Date;
  updated_at: Date;
}

// ContractEvent
{
  event_type: string;         // 'harvested', 'deposited', etc.
  ledger: number;
  data: Record<string, unknown>;
  created_at: Date;
}
```

---

## API Integration

### REST Endpoints

#### 1. Request Data Export

```http
POST /api/v1/account/export
Authorization: Bearer <jwt_token>

Response 202 Accepted:
{
  "jobId": "job-abc123",
  "status": "pending"
}
```

#### 2. Check Export Status

```http
GET /api/v1/account/export/:jobId
Authorization: Bearer <jwt_token>

Response 200 OK:
{
  "jobId": "job-abc123",
  "status": "ready" | "pending" | "processing" | "failed",
  "expires_at": "2024-01-17T10:00:00Z"
}
```

#### 3. Download Export

```http
GET /api/v1/account/export/:jobId/download
Authorization: Bearer <jwt_token>

Response 200 OK (file content):
(JSON file with user data)

Response 410 Gone:
{
  "message": "Export has expired"
}
```

#### 4. Delete Account

```http
DELETE /api/v1/account
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "confirmation": "DELETE_MY_ACCOUNT",
  "reason": "optional reason for deletion"
}

Response 204 No Content
```

### Frontend Implementation Example

```typescript
// 1. Request export
const { jobId } = await api.post('/account/export');

// 2. Poll for status
const poll = setInterval(async () => {
  const status = await api.get(`/account/export/${jobId}`);
  
  if (status.status === 'ready') {
    clearInterval(poll);
    // 3. Download
    window.location.href = `/account/export/${jobId}/download`;
  } else if (status.status === 'failed') {
    clearInterval(poll);
    showError('Export failed');
  }
}, 2000); // Poll every 2 seconds
```

---

## Best Practices

### 1. **User Confirmation for Deletions**

```typescript
// Backend should not delete without explicit confirmation
POST /account/delete-confirm
{
  "confirmationCode": "DELETE_MY_ACCOUNT"  // Must match exactly
}
```

### 2. **Grace Period for Account Deletion**

```typescript
// Optional: Implement 30-day grace period
- Day 0: User requests deletion
- Day 1-29: Account marked for deletion, user can cancel
- Day 30: Account actually deleted
```

### 3. **Export Validation**

```typescript
// After export, verify file integrity
const exported = JSON.parse(fs.readFileSync(path));
console.assert(exported.profile.id === userId, 'Export mismatch');
console.assert(Array.isArray(exported.notifications), 'Invalid export');
```

### 4. **Audit Logging**

```typescript
// Log all sensitive operations
logger.audit({
  action: 'ACCOUNT_DELETE',
  userId,
  timestamp: new Date(),
  reason: deletionReason,
  admin: isAdminInitiated
});
```

### 5. **Error Handling in Exports**

```typescript
try {
  await accountService.requestExport(userId);
} catch (error) {
  if (error instanceof BadRequestException) {
    // Job already exists
    return existingJobId;
  }
  throw error;
}
```

---

## Troubleshooting

### Issue: Exports Stuck in 'processing'

**Symptoms**: Job status never changes from 'processing'

**Causes**:
1. Long-running database query
2. File system issue
3. Process crashed

**Solutions**:
```sql
-- Check stuck jobs
SELECT * FROM data_export_jobs WHERE status='processing' AND updated_at < NOW() - INTERVAL '10 minutes';

-- Manual recovery (mark as failed)
UPDATE data_export_jobs SET status='failed' WHERE id='job-id';
```

### Issue: Export Files Not Deleted

**Symptoms**: `/exports` directory grows indefinitely

**Causes**:
1. `cleanupExports()` not running
2. Cron job disabled
3. File system permission error

**Solutions**:
```bash
# Check cron log
tail -f /var/log/cron

# Manually cleanup
find /exports -type f -mtime +2 -delete

# Verify permissions
ls -la /exports
```

### Issue: Download Returns 410 Gone

**Symptoms**: User tries to download after export expired

**Causes**:
- TTL exceeded (default: 48 hours)
- File manually deleted
- Permission issue

**Solutions**:
```typescript
// Extend TTL if needed
EXPORT_TTL_HOURS=72  // Increase to 3 days

// Or regenerate export
await accountService.requestExport(userId);
```

### Issue: Account Deletion Fails

**Symptoms**: Deletion throws error, account partially deleted

**Causes**:
- Database constraint violation
- File system error
- Transaction timeout

**Solutions**:
```sql
-- Check transaction status
SELECT * FROM pg_stat_activity WHERE query LIKE '%DELETE%';

-- If stuck, can manually clean (use with caution)
-- But better: restart database and retry
```

---

## Related Documentation

- [Data Privacy & GDPR Compliance](../docs/PRIVACY.md)
- [Database Schema](../migrations/)
- [Authentication & Authorization](../auth/README.md)
- [Performance Tuning](../docs/PERFORMANCE.md)
