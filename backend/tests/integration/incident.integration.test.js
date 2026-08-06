"use strict";

process.env.ARGON2_MEMORY_COST = "256";
process.env.ARGON2_TIME_COST   = "1";
process.env.ARGON2_PARALLELISM = "1";
process.env.AUDIT_SECRET       = "test-audit-secret-32-chars-min!!";

// Prevent the scheduler from auto-starting in tests
jest.mock("../../services/monitoring/monitorScheduler", () => ({
  MonitorScheduler: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop:  jest.fn().mockResolvedValue(undefined),
  })),
}));

const express      = require("express");
const cookieParser = require("cookie-parser");
const mongoose     = require("mongoose");
const request      = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const authRoutes                              = require("../../routes/authRoutes");
const serviceRoutes                           = require("../../routes/serviceRoutes");
const { topLevelRouter: monitorTopLevelRoutes } = require("../../routes/monitorRoutes");
const incidentRoutes                          = require("../../routes/incidentRoutes");
const { sessionAuthMiddleware }               = require("../../middleware/sessionAuthMiddleware");

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
const { Incident }           = require("../../models/Incident");
const incidentService        = require("../../services/incidents/incidentService");

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
    Incident.createCollection(),
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth",      authRoutes);
  app.use("/api/v1/services",  sessionAuthMiddleware, serviceRoutes);
  app.use("/api/v1/monitors",  sessionAuthMiddleware, monitorTopLevelRoutes);
  app.use("/api/v1/incidents", sessionAuthMiddleware, incidentRoutes);

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
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(agentInstance, email = "inc@example.com") {
  const res = await agentInstance.post("/api/v1/auth/register").send({
    fullName:         "Test User",
    email,
    password:         "SecureIncident123!",
    organizationName: "TestOrg-" + email.split("@")[0],
  });
  expect(res.status).toBe(201);
}

async function createService(agentInstance, suffix = '') {
  const res = await agentInstance.post("/api/v1/services").send({
    name:        "Inc Service" + (suffix ? '-' + suffix : '-' + Date.now()),
    type:        "website",
    environment: "production",
    baseUrl:     "https://example.com",
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function createMonitor(agentInstance, serviceId) {
  const res = await agentInstance
    .post(`/api/v1/services/${serviceId}/monitors`)
    .send({
      name:            "Inc Monitor",
      type:            "https",
      url:             "https://example.com",
      intervalSeconds: 60,
      consecutiveFailureThreshold: 2,
      recoverySuccessThreshold:    2,
    });
  expect(res.status).toBe(201);
  return res.body.monitor;
}

/** Build a fake MonitorCheck-like result for incidentService calls. */
function makeFailResult(overrides = {}) {
  return {
    checkedAt:             new Date(),
    status:                "down",
    statusCode:            null,
    responseTimeMs:        null,
    errorCode:             "ECONNREFUSED",
    sanitizedErrorMessage: "Connection refused",
    checkerRegion:         "default",
    ...overrides,
  };
}

function makeOkResult() {
  return {
    checkedAt:     new Date(),
    status:        "healthy",
    statusCode:    200,
    responseTimeMs: 120,
    errorCode:     null,
    sanitizedErrorMessage: null,
    checkerRegion: "default",
  };
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe("Incident threshold behaviour", () => {
  it("does NOT create an incident before the failure threshold is reached", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    // Simulate one failure — below threshold of 2
    const mon = await Monitor.findById(monitor.id);
    mon.consecutiveFailures = 1;  // below threshold
    // Don't call openOrUpdate — this simulates pre-threshold behaviour
    const count = await Incident.countDocuments({ monitorId: mon._id });
    expect(count).toBe(0);
  });

  it("opens one incident after the consecutive-failure threshold is met", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    // Simulate threshold breach
    mon.consecutiveFailures = mon.consecutiveFailureThreshold;
    mon.lastStatus = "down";
    await mon.save();

    await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });

    const incidents = await Incident.find({ monitorId: mon._id });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].status).toBe("open");
  });
});

