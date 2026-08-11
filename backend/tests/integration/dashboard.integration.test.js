"use strict";

process.env.ARGON2_MEMORY_COST = "256";
process.env.ARGON2_TIME_COST   = "1";
process.env.ARGON2_PARALLELISM = "1";
process.env.AUDIT_SECRET       = "test-audit-secret-32-chars-min!!";

const express      = require("express");
const cookieParser = require("cookie-parser");
const mongoose     = require("mongoose");
const request      = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const authRoutes               = require("../../routes/authRoutes");
const dashboardRoutes          = require("../../routes/dashboardRoutes");
const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");
const User                     = require("../../models/User");
const PasswordCredential       = require("../../models/PasswordCredential");
const Organization             = require("../../models/Organization");
const OrganizationMembership   = require("../../models/OrganizationMembership");
const TenantConfig             = require("../../models/TenantConfig");
const UserSession              = require("../../models/UserSession");
const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");
const DecisionTrace            = require("../../models/DecisionTrace");
const Service                  = require("../../models/Service");
const { getCookieName }        = require("../../services/identity/sessionService");

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
    DecisionTrace.createCollection(),
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/dashboard", sessionAuthMiddleware, dashboardRoutes);

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

async function registerAndLogin(email = "onboard@example.com", org = "OnboardOrg") {
  const regRes = await request(app).post("/api/v1/auth/register").send({
    fullName: "Onboard User",
    email,
    password: "SecureOnboard123!",
    organizationName: org,
  });
  expect(regRes.status).toBe(201);

  const raw = regRes.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.join("; ");
}

describe("GET /api/v1/dashboard/onboarding", () => {
  test("401 without session", async () => {
    const res = await request(app).get("/api/v1/dashboard/onboarding");
    expect(res.status).toBe(401);
    expect(["NOT_AUTHENTICATED", "SESSION_EXPIRED", "SESSION_REVOKED"]).toContain(res.body.code);
  });

  test("200 with valid session — fresh workspace has expected shape", async () => {
    const cookie = await registerAndLogin();
    const res = await request(app)
      .get("/api/v1/dashboard/onboarding")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.workspaceCreated).toBe(true);
    expect(data.serviceAdded).toBe(false);
    expect(data.domainVerified).toBe(false);
    expect(data.monitoringConnected).toBe(false);
    expect(data.firstEventReceived).toBe(false);
    expect(data.firstInsightGenerated).toBe(false);
    expect(data.nextRecommendedAction).toBe("ADD_SERVICE");
  });

  test("serviceAdded becomes true when a Service exists for the organization", async () => {
    const cookie = await registerAndLogin("svc@example.com", "SvcOrg");

    const org = await Organization.findOne({ name: "SvcOrg" });
    expect(org).not.toBeNull();

    await Service.create({
      organizationId: org._id,
      tenantId: org.tenantId,
      name: "payments-api",
      slug: "payments-api",
      type: "api",
      environment: "production",
      status: "active",
      createdBy: (await require("../../models/User").findOne({ email: "svc@example.com" }))._id,
    });

    const res = await request(app)
      .get("/api/v1/dashboard/onboarding")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.serviceAdded).toBe(true);
    expect(res.body.data.nextRecommendedAction).toBe("CONNECT_MONITORING");
  });

  test("response contains no invented performance metrics", async () => {
    const cookie = await registerAndLogin("clean@example.com", "CleanOrg");
    const res = await request(app)
      .get("/api/v1/dashboard/onboarding")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // No uptime, recovery time, or incident counts should appear
    expect(body).not.toMatch(/uptime/i);
    expect(body).not.toMatch(/recoveryTime/i);
    expect(body).not.toMatch(/incidentCount/i);
  });
});
