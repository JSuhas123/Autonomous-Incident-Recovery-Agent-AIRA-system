"use strict";

process.env.ARGON2_MEMORY_COST = "256";
process.env.ARGON2_TIME_COST   = "1";
process.env.ARGON2_PARALLELISM = "1";
process.env.AUDIT_SECRET       = "test-audit-secret-32-chars-min!!";

// Mock the execution service so we can control HTTP check results
jest.mock("../../services/monitoring/monitorExecutionService", () => ({
  ...jest.requireActual("../../services/monitoring/monitorExecutionService"),
  executeCheck: jest.fn(),
}));

const express      = require("express");
const cookieParser = require("cookie-parser");
const mongoose     = require("mongoose");
const request      = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const execService = require("../../services/monitoring/monitorExecutionService");

const authRoutes               = require("../../routes/authRoutes");
const serviceRoutes            = require("../../routes/serviceRoutes");
const { topLevelRouter: monitorTopLevelRoutes } = require("../../routes/monitorRoutes");
const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");

const User                   = require("../../models/User");
const PasswordCredential     = require("../../models/PasswordCredential");
const Organization           = require("../../models/Organization");
const OrganizationMembership = require("../../models/OrganizationMembership");
const TenantConfig           = require("../../models/TenantConfig");
const UserSession            = require("../../models/UserSession");
const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");
const Service                = require("../../models/Service");
const Monitor                = require("../../models/Monitor");
const MonitorCheck           = require("../../models/MonitorCheck");

let replSet;
let app;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { serverSelectionTimeoutMS: 30000 });

  await Promise.all([
    User.createCollection(),
    PasswordCredential.createCollection(),
    Organization.createCollection(),
    OrganizationMembership.createCollection(),
    TenantConfig.createCollection(),
    UserSession.createCollection(),
    AuthenticationAuditEvent.createCollection(),
    Service.createCollection(),
    Monitor.createCollection(),
    MonitorCheck.createCollection(),
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/services", sessionAuthMiddleware, serviceRoutes);
  app.use("/api/v1/monitors", sessionAuthMiddleware, monitorTopLevelRoutes);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  });
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

afterEach(async () => {
  const cols = mongoose.connection.collections;
  await Promise.all(Object.values(cols).map((c) => c.deleteMany({})));
  jest.resetAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(agent, email = "monitor@example.com") {
  await agent.post("/api/v1/auth/register").send({
    fullName: "Test User",
    email,
    password: "SecureMonitor123!",
    organizationName: "TestOrg-" + email.split("@")[0],
  });
}

async function createService(agent) {
  const res = await agent.post("/api/v1/services").send({
    name: "My Service",
    type: "website",
    environment: "production",
    baseUrl: "https://example.com",
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

function makeFakeResult(overrides = {}) {
  return {
    status:          "healthy",
    statusCode:      200,
    responseTimeMs:  120,
    responseSizeBytes: 1024,
    dnsTimeMs:       10,
    tcpTimeMs:       25,
    tlsTimeMs:       50,
    firstByteTimeMs: 80,
    sslValid:        true,
    sslDaysRemaining: 60,
    contentMatched:  null,
    redirectCount:   0,
    errorCode:       null,
    sanitizedErrorMessage: null,
    checkerRegion:   "default",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Monitor CRUD", () => {
  test("creates a monitor for a service", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const res = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Homepage check",
      type: "https",
      url:  "https://example.com",
    });
    expect(res.status).toBe(201);
    expect(res.body.monitor.name).toBe("Homepage check");
    expect(res.body.monitor.type).toBe("https");
    expect(res.body.monitor.enabled).toBe(true);
    expect(res.body.monitor.lastStatus).toBe("unknown");
  });

  test("lists monitors for a service", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check A", type: "https", url: "https://example.com",
    });
    await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check B", type: "http", url: "http://example.com",
    });

    const res = await agent.get(`/api/v1/services/${svc.id}/monitors`);
    expect(res.status).toBe(200);
    expect(res.body.monitors).toHaveLength(2);
  });

  test("gets a single monitor via top-level route", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check A", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    const res = await agent.get(`/api/v1/monitors/${monitorId}`);
    expect(res.status).toBe(200);
    expect(res.body.monitor.id).toBe(monitorId);
  });

  test("updates monitor fields", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Old Name", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    const patchRes = await agent.patch(`/api/v1/monitors/${monitorId}`).send({
      name: "New Name", intervalSeconds: 120,
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.monitor.name).toBe("New Name");
    expect(patchRes.body.monitor.intervalSeconds).toBe(120);
  });

  test("pauses and resumes a monitor", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check A", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    const pauseRes = await agent.post(`/api/v1/monitors/${monitorId}/pause`);
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.monitor.enabled).toBe(false);

    const resumeRes = await agent.post(`/api/v1/monitors/${monitorId}/resume`);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.monitor.enabled).toBe(true);
  });

  test("rejects double-pause", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check A", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    await agent.post(`/api/v1/monitors/${monitorId}/pause`);
    const res = await agent.post(`/api/v1/monitors/${monitorId}/pause`);
    expect(res.status).toBe(400);
  });

  test("deletes a monitor and its checks", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check A", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    const delRes = await agent.delete(`/api/v1/monitors/${monitorId}`);
    expect(delRes.status).toBe(204);

    const getRes = await agent.get(`/api/v1/monitors/${monitorId}`);
    expect(getRes.status).toBe(404);
  });
});

