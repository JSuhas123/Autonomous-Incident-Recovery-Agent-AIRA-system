"use strict";
/**
 * Route Protection Tests
 *
 * Verifies the auth boundary between browser session routes and machine HMAC routes
 * under /api/v1/tenants/:tenantId.
 *
 * Architecture under test:
 *   app.post  /tenants/:id/signals       authMiddleware → machine only
 *   app.post  /tenants/:id/actions/:a/dry-run authMiddleware → machine only
 *   app.use   /tenants/:id               browserTenantAuth → session + org check
 */
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let replSet;
let app;

// ─── test app mirrors real server.js architecture ───────────────────────────
async function buildApp() {
  const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");
  const { requireOrgAccess } = require("../../middleware/orgAuthMiddleware");
  const authMiddleware = require("../../middleware/authMiddleware");
  const DecisionTrace = require("../../models/DecisionTrace");

  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser());

  // Preflight: return 204 before any auth runs
  testApp.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  // Public health
  testApp.get("/health", (req, res) => res.json({ status: "ok" }));

  // MACHINE routes — registered first with explicit verb+path
  // authMiddleware requires Authorization + X-Timestamp → returns MISSING_AUTH_HEADER when absent
  testApp.post(
    "/api/v1/tenants/:tenantId/signals",
    authMiddleware,
    (req, res) => res.json({ received: true, tenantId: req.tenant.id })
  );
  testApp.post(
    "/api/v1/tenants/:tenantId/actions/:id/dry-run",
    authMiddleware,
    (req, res) => res.json({ dryRun: true })
  );

  // BROWSER routes — registered after machine routes
  const browserTenantAuth = [sessionAuthMiddleware, requireOrgAccess()];
  const decisionsRouter = express.Router();
  decisionsRouter.get("/decisions", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const decisions = await DecisionTrace.find({ tenantId: req.auth.tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ decisions, total: decisions.length });
  });
  testApp.use("/api/v1/tenants/:tenantId", browserTenantAuth, decisionsRouter);

  return testApp;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const authService = require("../../services/identity/authService");
const { getCookieName } = require("../../services/identity/sessionService");

// Register then login; return the full login result including rawToken
async function createUserSession(email, orgName) {
  await authService.register({
    fullName: "Test User",
    email,
    password: "TestPassword123!",
    organizationName: orgName,
  });
  return authService.login({ email, password: "TestPassword123!" });
}

// Build the Cookie header string from a raw session token
function buildCookieHeader(rawToken) {
  return `${getCookieName()}=${rawToken}`;
}

// ─── lifecycle ───────────────────────────────────────────────────────────────
beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri();
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-secret-64-chars-minimum-for-hmac-sha256-derivation-aira";

  await mongoose.connect(process.env.MONGODB_URI);

  const db = mongoose.connection.db;
  for (const name of [
    "users", "organizations", "organizationmemberships", "passwordcredentials",
    "usersessions", "tenantconfigs", "authenticationauditevents", "decisiontraces",
  ]) {
    try { await db.createCollection(name); } catch (_) { /* already exists */ }
  }

  app = await buildApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

afterEach(async () => {
  for (const name of [
    "users", "organizations", "organizationmemberships",
    "passwordcredentials", "usersessions", "tenantconfigs", "authenticationauditevents",
  ]) {
    await mongoose.connection.collection(name).deleteMany({});
  }
});

// ─── browser session route tests ─────────────────────────────────────────────
describe("GET /api/v1/tenants/:tenantId/decisions — browser session auth", () => {
  let sessionCookie;
  let tenantId;

  beforeEach(async () => {
    // login() returns { rawToken, session, csrfToken, user, organization, membership }
    const loginResult = await createUserSession("dash@example.com", "DashOrg");
    tenantId = loginResult.organization.tenantId;
    sessionCookie = buildCookieHeader(loginResult.rawToken);
  });

  test("valid session + correct tenant → 200 with decisions array", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/decisions?limit=10`)
      .set("Cookie", sessionCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("decisions");
    expect(Array.isArray(res.body.decisions)).toBe(true);
  });

  test("no session → 401, code is session-related (not MISSING_AUTH_HEADER)", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/decisions?limit=10`);
    expect(res.status).toBe(401);
    expect(res.body.code).not.toBe("MISSING_AUTH_HEADER");
    expect(["NOT_AUTHENTICATED", "SESSION_EXPIRED", "SESSION_REVOKED"]).toContain(res.body.code);
  });

  test("wrong tenant → 403", async () => {
    const res = await request(app)
      .get("/api/v1/tenants/wrong_tenant_xyz/decisions?limit=10")
      .set("Cookie", sessionCookie);
    expect(res.status).toBe(403);
    expect(["CROSS_TENANT_ACCESS", "TENANT_NOT_FOUND"]).toContain(res.body.code);
  });

  test("no Authorization header with valid session → 200 (machine header not required)", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/decisions`)
      .set("Cookie", sessionCookie);
    // No Authorization, X-Signature, X-Timestamp — must still succeed
    expect(res.body.code).not.toBe("MISSING_AUTH_HEADER");
    expect(res.status).toBe(200);
  });
});

// ─── machine HMAC route tests ─────────────────────────────────────────────────
describe("POST /api/v1/tenants/:tenantId/signals — machine HMAC auth", () => {
  test("no Authorization header → 401 MISSING_AUTH_HEADER", async () => {
    const res = await request(app)
      .post("/api/v1/tenants/some_tenant/signals")
      .send({ errorRate: 0.9 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_AUTH_HEADER");
  });
});

describe("POST /api/v1/tenants/:tenantId/actions/:id/dry-run — machine HMAC auth", () => {
  test("no Authorization header → 401 MISSING_AUTH_HEADER", async () => {
    const res = await request(app)
      .post("/api/v1/tenants/some_tenant/actions/abc/dry-run")
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_AUTH_HEADER");
  });
});

// ─── OPTIONS preflight ────────────────────────────────────────────────────────
describe("OPTIONS preflight", () => {
  test("OPTIONS /tenants/:id/signals → 204, not intercepted by auth", async () => {
    const res = await request(app)
      .options("/api/v1/tenants/some_tenant/signals");
    expect(res.status).toBe(204);
  });

  test("OPTIONS /tenants/:id/decisions → 204", async () => {
    const res = await request(app)
      .options("/api/v1/tenants/some_tenant/decisions");
    expect(res.status).toBe(204);
  });
});

// ─── public health ────────────────────────────────────────────────────────────
describe("Public health endpoint", () => {
  test("GET /health → 200 without any auth", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});
