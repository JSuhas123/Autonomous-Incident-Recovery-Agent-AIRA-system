"use strict";
/**
 * Approvals Endpoints Integration Tests
 *
 * Tests GET /api/v1/tenants/:tenantId/approvals
 * and  GET /api/v1/tenants/:tenantId/approvals/queue/stats
 * using session-cookie authentication (browser flow).
 */
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");

const authService = require("../../services/identity/authService");
const { getCookieName } = require("../../services/identity/sessionService");
const ApprovalRequest = require("../../models/ApprovalRequest");

let replSet;
let app;

// ─── build a minimal app matching server.js architecture ─────────────────────
async function buildApp() {
  const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");
  const { requireOrgAccess } = require("../../middleware/orgAuthMiddleware");
  const approvalRoutes = require("../../routes/approvalRoutes");
  const authMiddleware = require("../../middleware/authMiddleware");

  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser());

  testApp.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  // Machine-only signal ingestion (unchanged)
  testApp.post(
    "/api/v1/tenants/:tenantId/signals",
    authMiddleware,
    (req, res) => res.json({ received: true }),
  );

  const browserTenantAuth = [sessionAuthMiddleware, requireOrgAccess()];
  testApp.use(
    "/api/v1/tenants/:tenantId/approvals",
    browserTenantAuth,
    approvalRoutes,
  );

  // eslint-disable-next-line no-unused-vars
  testApp.use((err, req, res, _next) => {
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code || undefined,
    });
  });

  return testApp;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function createUserSession(email, orgName) {
  await authService.register({
    fullName: "Test User",
    email,
    password: "TestPassword123!",
    organizationName: orgName,
  });
  return authService.login({ email, password: "TestPassword123!" });
}

function buildCookieHeader(rawToken) {
  return `${getCookieName()}=${rawToken}`;
}

// ─── lifecycle ───────────────────────────────────────────────────────────────
beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri();
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET =
    "test-secret-64-chars-minimum-for-hmac-sha256-derivation-aira";

  await mongoose.connect(process.env.MONGODB_URI);

  const db = mongoose.connection.db;
  for (const name of [
    "users",
    "organizations",
    "organizationmemberships",
    "passwordcredentials",
    "usersessions",
    "tenantconfigs",
    "authenticationauditevents",
    "approval_requests",
  ]) {
    try { await db.createCollection(name); } catch (_) { /* exists */ }
  }

  app = await buildApp();
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

afterEach(async () => {
  for (const name of [
    "users",
    "organizations",
    "organizationmemberships",
    "passwordcredentials",
    "usersessions",
    "tenantconfigs",
    "authenticationauditevents",
    "approval_requests",
  ]) {
    await mongoose.connection.collection(name).deleteMany({});
  }
});

// ─── GET /approvals ───────────────────────────────────────────────────────────
describe("GET /api/v1/tenants/:tenantId/approvals", () => {
  let sessionCookie;
  let tenantId;

  beforeEach(async () => {
    const result = await createUserSession("approvals@test.com", "ApprovalOrg");
    tenantId = result.organization.tenantId;
    sessionCookie = buildCookieHeader(result.rawToken);
  });

  // test 1
  test("valid session + matching tenant + no approvals → 200 with empty pending array", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals`)
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("pending");
    expect(Array.isArray(res.body.pending)).toBe(true);
    expect(res.body.pending).toHaveLength(0);
    expect(res.body.pendingCount).toBe(0);
  });

  // test 2
  test("valid session + matching tenant + approval records → 200 with data", async () => {
    await ApprovalRequest.create({
      tenantId,
      decisionId: "dec-001",
      action: "restart_pod",
      reason: "high cpu",
      confidence: 0.7,
      resource: "api-pod",
      status: "pending",
    });

    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals`)
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.pending).toHaveLength(1);
    expect(res.body.pendingCount).toBe(1);
    expect(res.body.pending[0]).toHaveProperty("approvalId");
    expect(res.body.pending[0].action).toBe("restart_pod");
  });

  // test 5
  test("missing session → 401", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals`);

    expect(res.status).toBe(401);
  });

  // test 6
  test("wrong tenant → 403", async () => {
    const res = await request(app)
      .get("/api/v1/tenants/wrong_tenant_xyz/approvals")
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(403);
    expect(["CROSS_TENANT_ACCESS", "TENANT_NOT_FOUND"]).toContain(res.body.code);
  });

  // test 7
  test("malformed query parameter → 400", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals?limit=not_a_number`)
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  // test 10
  test("no Authorization/HMAC headers required — session cookie is sufficient", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals`)
      .set("Cookie", sessionCookie);
    // Must not require machine auth headers
    expect(res.body.code).not.toBe("MISSING_AUTH_HEADER");
    expect(res.status).toBe(200);
  });
});

// ─── GET /approvals/queue/stats ───────────────────────────────────────────────
describe("GET /api/v1/tenants/:tenantId/approvals/queue/stats", () => {
  let sessionCookie;
  let tenantId;

  beforeEach(async () => {
    const result = await createUserSession("stats@test.com", "StatsOrg");
    tenantId = result.organization.tenantId;
    sessionCookie = buildCookieHeader(result.rawToken);
  });

  // test 3
  test("valid session + empty queue → 200 with zero-valued stats", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals/queue/stats`)
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("queue");
    const q = res.body.queue;
    expect(q.pending).toBe(0);
    expect(q.approved).toBe(0);
    expect(q.rejected).toBe(0);
    expect(q.expired).toBe(0);
    expect(q.total).toBe(0);
  });

  // test 4
  test("populated queue → stats reflect correct counts", async () => {
    await ApprovalRequest.create([
      { tenantId, decisionId: "d1", action: "restart_pod", reason: "r", confidence: 0.7, resource: "pod1", status: "pending" },
      { tenantId, decisionId: "d2", action: "restart_pod", reason: "r", confidence: 0.7, resource: "pod2", status: "approved" },
      { tenantId, decisionId: "d3", action: "restart_pod", reason: "r", confidence: 0.7, resource: "pod3", status: "rejected" },
    ]);

    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals/queue/stats`)
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(200);
    const q = res.body.queue;
    expect(q.pending).toBe(1);
    expect(q.approved).toBe(1);
    expect(q.rejected).toBe(1);
    expect(q.expired).toBe(0);
    expect(q.total).toBe(3);
  });

  // test 5
  test("missing session → 401", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals/queue/stats`);

    expect(res.status).toBe(401);
  });

  // test 6
  test("wrong tenant → 403", async () => {
    const res = await request(app)
      .get("/api/v1/tenants/wrong_tenant_xyz/approvals/queue/stats")
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(403);
  });

  // test 8
  test("no approval records for tenant → stats 200 with zeros (no 500)", async () => {
    // Different tenant's approvals must not contaminate counts
    await ApprovalRequest.create({
      tenantId: "other-tenant",
      decisionId: "d-other",
      action: "restart_pod",
      reason: "r",
      confidence: 0.7,
      resource: "pod",
      status: "pending",
    });

    const res = await request(app)
      .get(`/api/v1/tenants/${tenantId}/approvals/queue/stats`)
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.queue.total).toBe(0);
    expect(res.body.queue.pending).toBe(0);
  });
});

// ─── machine ingestion route regression ──────────────────────────────────────
// test 9
describe("Machine ingestion routes remain unaffected", () => {
  test("POST /signals without Authorization still requires machine auth (not session)", async () => {
    const res = await request(app)
      .post("/api/v1/tenants/some_tenant/signals")
      .send({ data: 1 });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_AUTH_HEADER");
  });
});
