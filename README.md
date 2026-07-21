# Autonomous Incident Recovery Agent (AIRA)

A policy-driven backend engine that automatically detects, analyzes, and responds to infrastructure incidents. It sits between your observability tools (Prometheus, Datadog) and your infrastructure, making safe, explainable, auditable decisions.

> **Deployment Status**: Running on Docker Compose (`localhost:5000`) and Kubernetes (`localhost:30500` / port-forward `localhost:8888`)  
> **GitHub**: [JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system](https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system)

---

## Table of Contents

1. [What AIRA Does](#what-aira-does)
2. [Quick Start — Local Dev](#quick-start--local-dev)
3. [Quick Start — Docker Compose](#quick-start--docker-compose-staging)
4. [Quick Start — Kubernetes](#quick-start--kubernetes-production)
5. [Architecture](#architecture)
6. [Project Structure](#project-structure)
7. [API Overview](#api-overview)
8. [Feature Flags](#feature-flags)
9. [Testing](#testing)
10. [Documentation Index](#documentation-index)
11. [Safety Mechanisms](#safety-mechanisms)
12. [Contributing](#contributing)

---

## What AIRA Does

**Problem**: Infrastructure incidents require humans to detect → diagnose → decide → act. This takes minutes. Minutes cost money.

**Solution**: AIRA automates that loop while keeping humans in control through policy rules, approval workflows, and complete audit trails.

```
Observability Alert
        │
        ▼
 [Analysis Agent]          Pattern detection, severity scoring
        │
        ▼
 [Decision Agent]          Policy matching, confidence calculation
        │
        ▼
 [Approval Gate]           Manual approval (if policy requires it)
        │
        ▼
  [Action Agent]           Safety checks, runbook execution
        │
        ▼
 [Audit + Feedback]        Immutable trail, outcome tracking, ML update
```

**Key properties**:
- **Explainable**: Every decision includes a full reasoning trace
- **Safe**: Distributed locks, circuit breakers, dry-run mode, kill switches
- **Multi-tenant**: Complete data isolation per tenant
- **Policy-driven**: Rules defined in YAML, not code
- **Deterministic**: Same signal + same policy = same decision

**AIRA is NOT**: a monitoring tool, a dashboard, or a general automation platform.

---

## Quick Start — Local Dev

### Prerequisites

- Node.js 18+
- Docker Desktop (for infrastructure services)

### 1. Clone & Install

```bash
git clone https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system.git
cd Autonomous-Incident-Recovery-Agent-AIRA-system/backend
npm install
```

### 2. Create `.env`

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/decision_engine
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://guest:guest@localhost:5672
AUDIT_SECRET=change-me-at-least-32-characters-long
LOG_LEVEL=debug
```

### 3. Start Infrastructure

```bash
# From repo root
docker compose up mongo redis rabbitmq -d
```

### 4. Start the Server

```bash
cd backend
npm start
# → Server running on http://localhost:5000
```

### 5. Verify

```bash
curl http://localhost:5000/health
# {"status":"ok","redis":{"connected":true}}

curl http://localhost:5000/health/detailed
# {"status":"healthy","components":{"database":"connected","queue":"connected",...}}
```

### 6. Submit Your First Incident

```bash
curl -X POST http://localhost:5000/api/decisions/demo-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "incidentId": "INC-001",
    "severity": "high",
    "affectedService": "payment-api",
    "symptoms": ["high_latency", "error_rate_spike"],
    "context": { "errorRate": 0.45, "p99Latency": 8500 }
  }'
```

---

## Quick Start — Docker Compose (Staging)

Runs all services (app + MongoDB + Redis + RabbitMQ) in Docker on one machine.

```bash
# From repo root
docker compose up --build -d

# Check status
docker compose ps       # all should show "healthy"
curl http://localhost:5000/health/detailed

# View logs
docker compose logs -f app

# Stop
docker compose down
```

Ports:
| Service | Port |
|---|---|
| AIRA API | 5000 |
| MongoDB | 27017 |
| Redis | 6379 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ Management UI | 15672 |

---

## Quick Start — Kubernetes (Production)

### Prerequisites

Enable Kubernetes in Docker Desktop: **Settings → Kubernetes → Enable Kubernetes → Apply & Restart**

Wait ~3 minutes, then verify:
```bash
kubectl get nodes
# NAME                    STATUS   ROLES           AGE
# desktop-control-plane   Ready    control-plane   ...
```

### Deploy

```bash
# 1. Generate secrets from .env
node k8s/generate-secrets.js

# 2. Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret-generated.yaml
kubectl apply -f k8s/redis.yaml -f k8s/rabbitmq.yaml -f k8s/mongodb.yaml
kubectl apply -f k8s/deployment.yaml -f k8s/nodeport.yaml

# 3. Watch rollout
kubectl get pods -n aira -w
# Wait for all pods to show 1/1 Running
```

### Access

```bash
# Port-forward (works on all clusters)
kubectl port-forward svc/aira-backend 8888:80 -n aira
curl http://localhost:8888/health

# NodePort (Docker Desktop only)
curl http://localhost:30500/health
```

### Common Operations

```bash
# Scale
kubectl scale deployment/aira-backend --replicas=4 -n aira

# Rolling update after code change
docker build -t aira-deploy-app:v2 -f Dockerfile .
kubectl set image deployment/aira-backend aira=aira-deploy-app:v2 -n aira
kubectl rollout status deployment/aira-backend -n aira

# Rollback
kubectl rollout undo deployment/aira-backend -n aira

# Logs
kubectl logs -n aira -l app=aira,component=backend -f --tail=100

# Teardown
kubectl delete namespace aira
```

---

## Architecture

### Components

| Layer | Components |
|---|---|
| **API Layer** | Express routes (10 route files, 55+ endpoints) |
| **Agents** | `analysisAgent`, `decisionAgent`, `actionAgent`, `batchDecisionAgent` |
| **Core Services** | Policy engine, confidence service, approval workflow |
| **Infrastructure** | DB service, queue service, Redis locks, multi-instance coordinator |
| **Execution** | Runbook executor, dry-run service, circuit breaker, K8s executor |
| **Integrations** | Slack, webhooks, Datadog, PagerDuty |
| **Observability** | Structured logging, Prometheus metrics, audit trails |

### Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 18 (Alpine Docker image) |
| Framework | Express.js |
| Database | MongoDB 7.0 (Mongoose 8.x) |
| Cache / Locks | Redis 7 (redis v4 client — camelCase API) |
| Queue | RabbitMQ 3.12 (amqplib) |
| Testing | Jest 29.7 |
| Containers | Docker + Kubernetes |
| Metrics | Prometheus (`/metrics` endpoint) |

### Data Flow

```
POST /api/decisions/:tenantId
        │
        ├─ authMiddleware (tenant validation)
        ├─ rateLimitingMiddleware (per-tenant token bucket)
        ├─ sanitizationMiddleware (XSS + DOM injection scrubbing)
        ├─ inputValidationMiddleware (Joi schema)
        │
        ▼
  decisionAgent.process()
        │
        ├─ analysisAgent.analyze()   →  pattern + severity
        ├─ policyEngine.match()      →  applicable rules
        ├─ confidenceService.score() →  ML-weighted confidence
        │
        ├─ [approval gate if policy.requiresApproval]
        │
        └─ actionAgent.execute()
              ├─ distributedLockService.acquire()
              ├─ dryRunService.validate() (if dry-run mode)
              ├─ runbookExecutionService.run()
              └─ auditService.record()
```

---

## Project Structure

```
repo-root/
├── Dockerfile                     # Multi-stage Node.js 18 Alpine image
├── docker-compose.yml             # Full stack (app + mongo + redis + rabbitmq)
├── k8s/                           # Kubernetes manifests
│   ├── namespace.yaml             #   aira namespace
│   ├── configmap.yaml             #   Non-secret config
│   ├── secret.yaml                #   Secret template (no real values)
│   ├── generate-secrets.js        #   Generates secret-generated.yaml from .env
│   ├── deployment.yaml            #   AIRA app + HPA (2-10 replicas)
│   ├── nodeport.yaml              #   External access on port 30500
│   ├── ingress.yaml               #   Ingress for aira.local (needs nginx controller)
│   ├── redis.yaml                 #   Redis deployment + service
│   ├── rabbitmq.yaml              #   RabbitMQ deployment + service
│   └── mongodb.yaml               #   MongoDB StatefulSet + PVC
│
└── backend/
    ├── server.js                  # Express entry point
    ├── jest.config.js             # Jest configuration
    ├── package.json
    │
    ├── agents/                    # Three-agent decision pipeline
    │   ├── analysisAgent.js       #   Signal pattern detection + severity scoring
    │   ├── decisionAgent.js       #   Policy matching + confidence
    │   ├── actionAgent.js         #   Risk assessment + safety gate execution
    │   └── batchDecisionAgent.js  #   Batch incident processing
    │
    ├── config/
    │   ├── featureFlags.js        # Feature toggle definitions
    │   └── killSwitches.js        # Emergency shutdown definitions
    │
    ├── middleware/
    │   ├── authMiddleware.js
    │   ├── rateLimitingMiddleware.js
    │   ├── sanitizationMiddleware.js    # XSS + DOM injection filtering
    │   ├── inputValidationMiddleware.js
    │   ├── tenantIsolationMiddleware.js
    │   └── killSwitchMiddleware.js
    │
    ├── models/                    # MongoDB schemas
    │   ├── DecisionTrace.js       #   Full reasoning trace per decision
    │   ├── AuditEvent.js          #   Immutable audit log
    │   ├── PolicyDefinition.js    #   Policy with YAML + version
    │   ├── PolicyVersion.js       #   Policy version history
    │   ├── ApprovalRequest.js     #   Pending/approved/rejected actions
    │   ├── RunbookExecution.js    #   Execution history
    │   ├── IncidentMemory.js      #   Past incidents for ML learning
    │   ├── ActionLog.js           #   All actions taken
    │   └── Log.js                 #   System logs
    │
    ├── routes/
    │   ├── coreApiRoutes.js       # POST /api/decisions/:tenantId
    │   ├── actionLogRoutes.js     # GET  /api/actions/:tenantId
    │   ├── approvalRoutes.js      # POST /api/approvals/:tenantId/:id/approve
    │   ├── runbookRoutes.js       # GET/POST /api/runbooks/:tenantId
    │   ├── policyManagementRoutes.js # CRUD /api/policies/:tenantId
    │   ├── reportingRoutes.js     # GET  /api/reporting/:tenantId/summary
    │   ├── effectivenessRoutes.js # GET  /api/effectiveness/:tenantId
    │   ├── confidenceRoutes.js    # GET  /api/confidence/:tenantId
    │   ├── integrationRoutes.js   # POST /api/integrations/:tenantId
    │   └── executionModesRoutes.js
    │
    ├── services/
    │   ├── core/                  # Policy engine, decision tracing, versioning
    │   ├── confidence/            # ML-based confidence scoring + calibration
    │   ├── learning/              # Feedback loops, outcome tracking
    │   ├── execution/             # Runbooks, approvals, dry-run, circuit breaker
    │   ├── integrations/          # Slack, webhooks, Datadog, PagerDuty
    │   ├── reporting/             # MongoDB aggregation, trends, ROI
    │   ├── observability/         # Audit trails, structured logging, Prometheus
    │   ├── k8s/                   # Kubernetes executor
    │   └── infrastructure/        # DB, queue, Redis locks, health, cleanup
    │
    ├── policies/
    │   └── default-policy.yaml    # Example policy definitions
    │
    ├── runbooks/                  # Pre-built runbook definitions
    │   ├── api-rate-limit-fix.yaml
    │   ├── cache-invalidation.yaml
    │   ├── database-failover.yaml
    │   ├── kubernetes-pod-restart.yaml
    │   └── message-queue-recovery.yaml
    │
    ├── tests/
    │   ├── unit/
    │   ├── integration/
    │   └── e2e/
    │
    ├── chaos/                     # Chaos / failure scenario tests
    │   ├── run-chaos-tests.js
    │   ├── ChaosScenarios.js      # 15+ failure scenarios
    │   ├── SafetyGatesValidator.js
    │   └── quick-start.js         # Environment validation
    │
    └── simulation/                # Load and scenario simulation
```

---

## API Overview

**Base URL**: `http://localhost:5000`  
All tenant-scoped routes use `:tenantId` path param.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | All components + feature flags |
| GET | `/metrics` | Prometheus metrics |
| POST | `/api/decisions/:tenantId` | Submit incident for decision |
| GET | `/api/decisions/:tenantId/:id` | Get decision trace |
| GET | `/api/actions/:tenantId` | List action history |
| POST | `/api/actions/:tenantId` | Execute an action |
| GET | `/api/approvals/:tenantId` | List pending approvals |
| POST | `/api/approvals/:tenantId/:id/approve` | Approve an action |
| POST | `/api/approvals/:tenantId/:id/reject` | Reject an action |
| GET | `/api/policies/:tenantId` | List policies |
| PUT | `/api/policies/:tenantId/:id` | Create/update policy |
| GET | `/api/runbooks/:tenantId` | List runbooks |
| POST | `/api/runbooks/:tenantId/:id/execute` | Execute a runbook |
| GET | `/api/reporting/:tenantId/summary` | Incident summary report |
| GET | `/api/effectiveness/:tenantId` | Action effectiveness metrics |
| GET | `/api/confidence/:tenantId/:incidentId` | Confidence score history |

See [API.md](API.md) for full request/response schemas and examples.

---

## Feature Flags

All flags default to `false` (safe for production). Enable via environment variable or ConfigMap.

| Flag | Variable | What It Enables |
|---|---|---|
| OpenAI Analysis | `ENABLE_OPENAI_ANALYSIS` | GPT-powered root cause analysis |
| Incident Learning | `ENABLE_INCIDENT_LEARNING` | ML confidence from past incidents |
| Auto Remediation | `ENABLE_AUTO_REMEDIATION` | Execute actions without approval |
| K8s Executor | `ENABLE_KUBERNETES_EXECUTOR` | Run actions on K8s workloads directly |
| Cost Optimization | `ENABLE_COST_OPTIMIZATION` | Cost-aware decision weights |
| Cross-Tenant Correlation | `ENABLE_CROSS_TENANT_CORRELATION` | Share context across tenants |
| ML Confidence Boost | `ENABLE_ML_CONFIDENCE_BOOST` | Historical data confidence boost |
| Manual Approval for Restarts | `REQUIRE_MANUAL_APPROVAL_FOR_RESTART` | Force human approval on restarts |
| Distributed Tracing | `ENABLE_DISTRIBUTED_TRACING` | OpenTelemetry trace export |

Enable in Kubernetes without redeploying:
```bash
kubectl patch configmap aira-config -n aira \
  --type=merge -p '{"data":{"ENABLE_AUTO_REMEDIATION":"true"}}'
kubectl rollout restart deployment/aira-backend -n aira
```

---

## Testing

```bash
cd backend

# Run all tests
npm test

# Unit tests only
npm test -- --testPathPattern=unit

# Integration tests
npm test -- --testPathPattern=integration

# Coverage report
npm run test:coverage

# Chaos / failure scenarios
cd chaos && node run-chaos-tests.js
```

See [TESTING.md](TESTING.md) for full test guide, coverage targets, and writing new tests.

---

## Documentation Index

| Document | Contents |
|---|---|
| **[STAGING-AND-USAGE-GUIDE.md](STAGING-AND-USAGE-GUIDE.md)** | Complete deployment guide: local dev, Docker, Kubernetes, env config, API usage, monitoring, upgrading, troubleshooting |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System design, agent pipeline, data models, decision loop |
| **[API.md](API.md)** | Full REST API reference — all endpoints, request/response schemas, auth |
| **[POLICIES.md](POLICIES.md)** | Policy DSL, YAML syntax, versioning, examples |
| **[TESTING.md](TESTING.md)** | Test suite guide, coverage, chaos testing, writing new tests |
| **[OBSERVABILITY.md](OBSERVABILITY.md)** | Prometheus metrics, Grafana dashboards, alerting rules |
| **[OPERATIONS.md](OPERATIONS.md)** | On-call runbooks, incident response procedures |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Common issues, debug commands, error reference |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Contribution workflow, code standards, PR process |
| **[CHANGELOG.md](CHANGELOG.md)** | Version history and breaking changes |
| **[QUICK-REFERENCE.md](QUICK-REFERENCE.md)** | One-page command cheat sheet |

---

## Safety Mechanisms

| Mechanism | Protection |
|---|---|
| **Distributed Idempotency** | Redis-backed atomic locks (120s TTL) prevent duplicate action execution across replicas |
| **SAFE_MODE** | Auto-activates when Redis is unavailable — blocks all action execution, forces manual review |
| **Circuit Breaker** | Trips after 80% queue failure rate, stops cascading failures |
| **Policy Versioning** | Every decision records the exact policy version evaluated — full deterministic audit trail |
| **Backpressure** | Returns `503` when queue is full, prevents silent message drops |
| **Dry-Run Mode** | Validate dangerous actions without executing them |
| **Kill Switches** | Emergency disable for any service capability via `config/killSwitches.js` |
| **Rate Limiting** | Per-tenant token bucket — prevents abuse and runaway automation |
| **Input Sanitization** | XSS filtering + DOM injection blocking on all request bodies |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

Quick summary:
1. Fork the repo, create a branch (`feature/` or `fix/`)
2. Write code + tests (all new code needs test coverage)
3. Run `npm test` and `cd chaos && node run-chaos-tests.js`
4. Submit a PR with description of what changed and how you tested it

---

*Design philosophy: Explainability > Intelligence. Safety > Automation. Determinism > Flexibility.*
