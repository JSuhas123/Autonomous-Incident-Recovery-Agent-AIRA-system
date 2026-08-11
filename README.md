# Autonomous Incident Recovery Agent (AIRA)

> **Live**: Frontend → [Vercel](https://autonomous-incident-recovery-agent-ten.vercel.app) · Backend → [Railway](https://autonomous-incident-recovery-agent-aira-system-production.up.railway.app)  
> **Repo**: [JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system](https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system)

---

## Overview

AIRA is a policy-driven incident recovery platform. It sits between your observability stack (Prometheus, Datadog) and your infrastructure, making safe, explainable, auditable decisions with human-in-the-loop approval gates.

> **AI DOES NOT DIRECTLY EXECUTE INFRASTRUCTURE.** The 8-agent intelligence pipeline produces playbook recommendations and parameters. All infrastructure mutations are performed exclusively by the deterministic V1 Playbook/Runbook Engine, subject to human approval gates and policy enforcement.

---

## Agent Intelligence Platform (v2)

### Architecture

```
Observability Signal
        │
        ▼
POST /api/v1/incidents/:id/analyze
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AgentOrchestrator (v2)                           │
│                                                                     │
│  1. CorrelationAgent      — groups signals into a single incident   │
│  2. InvestigationAgent    — collects k8s/DB/log evidence (reduced)  │
│  3. DiagnosisAgent        — infers root cause + confidence dims     │
│  4. PlaybookSelectionAgent— recommends playbook from V1 catalogue   │
│  5. ParameterResolutionAgent — resolves playbook parameters safely  │
│       │                                                             │
│       ▼  handoff to DETERMINISTIC V1 engine                         │
│  6. RecoveryMonitoringAgent — monitors V1 execution outcome         │
│  7. ExplanationAgent      — produces human-readable audit narrative │
│  8. LearningAgent         — proposes improvements (human-approved)  │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
  AgentIntelligenceRun (MongoDB) — full trace + confidence + audit
        │
        ▼
  Frontend AgentIntelligencePanel — live-polling UI (4s interval)
```

### Agent Summary

| Agent | Input | Output | Failure Mode |
|---|---|---|---|
| CorrelationAgent | signals[] | incidentGroup, evidenceIds[] | MANUAL_REQUIRED |
| InvestigationAgent | incidentGroup | evidencePackage[] (reduced) | MANUAL_REQUIRED |
| DiagnosisAgent | evidencePackage | hypotheses[], rootCause, confidence | MANUAL_REQUIRED |
| PlaybookSelectionAgent | diagnosis | selectedPlaybook, rationale | NO_SAFE_PLAYBOOK |
| ParameterResolutionAgent | selectedPlaybook | candidates[], readyForExecution | MANUAL_REQUIRED |
| RecoveryMonitoringAgent | executionResult | status, recommendation, rollback | ESCALATE |
| ExplanationAgent | full context | narrative, timeline, audienceLevel | degrades gracefully |
| LearningAgent | outcome | recommendations (requiresHumanApproval) | MANUAL_REQUIRED |

### Safety Boundaries

- **No infrastructure execution** — agents never call `kubectl`, `aws`, or any infra API directly
- **Hallucination guards** — evidence IDs and playbook IDs are validated against real data; fabricated references are stripped
- **Prompt injection defense** — signal messages are treated as untrusted data; structural attacks cannot alter agent decisions
- **Secret redaction** — parameters tagged `secret: true` are masked before being written to audit logs
- **Learning approval gate** — `LearningAgent` always sets `requiresHumanApproval: true`; no automated policy mutation
- **Evidence reduction** — log arrays truncated to 100 lines × 512 chars; evidence items limited to 50; total bytes budgeted

### Cost Controls

All limits are configurable via `AIRA_BUDGET_<KEY>` environment variables (see `backend/agents/v2/config/agentBudgets.js`):

| Budget Key | Default | Description |
|---|---|---|
| `maxModelCallsPerIncident` | 20 | Hard cap on LLM calls per incident analysis |
| `agentTimeoutMs` | 15000 | Per-agent execution timeout |
| `orchestratorTimeoutMs` | 120000 | Total orchestrator timeout |
| `maxLogLines` | 100 | Max log lines per evidence item |
| `maxLogLineChars` | 512 | Max chars per log line |
| `maxContextChars` | 8000 | Max chars of context sent to LLM |
| `maxEvidenceItems` | 50 | Max evidence items per package |
| `maxEvidenceItemBytes` | 4096 | Max bytes per evidence item |

### Manual Escalation Codes

When agents cannot safely proceed, they produce a `manualReason`:

| Code | Meaning |
|---|---|
| `AGENT_UNAVAILABLE` | Reasoning provider unreachable |
| `AGENT_OUTPUT_INVALID` | LLM response failed contract validation |
| `AGENT_CONFIDENCE_TOO_LOW` | Confidence below threshold for autonomous action |
| `EVIDENCE_INSUFFICIENT` | Not enough evidence to form a safe diagnosis |
| `AGENT_TIMEOUT` | Agent exceeded time budget |
| `LEGACY_PATH_BLOCKED` | Attempted to use deprecated legacy execution path |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/incidents/:id/analyze` | Trigger agent analysis |
| `POST` | `/api/v1/incidents/:id/analyze/retry` | Retry failed analysis |
| `GET` | `/api/v1/incidents/:id/intelligence` | Latest AgentIntelligenceRun |
| `GET` | `/api/v1/incidents/:id/agent-evidence` | Evidence package |
| `GET` | `/api/v1/incidents/:id/agent-diagnosis` | Diagnosis output |
| `GET` | `/api/v1/incidents/:id/agent-trace` | Full agent execution trace |

---

## Playbook + Runbook Platform V1 (Frozen)

> V1 is the authoritative execution layer. It is **never modified** by agent outputs. Agents recommend; V1 executes — after human approval where required.

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
  agents/
    v2/                    # 8-agent intelligence platform (authoritative)
      agents/              # correlationAgent, investigationAgent, diagnosisAgent,
                           # playbookSelectionAgent, parameterResolutionAgent,
                           # recoveryMonitoringAgent, explanationAgent, learningAgent
      runtime/             # agentOrchestrator, baseAgent, reasoningProvider
      contracts/           # agentContracts, confidenceModel
      config/              # agentBudgets (cost controls + env overrides)
      tests/               # 12 test suites, 72+ tests
      index.js             # public API: buildAgentOrchestrator + all exports
    analysisAgent.js       # DEPRECATED — no-op start/stop
    decisionAgent.js       # DEPRECATED — no-op start/stop
    actionAgent.js         # DEPRECATED — performAction returns LEGACY_PATH_BLOCKED
    batchDecisionAgent.js  # DEPRECATED — class retained for import compat only
  models/                  # Mongoose models (User, Organization, AgentIntelligenceRun, …)
  routes/                  # Express routers (authRoutes, agentIntelligenceRoutes, …)
  middleware/              # sessionAuthMiddleware, csrfMiddleware, killSwitchMiddleware, …
  services/
    identity/              # authService, sessionService, passwordService, csrfHelper
  tests/
    unit/                  # playbookValidator, playbookGoldenPath, runbookSchema, …
    integration/           # auth, incident, approvals, services, monitor, …

frontend/
  src/
    api/
      client.ts            # cookie-based fetch wrapper + agent intelligence methods
      hooks/
        useAgentIntelligence.ts  # polling hooks for agent analysis (4s, terminal-state aware)
    components/
      incidents/
        AgentIntelligencePanel.tsx  # full agent intelligence UI panel
    types/
      agentIntelligence.ts         # TypeScript types for all agent API responses
    pages/
      IncidentDetailPage.tsx       # renders AgentIntelligencePanel
    store/
      authStore.ts         # Zustand store — no persist middleware, no secrets
```

---

## Running Tests

```bash
cd backend

# V2 agent intelligence platform (72 tests, 12 suites)
npx jest --testPathPattern="agents/v2/tests" --no-coverage --forceExit

# Legacy agent migration + prompt injection (integration)
npx jest --testPathPattern="agentIntegration" --no-coverage --forceExit

# Cost controls + evidence reduction
npx jest --testPathPattern="costControls" --no-coverage --forceExit

# V1 Playbook/Runbook unit tests
npx jest --testPathPattern="unit" --no-coverage --forceExit

# All tests (743 passing, 27 suites; integration tests require MongoDB)
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
