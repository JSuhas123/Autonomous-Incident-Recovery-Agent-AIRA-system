# AIRA — Deployment Guide

**Version**: 2.2.1 | **Status**: Production Ready | **Last Updated**: July 2026

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Configuration](#2-environment-configuration)
3. [Local Development](#3-local-development)
4. [Docker Compose (Staging / Single Machine)](#4-docker-compose-staging--single-machine)
5. [Kubernetes (Production)](#5-kubernetes-production)
6. [Health Checks & Verification](#6-health-checks--verification)
7. [Observability](#7-observability)
8. [Rollback & Recovery](#8-rollback--recovery)
9. [Security Checklist](#9-security-checklist)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Required
| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 18.x | Runtime |
| Docker | 20.10+ | Containerization |
| Docker Compose | v2+ | Local/staging orchestration |
| MongoDB | 7.0+ | Primary database |
| RabbitMQ | 3.12+ | Message queue |
| Redis | 7.x | Distributed locks & cache |

### Optional (Production)
| Tool | Purpose |
|------|---------|
| Kubernetes 1.24+ | Production orchestration |
| `kubectl` | K8s cluster management |
| MongoDB Atlas | Managed cloud database |
| CloudAMQP / Amazon MQ | Managed RabbitMQ |
| Redis Cloud / ElastiCache | Managed Redis |
| Prometheus + Grafana | Metrics & dashboards |

---

## 2. Environment Configuration

### 2.1 Copy the Template

```bash
cd backend
cp .env.example .env
```

### 2.2 Required Variables

| Variable | Dev Default | Production Value |
|----------|-------------|-----------------|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `5000` | `5000` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/decision_engine` | Atlas URI or managed URI |
| `RABBITMQ_URL` | `amqp://localhost` | `amqp://user:pass@host:5672` |
| `REDIS_URL` | `redis://localhost:6379` | `redis://user:pass@host:6379` |
| `AUDIT_SECRET` | _(change this!)_ | Strong random string (32+ chars) |
| `DISABLE_MEMORY_DB` | `false` | **`true`** |
| `ALLOW_IN_MEMORY_LOCKS` | `true` | **`false`** |

### 2.3 Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | _(empty)_ | AI-enhanced analysis (leave empty to skip) |
| `OPENAI_MODEL` | `gpt-4o-mini` | `gpt-4o` for higher accuracy |
| `SLACK_TOKEN` | _(empty)_ | Slack incident notifications |
| `PAGERDUTY_TOKEN` | _(empty)_ | PagerDuty escalations |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend URL |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |
| `METRICS_ENABLED` | `true` | Prometheus metrics endpoint |
| `SAFE_MODE` | `false` | Block all action execution (manual override) |

### 2.4 Generating a Secure AUDIT_SECRET

```bash
# Linux / macOS
openssl rand -base64 48

# Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Windows PowerShell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

---

## 3. Local Development

### Step 1 — Start Infrastructure

```bash
# From project root — starts MongoDB, RabbitMQ, Redis
docker-compose up -d mongodb rabbitmq redis

# Verify all three are healthy
docker-compose ps
```

Expected output:
```
backend-tracker-mongo     running (healthy)
backend-tracker-rabbitmq  running (healthy)
backend-tracker-redis     running (healthy)
```

### Step 2 — Install Dependencies & Start Server

```bash
cd backend
npm install
npm start
```

Expected log output:
```
✓ MongoDB connected
✓ RabbitMQ connected  
✓ Redis connected
✓ Server listening on port 5000
```

### Step 3 — Verify

```bash
curl http://localhost:5000/health
# {"status":"ok","safeMode":false,"redis":{"connected":true},...}

curl http://localhost:5000/health/detailed
# Full dependency health report
```

---

## 4. Docker Compose (Staging / Single Machine)

This runs the full stack — AIRA app + all infrastructure — in containers.

### Step 1 — Configure Secrets

Create a `.env` file at the project root (never committed):

```env
# Required for production stack
AUDIT_SECRET=<your-strong-random-secret>
MONGO_PASSWORD=<strong-mongo-password>
RABBITMQ_PASSWORD=<strong-rabbitmq-password>

# Optional
OPENAI_API_KEY=
SLACK_TOKEN=
CORS_ORIGIN=https://your-frontend.com
LOG_LEVEL=info
```

### Step 2 — Build and Start

```bash
# Build the AIRA image
docker build -t aira-backend:2.2.1 .

# Start the full stack
docker-compose up -d

# Tail logs
docker-compose logs -f app
```

### Step 3 — Verify

```bash
# App health
curl http://localhost:5000/health

# RabbitMQ management UI
open http://localhost:15672
# Default login: guest / guest (change in .env for prod)

# Prometheus metrics
curl http://localhost:5000/metrics
```

### Step 4 — Stop

```bash
docker-compose down          # stop & remove containers (keeps volumes)
docker-compose down -v       # also removes data volumes (destructive!)
```

---

## 5. Kubernetes (Production)

### 5.1 — Build & Push Docker Image

```bash
# Replace with your container registry
REGISTRY=your-registry.io/aira
VERSION=2.2.1

docker build -t $REGISTRY/aira-backend:$VERSION .
docker push $REGISTRY/aira-backend:$VERSION
```

### 5.2 — Update Image in deployment.yaml

In [k8s/deployment.yaml](k8s/deployment.yaml), replace:
```yaml
image: your-registry/aira-backend:latest
```
with:
```yaml
image: your-registry.io/aira/aira-backend:2.2.1
```

### 5.3 — Create the Secret

Edit [k8s/secret.yaml](k8s/secret.yaml) with base64-encoded values:

```bash
# Encode each secret value
echo -n 'mongodb+srv://user:pass@cluster.mongodb.net/decision_engine' | base64
echo -n 'amqp://user:pass@rabbitmq-host:5672' | base64
echo -n 'your-strong-audit-secret-min-32-chars' | base64
echo -n 'xoxb-your-slack-bot-token' | base64  # optional
```

Paste the output into the `data:` section of `k8s/secret.yaml`.

### 5.4 — Update ConfigMap

Edit [k8s/configmap.yaml](k8s/configmap.yaml) for your environment:

```yaml
data:
  redis-url: "redis://your-redis-host:6379"
  cors-origin: "https://your-frontend.com"
  log-level: "info"
  # ...other values
```

### 5.5 — Apply Manifests

```bash
# Apply in order
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml

# Watch rollout
kubectl rollout status deployment/aira-backend
```

### 5.6 — Verify Pod Health

```bash
# Check pods
kubectl get pods -l app=aira

# Expected output:
# NAME                            READY   STATUS    RESTARTS
# aira-backend-xxx-yyy            1/1     Running   0
# aira-backend-xxx-zzz            1/1     Running   0
# aira-backend-xxx-www            1/1     Running   0

# Check logs
kubectl logs -l app=aira --tail=50

# Exec health check inside pod
kubectl exec -it <pod-name> -- node -e \
  "require('http').get('http://localhost:5000/health', r => { console.log(r.statusCode) })"
```

### 5.7 — Expose the Service (optional)

The default service type is `ClusterIP`. To expose externally:

**Option A — Port-forward for testing:**
```bash
kubectl port-forward svc/aira-backend 5000:80
curl http://localhost:5000/health
```

**Option B — Ingress (recommended for production):**
```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aira-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: aira.your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: aira-backend
            port:
              number: 80
```

```bash
kubectl apply -f k8s/ingress.yaml
```

### 5.8 — Scaling

```bash
# Manual scale
kubectl scale deployment aira-backend --replicas=5

# Auto-scale (HPA)
kubectl autoscale deployment aira-backend \
  --cpu-percent=70 \
  --min=3 \
  --max=10
```

---

## 6. Health Checks & Verification

### Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | None | Basic liveness — returns `ok` or `degraded` |
| `GET /health/detailed` | None | Full dependency status (DB, queue, Redis, feature flags) |
| `GET /health/multi-instance` | None | Cluster coordination status |
| `GET /metrics` | None | Prometheus metrics (15+ KPIs) |

### Quick Smoke Test

```bash
BASE=http://localhost:5000

# 1. Basic health
curl -s $BASE/health | jq .status

# 2. Detailed health — all components should be "connected"
curl -s $BASE/health/detailed | jq .components

# 3. Metrics available
curl -s $BASE/metrics | head -20

# 4. API reachable (expects 401 without auth — that's correct)
curl -s -o /dev/null -w "%{http_code}" \
  $BASE/api/v1/tenants/default/decisions
# Expected: 401
```

### Expected Health Response (Production)

```json
{
  "status": "ok",
  "safeMode": false,
  "redis": { "connected": true },
  "components": {
    "database": "connected",
    "queue": "connected",
    "idempotency": "connected",
    "redis": { "connected": true },
    "memoryCleanup": "running"
  }
}
```

If `safeMode: true` is returned, the server is running in degraded mode (Redis disconnected). Actions will be blocked until Redis reconnects.

---

## 7. Observability

### Prometheus Metrics

Metrics are available at `GET /metrics` in Prometheus text format.

Key metrics exposed:
- `aira_decisions_total` — total decisions made
- `aira_actions_executed_total` — actions executed
- `aira_confidence_score` — decision confidence distribution
- `aira_queue_depth` — RabbitMQ queue depth
- `aira_response_time_ms` — API response times

### Grafana (with infra-simulation stack)

```bash
cd infra-simulation
docker-compose up -d

# Grafana UI
open http://localhost:3000
# Default: admin / admin

# Prometheus UI
open http://localhost:9090
```

### Structured Logs

All logs are JSON-structured via Winston. In production, pipe to your log aggregator:

```bash
# Docker — ship logs to CloudWatch / Datadog / ELK
docker-compose logs -f app | your-log-shipper

# Kubernetes — logs are captured by your node logging agent automatically
kubectl logs -l app=aira -f
```

---

## 8. Rollback & Recovery

### Docker Compose

```bash
# Roll back to previous image tag
docker-compose down
docker tag aira-backend:2.2.0 aira-backend:current
docker-compose up -d
```

### Kubernetes

```bash
# View rollout history
kubectl rollout history deployment/aira-backend

# Roll back to previous revision
kubectl rollout undo deployment/aira-backend

# Roll back to specific revision
kubectl rollout undo deployment/aira-backend --to-revision=2

# Watch rollback progress
kubectl rollout status deployment/aira-backend
```

### Emergency Safe Mode

If the system is behaving unexpectedly, engage Safe Mode — this blocks ALL action execution while keeping the API available:

```bash
# Via environment variable restart
NODE_ENV=production SAFE_MODE=true node server.js

# Or via kill switch API (if the kill switch endpoint is enabled)
curl -X POST http://localhost:5000/api/v1/kill-switches \
  -H "Authorization: Bearer <token>" \
  -d '{"switch": "GLOBAL_SAFE_MODE", "enabled": true}'
```

---

## 9. Security Checklist

Before going to production, verify all items below:

- [ ] `AUDIT_SECRET` is a strong random value (not the example default)
- [ ] `MONGODB_URI` uses a dedicated database user (not root)
- [ ] `RABBITMQ_URL` uses a dedicated vhost and user (not `guest`)
- [ ] `REDIS_URL` has a password set (`requirepass` in Redis config)
- [ ] `CORS_ORIGIN` is set to your exact frontend domain (not `*`)
- [ ] `DISABLE_MEMORY_DB=true` (no in-memory fallback in production)
- [ ] `ALLOW_IN_MEMORY_LOCKS=false` (Redis required for distributed locks)
- [ ] `NODE_ENV=production`
- [ ] `.env` file is NOT committed to git (check `.gitignore`)
- [ ] `k8s/secret.yaml` with real values is NOT committed to git
- [ ] Container runs as `USER node` (non-root) — confirmed in Dockerfile
- [ ] K8s pod `runAsNonRoot: true` and `readOnlyRootFilesystem: true` — set in deployment.yaml
- [ ] All sensitive env vars come from K8s Secrets (not ConfigMap)
- [ ] TLS/HTTPS is terminated at the ingress/load balancer level
- [ ] Rate limiting middleware is active (`rateLimitingMiddleware`)

---

## 10. Troubleshooting

### Server won't start

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `MongooseError: connect ECONNREFUSED` | MongoDB not running | `docker-compose up -d mongodb` |
| `Error: connect ECONNREFUSED 127.0.0.1:5672` | RabbitMQ not running | `docker-compose up -d rabbitmq` |
| `Error: connect ECONNREFUSED 127.0.0.1:6379` | Redis not running | `docker-compose up -d redis` |
| `Missing required env var AUDIT_SECRET` | `.env` not configured | Copy `.env.example` to `.env` and set values |

### Health returns `degraded` / `safeMode: true`

Redis is disconnected. AIRA enters safe mode automatically — all action execution is blocked.

```bash
# Check Redis connectivity
redis-cli -u $REDIS_URL ping
# Expected: PONG

# Check system health diagnostics
curl http://localhost:5000/health/detailed | jq .diagnostics
```

### K8s pods in `CrashLoopBackOff`

```bash
# Get crash reason
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous

# Common causes:
# - Secret not applied: kubectl apply -f k8s/secret.yaml
# - Wrong image tag: check `image:` in deployment.yaml
# - Filesystem write error: check volumeMounts are present for /app/logs and /tmp
```

### RabbitMQ messages piling up (DLQ)

```bash
# Check queue stats via management UI
open http://localhost:15672

# Or via API
curl -u guest:guest http://localhost:15672/api/queues

# Trigger manual retry processor
curl -X POST http://localhost:5000/api/v1/tenants/default/queue/retry \
  -H "Authorization: Bearer <token>"
```

### Decisions not executing (stuck at approval)

Check if approval workflow is blocking:
```bash
curl http://localhost:5000/api/v1/tenants/default/approvals \
  -H "Authorization: Bearer <token>"
```

Pending approvals older than `APPROVAL_EXPIRATION_MINUTES` auto-expire.

---

## Quick Reference

```bash
# Local dev — start infra only
docker-compose up -d mongodb rabbitmq redis && cd backend && npm start

# Full stack via Docker Compose
docker-compose up -d

# Deploy to Kubernetes
kubectl apply -f k8s/secret.yaml && \
kubectl apply -f k8s/configmap.yaml && \
kubectl apply -f k8s/deployment.yaml && \
kubectl rollout status deployment/aira-backend

# Health check
curl http://localhost:5000/health

# Emergency safe mode
curl -X POST http://localhost:5000/api/v1/kill-switches \
  -H "Authorization: Bearer <token>" \
  -d '{"switch":"GLOBAL_SAFE_MODE","enabled":true}'

# K8s rollback
kubectl rollout undo deployment/aira-backend
```
