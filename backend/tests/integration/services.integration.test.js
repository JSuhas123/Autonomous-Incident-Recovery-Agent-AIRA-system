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
const serviceRoutes            = require("../../routes/serviceRoutes");
const dashboardRoutes          = require("../../routes/dashboardRoutes");
const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");
const User                     = require("../../models/User");
const PasswordCredential       = require("../../models/PasswordCredential");
const Organization             = require("../../models/Organization");
const OrganizationMembership   = require("../../models/OrganizationMembership");
const TenantConfig             = require("../../models/TenantConfig");
const UserSession              = require("../../models/UserSession");
const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");
const Service                  = require("../../models/Service");

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
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/services", sessionAuthMiddleware, serviceRoutes);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndGetCookie(email = "svc@example.com", org = "SvcOrg") {
  const res = await request(app).post("/api/v1/auth/register").send({
    fullName: "SvcUser",
    email,
    password: "SecureService123!",
    organizationName: org,
  });
  expect(res.status).toBe(201);
  const raw = res.headers["set-cookie"];
  return { cookie: (Array.isArray(raw) ? raw : [raw]).join("; "), csrfToken: res.body.csrfToken };
}

const VALID_SERVICE = {
  name: "My API",
  type: "api",
  environment: "production",
  baseUrl: "https://api.example.com",
  description: "Main production API",
  tags: ["v2", "production"],
};

// ─── POST /api/v1/services ────────────────────────────────────────────────────

