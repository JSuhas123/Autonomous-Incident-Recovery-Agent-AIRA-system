# AIRA — Enterprise-Grade Repository Audit Report

**Repository:** `JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system`  
**Branch Audited:** `hardening/aira-production`  
**Audit Date:** 2026-07-22  
**Auditor Role:** Principal Software Architect  
**Audit Scope:** Full codebase — architecture, security, scalability, maintainability, deployment

---

## Table of Contents

1. [High-Level Architecture Overview](#1-high-level-architecture-overview)
2. [Folder Structure Analysis](#2-folder-structure-analysis)
3. [Backend Analysis](#3-backend-analysis)
4. [Frontend Analysis](#4-frontend-analysis)
5. [Database Analysis](#5-database-analysis)
6. [API Analysis](#6-api-analysis)
7. [Security Issues](#7-security-issues)
8. [Performance Issues](#8-performance-issues)
9. [Code Quality Issues](#9-code-quality-issues)
10. [Technical Debt](#10-technical-debt)
11. [Duplicate Logic](#11-duplicate-logic)
12. [Dead Code](#12-dead-code)
13. [Unused Packages](#13-unused-packages)
14. [Dependency Risks](#14-dependency-risks)
15. [Production Risks](#15-production-risks)
16. [Deployment Risks](#16-deployment-risks)
17. [Testing Coverage](#17-testing-coverage)
18. [Build Problems](#18-build-problems)
19. [Recommended Refactoring Order](#19-recommended-refactoring-order)
20. [Priority Matrix](#20-priority-matrix)

---

## 1. High-Level Architecture Overview

### System Purpose
AIRA (Autonomous Incident Recovery Agent) is a multi-tenant, event-driven backend system for automated incident detection, decision-making, and remediation in Kubernetes-based cloud environments. It ingests operational signals, applies tenant-scoped policies, runs a three-stage agent pipeline (Analysis → Decision → Action), and optionally executes remediations autonomously.

### Architecture Pattern
**Event-driven pipeline with CQRS-style separation:**

```
External Signal
      │
      ▼
[POST /signals]  ──►  RabbitMQ Queue: signal.received
                             │
                    ┌────────▼────────┐
                    │ Analysis Agent  │  (classifies incident, enriches context)
                    └────────┬────────┘
                             │ incident.analyzed
                    ┌────────▼────────┐
                    │ Decision Agent  │  (evaluates policies, selects action)
                    └────────┬────────┘
                             │ decision.proposed
                    ┌────────▼────────┐
                    │  Action Agent   │  (executes or queues for approval)
                    └────────┬────────┘
                             │
                    [Kubernetes / Slack / Runbook]
```

### Core Components

| Component | Technology | Purpose |
|---|---|---|
| API Server | Express.js | REST API, middleware chain |
| Message Broker | RabbitMQ (amqplib) | Async agent pipeline |
| Database | MongoDB (Mongoose) | Persistence, audit, decisions |
| Cache / Idempotency | Redis (redis@4) | Deduplication, distributed locks |
| Metrics | prom-client | Prometheus-format `/metrics` |
| Logging | Winston | Structured JSON logging |
| Orchestration | Kubernetes | Pod lifecycle management |
| Safety Layer | Kill switches + Feature flags | Safe-mode operations |

### Architectural Strengths
- Comprehensive tenant isolation middleware with body/URL cross-validation
- HMAC-signed request authentication (timing-safe comparison)
- Feature flags default to `false` (safe-by-default posture)
- Graceful degradation: Redis and RabbitMQ failures fall back to in-memory alternatives
- Idempotency protection on all mutations
- Distributed locking for multi-instance coordination

### Architectural Weaknesses (summary)
- No frontend exists; API contracts are undocumented for consumers
- `/metrics` and `/health` endpoints are publicly accessible with no authentication
- Sample and chaos data is auto-seeded on every startup
- `@kubernetes/client-node` is pinned at a version range containing two critical RCE CVEs
- CORS is configured as `"*"` in the Kubernetes ConfigMap, overriding the application-level restriction

---

## 2. Folder Structure Analysis

### Current Structure
```
/ (root)
├── backend/               # Node.js application (all server-side code)
│   ├── agents/            # Three pipeline agents (analysis, decision, action)
│   ├── archived-issues/   # Deprecated troubleshooting files
│   ├── chaos/             # Chaos engineering test harness
│   ├── cli/               # aira CLI tool
│   ├── config/            # featureFlags, killSwitches, confidenceThresholds
│   ├── logs/              # Runtime log files (should not be in repo)
│   ├── middleware/         # 7 Express middleware files
│   ├── models/            # 17 Mongoose models
│   ├── policies/          # Policy YAML definitions
│   ├── routes/            # 10 route modules
│   ├── runbooks/          # Runbook YAML files
│   ├── scripts/           # Utility scripts
│   ├── services/          # 11 service subdirectories + 3 loose files
│   ├── simulation/        # Simulation engine
│   ├── temp-tests/        # Temporary test files
│   ├── tests/             # Formal test suite
│   └── utils/             # Utility functions
├── docs/                  # (this audit, plus reference docs)
├── infra-simulation/      # Docker Compose simulation environment
├── k8s/                   # Kubernetes manifests
└── *.md                   # 25+ documentation files at root level
```

### Issues

| ID | Issue | Severity |
|---|---|---|
| FS-01 | **25+ `.md` documentation files at repository root** — creates noise, should be moved to `docs/` | Medium |
| FS-02 | **`backend/logs/` committed to repository** — runtime artifacts should be git-ignored | Medium |
| FS-03 | **`backend/temp-tests/`** — temporary test files that are not part of the formal test suite should be deleted | Low |
| FS-04 | **`backend/archived-issues/`** — historical debugging files have no place in production code; should be removed or moved to a separate branch | Low |
| FS-05 | **`backend/services/` has 3 loose service files** (`dlqService.js`, `messageOrderingService.js`, `notificationService.js`) at the top level alongside 11 subdirectories — inconsistent; loose files should be moved into the `infrastructure/` subdirectory | Medium |
| FS-06 | **No `frontend/` directory exists** — the system has a documented API but no consumer; the API surface is unverified without an integration partner | High |
| FS-07 | **`backend/chaos/` is a separate test harness** with its own `package.json` — this creates a second dependency tree that may diverge from the main tree | Medium |

---

## 3. Backend Analysis

### server.js — Startup Sequence
The startup function performs these steps in order:
1. Load environment via `dotenv`
2. Initialize feature flags
3. Connect to MongoDB
4. Run `populateSampleData()` ← **unconditional, every startup**
5. Connect to RabbitMQ (falls back to mock)
6. Connect to Redis (falls back to mock)
7. Start background jobs (memory cleanup, retry processor)
8. Start three pipeline agents
9. Initialize multi-instance coordinator
10. Listen on port

**Critical issue:** Step 4 destroys and recreates data for the `default` tenant on every restart, including in production.

### Agent Pipeline
| Agent | File | Responsibility |
|---|---|---|
| Analysis Agent | `agents/analysisAgent.js` | Signal consumption, incident classification |
| Decision Agent | `agents/decisionAgent.js` | Policy evaluation, action selection |
| Action Agent | `agents/actionAgent.js` | Action execution via K8s/Runbook/Slack |

All three agents consume from RabbitMQ topics and publish to the next topic. When RabbitMQ is unavailable and the mock fallback is active, this entire pipeline silently operates in-memory with no persistence and no durability guarantees — with no operational alert raised.

### Middleware Chain Order
```
CORS → JSON Parser → Correlation ID → Sanitization → Kill Switch → Confidence Check
    → [for /api/v1/tenants/:tenantId] Auth → Rate Limit → Tenant Isolation → Audit Log
    → Route Handler
```
This ordering is correct. However:
- `sanitizationMiddleware` is applied globally before auth, which is correct, but the `allowRichText: false` flag passed as a hardcoded option prevents legitimate rich-text payloads in runbook descriptions.
- Rate limiting is applied only to `/api/v1/tenants/:tenantId` — unauthenticated routes (`/health*`, `/metrics`) have no rate limiting.

### Services Architecture
The `services/` directory contains 11 subdirectories plus 3 loose files. Service modules are generally well-separated by concern. However:
- `services/infrastructure/index.js` exports 15+ services — this is a large barrel export that couples consumers to the entire infrastructure layer.
- `circuitBreakerService.js` exists inside `infrastructure/` but is not exported from `infrastructure/index.js`, meaning some consumers may import it directly via relative path (creating hidden coupling).

---

## 4. Frontend Analysis

### Finding
**No frontend code exists in this repository.** The system is documented as an "Incident Response Decision Engine API" but there is no React, Vue, Angular, or any other UI framework present.

### Implications

| ID | Issue | Risk |
|---|---|---|
| FE-01 | **No frontend means no verified API consumer** — route contracts (request shapes, response shapes, error codes) have not been exercised by a real client; only test code validates them | High |
| FE-02 | **`CORS_ORIGIN` is set to `"*"` in k8s/configmap.yaml** — this was presumably intended to be temporary until a real frontend origin was known, but has been left open | Critical |
| FE-03 | **No OpenAPI/Swagger specification** — engineers building a frontend or integration partner must reverse-engineer the API from route files | High |
| FE-04 | **Authentication mechanism (HMAC-signed `keyId:secret`)** is complex for browser-based clients to implement securely — the secret would need to reside in the frontend, making it extractable | High |

---

## 5. Database Analysis

### Technology
MongoDB 7.0 via Mongoose 8.6.2.

### Models Inventory (17 models)

| Model | Indexes | TTL | Status |
|---|---|---|---|
| `DecisionTrace` | tenantId+createdAt, correlationId | 90 days | Active |
| `AuditEvent` | tenantId+timestamp, correlationId | 90 days | Active |
| `TenantConfig` | tenantId (unique) | None | Active |
| `PolicyDefinition` | tenantId+version | None | Active |
| `IncidentMemory` | tenantId+patternId | None | Active |
| `ActionLog` | tenantId+executedAt, correlationId | 30 days | **Deprecated stub** |
| `RunbookExecution` | tenantId+runbookId | None | Active |
| `ServiceDependency` | tenantId+serviceId | None | Active |
| `SimulationResult` | tenantId | None | Active |
| `FailedMessage` | tenantId+topic | None | Active |
| `FeedbackOutcome` | tenantId | None | Active |
| `Log` | tenantId+timestamp | — | Active (used for sample data) |

### Database Issues

| ID | Issue | Risk |
|---|---|---|
| DB-01 | **`ActionLog.js` is a deprecated stub** with a comment stating "use AuditEvent instead," but is still imported and used in test suites and route handlers — dual-write risk | High |
| DB-02 | **`IncidentMemory` has no TTL index** — patterns accumulate indefinitely; in a busy production tenant this will grow without bound | Medium |
| DB-03 | **`PolicyVersion.js` and `PolicyDefinition.js` both exist** — version tracking is split across two models; no clear migration path documented | Medium |
| DB-04 | **`SimulationResult` and `Log` are in the same models directory as production models** — simulation data can be accidentally included in production queries | Medium |
| DB-05 | **No compound index on `tenantId + correlationId`** for `DecisionTrace` — cross-joining a decision to its audit events requires a full collection scan on `correlationId` | Medium |
| DB-06 | **`mongodb-memory-server@10.1.4` is in production dependencies** (not devDependencies) — this downloads a MongoDB binary at runtime, adding 50-100 MB to the production image and creating a supply-chain risk | High |
| DB-07 | **No read/write concern configurations** — Mongoose connects with default settings; for a system that executes remediations, `writeConcern: { w: "majority" }` should be enforced | High |
| DB-08 | **No database migration tooling** — schema changes are applied ad-hoc; there is no versioned migration runner (e.g., migrate-mongo) to ensure consistent state across environments | Medium |

---

## 6. API Analysis

### Route Inventory

| Module | Mount Path | Purpose |
|---|---|---|
| `coreApiRoutes` | `/api/v1/tenants/:tenantId` | Signal ingestion, decisions, actions |
| `approvalRoutes` | `/api/v1/tenants/:tenantId` | Manual approval workflow |
| `policyManagementRoutes` | `/api/v1/tenants/:tenantId` | CRUD for policies |
| `effectivenessRoutes` | `/api/v1/tenants/:tenantId` | Action effectiveness metrics |
| `confidenceRoutes` | `/api/v1/tenants/:tenantId` | Confidence scoring |
| `integrationRoutes` | `/api/v1/tenants/:tenantId` | External integrations |
| `executionModesRoutes` | `/api/v1/tenants/:tenantId` | Execution mode configuration |
| `reportingRoutes` | `/api/v1/tenants/:tenantId` | Reports and analytics |
| `runbookRoutes` | `/api/v1/tenants/:tenantId` | Runbook management |
| `actionLogRoutes` | Unknown | Action log queries |

### API Issues

| ID | Issue | Risk |
|---|---|---|
| API-01 | **No versioning strategy beyond `/v1/`** — all 10 route modules are mounted at the same prefix; no plan documented for adding `/v2/` routes for breaking changes | Medium |
| API-02 | **`coreApiRoutes.js` contains `buildTieredDecision()` — business logic inside a route file** — this function should live in the decision service layer, not in routing code | High |
| API-03 | **No OpenAPI spec exists** — all 10 route modules must be read manually to understand the API surface | High |
| API-04 | **`/metrics` endpoint is unauthenticated** — exposes per-tenant counters, queue depth, error rates, and memory patterns to any network caller | Critical |
| API-05 | **`/health/detailed` is unauthenticated** — leaks Redis connection state, safe-mode status, internal diagnostics, and warning messages | Critical |
| API-06 | **`/health/multi-instance` is unauthenticated** — exposes cluster topology and leader election state | High |
| API-07 | **Kill switch control endpoint (`POST /kill-switch/control`) appears to have no auth guard** beyond what is applied at the `/api/v1/tenants/:tenantId` prefix — if it is mounted outside that prefix, it is unprotected | Critical |
| API-08 | **Idempotency key is required but never validated for format** — any string is accepted; there is no UUID enforcement, enabling replay with arbitrary keys | Medium |
| API-09 | **`actionLogRoutes` mount path unknown** — not found in the main `server.js` route registration block, suggesting it may be orphaned or conditionally loaded | Medium |

---

## 7. Security Issues

### S-01 — CRITICAL: Unauthenticated `/metrics` Endpoint
- **Problem:** `/metrics` (Prometheus format) is publicly accessible. It exposes per-tenant decision counts, queue depths, error rates, action execution totals, and memory pattern counts — all sensitive operational data.
- **Risk:** Information disclosure enables targeted attacks. An attacker can observe which tenants are active, which services are failing, and when automated remediations are suppressed.
- **Solution:** Add HTTP Basic Auth or token validation middleware to `/metrics`. If Prometheus scraping requires network-level access only, add a network policy in Kubernetes to restrict the endpoint to the monitoring namespace.
- **Effort:** 2 hours

### S-02 — CRITICAL: Unauthenticated `/health/detailed` and `/health/multi-instance`
- **Problem:** These endpoints expose internal topology: Redis connectivity, safe-mode status, RabbitMQ state, multi-instance leader election state, and diagnostic warnings.
- **Risk:** Attackers learn exactly when the system is degraded and can time attacks accordingly.
- **Solution:** Protect with the same auth middleware as API routes, or expose only a simplified `{ status: "ok" | "degraded" }` to unauthenticated callers.
- **Effort:** 2 hours

### S-03 — CRITICAL: Chaos Tenant Auto-Created on Every Startup
- **Problem:** `server.js` line 766 creates a tenant with `keyId: "chaos-key"`, `secret: "chaos-secret"` during startup. This creates a known-credential backdoor account in every environment including production.
- **Risk:** Any attacker who knows this credential (it is publicly visible in the open-source repository) can authenticate as a valid tenant and inject signals, override decisions, or manipulate policies.
- **Solution:** Remove this block entirely. Chaos test tenant creation belongs in a test-setup script run only in CI/test environments, gated by `NODE_ENV !== 'production'`.
- **Effort:** 30 minutes

### S-04 — CRITICAL: Sample Data Auto-Populated on Every Startup
- **Problem:** `populateSampleData()` is called unconditionally at startup. It deletes all records for the `default` tenant and recreates them with fixture data.
- **Risk:** In production, this destroys real incident history, decision traces, and learned patterns on every pod restart. Additionally, the `default` tenant has no access controls in the seeder — any caller who knows the tenantId "default" can query this data.
- **Solution:** Gate with `if (process.env.NODE_ENV !== 'production' && process.env.SEED_SAMPLE_DATA === 'true')`. Move the seeder to a standalone script.
- **Effort:** 1 hour

### S-05 — CRITICAL: Hardcoded Fallback Secrets
- **Problem:** `auditService.js` lines 69 and 325 use `process.env.AUDIT_SECRET || "audit-secret"`. `k8s/generate-secrets.js` falls back to `"change-me-32chars-minimum-secret"` and `"password"` for MongoDB.
- **Risk:** If the environment variable is not set, the system silently uses a well-known weak secret. Audit signatures computed with "audit-secret" are trivially forgeable.
- **Solution:** Replace all `|| "default-secret"` patterns with a hard startup failure: `if (!process.env.AUDIT_SECRET) throw new Error("AUDIT_SECRET must be set")`. Add a startup validation function that asserts all required secrets are non-empty.
- **Effort:** 2 hours

### S-06 — CRITICAL: `CORS_ORIGIN: "*"` in Kubernetes ConfigMap
- **Problem:** `k8s/configmap.yaml` sets `CORS_ORIGIN: "*"`, which overrides the application's own default of `http://localhost:3000`. This allows any web origin to make cross-origin requests to the API.
- **Risk:** Cross-site request forgery from any origin; credential theft via malicious websites.
- **Solution:** Set `CORS_ORIGIN` to the specific frontend origin (or a comma-separated allowlist). Remove the wildcard.
- **Effort:** 15 minutes

### S-07 — CRITICAL: `jsonpath-plus ≤10.2.0` — Remote Code Execution
- **Problem:** `@kubernetes/client-node ≤1.0.0-rc7` depends on `jsonpath-plus` which has two confirmed RCE CVEs: GHSA-pppg-cpfq-h7wr and GHSA-hw8r-x6gr-5gjp.
- **Risk:** Arbitrary code execution on the server. Any code path that uses the Kubernetes client with user-influenced label selectors or JSON path queries is exploitable.
- **Solution:** `npm audit fix --force` — upgrades `@kubernetes/client-node` to `1.4.0`. This is a breaking change; test the Kubernetes integration after upgrade.
- **Effort:** 4–8 hours (upgrade + regression testing)

### S-08 — CRITICAL: `form-data ≤2.5.5` — CRLF Injection
- **Problem:** Transitive dependency via `request` → `form-data` with CRLF injection (GHSA-hmw2-7cc7-3qxx) and unsafe boundary generation (GHSA-fjxv-7rqg-78g4).
- **Risk:** HTTP header injection, potential request smuggling.
- **Solution:** Same `@kubernetes/client-node` upgrade resolves this entire chain.
- **Effort:** Covered by S-07

### S-09 — HIGH: Raw Secret Transmitted in Authorization Header
- **Problem:** Auth scheme sends `Authorization: Bearer keyId:secret` — the raw secret is transmitted in plaintext on every request. The secret is used as an HMAC signing key but is also directly exposed in the header.
- **Risk:** Any proxy, log aggregator, or network tap that captures request headers obtains the signing secret, allowing unlimited request forgery.
- **Solution:** Transmit only the `keyId` in the Authorization header. The client signs with the secret but never sends it. The server looks up the stored secret hash by `keyId` and re-derives the expected signature.
- **Effort:** 1 day (requires coordinated client change)

### S-10 — HIGH: `brace-expansion <1.1.16` — ReDoS
- **Problem:** GHSA-3jxr-9vmj-r5cp — exponential-time regex in glob expansion.
- **Risk:** A single crafted file path can cause 100% CPU consumption for seconds, enabling DoS.
- **Solution:** `npm audit fix` (non-breaking).
- **Effort:** 30 minutes

### S-11 — HIGH: No Rate Limiting on Health and Metrics Endpoints
- **Problem:** `/health`, `/health/detailed`, `/health/multi-instance`, and `/metrics` have no rate limiting.
- **Risk:** These endpoints perform real service checks (Redis PING, RabbitMQ status). Flooding them causes unnecessary load on infrastructure services.
- **Solution:** Apply a lightweight rate limiter (e.g., `express-rate-limit`) to all unauthenticated endpoints.
- **Effort:** 2 hours

### S-12 — MEDIUM: Idempotency Store Falls Back to In-Memory Map
- **Problem:** When Redis is unavailable, idempotency checks use a `Map()` stored in process memory. In multi-instance deployments, each pod has its own map — duplicate requests to different pods will both execute.
- **Risk:** Double execution of remediations (pod restarts, scale operations) across multiple backend instances.
- **Solution:** Make Redis a hard dependency in production. Add a `REQUIRE_REDIS=true` flag that converts the fallback from silent to a startup failure.
- **Effort:** 3 hours

### S-13 — MEDIUM: `qs <6.14.1` — Memory Exhaustion DoS
- **Problem:** GHSA-6rw7-vpxm-498p — bracket-notation `arrayLimit` bypass.
- **Risk:** Crafted query strings exhaust server memory.
- **Solution:** Covered by the `@kubernetes/client-node` upgrade (S-07).
- **Effort:** Covered by S-07

### S-14 — MEDIUM: `tough-cookie <4.1.3` — Prototype Pollution
- **Problem:** GHSA-72xf-g2v4-qvf3.
- **Risk:** Prototype pollution enabling property injection on global `Object`.
- **Solution:** Covered by the `@kubernetes/client-node` upgrade.
- **Effort:** Covered by S-07

---

## 8. Performance Issues

### P-01 — HIGH: No Compound Index on `tenantId + correlationId` for Decision Traces
- **Problem:** Looking up a decision trace by its correlationId requires either a `correlationId`-only index (cross-tenant) or a full scan after filtering by `tenantId`.
- **Risk:** Slow audit queries in high-volume tenants. Cross-tenant correlationId lookups are a security risk if the wrong index is used.
- **Solution:** Add `{ tenantId: 1, correlationId: 1 }` compound index to `DecisionTrace`.
- **Effort:** 1 hour

### P-02 — HIGH: `IncidentMemory` Has No TTL Index
- **Problem:** Every incident pattern learned by the system is stored permanently. A production tenant processing 1,000 incidents/day will accumulate millions of pattern records within months.
- **Risk:** MongoDB collection grows unbounded; query performance degrades as memory patterns accumulate.
- **Solution:** Add TTL index (e.g., 180 days) with an option for tenants to configure retention via policy.
- **Effort:** 2 hours

### P-03 — MEDIUM: `populateSampleData()` Executes Synchronously at Startup
- **Problem:** The seeder runs `deleteMany` + `insertMany` on three collections during server startup before the HTTP server begins accepting requests.
- **Risk:** Startup time is increased by database write latency. Under load (slow MongoDB), startup can take several seconds, causing liveness probe failures and CrashLoopBackOff.
- **Solution:** Gate behind `NODE_ENV` (resolves this automatically once S-04 is fixed). If seeding is needed, run it after server listen, asynchronously.
- **Effort:** Resolved by S-04

### P-04 — MEDIUM: No Connection Pool Configuration for MongoDB
- **Problem:** Mongoose connects without explicit `maxPoolSize`, `minPoolSize`, or `serverSelectionTimeoutMS` settings.
- **Risk:** Under concurrent load the default pool (5 connections) becomes a bottleneck. Bursts that exceed pool size queue up, increasing decision latency.
- **Solution:** Configure `maxPoolSize: 20`, `minPoolSize: 5`, `serverSelectionTimeoutMS: 5000`.
- **Effort:** 1 hour

### P-05 — MEDIUM: Metrics Endpoint Calls `metricsService.getMetrics()` Synchronously on Every Scrape
- **Problem:** Each Prometheus scrape (typically every 15 seconds) triggers a full metric collection cycle. If the registry grows large, this adds latency to the scraping process.
- **Risk:** At scale, metric collection contends with request handling on the same event loop.
- **Solution:** Pre-compute and cache metrics on a background timer; serve the cached result on `/metrics`.
- **Effort:** 3 hours

### P-06 — LOW: `crypto` Listed as Production Dependency
- **Problem:** `crypto` is a Node.js built-in module. Listing it as a production npm dependency (`"crypto": "^1.0.1"`) installs a deprecated npm shim that shadows the built-in.
- **Risk:** The npm shim (`crypto@1.0.1`) does nothing except throw a deprecation warning. Any code relying on it may silently fail if the shim and the built-in diverge.
- **Solution:** Remove `crypto` from `package.json`. All `require('crypto')` calls resolve to the built-in automatically.
- **Effort:** 15 minutes

---

## 9. Code Quality Issues

### Q-01 — HIGH: Business Logic Inside Route Files
- **Problem:** `coreApiRoutes.js` contains `buildTieredDecision()` — a function with multi-tier severity classification, cascade detection, confidence assignment, and fallback logic. This is the core decision heuristic of the system.
- **Why it's a problem:** Route files should handle HTTP concerns only (parsing, validation, response formatting). Business logic in routes cannot be unit-tested without HTTP scaffolding, and it is invisible to the service layer.
- **Solution:** Extract `buildTieredDecision()` to `services/core/decisionEngine.js` (or the existing `policyEngine.js`).
- **Effort:** 4 hours

### Q-02 — HIGH: `server.js` is 1,000+ Lines
- **Problem:** The entry point handles startup orchestration, health endpoints, sample data seeding, chaos tenant creation, route mounting, graceful shutdown, and signal handling.
- **Why it's a problem:** Untestable monolith. Any change to startup order requires reading the entire file. Circular dependency risk.
- **Solution:** Extract: `startup.js` (bootstrap sequence), `seeder.js` (sample data), `routes/index.js` (route mounting), `shutdown.js` (graceful shutdown). `server.js` becomes a 50-line coordinator.
- **Effort:** 1 day

### Q-03 — MEDIUM: `featureFlags.js` Uses `process.env` at Module Load Time
- **Problem:** Feature flags are read once when the module is `require()`d. Changing an environment variable at runtime (e.g., via Kubernetes ConfigMap update) requires a pod restart.
- **Why it's a problem:** In production, operators want to toggle flags without restarts (especially kill switches).
- **Solution:** Add a polling mechanism that re-reads flags from a configuration service or a separate Redis key every 60 seconds.
- **Effort:** 4 hours

### Q-04 — MEDIUM: No Input Validation Schema for Signal Payloads
- **Problem:** `inputValidationMiddleware.js` exists but the actual schema for `POST /signals` is handled by `buildTieredDecision()` using implicit field reads with no `joi` validation.
- **Why it's a problem:** Invalid signals (missing `severity`, non-numeric `errorRate`) produce undefined behavior in the decision tier rather than a 400 error.
- **Solution:** Define a `joi` schema for signal payloads and validate in middleware before the handler runs.
- **Effort:** 3 hours

### Q-05 — MEDIUM: Silent Error Swallowing in Infrastructure Services
- **Problem:** `idempotencyService.js` and `queueService.js` catch connection errors and log warnings but return objects in a `connected: false` state rather than throwing. The caller checks `if (!connected)` before operations but the fallback path is silently activated.
- **Why it's a problem:** Operators are unaware the system is running degraded unless they observe logs. There is no metric counter for "fallback activated."
- **Solution:** Increment a Prometheus counter (`infrastructure_fallback_activations_total`) whenever a mock fallback is engaged. Alert on this counter in production.
- **Effort:** 2 hours

### Q-06 — LOW: Inconsistent Error Response Shape
- **Problem:** Some routes return `{ error: "message", code: "ERROR_CODE" }` (middleware pattern) while others return `{ success: false, message: "..." }` or `{ status: "error", details: [...] }`.
- **Why it's a problem:** API consumers cannot write a single error-handling function; they must handle multiple shapes.
- **Solution:** Standardize on a single error envelope: `{ success: false, error: { code, message, details? } }`. Create a `sendError(res, status, code, message)` utility.
- **Effort:** 1 day (systematic)

---

## 10. Technical Debt

| ID | Description | Origin | Risk | Effort to Resolve |
|---|---|---|---|---|
| TD-01 | `ActionLog.js` deprecated stub still imported in routes and tests | Phase 2 migration incomplete | High | 4 hours |
| TD-02 | `batchProcessingPipeline` disabled with `TODO` comment since Phase 7.5 | Module dependency unresolved | Medium | Unknown (module missing) |
| TD-03 | `PolicyVersion.js` and `PolicyDefinition.js` overlap in schema | Phase 3 policy refactor incomplete | Medium | 1 day |
| TD-04 | 25+ documentation `.md` files at repository root | Accumulated across 10 phases | Low | 2 hours (move to `docs/`) |
| TD-05 | `backend/chaos/package.json` — separate dependency tree | Chaos harness never integrated | Medium | 4 hours |
| TD-06 | `collectCoverage: false` in `jest.config.js` — coverage collection disabled by default | Never enabled after Phase 1 | Medium | 1 hour |
| TD-07 | `mongodb-memory-server` in production dependencies | Copied from test setup | High | 30 minutes (move to devDeps) |
| TD-08 | No database migration runner | Schema evolved ad-hoc across 10 phases | High | 1 week |
| TD-09 | Kill switch control endpoint accessibility unknown | Not clearly registered in server.js | Critical | 2 hours |

---

## 11. Duplicate Logic

| ID | Duplicated Logic | Locations | Risk |
|---|---|---|---|
| DL-01 | **HMAC signature generation** (`hashWithSecret` function) | `middleware/authMiddleware.js`, `chaos/validate-setup.js`, `chaos/quick-start.js`, `tests/phase1-integration.test.js`, `tests/integration/consolidated-integration.test.js` | Divergence — if the algorithm changes in authMiddleware, the copies in test/chaos files will silently test against the old algorithm |
| DL-02 | **Tenant lookup pattern** (`TenantConfig.findOne({ tenantId, status: "active" })`) | Multiple route handlers and the auth middleware | If the lookup needs to add a second condition (e.g., `suspendedAt: null`), it must be updated in 8+ places |
| DL-03 | **Prometheus metric recording boilerplate** | Spread across all 11 service modules | Each service duplicates label-construction logic; a single typo in a label name breaks dashboards |
| DL-04 | **Confidence score calculation** | `services/core/confidence/`, `agents/analysisAgent.js`, `coreApiRoutes.js` (`buildTieredDecision`) | Three separate codepaths for confidence scoring may disagree |
| DL-05 | **Correlation ID generation** (`crypto.randomUUID()`)  | `correlationIdMiddleware.js`, `queueService.js`, `idempotencyService.js`, agent files | Inconsistent — some use UUID v4, some rely on external assignment |

---

## 12. Dead Code

| ID | Dead Code | Location | Evidence |
|---|---|---|---|
| DC-01 | `ActionLog.js` model (deprecated stub) | `backend/models/ActionLog.js` | File comment: "Consolidated into AuditEvent during Phase 2" |
| DC-02 | `batchProcessingPipeline` import and start sequence | `backend/server.js` lines ~880 | Commented out with TODO since Phase 7.5 |
| DC-03 | `backend/temp-tests/` directory | `backend/temp-tests/` | Temporary test files not referenced by jest config |
| DC-04 | `backend/archived-issues/` directory | `backend/archived-issues/` | Historical debugging artifacts |
| DC-05 | `backend/simulation/` | `backend/simulation/` | Simulation engine exists in both `backend/simulation/` and `infra-simulation/` — one is likely unused |
| DC-06 | `runbookRoutes.js` | `backend/routes/runbookRoutes.js` | Not found in the main route registration block of `server.js` |
| DC-07 | `actionLogRoutes.js` | `backend/routes/actionLogRoutes.js` | Not found in the main route registration block of `server.js` |

---

## 13. Unused Packages

| Package | Declared In | Likely Usage | Issue |
|---|---|---|---|
| `crypto` (npm shim) | `backend/package.json` dependencies | Node built-in used throughout | npm shim `crypto@1.0.1` is deprecated and does nothing; should be removed |
| `mongodb-memory-server` | `backend/package.json` dependencies | In-memory MongoDB for tests | Should be in `devDependencies`; adds 50–100 MB binary download to production image |
| `uuid` (two versions) | `backend/package.json` + `@kubernetes/client-node` transitive | UUID generation | The top-level `uuid@11` is correct; the transitive `uuid` from `request` is an older vulnerable version |

---

## 14. Dependency Risks

### Critical CVEs

| Package | CVE/Advisory | Severity | Attack Vector | Fix |
|---|---|---|---|---|
| `jsonpath-plus ≤10.2.0` | GHSA-pppg-cpfq-h7wr, GHSA-hw8r-x6gr-5gjp | **Critical** — RCE | Malicious JSON path expression | Upgrade `@kubernetes/client-node` to `≥1.4.0` |
| `form-data ≤2.5.5` | GHSA-fjxv-7rqg-78g4, GHSA-hmw2-7cc7-3qxx | **Critical** — CRLF injection | Crafted multipart field names | Same upgrade |
| `brace-expansion <1.1.16` | GHSA-3jxr-9vmj-r5cp | High — ReDoS | Crafted glob pattern | `npm audit fix` (non-breaking) |
| `qs <6.14.1` | GHSA-6rw7-vpxm-498p | Moderate — DoS | Crafted query string | Same `@kubernetes/client-node` upgrade |
| `tough-cookie <4.1.3` | GHSA-72xf-g2v4-qvf3 | Moderate — Prototype pollution | HTTP response with crafted `Set-Cookie` | Same upgrade |

### Architecture Dependency Risks

| ID | Risk | Description |
|---|---|---|
| DR-01 | **`@kubernetes/client-node` outdated range** — pinned to `^0.21.0` which resolves to `0.21.x`, an unmaintained series | Breaking API changes in `1.x` require migration but the security fix requires the upgrade |
| DR-02 | **`amqplib@0.10.4`** — last major update 2022; no official TypeScript types; community-maintained | Library abandonment risk for core messaging infrastructure |
| DR-03 | **`express@4.19.2`** — Express 5 is now stable; Express 4 receives only security patches | Long-term maintenance risk; future Node.js versions may break Express 4 internals |
| DR-04 | **`mongoose@8.6.2`** — this is a recent version; however, 17 models with no migration tooling means Mongoose schema changes require careful coordination | Operational risk, not a package risk per se |
| DR-05 | **`chaos/package.json`** has its own dependency tree — it may have separate vulnerable packages not covered by the main audit | Run `npm audit` inside `backend/chaos/` separately |

---

## 15. Production Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| PR-01 | **Pod restart destroys production data** via `populateSampleData()` | Certain on every restart | Critical — all `default` tenant history lost | Gate behind `NODE_ENV` (S-04) |
| PR-02 | **Known credential backdoor** via chaos tenant | Certain — credentials in public repo | Critical — unauthorized tenant access | Remove chaos seeding from startup (S-03) |
| PR-03 | **Silent RabbitMQ mock fallback in production** — pipeline operates without durability | Likely if RabbitMQ pod restarts before backend | High — no remediation actions persisted | Hard-fail with `REQUIRE_RABBITMQ=true` (I-01) |
| PR-04 | **Silent Redis mock fallback** — idempotency breaks in multi-instance deployments | Likely if Redis pod restarts | High — duplicate remediation actions | Hard-fail with `REQUIRE_REDIS=true` (S-12) |
| PR-05 | **RCE via `jsonpath-plus`** if Kubernetes labels are user-influenced | Low (internal system) but catastrophic if exploited | Critical | npm upgrade (S-07) |
| PR-06 | **AUDIT_SECRET falls back to "audit-secret"** if env var absent | Possible in misconfigured environments | High — audit trail forgeable | Hard-fail on missing secret (S-05) |
| PR-07 | **`CORS_ORIGIN: "*"`** allows any origin to make authenticated requests | Certain in current k8s deployment | High | Fix configmap (S-06) |
| PR-08 | **No write-concern majority** — MongoDB acknowledgement without quorum | Possible under network partition | Medium — lost writes on primary failure | Configure Mongoose write concern |

---

## 16. Deployment Risks

| ID | Issue | Severity | Solution | Effort |
|---|---|---|---|---|
| DEP-01 | **Duplicate `imagePullPolicy`** in `k8s/deployment.yaml` (lines declare both `Never` and `Always`) — last value wins silently | High | Remove the `Never` line; keep `Always` for production, or better, use an env-specific value | 15 min |
| DEP-02 | **`k8s/secret.yaml` uses `namespace: default`** but `k8s/deployment.yaml` uses `namespace: aira`** — applying the secret to `default` makes it invisible to pods in `aira` | Critical | Change `secret.yaml` namespace to `aira` | 15 min |
| DEP-03 | **`k8s/secret.yaml` contains placeholder values** (`<base64-encoded-mongodb-uri>`) — `kubectl apply` will create a secret with literal placeholder strings | Critical | Document clearly that this is a template; add a `kustomize` or Helm values file for actual deployment | 2 hours |
| DEP-04 | **No `PodDisruptionBudget`** — rolling updates can bring both replicas down simultaneously with `replicas: 2` | Medium | Add PDB with `minAvailable: 1` | 1 hour |
| DEP-05 | **No `HorizontalPodAutoscaler`** — traffic spikes require manual scaling | Medium | Add HPA targeting CPU/memory | 2 hours |
| DEP-06 | **CrashLoop recovery is entirely Kubernetes-native** — the liveness probe restarts the pod on `/health` failure, but if startup itself is slow (e.g., MongoDB cold start), the `initialDelaySeconds: 30` may not be sufficient, causing premature restarts | Medium | Implement a startup probe separate from the liveness probe with higher `failureThreshold` | 1 hour |
| DEP-07 | **`imagePullPolicy: Never` (first entry in deployment.yaml)** implies a local image build is expected — this will fail in any cluster without a local registry | High | Resolved by DEP-01 |
| DEP-08 | **No resource quotas at namespace level** — a single misbehaving tenant could consume all cluster CPU | Medium | Add `ResourceQuota` to the `aira` namespace | 2 hours |
| DEP-09 | **`RABBITMQ_URL` in ConfigMap contains credentials** (`amqp://aira:airapass@aira-rabbitmq:5672`) — credentials belong in a Secret, not a ConfigMap | Critical | Move RABBITMQ_URL to `aira-secrets` Secret | 1 hour |

---

## 17. Testing Coverage

### Coverage Configuration
- **Tool:** Jest 29.7
- **Coverage:** Disabled by default (`collectCoverage: false`)
- **Thresholds (when enabled):** 60% for branches, functions, lines, statements
- **Timeout:** 120 seconds per test (very high — suggests tests with real I/O)

### Test Suite Inventory

| Suite | Location | Type | Dependencies |
|---|---|---|---|
| Phase 1 Integration | `tests/phase1-integration.test.js` | Integration | Real MongoDB |
| Multi-Tenant Isolation | `tests/multi-tenant-isolation.test.js` | Integration | MongoMemoryServer |
| Phase 2 Observability | `tests/phase2-observability.test.js` | Integration | Real Redis? |
| Phase 3 Chaos | `tests/phase3-chaos.test.js` | Integration | Real services |
| Auth Middleware | `tests/middleware/authMiddleware.test.js` | Integration | Real MongoDB |
| Tenant Isolation MW | `tests/middleware/tenantIsolationMiddleware.test.js` | Unit | None |
| Unit tests | `tests/unit/` | Unit | Varies |
| E2E | `tests/e2e/complete-workflow.e2e.test.js` | E2E | All services |
| Load | `tests/load/` | Load | Real services |

### Testing Issues

| ID | Issue | Risk |
|---|---|---|
| T-01 | **Coverage collection is disabled by default** — no CI pipeline can enforce the 60% threshold | High |
| T-02 | **Most "integration" tests require a real MongoDB connection** — they cannot run without a database, making them unsuitable for pre-commit hooks | Medium |
| T-03 | **Chaos test harness in `backend/chaos/` is a completely separate test framework** with its own setup scripts — it is not integrated with Jest and cannot be run from `npm test` | Medium |
| T-04 | **`temp-tests/` files are outside the jest `testMatch` pattern** — they exist but are never run by the test runner | Low |
| T-05 | **E2E tests use hardcoded `localhost:5000`** — they cannot run in CI without a running server | Medium |
| T-06 | **`tests/phase1-integration.test.js` and `tests/integration/phase1-integration.test.js` both exist** — duplicated test file paths; it is unclear which is canonical | Medium |
| T-07 | **Load tests have a 600-second timeout (`test:load`)** — will block CI pipelines for 10 minutes | Low |
| T-08 | **No contract tests or consumer-driven tests** — the API surface has never been tested against an actual consumer | High |

---

## 18. Build Problems

| ID | Issue | Impact | Solution | Effort |
|---|---|---|---|---|
| B-01 | **No CI/CD pipeline configuration found** (no `.github/workflows/`, no `Jenkinsfile`, no `.gitlab-ci.yml`) — there is no automated build, test, or deployment pipeline | Critical | Create GitHub Actions workflow with lint, test, audit, build, push steps | 1 day |
| B-02 | **`Dockerfile` exists but is not analyzed here** — verify it uses a non-root user, multi-stage build, and does not copy `.env` or `node_modules` | High | Review Dockerfile; use `node:18-alpine` as base, multi-stage build | 2 hours |
| B-03 | **`npm audit fix --force` is required for critical CVEs but is flagged as breaking** — there is no automated process to detect when a new CVE requires a breaking dependency upgrade | High | Add `npm audit --audit-level=critical` as a CI gate that fails the build | 2 hours |
| B-04 | **`collectCoverage: false`** means `npm run test:coverage` must be explicitly invoked — no CI build verifies coverage thresholds | Medium | Enable coverage in CI: `npm test -- --coverage` | 1 hour |
| B-05 | **`mongodb-memory-server` in production dependencies** downloads a MongoDB binary during `npm install` in the Docker build — this increases build time and image size significantly | High | Move to `devDependencies`; use `npm install --omit=dev` in Dockerfile | 30 min |
| B-06 | **No `.nvmrc` or `engines` field enforcement** — `package.json` specifies `node >=18` but nothing prevents building with Node 16 | Low | Add `.nvmrc` with `18`; add a Volta pin if using Volta | 30 min |

---

## 19. Recommended Refactoring Order

The following order is derived from dependency relationships, risk reduction impact, and effort ratio. Each step is self-contained.

### Phase 1 — Security Hardening (1–2 days)
1. **Remove chaos tenant seeding from `server.js` startup** (S-03) — 30 min
2. **Gate `populateSampleData()` behind `NODE_ENV !== 'production'`** (S-04, P-03) — 1 hr
3. **Replace all hardcoded secret fallbacks with startup assertions** (S-05) — 2 hrs
4. **Fix `CORS_ORIGIN: "*"` in ConfigMap** (S-06) — 15 min
5. **Fix namespace mismatch between `secret.yaml` and `deployment.yaml`** (DEP-02) — 15 min
6. **Move `RABBITMQ_URL` from ConfigMap to Secret** (DEP-09) — 1 hr
7. **Run `npm audit fix --force` and regression test Kubernetes integration** (S-07 through S-14) — 4–8 hrs

### Phase 2 — Observability and Fallback Safety (1 day)
8. **Add auth or network restriction to `/metrics` and `/health/detailed`** (S-01, S-02, S-11) — 2 hrs
9. **Add Prometheus counter for infrastructure fallback activations** (Q-05) — 2 hrs
10. **Add `REQUIRE_RABBITMQ` and `REQUIRE_REDIS` production flags** (PR-03, PR-04, S-12) — 3 hrs

### Phase 3 — Kubernetes Hardening (1 day)
11. **Remove duplicate `imagePullPolicy`** (DEP-01) — 15 min
12. **Add `PodDisruptionBudget`** (DEP-04) — 1 hr
13. **Add startup probe** (DEP-06) — 1 hr
14. **Add `HorizontalPodAutoscaler`** (DEP-05) — 2 hrs
15. **Add namespace `ResourceQuota`** (DEP-08) — 2 hrs

### Phase 4 — Code Quality and Debt (2–3 days)
16. **Extract `buildTieredDecision()` to service layer** (Q-01) — 4 hrs
17. **Decompose `server.js`** into startup/routes/shutdown modules (Q-02) — 1 day
18. **Remove `ActionLog.js` and migrate all references to `AuditEvent`** (TD-01, DC-01) — 4 hrs
19. **Move `mongodb-memory-server` to devDependencies** (TD-07, B-05, DB-06) — 30 min
20. **Remove `crypto` npm shim** (P-06) — 15 min

### Phase 5 — Testing and CI (1–2 days)
21. **Create GitHub Actions CI pipeline** (B-01) — 1 day
22. **Enable coverage in CI and enforce 60% threshold** (T-01, B-04) — 1 hr
23. **Add `joi` validation schema for signal payloads** (Q-04) — 3 hrs
24. **Standardize error response envelope** (Q-06) — 1 day

### Phase 6 — Architecture Improvements (3–5 days)
25. **Add database migration runner** (TD-08, DB-08) — 1 wk
26. **Add TTL index to `IncidentMemory`** (P-02, DB-02) — 2 hrs
27. **Add compound index `tenantId + correlationId`** on DecisionTrace (P-01, DB-05) — 1 hr
28. **Generate OpenAPI spec from routes** (API-03, FE-03) — 1 day
29. **Consolidate `hashWithSecret` into a shared utility** (DL-01) — 2 hrs

---

## 20. Priority Matrix

### Critical Priority — Fix Before Any Production Deployment

| ID | Issue | Effort |
|---|---|---|
| S-03 | Chaos tenant auto-created with known credentials | 30 min |
| S-04 | Sample data destroys production tenant on every restart | 1 hr |
| S-05 | Hardcoded fallback secrets (`"audit-secret"`, `"change-me-..."`) | 2 hrs |
| S-07/S-08 | RCE and CRLF injection via `@kubernetes/client-node` dependency chain | 4–8 hrs |
| S-06 | `CORS_ORIGIN: "*"` in Kubernetes ConfigMap | 15 min |
| DEP-02 | Secret namespace mismatch (`default` vs `aira`) | 15 min |
| DEP-09 | RabbitMQ credentials in ConfigMap (plaintext) | 1 hr |
| API-04/05 | `/metrics` and `/health/detailed` publicly accessible | 2 hrs |

### High Priority — Fix in First Sprint

| ID | Issue | Effort |
|---|---|---|
| S-09 | Raw secret transmitted in Authorization header | 1 day |
| S-10 | ReDoS via `brace-expansion` | 30 min |
| S-12 | Redis mock fallback silently breaks multi-instance idempotency | 3 hrs |
| B-01 | No CI/CD pipeline | 1 day |
| DB-06 | `mongodb-memory-server` in production dependencies | 30 min |
| DB-07 | No MongoDB write concern | 1 hr |
| Q-01 | Business logic inside route file | 4 hrs |
| TD-01 | Deprecated `ActionLog.js` still used | 4 hrs |
| DEP-01 | Duplicate `imagePullPolicy` in deployment | 15 min |
| FE-02 | No frontend but CORS is wildcard | 15 min |

### Medium Priority — Fix in Second Sprint

| ID | Issue | Effort |
|---|---|---|
| Q-02 | `server.js` 1,000+ line monolith | 1 day |
| P-02 | `IncidentMemory` has no TTL | 2 hrs |
| P-01 | Missing compound index on DecisionTrace | 1 hr |
| Q-04 | No `joi` validation for signal payloads | 3 hrs |
| Q-06 | Inconsistent error response shapes | 1 day |
| DB-08 | No database migration runner | 1 wk |
| T-01 | Coverage disabled by default | 1 hr |
| API-03 | No OpenAPI specification | 1 day |
| DEP-04/05/06 | Missing PDB, HPA, startup probe | 4 hrs |
| DL-01 | HMAC function duplicated across 5 files | 2 hrs |

### Low Priority — Backlog

| ID | Issue | Effort |
|---|---|---|
| FS-01 | 25+ `.md` files at repository root | 2 hrs |
| FS-02 | `backend/logs/` committed to repo | 1 hr |
| DC-03/04 | `temp-tests/`, `archived-issues/` dead directories | 1 hr |
| P-06 | `crypto` npm shim in dependencies | 15 min |
| Q-03 | Feature flags read at module load time | 4 hrs |
| TD-05 | Chaos harness has separate `package.json` | 4 hrs |
| T-07 | Load tests block CI for 10 minutes | 2 hrs |

---

## Appendix A — Vulnerability Summary

| Package | Advisory | Severity | CVSS | Status |
|---|---|---|---|---|
| `jsonpath-plus ≤10.2.0` | GHSA-pppg-cpfq-h7wr | Critical | 9.8 | Unpatched |
| `jsonpath-plus ≤10.2.0` | GHSA-hw8r-x6gr-5gjp | Critical | 9.8 | Unpatched |
| `form-data ≤2.5.5` | GHSA-fjxv-7rqg-78g4 | Critical | — | Unpatched |
| `form-data ≤2.5.5` | GHSA-hmw2-7cc7-3qxx | Critical | — | Unpatched |
| `brace-expansion <1.1.16` | GHSA-3jxr-9vmj-r5cp | High | — | Unpatched |
| `qs <6.14.1` | GHSA-6rw7-vpxm-498p | Moderate | — | Unpatched |
| `tough-cookie <4.1.3` | GHSA-72xf-g2v4-qvf3 | Moderate | — | Unpatched |
| `uuid (transitive) <11.1.1` | GHSA-w5hq-g745-h8pq | Moderate | — | Unpatched |

**Total: 8 vulnerabilities — 4 Critical, 1 High, 3 Moderate**

All 8 are resolved by: `npm audit fix --force` (upgrades `@kubernetes/client-node` to `1.4.0`) + `npm audit fix`.

---

*End of Audit Report — AIRA Repository — 2026-07-22*