describe("Monitor test-run endpoint", () => {
  test("returns real result without persisting", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    execService.executeCheck.mockResolvedValue(makeFakeResult());

    const res = await agent.post(`/api/v1/monitors/${monitorId}/test`);
    expect(res.status).toBe(200);
    expect(res.body.result.status).toBe("healthy");
    expect(res.body.result.statusCode).toBe(200);

    // Check was not persisted
    const checkCount = await MonitorCheck.countDocuments();
    expect(checkCount).toBe(0);
  });

  test("test result reflects timeout error", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Slow", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    execService.executeCheck.mockResolvedValue(makeFakeResult({
      status: "down", statusCode: null, responseTimeMs: null,
      errorCode: "ETIMEDOUT", sanitizedErrorMessage: "Request timed out",
    }));

    const res = await agent.post(`/api/v1/monitors/${monitorId}/test`);
    expect(res.status).toBe(200);
    expect(res.body.result.status).toBe("down");
    expect(res.body.result.errorCode).toBe("ETIMEDOUT");
  });
});

describe("Monitor checks history", () => {
  test("returns empty check list initially", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const createRes = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Check", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    const res = await agent.get(`/api/v1/monitors/${monitorId}/checks`);
    expect(res.status).toBe(200);
    expect(res.body.checks).toHaveLength(0);
  });
});

describe("Organization isolation", () => {
  test("user from org A cannot read org B's monitors", async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    await registerAndLogin(agentA, "userA@example.com");
    await registerAndLogin(agentB, "userB@example.com");

    const svcA = await createService(agentA);
    const createRes = await agentA.post(`/api/v1/services/${svcA.id}/monitors`).send({
      name: "A's monitor", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    // Org B cannot access Org A's monitor
    const res = await agentB.get(`/api/v1/monitors/${monitorId}`);
    expect(res.status).toBe(403);
  });

  test("user from org A cannot delete org B's monitors", async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    await registerAndLogin(agentA, "userA2@example.com");
    await registerAndLogin(agentB, "userB2@example.com");

    const svcA = await createService(agentA);
    const createRes = await agentA.post(`/api/v1/services/${svcA.id}/monitors`).send({
      name: "A's monitor", type: "https", url: "https://example.com",
    });
    const monitorId = createRes.body.monitor.id;

    const res = await agentB.delete(`/api/v1/monitors/${monitorId}`);
    expect(res.status).toBe(403);
  });
});

describe("Input validation", () => {
  test("rejects invalid URL scheme", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const res = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Bad", type: "https", url: "ftp://example.com",
    });
    expect(res.status).toBe(400);
  });

  test("rejects interval below minimum", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const res = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Too fast", type: "https", url: "https://example.com", intervalSeconds: 5,
    });
    expect(res.status).toBe(400);
  });

  test("strips Authorization header from requestHeaders", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    const res = await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Sneaky", type: "https", url: "https://example.com",
      requestHeaders: { Authorization: "Bearer secret", "X-Custom": "value" },
    });
    expect(res.status).toBe(201);
    expect(res.body.monitor.requestHeaders).not.toHaveProperty("Authorization");
    expect(res.body.monitor.requestHeaders).toHaveProperty("X-Custom", "value");
  });
});

describe("Cross-service monitor listing", () => {
  test("GET /api/v1/monitors returns monitors from all services", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svc = await createService(agent);

    await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Mon 1", type: "https", url: "https://example.com",
    });
    await agent.post(`/api/v1/services/${svc.id}/monitors`).send({
      name: "Mon 2", type: "http", url: "http://example.com",
    });

    const res = await agent.get("/api/v1/monitors");
    expect(res.status).toBe(200);
    expect(res.body.monitors.length).toBeGreaterThanOrEqual(2);
  });
});