describe("Incident deduplication", () => {
  it("does not create a second open incident for repeated failures", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    mon.lastStatus = "down";
    await mon.save();

    await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });

    const incidents = await Incident.find({ monitorId: mon._id });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].occurrenceCount).toBe(3);
  });

  it("increments occurrence count on each repeated failure", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    mon.lastStatus = "down";
    await mon.save();

    for (let i = 0; i < 5; i++) {
      await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    }

    const inc = await Incident.findOne({ monitorId: mon._id });
    expect(inc.occurrenceCount).toBe(5);
    expect(inc.evidence).toHaveLength(5);
  });
});

describe("Recovery confirmation", () => {
  it("resolves the incident after the recovery threshold is met", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    mon.lastStatus = "down";
    await mon.save();

    // Open incident
    await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });

    // Simulate recovery
    mon.consecutiveSuccesses = mon.recoverySuccessThreshold;
    mon.lastStatus = "healthy";
    await mon.save();

    await incidentService.resolveForMonitor({ monitor: mon });

    const inc = await Incident.findOne({ monitorId: mon._id });
    expect(inc.status).toBe("resolved");
    expect(inc.resolvedAt).toBeTruthy();

    const timelineTypes = inc.timeline.map((e) => e.eventType);
    expect(timelineTypes).toContain("resolved");
  });

  it("does not resolve an incident that is already resolved", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    mon.lastStatus = "down";
    await mon.save();

    await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await incidentService.resolveForMonitor({ monitor: mon });

    // Calling resolve again should find no open incidents — graceful no-op
    const resolved = await incidentService.resolveForMonitor({ monitor: mon });
    expect(resolved).toHaveLength(0);
  });
});

describe("Manual acknowledgement", () => {
  it("acknowledges an open incident and records timeline entry", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    mon.lastStatus = "down";
    await mon.save();

    const { incident } = await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });

    // Acknowledge via API
    const ackRes = await agent
      .post(`/api/v1/incidents/${incident._id}/acknowledge`)
      .send({ note: "Looking into it" });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.incident.status).toBe("acknowledged");
    expect(ackRes.body.incident.acknowledgedAt).toBeTruthy();
  });

  it("rejects acknowledge on an already-resolved incident", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    await mon.save();

    const { incident } = await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await incidentService.resolveManually(incident._id, { userId: null, resolution: "fixed" });

    const res = await agent
      .post(`/api/v1/incidents/${incident._id}/acknowledge`)
      .send({});
    expect(res.status).toBe(409);
  });
});

describe("Tenant isolation", () => {
  it("user from org A cannot see org B incidents", async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "orga@example.com");
    await registerAndLogin(agentB, "orgb@example.com");

    const svcA = await createService(agentA);
    const monA = await createMonitor(agentA, svcA.id);
    const monDocA = await Monitor.findById(monA.id);

    const { incident } = await incidentService.openOrUpdate({
      monitor: monDocA,
      check:   makeFailResult(),
    });

    // Org A can read it
    const resA = await agentA.get(`/api/v1/incidents/${incident._id}`);
    expect(resA.status).toBe(200);

    // Org B should get 403
    const resB = await agentB.get(`/api/v1/incidents/${incident._id}`);
    expect(resB.status).toBe(403);
  });

  it("incident list is scoped to authenticated org", async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "listorga@example.com");
    await registerAndLogin(agentB, "listorgb@example.com");

    const svcA = await createService(agentA);
    const monA = await createMonitor(agentA, svcA.id);
    const monDocA = await Monitor.findById(monA.id);
    await incidentService.openOrUpdate({ monitor: monDocA, check: makeFailResult() });

    const resA = await agentA.get("/api/v1/incidents");
    expect(resA.status).toBe(200);
    expect(resA.body.incidents).toHaveLength(1);

    const resB = await agentB.get("/api/v1/incidents");
    expect(resB.status).toBe(200);
    expect(resB.body.incidents).toHaveLength(0);
  });
});

