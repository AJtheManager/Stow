# CacheService API Reference and Implementation Guide

## Overview

The `CacheService` provides a unified interface for caching operations with support for Redis and in-memory fallback. This guide covers all available methods, use cases, patterns, and implementation examples.

## Table of Contents

1. [API Reference](#api-reference)
2. [Method Details](#method-details)
3. [Usage Patterns](#usage-patterns)
4. [Common Patterns](#common-patterns)
5. [Performance Considerations](#performance-considerations)
6. [Troubleshooting](#troubleshooting)

---

## API Reference

### Core Methods

| Method | Signature | Returns | Purpose |
|--------|-----------|---------|---------|
| `get<T>()` | `get<T>(key: string)` | `Promise<T \| undefined>` | Retrieve a value from cache |
| `set<T>()` | `set<T>(key: string, value: T, ttl?: number)` | `Promise<void>` | Store a value in cache with optional TTL |
| `del()` | `del(key: string)` | `Promise<void>` | Delete a single cache entry |
| `reset()` | `reset()` | `Promise<void>` | Clear all cache entries |
| `wrap<T>()` | `wrap<T>(key: string, factory: () => Promise<T>, ttl?: number)` | `Promise<T>` | Get or set pattern with factory function |
| `deletePattern()` | `deletePattern(pattern: string)` | `Promise<void>` | Delete multiple entries matching pattern |

### Key Generation Methods

| Method | Signature | Returns | Example |
|--------|-----------|---------|---------|
| `getUserCacheKey()` | `getUserCacheKey(userId: string, resource: string)` | `string` | `user:123:profile` |
| `getSessionCacheKey()` | `getSessionCacheKey(sessionId: string)` | `string` | `session:abc123def` |
| `getRealtimeCacheKey()` | `getRealtimeCacheKey(dataType: string, identifier: string)` | `string` | `realtime:balance:0x123...` |

---

## Method Details

### get<T>(key: string)

Retrieves a value from the cache.

```typescript
// Basic usage
const user = await this.cacheService.get<User>('user:123:profile');
if (!user) {
  console.log('Cache miss');
}

// With type safety
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

const profile = await this.cacheService.get<UserProfile>('user:123:profile');
```

**Returns:**
- The cached value if found
- `undefined` if key does not exist or TTL has expired

---

### set<T>(key: string, value: T, ttl?: number)

Stores a value in the cache with an optional TTL (Time To Live).

```typescript
// Without TTL (uses default)
await this.cacheService.set('user:123:profile', userProfile);

// With TTL in seconds
await this.cacheService.set('user:123:profile', userProfile, 1800); // 30 minutes

// Complex objects
const data = {
  balance: 1000,
  lastUpdated: new Date(),
  assets: ['USDC', 'XLM']
};
await this.cacheService.set('account:456:balance', data, 60);
```

**Parameters:**
- `key` (string): Unique cache key
- `value` (T): Any serializable value
- `ttl` (number, optional): Time to live in **seconds**

**Note:** TTL is converted to milliseconds internally for the cache manager.

---

### del(key: string)

Deletes a single cache entry.

```typescript
// Delete user profile cache
await this.cacheService.del('user:123:profile');

// Delete after data update
await this.updateUserProfile(userId, newData);
await this.cacheService.del(`user:${userId}:profile`);
```

**Use case:** Call after data mutations (create, update, delete operations)

---

### reset()

Clears all cache entries. Use with caution in production.

```typescript
// Clear entire cache
await this.cacheService.reset();

// Typical use: maintenance, testing
```

**⚠️ Warning:** This affects all users and all services using the cache. Use only during maintenance windows or in tests.

---

### wrap<T>(key: string, factory: () => Promise<T>, ttl?: number)

Implements the "get or set" pattern. Returns cached value if present; otherwise executes factory function, caches result, and returns it.

```typescript
// Fetch user or return cached version
const user = await this.cacheService.wrap(
  `user:${userId}:profile`,
  () => this.userRepository.findById(userId),
  1800 // Cache for 30 minutes
);

// Example with database query
const posts = await this.cacheService.wrap(
  `user:${userId}:posts`,
  async () => {
    return await this.postRepository.find({
      where: { authorId: userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  },
  600 // Cache for 10 minutes
);

// No TTL (uses default)
const config = await this.cacheService.wrap(
  'app:config',
  () => this.configService.loadConfiguration()
);
```

**Advantages:**
- Single method call reduces boilerplate
- Atomic operation prevents race conditions
- Factory function only executes on cache miss

---

### deletePattern(pattern: string)

Deletes multiple cache entries matching a pattern.

```typescript
// Delete all cache for a user
await this.cacheService.deletePattern(`user:123:*`);

// Delete all session data
await this.cacheService.deletePattern(`session:*`);

// Delete all real-time balance data
await this.cacheService.deletePattern(`realtime:balance:*`);
```

**⚠️ Note:** Currently logs a warning because pattern deletion requires Redis-specific implementation. Full support requires Redis SCAN and DEL commands through the Redis client.

---

### getUserCacheKey(userId: string, resource: string)

Generates a standardized cache key for user-specific data.

```typescript
// Profile data
const profileKey = this.cacheService.getUserCacheKey('user123', 'profile');
// Returns: 'user:user123:profile'

// User settings
const settingsKey = this.cacheService.getUserCacheKey('user123', 'settings');
// Returns: 'user:user123:settings'

// User transactions
const txKey = this.cacheService.getUserCacheKey('user123', 'transactions');
// Returns: 'user:user123:transactions'
```

**Format:** `user:{userId}:{resource}`

---

### getSessionCacheKey(sessionId: string)

Generates a standardized cache key for session data.

```typescript
const sessionKey = this.cacheService.getSessionCacheKey('session-abc123');
// Returns: 'session:session-abc123'

// Usage in authentication
const sessionData = await this.cacheService.get(sessionKey);
if (!sessionData) {
  throw new UnauthorizedException('Session expired');
}
```

**Format:** `session:{sessionId}`

---

### getRealtimeCacheKey(dataType: string, identifier: string)

Generates a standardized cache key for real-time data.

```typescript
// Account balance
const balanceKey = this.cacheService.getRealtimeCacheKey('balance', '0x123abc');
// Returns: 'realtime:balance:0x123abc'

// Exchange rates
const rateKey = this.cacheService.getRealtimeCacheKey('fx-rate', 'USD');
// Returns: 'realtime:fx-rate:USD'

// WebSocket subscription data
const wsKey = this.cacheService.getRealtimeCacheKey('websocket', 'user-456');
// Returns: 'realtime:websocket:user-456'
```

**Format:** `realtime:{dataType}:{identifier}`

---

## Usage Patterns

### Pattern 1: Simple Cache-Aside (Lazy Loading)

```typescript
async getUser(userId: string): Promise<User> {
  const cacheKey = this.cacheService.getUserCacheKey(userId, 'profile');
  
  // Try cache first
  let user = await this.cacheService.get<User>(cacheKey);
  if (user) {
    return user;
  }
  
  // Cache miss: fetch from database
  user = await this.userRepository.findById(userId);
  
  // Store in cache for 30 minutes
  await this.cacheService.set(cacheKey, user, 1800);
  
  return user;
}
```

### Pattern 2: Using wrap() for Concise Code

```typescript
async getUser(userId: string): Promise<User> {
  const cacheKey = this.cacheService.getUserCacheKey(userId, 'profile');
  
  return this.cacheService.wrap(
    cacheKey,
    () => this.userRepository.findById(userId),
    1800
  );
}
```

### Pattern 3: Cache Invalidation on Update

```typescript
async updateUser(userId: string, data: Partial<User>): Promise<User> {
  // Update database
  const updated = await this.userRepository.update(userId, data);
  
  // Invalidate cache
  const cacheKey = this.cacheService.getUserCacheKey(userId, 'profile');
  await this.cacheService.del(cacheKey);
  
  return updated;
}
```

### Pattern 4: Bulk Cache Invalidation

```typescript
async deleteUser(userId: string): Promise<void> {
  // Delete from database
  await this.userRepository.delete(userId);
  
  // Invalidate all user-related cache
  await this.cacheService.deletePattern(`user:${userId}:*`);
}
```

### Pattern 5: Time-Based Cache with Fallback

```typescript
async getRealTimeBalance(accountId: string): Promise<number> {
  const cacheKey = this.cacheService.getRealtimeCacheKey('balance', accountId);
  
  // Try very short-lived cache (5 seconds)
  let balance = await this.cacheService.get<number>(cacheKey);
  if (balance !== undefined) {
    return balance;
  }
  
  // Fetch from blockchain/API
  balance = await this.blockchainService.getBalance(accountId);
  
  // Cache briefly to reduce redundant calls
  await this.cacheService.set(cacheKey, balance, 5);
  
  return balance;
}
```

### Pattern 6: Warming the Cache

```typescript
async warmCache(): Promise<void> {
  const users = await this.userRepository.findAll();
  
  for (const user of users) {
    const cacheKey = this.cacheService.getUserCacheKey(user.id, 'profile');
    await this.cacheService.set(cacheKey, user, 1800);
  }
  
  console.log(`Warmed cache for ${users.length} users`);
}
```

### Pattern 7: Conditional Caching

```typescript
async getData(userId: string, includeCache = true): Promise<Data> {
  const cacheKey = this.cacheService.getUserCacheKey(userId, 'data');
  
  if (includeCache) {
    const cached = await this.cacheService.get<Data>(cacheKey);
    if (cached) return cached;
  }
  
  const data = await this.fetchData(userId);
  
  if (includeCache) {
    await this.cacheService.set(cacheKey, data, 600);
  }
  
  return data;
}
```

---

## Common Patterns

### Caching Multiple Related Items

```typescript
async getUserWithPosts(userId: string) {
  const userKey = this.cacheService.getUserCacheKey(userId, 'profile');
  const postsKey = this.cacheService.getUserCacheKey(userId, 'posts');
  
  const [user, posts] = await Promise.all([
    this.cacheService.wrap(userKey, () => this.getUser(userId), 1800),
    this.cacheService.wrap(postsKey, () => this.getPosts(userId), 600),
  ]);
  
  return { user, posts };
}
```

### TTL Strategy by Data Type

```typescript
const TTL_STRATEGY = {
  // Long-lived data
  PROFILE: 3600,      // 1 hour
  CONFIG: 86400,      // 24 hours
  
  // Medium-lived data
  POSTS: 600,         // 10 minutes
  TRANSACTIONS: 300,  // 5 minutes
  
  // Short-lived data
  BALANCE: 60,        // 1 minute
  RATE: 30,           // 30 seconds
};
```

### Graceful Degradation

```typescript
async getData(userId: string): Promise<Data> {
  try {
    return await this.cacheService.wrap(
      `user:${userId}:data`,
      () => this.fetchData(userId),
      600
    );
  } catch (error) {
    console.error('Cache error, fetching directly:', error);
    return this.fetchData(userId);
  }
}
```

---

## Performance Considerations

### TTL Recommendations

- **Static/Reference Data**: 24+ hours (config, settings)
- **User Profile Data**: 15-30 minutes
- **List/Paginated Data**: 5-10 minutes
- **Real-time Data**: 30 seconds - 2 minutes
- **Session Data**: 24 hours
- **Exchange Rates**: 1-5 minutes

### Memory Management

- Monitor Redis memory usage
- Set appropriate TTLs to avoid memory bloat
- Consider using cache warming for predictable data access patterns
- Use `deletePattern` to bulk invalidate related items

### Race Conditions

The `wrap()` method is atomic and prevents cache stampedes when cache expires simultaneously from multiple requests.

```typescript
// Safe: Only one request executes factory function
const value = await this.cacheService.wrap(key, expensiveOperation, ttl);
```

---

## Troubleshooting

### Cache Miss (undefined returned)

**Causes:**
- Key does not exist
- TTL has expired
- Redis connection issue (falls back to in-memory)

**Solution:**
```typescript
const value = await this.cacheService.get(key);
console.log(value === undefined ? 'Cache miss or expired' : 'Cache hit');
```

### Large Object Serialization

If caching large objects is slow:
- Reduce object size before caching
- Increase TTL to reduce writes
- Consider caching derived/summarized data

```typescript
// Bad: Caching entire large object
await this.cacheService.set(key, largeObject, 600);

// Good: Cache only necessary fields
const summary = { id, name, status };
await this.cacheService.set(key, summary, 600);
```

### Memory Pressure

If Redis memory usage is high:
- Audit TTL values (reduce them)
- Check for cache key leaks
- Implement cache cleanup strategies
- Monitor with `redis-cli INFO memory`

### Pattern Deletion Not Working

Full pattern support requires Redis upgrade:

```typescript
// Current workaround: delete specific keys
const userId = 'user123';
await Promise.all([
  this.cacheService.del(`user:${userId}:profile`),
  this.cacheService.del(`user:${userId}:posts`),
  this.cacheService.del(`user:${userId}:settings`),
]);
```

---

## Related Documentation

- [Cache Module README](./README.md)
- [Performance Tests](../performance/cache-effectiveness-test.js)
- [Redis Documentation](https://redis.io/docs/)
- [NestJS Caching](https://docs.nestjs.com/techniques/caching)
