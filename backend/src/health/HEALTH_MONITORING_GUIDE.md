# Health Monitoring Guide

## Overview

The Health module provides comprehensive monitoring and diagnostic endpoints for the Stow application. It implements the Kubernetes-recommended patterns for liveness probes, readiness probes, and detailed health status monitoring.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Endpoints](#endpoints)
3. [Health Status Levels](#health-status-levels)
4. [Dependency Checks](#dependency-checks)
5. [Integration Examples](#integration-examples)
6. [Monitoring Strategies](#monitoring-strategies)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Basic Health Check

```bash
# Check overall application health
curl http://localhost:3000/api/v1/health

# Expected response (200 OK):
{
  "status": "ok",
  "info": {
    "http": { "status": "up" },
    "database": { "status": "up" },
    "storage": { "status": "up" }
  }
}
```

### Liveness Probe

```bash
# Check if application process is running
curl http://localhost:3000/api/v1/health/live

# Expected response (200 OK):
{
  "status": "ok",
  "type": "liveness",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Readiness Probe

```bash
# Check if application is ready to serve requests
curl http://localhost:3000/api/v1/health/ready

# Expected response (200 OK when ready, 503 when not):
{
  "status": "ok",
  "info": {
    "database": { "status": "up" }
  }
}
```

### Detailed Dependencies

```bash
# Get detailed status of all dependencies with latency
curl http://localhost:3000/api/v1/health/dependencies

# Expected response (200 OK):
{
  "status": "healthy",
  "database": {
    "status": "up",
    "latency_ms": 3
  },
  "soroban": {
    "status": "up",
    "latency_ms": 145
  },
  "cache": {
    "status": "up",
    "latency_ms": 2
  },
  "indexer": {
    "status": "up",
    "lag_ledgers": 15,
    "last_processed_ledger": 456789,
    "latest_contract_ledger": 456804
  },
  "uptime_seconds": 3600
}
```

---

## Endpoints

### 1. GET `/api/v1/health`

**Purpose**: Comprehensive health check for load balancers and CI/CD pipelines  
**HTTP Responses**:
- `200 OK` - All checks passed (HTTP, Database, Storage)
- `503 Service Unavailable` - One or more checks failed

**Response Schema**:
```json
{
  "status": "ok" | "error",
  "info": {
    "http": { "status": "up" | "down" },
    "database": { "status": "up" | "down" },
    "storage": { "status": "up" | "down" }
  },
  "error": {} // Only present if status is "error"
}
```

**Use Case**: 
- Docker container health checks
- Kubernetes readiness and liveness probes
- Load balancer health checks
- CI/CD deployment validation

---

### 2. GET `/api/v1/health/live`

**Purpose**: Liveness probe - indicates if process is running  
**HTTP Response**: Always `200 OK`

**Response Schema**:
```json
{
  "status": "ok",
  "type": "liveness",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Use Case**:
- Kubernetes liveness probe (restart container if failing)
- Quick process verification
- Minimal overhead checks

**Kubernetes Configuration**:
```yaml
livenessProbe:
  httpGet:
    path: /api/v1/health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3
```

---

### 3. GET `/api/v1/health/ready`

**Purpose**: Readiness probe - indicates if application is ready for traffic  
**HTTP Responses**:
- `200 OK` - Application is ready
- `503 Service Unavailable` - Database unavailable

**Response Schema**:
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" }
  }
}
```

**Checks**: Database connectivity only (critical dependency)

**Use Case**:
- Kubernetes readiness probe (remove from load balancer if failing)
- Deployment wait conditions
- Gradual traffic routing

**Kubernetes Configuration**:
```yaml
readinessProbe:
  httpGet:
    path: /api/v1/health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 2
```

---

### 4. GET `/api/v1/health/ping`

**Purpose**: Lightweight ping check (used internally by main health check)  
**HTTP Response**: Always `200 OK`

**Response Schema**:
```json
{
  "status": "ok",
  "type": "ping",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Use Case**:
- Internal use only (avoids recursion in main health check)
- Quick verification that HTTP layer is functioning
- Minimal database queries

---

### 5. GET `/api/v1/health/dependencies`

**Purpose**: Detailed status of all dependencies with latency metrics  
**HTTP Response**: `200 OK` (always, includes degraded status)

**Response Schema**:
```json
{
  "status": "healthy" | "degraded" | "down",
  "database": {
    "status": "up" | "down",
    "latency_ms": 3
  },
  "soroban": {
    "status": "up" | "down" | "degraded",
    "latency_ms": 145
  },
  "cache": {
    "status": "up" | "down",
    "latency_ms": 2
  },
  "indexer": {
    "status": "up" | "down",
    "lag_ledgers": 15,
    "last_processed_ledger": 456789,
    "latest_contract_ledger": 456804
  },
  "uptime_seconds": 3600
}
```

**Status Interpretation**:
- `healthy` - All dependencies operational
- `degraded` - Database is up but Soroban, Cache, or Indexer is down
- `down` - Database is down (critical failure)

**Use Case**:
- Detailed monitoring dashboards
- Alert triggers based on specific dependency status
- Performance troubleshooting
- Indexer lag monitoring

---

### 6. GET `/api/v1/health/detailed?verbose=true`

**Purpose**: Flexible health check with optional verbose output  
**Query Parameters**:
- `verbose` (boolean, optional): Set to `true` for detailed output, defaults to summary

**Response Schema** (compact):
```json
{
  "status": "healthy" | "degraded" | "down",
  "uptime_seconds": 3600
}
```

**Response Schema** (verbose):
```json
{
  "status": "healthy" | "degraded" | "down",
  "database": { ... },
  "soroban": { ... },
  "cache": { ... },
  "indexer": { ... },
  "uptime_seconds": 3600
}
```

**Use Case**:
- Flexible monitoring queries
- Bandwidth-sensitive clients
- Progressive detail loading

---

## Health Status Levels

### Overall Status Computation

The system reports three status levels:

| Status | Meaning | Critical Issue | Response |
|--------|---------|-----------------|----------|
| `healthy` | All dependencies operational | None | Service fully operational |
| `degraded` | Non-critical dependencies down | Soroban RPC, Cache, or Indexer down | API operational, reduced features |
| `down` | Critical dependency down | Database down | API cannot operate |

### Dependency Criticality

| Dependency | Criticality | Impact if Down |
|------------|------------|----------------|
| Database (PostgreSQL) | **CRITICAL** | Complete outage - affects all endpoints |
| Soroban RPC | Non-critical | Cannot interact with blockchain, but API works |
| Cache (Redis) | Non-critical | Reduced performance, increased DB load |
| Indexer | Non-critical | Blockchain data not updated, but historical data available |

---

## Dependency Checks

### 1. Database Check

**What It Tests**: PostgreSQL connectivity and query execution  
**Method**: Executes `SELECT 1` query  
**Timeout**: 5 seconds  
**Latency Range**: 1-10ms (typical)

```typescript
// Implementation detail
await this.dataSource.query('SELECT 1');
```

**Troubleshooting**:
- If latency > 100ms: Database may be under load
- If status is down: Check PostgreSQL connection string and network

### 2. Soroban RPC Check

**What It Tests**: Soroban RPC endpoint availability  
**Method**: Sends `getHealth` JSON-RPC call  
**Timeout**: 5 seconds  
**Latency Range**: 50-500ms (typical)

```typescript
// Implementation detail
POST https://soroban-testnet.stellar.org
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getHealth",
  "params": []
}
```

**Status Interpretation**:
- `up` - RPC responding (HTTP 200)
- `degraded` - RPC responding but not healthy
- `down` - RPC timeout or unreachable

**Troubleshooting**:
- If latency > 5000ms: Network issue or RPC overloaded
- If status is down: Check SOROBAN_RPC_URL environment variable

### 3. Cache Check

**What It Tests**: Cache (Redis) set/get operations  
**Method**: Sets probe value, retrieves it, verifies  
**Timeout**: 5 seconds  
**Latency Range**: 1-5ms (typical)

```typescript
// Implementation detail
await cacheManager.set('__health_check_probe__', 'ok', 5000);
const value = await cacheManager.get('__health_check_probe__');
// Verify value === 'ok'
```

**Troubleshooting**:
- If latency > 50ms: Redis under load
- If status is down: Check Redis connection and CACHE_MANAGER setup

### 4. Indexer Check

**What It Tests**: Blockchain indexer lag  
**Method**: Queries indexer metrics for lag in ledgers  
**Threshold**: 100 ledgers (configurable)

```typescript
const lag = metrics.lag_in_ledgers;
const status = lag > 100 ? 'down' : 'up';
```

**Status Interpretation**:
- `up` - Indexer within acceptable lag (< 100 ledgers)
- `down` - Indexer lagging significantly (> 100 ledgers)

**Metrics Returned**:
- `lag_ledgers` - How far behind the latest ledger
- `last_processed_ledger` - Most recent ledger processed
- `latest_contract_ledger` - Latest ledger with contract activity

**Troubleshooting**:
- If lag is growing: Indexer may be stuck or overloaded
- If lag is large: May indicate Soroban RPC connectivity issues

---

## Integration Examples

### Docker Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health/ready || exit 1
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stow-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: stow:latest
        ports:
        - containerPort: 3000
        
        # Liveness probe - restart if failing
        livenessProbe:
          httpGet:
            path: /api/v1/health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          failureThreshold: 3
        
        # Readiness probe - remove from LB if failing
        readinessProbe:
          httpGet:
            path: /api/v1/health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 2
        
        # Startup probe - wait before beginning checks
        startupProbe:
          httpGet:
            path: /api/v1/health/live
            port: 3000
          periodSeconds: 5
          failureThreshold: 30
```

### Monitoring Dashboard (Prometheus)

```yaml
# Scrape health metrics every 30 seconds
- job_name: 'stow-api-health'
  scrape_interval: 30s
  metrics_path: '/api/v1/health/detailed'
  params:
    verbose: ['true']
  static_configs:
    - targets: ['localhost:3000']

# Alert rules
- alert: StowAPIUnhealthy
  expr: stow_api_health_status == 0
  for: 5m
  annotations:
    summary: "Stow API health check failed"

- alert: StowAPIIndexerLagging
  expr: stow_api_indexer_lag_ledgers > 500
  for: 10m
  annotations:
    summary: "Indexer lagging {{ $value }} ledgers"
```

### Monitoring Shell Script

```bash
#!/bin/bash
# Monitor Stow API health every minute

while true; do
  response=$(curl -s http://localhost:3000/api/v1/health/dependencies)
  status=$(echo $response | jq -r '.status')
  db_status=$(echo $response | jq -r '.database.status')
  indexer_lag=$(echo $response | jq -r '.indexer.lag_ledgers')
  
  echo "[$(date)] Status: $status | DB: $db_status | Indexer Lag: $indexer_lag"
  
  if [ "$status" = "down" ]; then
    # Send alert (PagerDuty, Slack, etc.)
    echo "ALERT: API is down!"
  fi
  
  if [ "$indexer_lag" -gt 500 ]; then
    echo "WARNING: Indexer lagging $indexer_lag ledgers"
  fi
  
  sleep 60
done
```

---

## Monitoring Strategies

### Strategy 1: Load Balancer Health Checks

**Endpoint**: `/api/v1/health`  
**Frequency**: Every 30 seconds  
**Action on Failure**: Remove instance from rotation

```
10:00:00 - Health check passed ✓
10:00:30 - Health check passed ✓
10:01:00 - Health check failed ✗
10:01:30 - Health check failed ✗ → Remove from LB
10:02:00 - Still failing ✗ → Alert ops team
```

### Strategy 2: Kubernetes Auto-Healing

**Liveness Probe**: `/api/v1/health/live` (every 10s)  
**Readiness Probe**: `/api/v1/health/ready` (every 5s)

```
Process crashes → Liveness probe fails
→ Container restarted automatically
→ Readiness probe starts checking
→ Once ready, traffic flows to pod
```

### Strategy 3: Detailed Monitoring & Alerting

**Endpoint**: `/api/v1/health/dependencies`  
**Frequency**: Every 60 seconds  
**Triggers**:

```
Database latency > 100ms → WARNING
Cache down > 2 minutes → ALERT (degraded service)
Indexer lag > 500 ledgers → WARNING (data stale)
Overall status = down → CRITICAL (page on-call)
```

### Strategy 4: Synthetic Monitoring

```bash
# External monitoring service checks every 5 minutes
curl -m 10 https://api.stow.example.com/api/v1/health/dependencies
```

**Success Criteria**:
- HTTP 200 response
- status == "healthy"
- All latencies < 1000ms

---

## Troubleshooting

### Issue: Health Check Returns 503

**Diagnosis**:
```bash
curl -v http://localhost:3000/api/v1/health
```

**Causes & Solutions**:

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| `"http": { "status": "down" }` | Self-ping failing (recursive) | Check port binding, firewall |
| `"database": { "status": "down" }` | PostgreSQL unavailable | Check DB connection, credentials |
| `"storage": { "status": "down" }` | /tmp disk 90%+ full | Clear temp files, increase storage |

### Issue: Readiness Probe Keeps Failing

**Check Database Connectivity**:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"
```

**Check Connection String**:
```bash
echo $DATABASE_URL
# Should be: postgres://user:pass@host:5432/database
```

### Issue: Indexer Status Showing "down"

**Check Lag**:
```bash
curl http://localhost:3000/api/v1/health/dependencies | jq '.indexer'
```

**Expected Output**:
```json
{
  "status": "up",
  "lag_ledgers": 15,
  "last_processed_ledger": 456789,
  "latest_contract_ledger": 456804
}
```

**If lag > 100 ledgers**:
1. Check indexer service is running
2. Check Soroban RPC connectivity
3. Check database performance
4. Review indexer logs

### Issue: High Latency in Health Checks

**Identify Slow Component**:
```bash
curl http://localhost:3000/api/v1/health/dependencies | jq '.[] | select(.latency_ms > 100)'
```

**Solutions by Component**:
- **Database**: Run ANALYZE, check index usage
- **Soroban RPC**: Switch RPC endpoint, check network
- **Cache**: Restart Redis, check memory usage
- **Indexer**: Check sync status, verify network

---

## Configuration

### Environment Variables

```env
# Port for health endpoints
PORT=3000

# Database connection
DATABASE_URL=postgres://user:pass@localhost:5432/stow

# Soroban RPC endpoint
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Cache configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Disk space warning threshold (percent)
DISK_WARNING_THRESHOLD=90

# Indexer lag threshold (ledgers)
INDEXER_LAG_THRESHOLD_LEDGERS=100
```

### Application Uptime Calculation

- Tracked from service start time
- Reported in seconds in all endpoints
- Resets when process restarts
- Used for deployment validation

---

## Related Documentation

- [NestJS Terminus Health Checks](https://docs.nestjs.com/techniques/health-checks)
- [Kubernetes Health Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Docker HEALTHCHECK](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [Performance Monitoring](../performance/README.md)
