# Autonomous Incident Recovery Agent (AIRA)

> **Live**: Frontend → [Vercel](https://autonomous-incident-recovery-agent-ten.vercel.app) · Backend → [Railway](https://autonomous-incident-recovery-agent-aira-system-production.up.railway.app)  
> **Repo**: [JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system](https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system)

---

## Overview

AIRA is a policy-driven incident recovery platform. It sits between your observability stack (Prometheus, Datadog) and your infrastructure, making safe, explainable, auditable decisions with human-in-the-loop approval gates.

```
Observability Alert → Analysis Agent → Decision Agent → Approval Gate → Action Agent → Audit Trail
```

---

## Authentication Architecture (v2)

AIRA uses **two separate auth paths**:

### Browser / Human Users — Cookie Session Auth
- `POST /api/v1/auth/register` — creates User + Organization + TenantConfig atomically
- `POST /api/v1/auth/login` — validates password (Argon2id), issues `HttpOnly` session cookie
- `GET /api/v1/auth/session` — bootstraps client state on page load
- `POST /api/v1/auth/logout` — destroys session, clears cookie
- `GET /api/v1/auth/csrf` — returns fresh CSRF token for the current session

**Session cookie:**
| Environment | Cookie Name | SameSite | Secure |
|---|---|---|---|
| Production | `__Host-aira_session` | `None` | `true` |
| Development | `aira_session_dev` | `Lax` | `false` |

All browser state-mutating requests require `X-CSRF-Token` header (HMAC-SHA256 derived from server-side secret). CSRF is validated server-side; no secrets are stored in the browser.

### Machine / API Clients — HMAC Signature Auth
- Requests to `/api/v1/tenants/:tenantId/*` authenticate via `X-Tenant-ID`, `X-Key-ID`, `X-Timestamp`, `X-Signature` headers
- Signature: `HMAC-SHA256(keySecret, "tenantId:keyId:timestamp:method:path")`
- Machine clients bypass CSRF checks (they use the HMAC path, not session cookies)

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20 · Express 4 · CommonJS |
| Database | MongoDB (Mongoose 8) |
| Password hashing | `@node-rs/argon2` (Argon2id) |
| Frontend | React 18 · TypeScript 5 · Vite 6 |
| State management | Zustand 5 — no persistence for auth |
| Styling | Tailwind CSS · shadcn/ui · Framer Motion |
| Backend tests | Jest 29 · mongodb-memory-server · supertest |

---

## Quick Start (Local)

```bash
# Backend
cd backend
cp .env.example .env          # fill in MONGODB_URI, SESSION_SECRET, etc.
npm install
npm start                     # http://localhost:5000

# Frontend
cd frontend
cp .env.example .env          # set VITE_API_URL=http://localhost:5000
npm install
npm run dev                   # http://localhost:5173
```

**Required env vars (backend):**
```
MONGODB_URI=
SESSION_SECRET=               # 64+ random bytes
CORS_ORIGINS=http://localhost:5173
NODE_ENV=development
```

---

## Project Structure

```
backend/
  models/          # Mongoose models (User, Organization, UserSession, …)
  routes/          # Express routers (authRoutes, integrationRoutes, …)
  middleware/      # sessionAuthMiddleware, csrfMiddleware, orgAuthMiddleware, authMiddleware (HMAC)
  services/
    identity/      # authService, sessionService, passwordService, csrfHelper
  tests/
    unit/          # identity.models.test.js  (33 tests)
    integration/   # auth.integration.test.js (31 tests)
    middleware/    # authMiddleware.test.js    (machine HMAC tests)

frontend/
  src/
    api/
      client.ts    # cookie-based fetch wrapper; sends X-CSRF-Token on mutations
      hooks/       # React Query hooks (tenantId from organization.tenantId)
    store/
      authStore.ts # Zustand store — no persist middleware, no secrets
    hooks/
      useSessionBootstrap.ts  # calls GET /auth/session on mount
      useLogout.ts            # POST /auth/logout → clear state → navigate /login
    pages/
      LoginPage.tsx   # email + password only
      SignupPage.tsx  # registration form (fullName, workEmail, password, org)
    router/
      ProtectedRoute.tsx  # shows loader while status='loading', redirects if unauthenticated
```

---

## Running Tests

```bash
cd backend

# Identity model unit tests (33 tests)
npx jest --testPathPattern="identity.models" --no-coverage --forceExit

# Auth integration tests (31 tests)
npx jest --testPathPattern="auth.integration" --no-coverage --forceExit

# All tests
npx jest --no-coverage --forceExit
```

---

## Security Notes

- Passwords: Argon2id, `select: false` in Mongoose schema
- Sessions: `HttpOnly` cookie, server-side store in MongoDB, 30-day expiry with sliding window
- CSRF: double-submit with HMAC derivation — token never stored in `localStorage`
- CORS: exact Vercel origin only, `credentials: true`, `X-CSRF-Token` in allowed headers
- Machine secrets: never logged; HMAC replay window = 5 minutes

---

## Deployment

- **Backend**: Railway — set `NODE_ENV=production`, `SESSION_SECRET`, `MONGODB_URI`, `CORS_ORIGINS`
- **Frontend**: Vercel — set `VITE_API_URL` to Railway backend URL

---

## Playbook + Runbook Platform V1

### Architecture

```
Observability Signal
        │
        ▼
   Incident Model (MongoDB)
        │
        ▼
 incidentPlaybookService
  ├── analyseIncident()  →  playbookMatcher.matchPlaybooks()
  │                         └── resolveMatchOutcome()
  └── executeForIncident()
        │
        ▼
   PlaybookExecutionEngine
        │  reads playbookDef → policy → approval mode → stages
        ▼
   RunbookExecutionEngine  ──►  Action Handlers (kubernetes/*, wait/*)
        │
        ├── Verification steps
        ├── Rollback (on failure)
        └── Escalation (on unrecoverable)
        │
        ▼
   DecisionTrace + AuditEvent (MongoDB)
```

### Playbook Catalogue (21 playbooks, 18 canonical families)

| Family | Playbook ID | Category | Approval |
|---|---|---|---|
| K8S CrashLoopBackOff | PB-K8S-CRASHLOOP-001 | kubernetes | CONDITIONAL |
| K8S OOMKilled | PB-K8S-OOM-001 | kubernetes | CONDITIONAL |
| K8S Node NotReady | PB-K8S-NODE-NOTREADY-001 | kubernetes | MANUAL |
| K8S ImagePullBackOff | PB-K8S-IMAGEPULL-001 | kubernetes | MANUAL |
| K8S PVC Bound | PB-K8S-PVC-001 | kubernetes | MANUAL |
| K8S HPA Exhausted | PB-K8S-HPA-001 | kubernetes | MANUAL |
| DB Connection Pool | PB-DB-CONNPOOL-001 | database | CONDITIONAL |
| DB Replication Lag | PB-DB-REPLICATION-LAG-001 | database | MANUAL |
| DB Disk Full | PB-DB-DISK-001 | database | MANUAL |
| DB Slow Queries | PB-DB-SLOW-QUERY-001 | database | AUTOMATIC |
| API High Latency | PB-API-LATENCY-001 | api | CONDITIONAL |
| API High Error Rate | PB-API-ERROR-RATE-001 | api | CONDITIONAL |
| API Rate Limit | PB-API-RATELIMIT-001 | api | AUTOMATIC |
| Queue Backlog | PB-QUEUE-BACKLOG-001 | queue | CONDITIONAL |
| Queue DLQ Spike | PB-QUEUE-DLQ-001 | queue | MANUAL |
| Memory Leak | PB-MEMORY-LEAK-001 | resource | MANUAL |
| CPU Throttle | PB-CPU-THROTTLE-001 | resource | CONDITIONAL |
| Disk IO Saturation | PB-DISK-IO-001 | resource | CONDITIONAL |
| TLS Expiry | PB-CERT-EXPIRY-001 | security | MANUAL |
| Auth Failure Spike | PB-AUTH-FAILURE-001 | security | MANUAL |
| Network Packet Loss | PB-NETWORK-LOSS-001 | network | CONDITIONAL |

### Runbook Registry (1 runbook, lifecycle: DRAFT)

| Runbook ID | Name | Semver | Lifecycle | Handlers |
|---|---|---|---|---|
| RB-K8S-POD-RESTART | Kubernetes Pod Restart | 1.0.0 | DRAFT | 5 steps, all IMPLEMENTED |

**Lifecycle promotion path**: `DRAFT → VALIDATED → APPROVED → ACTIVE`  
A runbook reaches ACTIVE only after operator promotion in MongoDB. The PB-K8S-CRASHLOOP-001 golden path is blocked on RB-K8S-POD-RESTART reaching ACTIVE — all action handlers are present and implemented.

### Action Handlers (8 registered)

| Handler | Module |
|---|---|
| `kubernetes/restart_pod` | kubernetesHandlers.js |
| `kubernetes/restart_deployment` | kubernetesHandlers.js |
| `kubernetes/scale_deployment` | kubernetesHandlers.js |
| `kubernetes/list_pods` | kubernetesHandlers.js |
| `kubernetes/get_logs` | kubernetesHandlers.js |
| `kubernetes/check_pod_health` | kubernetesHandlers.js |
| `kubernetes/get_deployment_status` | kubernetesHandlers.js |
| `wait/poll_condition` | waitHandlers.js |

### Execution Outcome Codes (26 total)

`NO_SAFE_PLAYBOOK`, `NO_ACTIVE_PLAYBOOK`, `RUNBOOK_NOT_EXECUTABLE`, `MISSING_ACTION_HANDLER`, `MISSING_EVIDENCE`, `INSUFFICIENT_CONFIDENCE`, `PARAMETER_UNRESOLVED`, `RESOURCE_AMBIGUOUS`, `PRECONDITION_FAILED`, `POLICY_DENIED`, `APPROVAL_REJECTED`, `SUGGEST_ONLY`, `KILL_SWITCH_ACTIVE`, `BLAST_RADIUS_EXCEEDED`, `HIGH_RISK_ACTION`, `DESTRUCTIVE_ACTION`, `NON_REVERSIBLE_ACTION`, `EXECUTION_FAILED`, `RETRY_EXHAUSTED`, `VERIFICATION_FAILED`, `ROLLBACK_UNAVAILABLE`, `ROLLBACK_FAILED`, `INTEGRATION_UNAVAILABLE`, `INFRASTRUCTURE_UNREACHABLE`, `SECURITY_VIOLATION`, `TENANT_BOUNDARY_VIOLATION`

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/playbooks` | List playbooks (filter: lifecycle, category) |
| GET | `/api/v1/playbooks/:playbookId` | Get playbook definition |
| POST | `/api/v1/playbooks/match` | Match playbooks to incident (read-only) |
| POST | `/api/v1/playbooks/:id/:v/execute` | Execute best matching playbook |
| GET | `/api/v1/incidents/:id/playbooks` | Analyse matching playbooks for incident |
| POST | `/api/v1/incidents/:id/playbooks/execute` | Execute playbook for incident |

### Test Coverage

| Suite | Tests | Status |
|---|---|---|
| Golden Path (PB-K8S-CRASHLOOP-001) | 24 | ✅ All passing |
| All backend unit tests | 816 | ✅ All passing |

### Frozen Contracts (`backend/services/index.js`)

```js
getPlaybookMatchingService()   // playbookMatcher
getRunbookExecutionEngine()    // RunbookExecutionEngine
getDecisionTraceService()      // DecisionTrace model
getAuditEventService()         // AuditEvent model
getActionRegistry()            // ActionRegistry
getRunbookRegistry()           // RunbookRegistry
getPlaybookRegistry()          // PlaybookRegistry
getIncidentPlaybookService()   // incidentPlaybookService
```

### Future: AI Agent Layer (NOT YET IMPLEMENTED)

The following 8 agents are planned for V2 but are intentionally NOT built in V1:
1. Signal Ingestion Agent
2. Incident Classification Agent
3. Context Enrichment Agent
4. Risk Assessment Agent
5. Execution Supervisor Agent
6. Verification Agent
7. Escalation Agent
8. Continuous Learning Agent

---
