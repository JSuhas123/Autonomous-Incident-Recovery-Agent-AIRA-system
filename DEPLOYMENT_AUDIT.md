# DEPLOYMENT AUDIT — AIRA

Generated: 2026-08-06

---

## What already works

- Express backend with full route registration (`server.js`)
- MongoDB via Mongoose (connection, models, retry logic)
- Redis via `redis` npm package (distributed locks, health service)
- RabbitMQ via `amqplib` (queue service)
- CORS reads from `CORS_ORIGIN` environment variable (comma-separated allowlist)
- Auth middleware: HMAC-SHA256 tenant/key-based authentication on all `/api/v1/tenants/*` routes
- Kill switch middleware, sanitization middleware, confidence middleware
- Feature flags controlled entirely by environment variables
- Startup validator (`config/startupValidator.js`) fails fast on missing required vars
- Graceful shutdown: `SIGINT`/`SIGTERM` handlers present
- Dockerfile: non-root `node` user, `npm ci --only=production`, correct entrypoint
- Frontend: Vite + React + TypeScript, `npm run build` outputs to `dist/`
- Frontend router: `createBrowserRouter` (React Router v6), requires SPA rewrite for page refresh
- `VITE_API_URL` wired in `frontend/src/api/client.ts`

---

## What blocks deployment

| # | Blocker | File | Fix |
|---|---------|------|-----|
| 1 | `/health` returns HTTP 503 when `safeMode` is active (Redis down / multi-instance). Railway health check fails. | `backend/server.js` | Add `/health/live` (always 200) and `/health/ready`; fix `/health` to not return 503 for safeMode |
| 2 | Dockerfile HEALTHCHECK polls `/health` — same 503 problem | `Dockerfile` | Change to `/health/live` |
| 3 | No `.gitignore` at repo root | — | Create root `.gitignore` |
| 4 | `frontend/.env` committed with `VITE_API_URL=http://localhost:5000` | `frontend/.env` | Add to `.gitignore`; create `frontend/.env.example` |
| 5 | `frontend/src/api/client.ts` falls back to `localhost:5000` in production | `frontend/src/api/client.ts` | Throw clear error if missing in production |
| 6 | Corrupted/accidental files in backend root | `backend/{`, `backend/console.error(e))` | Delete |
| 7 | Debug dump files committed | `backend/jest-config-out.txt` etc. | Delete and add to `.gitignore` |
| 8 | RabbitMQ docker-compose uses `guest` account | `docker-compose.yml` | Switch to `aira` user |
| 9 | No `vercel.json` — React Router deep links 404 on refresh | — | Create `vercel.json` with SPA rewrite |
| 10 | No `railway.toml` — Railway does not know health-check path or start command | — | Create `railway.toml` |
| 11 | `seed-demo-tenant.js` refuses to run in `NODE_ENV=production` | `backend/scripts/seed-demo-tenant.js` | Create `seed-production-demo.js` without NODE_ENV guard |
| 12 | No demo banner in frontend | — | Add `DemoBanner` component, show when `VITE_DEMO_MODE=true` |
| 13 | `/api/v1/policy`, `/api/v1/effectiveness`, `/api/v1/confidence`, `/api/v1/execution`, `/api/v1/reports` routes lack auth middleware | `backend/server.js` | These are server-side aggregation routes with no tenant context. Add `internalTokenGuard` to mutating endpoints minimum. |

---

## Files that need changes

```
backend/server.js               — add /health/live, /health/ready; fix /health status code
Dockerfile                      — change HEALTHCHECK to /health/live
docker-compose.yml              — RabbitMQ user aira, healthcheck path
backend/package.json            — add seed:production-demo script
frontend/src/api/client.ts      — production guard for missing VITE_API_URL
frontend/src/components/layout/AppLayout.tsx  — add DemoBanner
README.md                       — add Live Demo section
```

## Files that need creation

```
.gitignore
.env.example
backend/.env.example            (update existing)
frontend/.env.example
vercel.json
railway.toml
backend/scripts/seed-production-demo.js
DEPLOYMENT.md
DEPLOYMENT_CHECKLIST.md
```

## Files to delete

```
backend/{
backend/console.error(e))
backend/jest-config-out.txt
backend/jest-full-config.txt
backend/jest_config_dump.txt
```

---

## Environment variables required

### Backend (Railway)

| Variable | Required | Secret | Notes |
|----------|----------|--------|-------|
| `NODE_ENV` | Yes | No | `production` |
| `PORT` | Auto-set by Railway | No | Railway injects this |
| `MONGODB_URI` | Yes | Yes | Atlas connection string |
| `REDIS_URL` | Yes | Yes | Railway Redis URL |
| `RABBITMQ_URL` | Yes | Yes | Railway RabbitMQ URL |
| `AUDIT_SECRET` | Yes | Yes | Min 32 chars random string |
| `CORS_ORIGIN` | Yes | No | Vercel frontend domain |
| `INTERNAL_API_TOKEN` | Recommended | Yes | Protects /metrics, /health/detailed |
| `SAFE_MODE` | Yes (demo) | No | `true` |
| `DISABLE_MEMORY_DB` | Yes | No | `true` |
| `ALLOW_IN_MEMORY_LOCKS` | Yes | No | `false` |
| `LOG_LEVEL` | No | No | `info` |
| `OPENAI_API_KEY` | No | Yes | Leave empty to skip AI analysis |
| `DEMO_TENANT_ID` | Yes | No | `demo` |
| `DEMO_KEY_ID` | Yes | No | `demo-key-1` |
| `DEMO_API_SECRET` | Yes | Yes | Min 32 chars random string |

### Frontend (Vercel)

| Variable | Required | Secret | Notes |
|----------|----------|--------|-------|
| `VITE_API_URL` | Yes | No | Backend Railway URL |
| `VITE_DEMO_MODE` | No | No | `true` to show demo banner |
| `VITE_DEFAULT_TENANT_ID` | No | No | `demo` |

---

## Risks and assumptions

1. **Railway single-instance**: `NODE_INSTANCE_ID` is not set → `safeMode` will NOT activate unless Redis goes down. This is correct for single-instance Railway deployment.
2. **RabbitMQ on Railway**: Railway offers managed RabbitMQ via plugin. The `RABBITMQ_URL` env var will be auto-injected — use it directly.
3. **MongoDB Atlas network access**: Railway IPs are dynamic. For the demo, `0.0.0.0/0` allowlist is needed with a warning. Restrict after confirming IP.
4. **Auth is API-key HMAC only**: No user-level auth/JWT. Dashboard users share the demo API key. Document as demo limitation.
5. **SAFE_MODE env var**: The current code does not read `process.env.SAFE_MODE`. Safe mode activates when Redis is down in multi-instance. For demo safety, `ENABLE_AUTO_REMEDIATION` and `ENABLE_KUBERNETES_EXECUTOR` must remain `false` (default).