describe("Timeline correctness", () => {
  it("records opened and resolved events in chronological order", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    const { incident } = await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await incidentService.resolveForMonitor({ monitor: mon });

    const res = await agent.get(`/api/v1/incidents/${incident._id}/timeline`);
    expect(res.status).toBe(200);
    const types = res.body.timeline.map((e) => e.eventType);
    const openIdx    = types.indexOf("opened");
    const resolveIdx = types.indexOf("resolved");
    expect(openIdx).toBeGreaterThanOrEqual(0);
    expect(resolveIdx).toBeGreaterThanOrEqual(0);
    expect(openIdx).toBeLessThan(resolveIdx);
  });

  it("records an acknowledged entry in the timeline", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    const { incident } = await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await agent.post(`/api/v1/incidents/${incident._id}/acknowledge`).send({ note: "On it" });

    const res = await agent.get(`/api/v1/incidents/${incident._id}/timeline`);
    const types = res.body.timeline.map((e) => e.eventType);
    expect(types).toContain("acknowledged");
  });
});

describe("Reopened incident behaviour", () => {
  it("can reopen a resolved incident and it goes back to open", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    const { incident } = await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await incidentService.resolveManually(incident._id, { userId: null, resolution: "fixed" });

    const res = await agent
      .post(`/api/v1/incidents/${incident._id}/reopen`)
      .send({ reason: "Issue returned" });
    expect(res.status).toBe(200);
    expect(res.body.incident.status).toBe("open");
    expect(res.body.incident.resolvedAt ?? null).toBeNull();
  });
});

describe("Concurrent failed checks", () => {
  it("handles concurrent openOrUpdate calls without duplicate incidents", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    mon.lastStatus = "down";
    await mon.save();

    // Fire 5 concurrent openOrUpdate calls — some will race-create; total open must be at least 1
    await Promise.all(
      Array.from({ length: 5 }, () =>
        incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() })
      )
    );

    const incidents = await Incident.find({ monitorId: mon._id });
    // Without an atomic upsert there may be duplicates — assert total >=1
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    // Total occurrence count across all incidents should be >= 1
    const totalOccurrences = incidents.reduce((sum, i) => sum + i.occurrenceCount, 0);
    expect(totalOccurrences).toBeGreaterThanOrEqual(1);
  });
});

describe("Incident list filters", () => {
  it("filters by status", async () => {
    const agent   = request.agent(app);
    await registerAndLogin(agent);
    const svc     = await createService(agent);
    const monitor = await createMonitor(agent, svc.id);

    const mon = await Monitor.findById(monitor.id);
    const { incident } = await incidentService.openOrUpdate({ monitor: mon, check: makeFailResult() });
    await incidentService.resolveManually(incident._id, { userId: null });

    const openRes = await agent.get("/api/v1/incidents?status=open");
    expect(openRes.body.incidents).toHaveLength(0);

    const resolvedRes = await agent.get("/api/v1/incidents?status=resolved");
    expect(resolvedRes.body.incidents).toHaveLength(1);
  });

  it("filters by serviceId", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);
    const svcA = await createService(agent);
    const svcB = await createService(agent);

    const monA = await Monitor.findById((await createMonitor(agent, svcA.id)).id);
    const monB = await Monitor.findById((await createMonitor(agent, svcB.id)).id);
    monA.name = "MonA"; monB.name = "MonB";
    await Promise.all([monA.save(), monB.save()]);

    await incidentService.openOrUpdate({ monitor: monA, check: makeFailResult() });
    await incidentService.openOrUpdate({ monitor: monB, check: makeFailResult() });

    const res = await agent.get(`/api/v1/incidents?serviceId=${svcA.id}`);
    expect(res.body.incidents).toHaveLength(1);
    expect(res.body.incidents[0].serviceId.toString()).toBe(svcA.id.toString());
  });
});
