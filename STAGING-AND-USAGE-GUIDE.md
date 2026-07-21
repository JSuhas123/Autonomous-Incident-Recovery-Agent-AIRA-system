# AIRA — Complete Staging & Usage Guide

**AIRA** (Autonomous Incident Recovery Agent) is a Node.js/Express backend that
automates incident detection, policy-driven decision making, approval workflows,
and multi-step action execution for infrastructure incidents.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Development Setup](#3-local-development-setup)
4. [Docker Compose Deployment (Staging)](#4-docker-compose-deployment-staging)
5. [Kubernetes Deployment (Production)](#5-kubernetes-deployment-production)
6. [Configuration Reference](#6-configuration-reference)
7. [Feature Flags](#7-feature-flags)
8. [Core API Usage](#8-core-api-usage)
9. [Monitoring & Observability](#9-monitoring--observability)
10. [Upgrading & Rolling Updates](#10-upgrading--rolling-updates)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Client / Webhook / Alert Source                    │
└────────────────────┬────────────────────────────────┘
                     │  HTTP
              ┌──────▼──────┐
              │  AIRA API   │  :5000
              │  (Express)  │
              └──┬──┬──┬───┘
       ┌─────────┘  │  └─────────┐
       ▼            ▼            ▼
  ┌─────────┐ ┌──────────┐ ┌─────────┐
  │ MongoDB  │ │  Redis   │ │RabbitMQ │
  │(decisions│ │(locks,   │ │(async   │
  │ logs,    │ │rate-limit│ │ queues) │
  │ policies)│ │ cache)   │ │         │
  └─────────┘ └──────────┘ └─────────┘
```

### Service Layers

| Layer | Purpose |
|---|---|
| **Routes** | HTTP endpoint definitions (REST) |
| **Agents** | Decision, Action, Analysis, BatchDecision |
| **Services/core** | Policy engine, rate-limiter, approval queue |
| **Services/infrastructure** | DB, Redis, RabbitMQ, multi-instance coordinator |
| **Services/execution** | K8s executor, canary runner, rollback |
| **Services/simulation** | Load scenario simulation for testing |
| **Middleware** | Auth, sanitization, audit logging, rate limiting |

---

## 2. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18+ (20 LTS recommended) | Runtime |
| npm | 9+ | Package manager |
| Docker Desktop | 4.x+ | Container runtime |
| kubectl | 1.28+ | Kubernetes CLI (bundled with Docker Desktop) |
| Git | any | Source control |

---

## 3. Local Development Setup

### 3.1 Clone & Install

```bash
git clone https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system.git
cd Autonomous-Incident-Recovery-Agent-AIRA-system/backend
npm install
```

### 3.2 Configure Environment

Create `backend/.env` (copy from the template below and fill in real values):

```env
# Application
NODE_ENV=development
PORT=5000
LOG_LEVEL=debug

# MongoDB
MONGODB_URI=mongodb://localhost:27017/decision_engine

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Auth / Security
AUDIT_SECRET=your-strong-random-secret-min-32-chars-here
JWT_SECRET=your-jwt-secret

# Optional — Slack alerts
SLACK_TOKEN=xoxb-your-token
SLACK_CHANNEL=#aira-alerts

# Optional — OpenAI (analysis agent)
OPENAI_API_KEY=sk-...

# Feature flags (set to "true" to enable)
ENABLE_OPENAI_ANALYSIS=false
ENABLE_INCIDENT_LEARNING=false
ENABLE_AUTO_REMEDIATION=false
ENABLE_KUBERNETES_EXECUTOR=false
```

### 3.3 Start Infrastructure Services

Start MongoDB, Redis, and RabbitMQ using Docker (one-time):

```bash
# From repo root
docker compose up mongo redis rabbitmq -d
```

Or install locally:
- **MongoDB**: https://www.mongodb.com/try/download/community
- **Redis**: https://redis.io/docs/getting-started/
- **RabbitMQ**: https://www.rabbitmq.com/download.html

### 3.4 Run the Server

```bash
cd backend
npm start
# or for development with auto-reload:
npx nodemon server.js
```

Server starts on `http://localhost:5000`.

### 3.5 Verify

```bash
curl http://localhost:5000/health
# → {"status":"ok","timestamp":"...","redis":{"connected":true}}

curl http://localhost:5000/health/detailed
# → {"status":"healthy","components":{"database":"connected","queue":"connected",...}}
```

---

## 4. Docker Compose Deployment (Staging)

This runs all services together in Docker on a single machine.

### 4.1 Build & Start

```bash
# From repo root
docker compose up --build -d
```

This starts:
- `aira-app` on port **5000**
- `mongo` on port **27017**
- `redis` on port **6379**
- `rabbitmq` on ports **5672** (AMQP) and **15672** (Management UI)

### 4.2 Verify Health

```bash
docker compose ps                         # all show "healthy"
curl http://localhost:5000/health/detailed
```

### 4.3 View Logs

```bash
docker compose logs -f app               # AIRA app logs
docker compose logs -f mongo             # MongoDB logs
docker compose logs --tail=50 app        # last 50 lines
```

### 4.4 Stop

```bash
docker compose down          # stop containers, keep volumes
docker compose down -v       # stop + delete volumes (wipes data)
```

### 4.5 Rebuild After Code Changes

```bash
docker compose up --build -d app
```

---

## 5. Kubernetes Deployment (Production)

All manifests are in `k8s/`. The namespace is `aira`.

### 5.1 Enable Kubernetes (Docker Desktop)

1. Open Docker Desktop → **Settings** → **Kubernetes**
2. Check **Enable Kubernetes** → **Apply & Restart**
3. Wait ~3 minutes for the cluster to initialize
4. Verify: `kubectl get nodes` → shows `desktop-control-plane   Ready`

### 5.2 Generate Secrets from .env

```bash
# Run from repo root (requires .env in repo root)
node k8s/generate-secrets.js
# → Creates k8s/secret-generated.yaml (gitignored)
```

### 5.3 Deploy Everything

```bash
# 1. Namespace
kubectl apply -f k8s/namespace.yaml

# 2. Config & Secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret-generated.yaml

# 3. Infrastructure
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/rabbitmq.yaml
kubectl apply -f k8s/mongodb.yaml

# 4. Application + HPA + NodePort
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/nodeport.yaml
```

Or apply all at once:

```bash
node k8s/generate-secrets.js
kubectl apply -f k8s/namespace.yaml -f k8s/configmap.yaml -f k8s/secret-generated.yaml \
  -f k8s/redis.yaml -f k8s/rabbitmq.yaml -f k8s/mongodb.yaml \
  -f k8s/deployment.yaml -f k8s/nodeport.yaml
```

### 5.4 Watch Rollout

```bash
kubectl get pods -n aira -w
# All should reach 1/1 Running within 2-3 minutes

kubectl rollout status deployment/aira-backend -n aira
# → "successfully rolled out"
```

### 5.5 Access the Application

**Option A — NodePort (Docker Desktop):**
```bash
# App is exposed at http://localhost:30500
curl http://localhost:30500/health
```

**Option B — Port Forward (any cluster):**
```bash
kubectl port-forward svc/aira-backend 8888:80 -n aira
# App is at http://localhost:8888
curl http://localhost:8888/health
```

### 5.6 Scale Replicas

```bash
kubectl scale deployment/aira-backend --replicas=5 -n aira
```

The HPA auto-scales between 2–10 replicas based on CPU (>70%) and memory (>80%).

### 5.7 Rolling Update (New Image)

```bash
# 1. Build new image
docker build -t aira-deploy-app:v2.0 -f Dockerfile .

# 2. Update deployment
kubectl set image deployment/aira-backend aira=aira-deploy-app:v2.0 -n aira

# 3. Watch rollout
kubectl rollout status deployment/aira-backend -n aira
```

### 5.8 Rollback

```bash
kubectl rollout undo deployment/aira-backend -n aira
kubectl rollout history deployment/aira-backend -n aira   # see history
```

### 5.9 View Pod Logs

```bash
# All backend pods (most recent 100 lines)
kubectl logs -n aira -l app=aira,component=backend --tail=100

# Single pod (replace pod name from kubectl get pods)
kubectl logs -n aira aira-backend-694c7c4887-8wqvg -f

# Previous crashed container
kubectl logs -n aira aira-backend-694c7c4887-8wqvg --previous
```

### 5.10 Delete Deployment (Teardown)

```bash
kubectl delete namespace aira
# Deletes everything in the aira namespace
```

---

## 6. Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | Set to `production` in Kubernetes |
| `PORT` | No | `5000` | HTTP listen port |
| `MONGODB_URI` | Yes | — | Full MongoDB connection URI |
| `REDIS_URL` | Yes | — | Redis URL (`redis://host:6379`) |
| `RABBITMQ_URL` | Yes | — | RabbitMQ AMQP URL |
| `AUDIT_SECRET` | Yes | — | Secret for audit log HMAC signing (min 32 chars) |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `METRICS_ENABLED` | No | `true` | Expose `/metrics` Prometheus endpoint |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin(s) |
| `DISABLE_MEMORY_DB` | No | `false` | Force MongoDB (disable in-memory fallback) |
| `ALLOW_IN_MEMORY_LOCKS` | No | `false` | Allow lock fallback if Redis unavailable |
| `SLACK_TOKEN` | No | — | Slack bot token for alert notifications |
| `OPENAI_API_KEY` | No | — | Required if `ENABLE_OPENAI_ANALYSIS=true` |

### Kubernetes ConfigMap Keys (k8s/configmap.yaml)

These non-sensitive keys are injected via ConfigMap:

```yaml
NODE_ENV: "production"
PORT: "5000"
LOG_LEVEL: "info"
REDIS_URL: "redis://aira-redis:6379"
RABBITMQ_URL: "amqp://aira:airapass@aira-rabbitmq:5672"
METRICS_ENABLED: "true"
DISABLE_MEMORY_DB: "true"
ALLOW_IN_MEMORY_LOCKS: "false"
```

### Kubernetes Secret Keys (auto-generated)

Generated by `node k8s/generate-secrets.js` from your `.env`:

| Key | Source |
|---|---|
| `MONGODB_URI` | Built from `MONGO_PASSWORD` — always uses `aira-mongodb:27017` |
| `AUDIT_SECRET` | From `.env` `AUDIT_SECRET` |
| `OPENAI_API_KEY` | From `.env` `OPENAI_API_KEY` |
| `SLACK_TOKEN` | From `.env` `SLACK_TOKEN` |
| `mongodb-password` | From `.env` `MONGO_PASSWORD` |
| `rabbitmq-password` | From `.env` `RABBITMQ_PASS` |

---

## 7. Feature Flags

All feature flags are **disabled by default** (safe for production). Enable via environment variable.

| Flag | Variable | Effect |
|---|---|---|
| OpenAI Analysis | `ENABLE_OPENAI_ANALYSIS=true` | AI-powered root cause analysis via GPT |
| Incident Learning | `ENABLE_INCIDENT_LEARNING=true` | ML-based confidence scoring from past incidents |
| Auto Remediation | `ENABLE_AUTO_REMEDIATION=true` | Execute actions without manual approval |
| K8s Executor | `ENABLE_KUBERNETES_EXECUTOR=true` | Run actions directly on Kubernetes workloads |
| Cost Optimization | `ENABLE_COST_OPTIMIZATION=true` | Cost-aware decision making |
| Cross-Tenant Correlation | `ENABLE_CROSS_TENANT_CORRELATION=true` | Share incident context across tenants |
| ML Confidence Boost | `ENABLE_ML_CONFIDENCE_BOOST=true` | Boost confidence scores with historical data |
| Manual Approval for Restarts | `REQUIRE_MANUAL_APPROVAL_FOR_RESTART=true` | Force approval even for pod restarts |
| Distributed Tracing | `ENABLE_DISTRIBUTED_TRACING=true` | OpenTelemetry trace export |

To enable a flag in Kubernetes, update the ConfigMap:

```bash
kubectl patch configmap aira-config -n aira \
  --type=merge \
  -p '{"data":{"ENABLE_AUTO_REMEDIATION":"true"}}'

kubectl rollout restart deployment/aira-backend -n aira
```

---

## 8. Core API Usage

Base URL: `http://localhost:5000` (local) or `http://localhost:30500` (Kubernetes NodePort)

### 8.1 Health Endpoints

```bash
GET /health
# → {"status":"ok","redis":{"connected":true}}

GET /health/detailed
# → All components: database, queue, redis, featureFlags, canExecuteActions
```

### 8.2 Incident Decision — Core Flow

**Step 1: Submit an incident for decision**

```bash
POST /api/decisions/:tenantId
Content-Type: application/json

{
  "incidentId": "inc-2026-001",
  "severity": "high",
  "affectedService": "payment-api",
  "symptoms": ["high_latency", "error_rate_spike"],
  "context": {
    "errorRate": 0.45,
    "p99Latency": 8500,
    "recentDeploy": true
  }
}
```

**Step 2: Get the decision result**

```bash
GET /api/decisions/:tenantId/:incidentId
```

**Step 3: Execute an action**

```bash
POST /api/actions/:tenantId
Content-Type: application/json

{
  "actionType": "restart_pod",
  "targetService": "payment-api",
  "parameters": { "namespace": "production" },
  "incidentId": "inc-2026-001"
}
```

### 8.3 Policy Management

```bash
# List all policies for a tenant
GET /api/policies/:tenantId

# Get a specific policy
GET /api/policies/:tenantId/:policyId

# Create or update a policy
PUT /api/policies/:tenantId/:policyId
Content-Type: application/json

{
  "name": "high-severity-auto-restart",
  "conditions": {
    "severity": ["high", "critical"],
    "affectedService": ["payment-api", "auth-service"]
  },
  "actions": ["restart_pod", "scale_up"],
  "requiresApproval": false,
  "maxActionsPerHour": 5
}
```

### 8.4 Approval Workflow

When `requiresApproval: true` or `REQUIRE_MANUAL_APPROVAL_FOR_RESTART=true`:

```bash
# Get pending approvals
GET /api/approvals/:tenantId

# Approve an action
POST /api/approvals/:tenantId/:approvalId/approve
Content-Type: application/json
{"approvedBy": "oncall-engineer", "reason": "verified safe"}

# Reject an action
POST /api/approvals/:tenantId/:approvalId/reject
Content-Type: application/json
{"rejectedBy": "oncall-engineer", "reason": "too risky during peak hours"}
```

### 8.5 Runbooks

```bash
# List runbooks
GET /api/runbooks/:tenantId

# Execute a runbook
POST /api/runbooks/:tenantId/:runbookId/execute
Content-Type: application/json
{"incidentId": "inc-2026-001", "parameters": {}}
```

### 8.6 Reporting & Effectiveness

```bash
# Incident summary report
GET /api/reporting/:tenantId/summary?from=2026-07-01&to=2026-07-21

# Action effectiveness metrics
GET /api/effectiveness/:tenantId

# Confidence score history
GET /api/confidence/:tenantId/:incidentId
```

### 8.7 Prometheus Metrics

```bash
GET /metrics
# Returns Prometheus text format:
# aira_decisions_total{tenant="...",outcome="..."} 42
# aira_action_latency_seconds{action_type="..."} 0.234
# aira_approval_queue_depth{tenant="..."} 3
# process_cpu_seconds_total ...
```

---

## 9. Monitoring & Observability

### 9.1 Prometheus + Grafana (Local)

Start the infra-simulation stack from `infra-simulation/`:

```bash
cd infra-simulation
docker compose up -d
```

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (admin / admin)

Add Prometheus data source: `http://host.docker.internal:9090`

### 9.2 Key Metrics to Watch

| Metric | Alert Threshold |
|---|---|
| `aira_decisions_total` | Sudden drop → app may be down |
| `aira_action_latency_seconds` | p99 > 5s → slow execution |
| `aira_approval_queue_depth` | > 20 → backlog growing |
| `process_heap_used_bytes` | > 400MB → memory leak |
| `mongodb_connections` | > 100 → connection pool exhaustion |

### 9.3 Kubernetes Pod Monitoring

```bash
# Resource usage
kubectl top pods -n aira

# HPA status
kubectl get hpa -n aira

# Events (for crash diagnosis)
kubectl get events -n aira --sort-by='.lastTimestamp'
```

---

## 10. Upgrading & Rolling Updates

### Update Application Code

```bash
# 1. Make code changes, push to GitHub
git add . && git commit -m "feat: ..." && git push

# 2. Build new image
docker build -t aira-deploy-app:$(git rev-parse --short HEAD) -f Dockerfile .

# 3. Update Kubernetes deployment
kubectl set image deployment/aira-backend \
  aira=aira-deploy-app:$(git rev-parse --short HEAD) -n aira

# 4. Monitor
kubectl rollout status deployment/aira-backend -n aira
```

### Update Configuration (No Restart Needed for ConfigMap)

```bash
kubectl edit configmap aira-config -n aira
# Save and exit — pods reload on next restart
# Force reload:
kubectl rollout restart deployment/aira-backend -n aira
```

### Update Secrets

```bash
# Re-generate from updated .env
node k8s/generate-secrets.js
kubectl apply -f k8s/secret-generated.yaml
kubectl rollout restart deployment/aira-backend -n aira
```

---

## 11. Troubleshooting

### App won't connect to MongoDB

```bash
# Check if MongoDB pod is running
kubectl get pods -n aira -l component=mongodb

# Check the MONGODB_URI in the secret
kubectl get secret aira-secrets -n aira -o jsonpath="{.data.MONGODB_URI}" \
  | base64 -d   # Linux/Mac
# → should be: mongodb://admin:<password>@aira-mongodb:27017/...

# Regenerate if wrong hostname
node k8s/generate-secrets.js
kubectl apply -f k8s/secret-generated.yaml
kubectl rollout restart deployment/aira-backend -n aira
```

### CrashLoopBackOff

```bash
# Check crash reason
kubectl logs -n aira <pod-name> --previous

# Common causes:
# - "EAI_AGAIN mongodb"  → wrong MONGODB_URI hostname (see above)
# - "ECONNREFUSED redis" → Redis not running or wrong REDIS_URL
# - "MODULE_NOT_FOUND"   → npm install not run or wrong path
# - OOMKilled           → Increase memory limit in deployment.yaml
```

### Redis not connecting

```bash
kubectl logs -n aira -l component=redis
kubectl exec -n aira -it <redis-pod> -- redis-cli ping
# → PONG
```

### RabbitMQ keeps restarting

```bash
kubectl logs -n aira -l component=rabbitmq
# RabbitMQ takes ~30-60s to start; app uses mock fallback during startup
# Check readiness probe timeout — increase initialDelaySeconds if needed
```

### Port 30500 not responding

NodePort requires Docker Desktop's Kubernetes to route traffic. Use port-forward instead:

```bash
kubectl port-forward svc/aira-backend 8888:80 -n aira
curl http://localhost:8888/health
```

### "Cannot override warnings preference in synchronous validation"

This is a known non-fatal warning from the policy YAML validator (Ajv). The policy engine falls back to hardcoded defaults. It does not affect functionality.

### Docker Compose containers stop after Docker Desktop restart

```bash
cd c:\temp\aira-deploy    # your deploy copy
docker compose up -d
```

---

## Quick Reference — Common Commands

```bash
# ── Local Dev ──────────────────────────────────────
cd backend && npm start                            # start app
curl http://localhost:5000/health/detailed         # health check

# ── Docker Compose ─────────────────────────────────
docker compose up --build -d                       # start all
docker compose logs -f app                         # tail logs
docker compose ps                                  # status
docker compose down                                # stop

# ── Kubernetes ─────────────────────────────────────
kubectl get pods -n aira                           # pod status
kubectl get all -n aira                            # all resources
kubectl logs -n aira -l component=backend -f       # stream logs
kubectl port-forward svc/aira-backend 8888:80 -n aira  # access app
kubectl rollout restart deployment/aira-backend -n aira # restart pods
kubectl scale deployment/aira-backend --replicas=4 -n aira # scale
kubectl delete namespace aira                      # teardown all

# ── Secrets ────────────────────────────────────────
node k8s/generate-secrets.js                       # regenerate secrets
kubectl apply -f k8s/secret-generated.yaml         # apply secrets

# ── Git / CI ───────────────────────────────────────
git push origin master                             # push to GitHub
```