describe("POST /api/v1/services", () => {
  test("401 without session", async () => {
    const res = await request(app).post("/api/v1/services").send(VALID_SERVICE);
    expect(res.status).toBe(401);
  });

  test("201 creates service with correct org/tenant isolation", async () => {
    const { cookie } = await registerAndGetCookie();
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send(VALID_SERVICE);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const svc = res.body.data;
    expect(svc.name).toBe("My API");
    expect(svc.type).toBe("api");
    expect(svc.environment).toBe("production");
    expect(svc.verificationStatus).toBe("unverified");
    expect(svc.monitoringStatus).toBe("not_configured");
    expect(svc.status).toBe("active");
    expect(svc.organizationId).toBeDefined();
  });

  test("400 on missing required fields", async () => {
    const { cookie } = await registerAndGetCookie("miss@example.com", "MissOrg");
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send({ name: "Incomplete" }); // missing type, environment
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("400 on localhost URL", async () => {
    const { cookie } = await registerAndGetCookie("lh@example.com", "LhOrg");
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send({ ...VALID_SERVICE, baseUrl: "http://localhost:3000" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_URL");
  });

  test("400 on private IP URL", async () => {
    const { cookie } = await registerAndGetCookie("priv@example.com", "PrivOrg");
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send({ ...VALID_SERVICE, baseUrl: "http://192.168.1.1/api" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_URL");
  });

  test("400 on ftp:// URL", async () => {
    const { cookie } = await registerAndGetCookie("ftp@example.com", "FtpOrg");
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send({ ...VALID_SERVICE, baseUrl: "ftp://files.example.com" });
    expect(res.status).toBe(400);
  });

  test("409 on duplicate name within same org", async () => {
    const { cookie } = await registerAndGetCookie("dup@example.com", "DupOrg");
    await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send(VALID_SERVICE);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_SERVICE");
  });

  test("createdBy is derived from session, not body", async () => {
    const { cookie } = await registerAndGetCookie("cbcheck@example.com", "CbOrg");
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send({ ...VALID_SERVICE, createdBy: "000000000000000000000000" }); // injected value
    expect(res.status).toBe(201);
    // createdBy must NOT equal the injected value
    expect(res.body.data.createdBy).not.toBe("000000000000000000000000");
  });
});

// ─── GET /api/v1/services ─────────────────────────────────────────────────────

describe("GET /api/v1/services", () => {
  test("401 without session", async () => {
    const res = await request(app).get("/api/v1/services");
    expect(res.status).toBe(401);
  });

  test("returns empty list for fresh org", async () => {
    const { cookie } = await registerAndGetCookie("list0@example.com", "ListOrg0");
    const res = await request(app).get("/api/v1/services").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  test("returns only services belonging to the authenticated org", async () => {
    const { cookie: c1 } = await registerAndGetCookie("orgA@example.com", "OrgA");
    const { cookie: c2 } = await registerAndGetCookie("orgB@example.com", "OrgB");

    await request(app).post("/api/v1/services").set("Cookie", c1).send({ ...VALID_SERVICE, name: "OrgA Service" });
    await request(app).post("/api/v1/services").set("Cookie", c2).send({ ...VALID_SERVICE, name: "OrgB Service" });

    const resA = await request(app).get("/api/v1/services").set("Cookie", c1);
    expect(resA.body.data).toHaveLength(1);
    expect(resA.body.data[0].name).toBe("OrgA Service");

    const resB = await request(app).get("/api/v1/services").set("Cookie", c2);
    expect(resB.body.data).toHaveLength(1);
    expect(resB.body.data[0].name).toBe("OrgB Service");
  });

  test("search filter works case-insensitively", async () => {
    const { cookie } = await registerAndGetCookie("srch@example.com", "SrchOrg");
    await request(app).post("/api/v1/services").set("Cookie", cookie).send({ ...VALID_SERVICE, name: "Alpha API" });
    await request(app).post("/api/v1/services").set("Cookie", cookie).send({ ...VALID_SERVICE, name: "Beta Site", type: "website" });

    const res = await request(app).get("/api/v1/services?search=alpha").set("Cookie", cookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Alpha API");
  });

  test("pagination works", async () => {
    const { cookie } = await registerAndGetCookie("page@example.com", "PageOrg");
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/v1/services")
        .set("Cookie", cookie)
        .send({ ...VALID_SERVICE, name: `Service ${i}`, baseUrl: null });
    }
    const res = await request(app).get("/api/v1/services?page=1&limit=3").set("Cookie", cookie);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.pages).toBe(2);
  });
});

// ─── GET /api/v1/services/:serviceId ─────────────────────────────────────────

describe("GET /api/v1/services/:serviceId", () => {
  test("404 for service belonging to another org", async () => {
    const { cookie: c1 } = await registerAndGetCookie("rd1@example.com", "Rd1Org");
    const { cookie: c2 } = await registerAndGetCookie("rd2@example.com", "Rd2Org");

    const createRes = await request(app).post("/api/v1/services").set("Cookie", c1).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    const res = await request(app).get(`/api/v1/services/${svcId}`).set("Cookie", c2);
    expect(res.status).toBe(404);
  });

  test("200 for service owned by the session org", async () => {
    const { cookie } = await registerAndGetCookie("rd3@example.com", "Rd3Org");
    const createRes = await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    const res = await request(app).get(`/api/v1/services/${svcId}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(svcId);
  });
});

// ─── PATCH /api/v1/services/:serviceId ───────────────────────────────────────

describe("PATCH /api/v1/services/:serviceId", () => {
  test("updates allowed fields", async () => {
    const { cookie } = await registerAndGetCookie("upd@example.com", "UpdOrg");
    const createRes = await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/services/${svcId}`)
      .set("Cookie", cookie)
      .send({ description: "Updated description" });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe("Updated description");
  });

  test("cross-org update returns 404", async () => {
    const { cookie: c1 } = await registerAndGetCookie("upd1@example.com", "Upd1Org");
    const { cookie: c2 } = await registerAndGetCookie("upd2@example.com", "Upd2Org");

    const createRes = await request(app).post("/api/v1/services").set("Cookie", c1).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/services/${svcId}`)
      .set("Cookie", c2)
      .send({ description: "Hacked" });
    expect(res.status).toBe(404);
  });
});

// ─── Pause / Resume ───────────────────────────────────────────────────────────

describe("POST pause / resume", () => {
  test("pause sets status to paused", async () => {
    const { cookie } = await registerAndGetCookie("pause@example.com", "PauseOrg");
    const createRes = await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    const res = await request(app).post(`/api/v1/services/${svcId}/pause`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("paused");
  });

  test("resume sets status back to active", async () => {
    const { cookie } = await registerAndGetCookie("resume@example.com", "ResumeOrg");
    const createRes = await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    await request(app).post(`/api/v1/services/${svcId}/pause`).set("Cookie", cookie);
    const res = await request(app).post(`/api/v1/services/${svcId}/resume`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
  });
});

// ─── DELETE (archive) ─────────────────────────────────────────────────────────

describe("DELETE /api/v1/services/:serviceId", () => {
  test("soft-archives the service (status = archived, archivedAt set)", async () => {
    const { cookie } = await registerAndGetCookie("arch@example.com", "ArchOrg");
    const createRes = await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    const res = await request(app).delete(`/api/v1/services/${svcId}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("archived");
    expect(res.body.data.archivedAt).not.toBeNull();
  });

  test("cross-org archive returns 404", async () => {
    const { cookie: c1 } = await registerAndGetCookie("arch1@example.com", "Arch1Org");
    const { cookie: c2 } = await registerAndGetCookie("arch2@example.com", "Arch2Org");

    const createRes = await request(app).post("/api/v1/services").set("Cookie", c1).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;

    const res = await request(app).delete(`/api/v1/services/${svcId}`).set("Cookie", c2);
    expect(res.status).toBe(404);
  });
});

// ─── Dashboard onboarding serviceAdded ───────────────────────────────────────

describe("Dashboard onboarding serviceAdded", () => {
  test("false before any service is created", async () => {
    const { cookie } = await registerAndGetCookie("ob0@example.com", "Ob0Org");
    const res = await request(app).get("/api/v1/dashboard/onboarding").set("Cookie", cookie);
    expect(res.body.data.serviceAdded).toBe(false);
  });

  test("true after a service is created", async () => {
    const { cookie } = await registerAndGetCookie("ob1@example.com", "Ob1Org");
    await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const res = await request(app).get("/api/v1/dashboard/onboarding").set("Cookie", cookie);
    expect(res.body.data.serviceAdded).toBe(true);
  });

  test("false after the only service is archived", async () => {
    const { cookie } = await registerAndGetCookie("ob2@example.com", "Ob2Org");
    const createRes = await request(app).post("/api/v1/services").set("Cookie", cookie).send(VALID_SERVICE);
    const svcId = createRes.body.data.id;
    await request(app).delete(`/api/v1/services/${svcId}`).set("Cookie", cookie);

    const res = await request(app).get("/api/v1/dashboard/onboarding").set("Cookie", cookie);
    expect(res.body.data.serviceAdded).toBe(false);
  });
});

// ─── URL validation unit-level ────────────────────────────────────────────────

describe("URL validator (via POST)", () => {
  let cookie;
  beforeEach(async () => {
    ({ cookie } = await registerAndGetCookie("url@example.com", "UrlOrg"));
  });

  const BLOCKED_URLS = [
    "http://localhost/api",
    "http://127.0.0.1/api",
    "http://192.168.0.1",
    "http://10.0.0.1",
    "http://169.254.169.254",
    "ftp://files.example.com",
  ];

  BLOCKED_URLS.forEach((url) => {
    test(`rejects ${url}`, async () => {
      const res = await request(app)
        .post("/api/v1/services")
        .set("Cookie", cookie)
        .send({ ...VALID_SERVICE, baseUrl: url, name: `Test ${url}` });
      expect(res.status).toBe(400);
    });
  });

  test("accepts valid https URL", async () => {
    const res = await request(app)
      .post("/api/v1/services")
      .set("Cookie", cookie)
      .send({ ...VALID_SERVICE, baseUrl: "https://api.acme.com/v1", name: "Valid URL Svc" });
    expect(res.status).toBe(201);
  });
});
