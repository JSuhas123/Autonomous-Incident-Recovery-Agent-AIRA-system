# AIRA — Deployment Checklist

Work through these in order. Check each item off when done.

---

## Pre-deployment

- [ ] Repository is pushed to GitHub
- [ ] No `.env` files committed (check: `git ls-files | grep "\.env$"` should return nothing)
- [ ] No real secrets in committed code
- [ ] Corrupted files deleted (`backend/{`, `backend/console.error(e))`)
- [ ] Debug dump files deleted (`jest-config-out.txt`, etc.)

## Build verification

- [ ] Backend installs: `cd backend && npm ci`
- [ ] Frontend installs: `cd frontend && npm ci`
- [ ] Frontend builds: `cd frontend && npm run build` (check `dist/` is created)
- [ ] Docker build passes: `docker build .`
- [ ] `docker compose config` shows no YAML errors

## MongoDB Atlas

- [ ] Atlas cluster created (M0 free tier)
- [ ] Database user `aira` created with `readWriteAnyDatabase`
- [ ] Network access: `0.0.0.0/0` added (with awareness of the security risk)
- [ ] Connection string copied (format: `mongodb+srv://aira:PASS@cluster.mongodb.net/decision_engine`)

## Railway — Backend

- [ ] Railway project created
- [ ] GitHub repo connected
- [ ] Root `Dockerfile` detected
- [ ] `railway.toml` present and correct
- [ ] Environment variables set:
  - [ ] `NODE_ENV=production`
  - [ ] `MONGODB_URI` (Atlas)
  - [ ] `AUDIT_SECRET` (32+ chars)
  - [ ] `CORS_ORIGIN` (set after Vercel step — placeholder OK for now)
  - [ ] `INTERNAL_API_TOKEN` (32+ chars)
  - [ ] `DISABLE_MEMORY_DB=true`
  - [ ] `ALLOW_IN_MEMORY_LOCKS=false`
  - [ ] `DEMO_TENANT_ID=demo`
  - [ ] `DEMO_KEY_ID=demo-key-1`
  - [ ] `DEMO_API_SECRET` (your chosen demo secret)
  - [ ] `ENABLE_AUTO_REMEDIATION=false`
  - [ ] `ENABLE_KUBERNETES_EXECUTOR=false`
- [ ] Backend deployed successfully (green in Railway dashboard)
- [ ] Backend public URL obtained: `https://_______________`

## Railway — Redis

- [ ] Redis plugin added to Railway project
- [ ] `REDIS_URL` auto-injected into backend service

## Railway — RabbitMQ

- [ ] RabbitMQ plugin added to Railway project
- [ ] `RABBITMQ_URL` auto-injected into backend service

## Health verification

- [ ] `GET <BACKEND_URL>/health/live` → 200 `{"status":"alive",...}`
- [ ] `GET <BACKEND_URL>/health/ready` → 200 `{"status":"ready",...}`
- [ ] `GET <BACKEND_URL>/health` → 200

## Demo tenant

- [ ] `seed-production-demo.js` run with correct env vars
- [ ] Script exited 0
- [ ] Tenant ID and Key ID confirmed in output

## Vercel — Frontend

- [ ] Vercel project created
- [ ] Root directory set to `frontend`
- [ ] Framework detected as Vite
- [ ] Environment variables set:
  - [ ] `VITE_API_URL` = Railway backend URL
  - [ ] `VITE_DEMO_MODE=true`
  - [ ] `VITE_DEFAULT_TENANT_ID=demo`
- [ ] Frontend deployed successfully
- [ ] Frontend public URL obtained: `https://_______________`

## CORS update

- [ ] Railway `CORS_ORIGIN` updated to Vercel domain
- [ ] Backend redeployed
- [ ] API call from browser succeeds (no CORS error in browser console)

## End-to-end verification

- [ ] Frontend loads at Vercel URL
- [ ] Login page appears
- [ ] Login with demo credentials succeeds (tenant=`demo`, key=`demo-key-1`, secret=`DEMO_API_SECRET`)
- [ ] Dashboard loads after login
- [ ] Incident list page loads
- [ ] Demo banner visible (if `VITE_DEMO_MODE=true`)
- [ ] Submit a simulated incident via POST `/api/v1/tenants/demo/signals`
- [ ] Incident appears in dashboard
- [ ] Decision trace created
- [ ] Audit record persists
- [ ] No real infrastructure action executed

## Security

- [ ] No secrets visible in browser console
- [ ] No secrets visible in Railway logs (check for AUDIT_SECRET, DEMO_API_SECRET)
- [ ] `/api/v1/policy/*` requires valid auth headers
- [ ] `/health/live` does not expose secrets

## Documentation

- [ ] README updated with live Frontend URL and Backend URL
- [ ] DEPLOYMENT.md reviewed and accurate
