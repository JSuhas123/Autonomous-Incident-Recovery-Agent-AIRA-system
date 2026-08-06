"use strict";

process.env.ARGON2_MEMORY_COST     = "256";
process.env.ARGON2_TIME_COST       = "1";
process.env.ARGON2_PARALLELISM     = "1";
process.env.AUDIT_SECRET           = "test-audit-secret-32-chars-min!!";
process.env.INTEGRATION_SECRET_KEY = "test-integration-secret-key-32ch";

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

const authRoutes        = require("../../routes/authRoutes");
const integrationRoutes = require("../../routes/integrationRoutes");
const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");

const User                    = require("../../models/User");
const PasswordCredential      = require("../../models/PasswordCredential");
const Organization            = require("../../models/Organization");
const OrganizationMembership  = require("../../models/OrganizationMembership");
const TenantConfig            = require("../../models/TenantConfig");
const UserSession             = require("../../models/UserSession");
const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");
const { IntegrationConnection } = require("../../models/IntegrationConnection");

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
    IntegrationConnection.createCollection(),
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth",        authRoutes);
  app.use("/api/v1/integrations", integrationRoutes);
  app.use("/api/v1/integration-definitions", (req, res, next) => {
    req.url = "/definitions" + req.url.replace(/^\/?/, "/").replace(/^\/\//, "/");
    integrationRoutes(req, res, next);
  });

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

async function registerAndLogin(agentInstance, email = "integ@example.com") {
  const res = await agentInstance.post("/api/v1/auth/register").send({
    fullName:         "Test User",
    email,
    password:         "SecureInteg123!",
    organizationName: "IntegOrg-" + email.split("@")[0] + Date.now(),
  });
  expect(res.status).toBe(201);
}

// ═════════════════════════════════════════════════════════════════════════════
// CATALOGUE
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/v1/integration-definitions", () => {
  it("returns catalogue without auth", async () => {
    const res = await request(app).get("/api/v1/integration-definitions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.definitions)).toBe(true);
    expect(res.body.definitions.length).toBeGreaterThan(0);
  });

  it("includes at least 4 available providers", async () => {
    const res = await request(app).get("/api/v1/integration-definitions");
    const available = res.body.definitions.filter((d) => d.availabilityStatus === "available");
    expect(available.length).toBeGreaterThanOrEqual(4);
  });

  it("coming_soon providers are present", async () => {
    const res = await request(app).get("/api/v1/integration-definitions");
    const coming = res.body.definitions.filter((d) => d.availabilityStatus === "coming_soon");
    expect(coming.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION CRUD
// ═════════════════════════════════════════════════════════════════════════════

describe("Integration connections", () => {
  it("requires auth to list connections", async () => {
    const res = await request(app).get("/api/v1/integrations/connections");
    expect(res.status).toBe(401);
  });

  it("creates a webhook_incoming connection", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent);

    const res = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming",
      name:     "My Incoming Webhook",
    });
    expect(res.status).toBe(201);
    expect(res.body.integration).toBeDefined();
    expect(res.body.integration.provider).toBe("webhook_incoming");
    expect(res.body.integration.status).toBe("connected");
  });

  it("does not return encryptedSecretReference in response", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "nosecret@example.com");

    const create = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming",
      name:     "Webhook",
      secret:   "my-hmac-secret",
    });
    expect(create.status).toBe(201);
    expect(create.body.integration.encryptedSecretReference).toBeUndefined();
    expect(create.body.integration.hasSecret).toBe(true);
  });

  it("creates a webhook_outgoing connection with targetUrl", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "out@example.com");

    const res = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_outgoing",
      name:     "Outgoing Webhook",
      nonSecretConfig: { targetUrl: "https://httpbin.org/post" },
    });
    expect(res.status).toBe(201);
    expect(res.body.integration.nonSecretConfig.targetUrl).toBe("https://httpbin.org/post");
  });

  it("rejects coming_soon provider with 422", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "cs@example.com");

    const res = await agent.post("/api/v1/integrations/connections").send({
      provider: "pagerduty",
      name:     "PagerDuty",
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/coming soon/i);
    expect(res.body.availabilityStatus).toBe("coming_soon");
  });

  it("rejects unknown provider with 422", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "unk@example.com");

    const res = await agent.post("/api/v1/integrations/connections").send({
      provider: "totally_fake_provider",
      name:     "Fake",
    });
    expect(res.status).toBe(422);
  });

  it("lists only own org connections", async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "orgA@example.com");
    await registerAndLogin(agentB, "orgB@example.com");

    await agentA.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "A Webhook",
    });

    const resB = await agentB.get("/api/v1/integrations/connections");
    expect(resB.status).toBe(200);
    expect(resB.body.integrations).toHaveLength(0);
  });

  it("prevents cross-org access by ID", async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await registerAndLogin(agentA, "crossA@example.com");
    await registerAndLogin(agentB, "crossB@example.com");

    const create = await agentA.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "A private webhook",
    });
    const id = create.body.integration.id;

    const res = await agentB.get(`/api/v1/integrations/connections/${id}`);
    expect(res.status).toBe(403);
  });

  it("patches a connection name", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "patch@example.com");

    const create = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "Old name",
    });
    const id = create.body.integration.id;

    const patch = await agent.patch(`/api/v1/integrations/connections/${id}`).send({ name: "New name" });
    expect(patch.status).toBe(200);
    expect(patch.body.integration.name).toBe("New name");
  });

  it("disables a connection", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "disable@example.com");

    const create = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "To disable",
    });
    const id = create.body.integration.id;

    const res = await agent.post(`/api/v1/integrations/connections/${id}/disable`);
    expect(res.status).toBe(200);
    expect(res.body.integration.status).toBe("disabled");
    expect(res.body.integration.disabledAt).toBeTruthy();
  });

  it("returns 400 when disabling an already-disabled connection", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "dis2@example.com");

    const create = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "To disable twice",
    });
    const id = create.body.integration.id;

    await agent.post(`/api/v1/integrations/connections/${id}/disable`);
    const res = await agent.post(`/api/v1/integrations/connections/${id}/disable`);
    expect(res.status).toBe(400);
  });

  it("rotates the secret", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "rotate@example.com");

    const create = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "Rotate me", secret: "old-secret",
    });
    const id = create.body.integration.id;

    const res = await agent.post(`/api/v1/integrations/connections/${id}/rotate-secret`).send({ secret: "new-secret" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("deletes a connection", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "del@example.com");

    const create = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "Delete me",
    });
    const id = create.body.integration.id;

    const del = await agent.delete(`/api/v1/integrations/connections/${id}`);
    expect(del.status).toBe(204);

    const get = await agent.get(`/api/v1/integrations/connections/${id}`);
    expect(get.status).toBe(404);
  });

  it("returns 404 on non-existent connection", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "notfound@example.com");

    const fakeId = new mongoose.Types.ObjectId();
    const res = await agent.get(`/api/v1/integrations/connections/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid ObjectId", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "badid@example.com");

    const res = await agent.get("/api/v1/integrations/connections/not-an-id");
    expect(res.status).toBe(400);
  });

  it("tests a webhook_incoming connection (always passes)", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "test@example.com");

    const create = await agent.post("/api/v1/integrations/connections").send({
      provider: "webhook_incoming", name: "Test Webhook",
    });
    const id = create.body.integration.id;

    const res = await agent.post(`/api/v1/integrations/connections/${id}/test`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
