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
