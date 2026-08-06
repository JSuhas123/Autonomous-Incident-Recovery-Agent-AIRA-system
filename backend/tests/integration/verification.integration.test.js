"use strict";

process.env.ARGON2_MEMORY_COST = "256";
process.env.ARGON2_TIME_COST   = "1";
process.env.ARGON2_PARALLELISM = "1";
process.env.AUDIT_SECRET       = "test-audit-secret-32-chars-min!!";
process.env.VERIFICATION_TTL_MS       = "2000";
process.env.VERIFICATION_MAX_ATTEMPTS = "3";

// Mock ONLY runVerificationCheck; preserve parseDomain for instruction-building
jest.mock("../../services/verificationService", () => ({
  ...jest.requireActual("../../services/verificationService"),
  runVerificationCheck: jest.fn(),
}));

const express      = require("express");
const cookieParser = require("cookie-parser");
const mongoose     = require("mongoose");
const request      = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const verificationService = require("../../services/verificationService");

const authRoutes               = require("../../routes/authRoutes");
const serviceRoutes            = require("../../routes/serviceRoutes");
const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");
const User                     = require("../../models/User");
const PasswordCredential       = require("../../models/PasswordCredential");
const Organization             = require("../../models/Organization");
const OrganizationMembership   = require("../../models/OrganizationMembership");
const TenantConfig             = require("../../models/TenantConfig");
const UserSession              = require("../../models/UserSession");
const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");
const Service                  = require("../../models/Service");
const VerificationChallenge    = require("../../models/VerificationChallenge");

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
    VerificationChallenge.createCollection(),
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/services", sessionAuthMiddleware, serviceRoutes);

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

async function registerAndGetCookie(email, org) {
  const res = await request(app).post("/api/v1/auth/register").send({
    fullName: "Test User",
    email,
    password: "SecureService123!",
    organizationName: org,
  });
  expect(res.status).toBe(201);
  const raw = res.headers["set-cookie"];
  return { cookie: (Array.isArray(raw) ? raw : [raw]).join("; ") };
}

async function createService(cookie, overrides = {}) {
  const res = await request(app)
    .post("/api/v1/services")
    .set("Cookie", cookie)
    .send({
      name: "Test Service",
      type: "api",
      environment: "production",
      baseUrl: "https://api.example.com",
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function createChallenge(cookie, serviceId, method = "dns_txt") {
  return request(app)
    .post(`/api/v1/services/${serviceId}/verification/challenge`)
    .set("Cookie", cookie)
    .send({ method });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("Unauthenticated requests", () => {
  test("GET /verification returns 401", async () => {
    const res = await request(app).get("/api/v1/services/aaaaaaaaaaaaaaaaaaaaaaaa/verification");
    expect(res.status).toBe(401);
  });

  test("POST /challenge returns 401", async () => {
    const res = await request(app)
      .post("/api/v1/services/aaaaaaaaaaaaaaaaaaaaaaaa/verification/challenge")
      .send({ method: "dns_txt" });
    expect(res.status).toBe(401);
  });

  test("POST /check returns 401", async () => {
    const res = await request(app)
      .post("/api/v1/services/aaaaaaaaaaaaaaaaaaaaaaaa/verification/check");
    expect(res.status).toBe(401);
  });
});

// ─── Create challenge ─────────────────────────────────────────────────────────

describe("POST /challenge", () => {
  test("creates a dns_txt challenge and returns token + instructions", async () => {
    const { cookie } = await registerAndGetCookie("ch1@x.com", "ChOrg1");
    const svc = await createService(cookie);

    const res = await createChallenge(cookie, svc.id, "dns_txt");
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.method).toBe("dns_txt");
    expect(d.token).toMatch(/^[a-f0-9]{64}$/);
    expect(d.status).toBe("pending");
    expect(d.instructions.host).toMatch(/^_aira-verification\./);
    expect(d.instructions.value).toMatch(/^aira-verification=/);
  });

  test("creates a file challenge with correct URL instructions", async () => {
    const { cookie } = await registerAndGetCookie("ch2@x.com", "ChOrg2");
    const svc = await createService(cookie);

    const res = await createChallenge(cookie, svc.id, "file");
    expect(res.status).toBe(201);
    expect(res.body.data.instructions.url).toBe(
      "https://api.example.com/.well-known/aira-verification.txt"
    );
  });

  test("creates a meta_tag challenge with correct tag instructions", async () => {
    const { cookie } = await registerAndGetCookie("ch3@x.com", "ChOrg3");
    const svc = await createService(cookie);

    const res = await createChallenge(cookie, svc.id, "meta_tag");
    expect(res.status).toBe(201);
    expect(res.body.data.instructions.tag).toMatch(/^<meta name="aira-verification"/);
  });

  test("400 for file method when service has no baseUrl", async () => {
    const { cookie } = await registerAndGetCookie("ch4@x.com", "ChOrg4");
    const svc = await createService(cookie, { baseUrl: undefined, name: "No-URL Svc", type: "database" });

    const res = await createChallenge(cookie, svc.id, "file");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_BASE_URL");
  });

  test("400 for invalid method", async () => {
    const { cookie } = await registerAndGetCookie("ch5@x.com", "ChOrg5");
    const svc = await createService(cookie);

    const res = await createChallenge(cookie, svc.id, "invalid_method");
    expect(res.status).toBe(400);
  });

  test("404 for service belonging to another org", async () => {
    const { cookie: c1 } = await registerAndGetCookie("ch6a@x.com", "ChOrg6A");
    const { cookie: c2 } = await registerAndGetCookie("ch6b@x.com", "ChOrg6B");
    const svc = await createService(c1);

    const res = await createChallenge(c2, svc.id, "dns_txt");
    expect(res.status).toBe(404);
  });

  test("returns existing pending challenge (200) if same method requested again", async () => {
    const { cookie } = await registerAndGetCookie("ch7@x.com", "ChOrg7");
    const svc = await createService(cookie);

    const r1 = await createChallenge(cookie, svc.id, "dns_txt");
    const r2 = await createChallenge(cookie, svc.id, "dns_txt");

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(r1.body.data.token).toBe(r2.body.data.token);
  });

  test("409 if service already verified", async () => {
    const { cookie } = await registerAndGetCookie("ch8@x.com", "ChOrg8");
    const svc = await createService(cookie);
    await Service.findByIdAndUpdate(svc.id, { verificationStatus: "verified" });

    const res = await createChallenge(cookie, svc.id, "dns_txt");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_VERIFIED");
  });
});

// ─── GET /verification ────────────────────────────────────────────────────────

describe("GET /verification", () => {
  test("returns unverified status with null challenge for new service", async () => {
    const { cookie } = await registerAndGetCookie("gv1@x.com", "GvOrg1");
    const svc = await createService(cookie);

    const res = await request(app)
      .get(`/api/v1/services/${svc.id}/verification`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe("unverified");
    expect(res.body.data.challenge).toBeNull();
  });

  test("tenant isolation — 404 for another org's service", async () => {
    const { cookie: c1 } = await registerAndGetCookie("gv2a@x.com", "GvOrg2A");
    const { cookie: c2 } = await registerAndGetCookie("gv2b@x.com", "GvOrg2B");
    const svc = await createService(c1);

    const res = await request(app)
      .get(`/api/v1/services/${svc.id}/verification`)
      .set("Cookie", c2);
    expect(res.status).toBe(404);
  });
});

// ─── POST /check — successful verification ────────────────────────────────────

describe("POST /check — successful verification", () => {
  test("DNS TXT check succeeds and marks service as verified", async () => {
    verificationService.runVerificationCheck.mockResolvedValue({ found: true });

    const { cookie } = await registerAndGetCookie("ck1@x.com", "CkOrg1");
    const svc = await createService(cookie);
    await createChallenge(cookie, svc.id, "dns_txt");

    const res = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/check`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.verificationStatus).toBe("verified");

    const updated = await Service.findById(svc.id);
    expect(updated.verificationStatus).toBe("verified");
    expect(updated.verificationMethod).toBe("dns_txt");
    expect(updated.verifiedAt).not.toBeNull();
  });
});

// ─── POST /check — wrong token ────────────────────────────────────────────────

describe("POST /check — wrong token", () => {
  test("returns 422 with reason when token not found", async () => {
    verificationService.runVerificationCheck.mockResolvedValue({
      found: false,
      reason: "TXT record not found",
    });

    const { cookie } = await registerAndGetCookie("ck2@x.com", "CkOrg2");
    const svc = await createService(cookie);
    await createChallenge(cookie, svc.id, "dns_txt");

    const res = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/check`)
      .set("Cookie", cookie);

    expect(res.status).toBe(422);
    expect(res.body.data.verified).toBe(false);
    expect(res.body.data.reason).toBeTruthy();
    expect(res.body.data.attemptsRemaining).toBe(2); // maxAttempts=3, 1 used
  });
});

// ─── POST /check — too many attempts ─────────────────────────────────────────

describe("POST /check — too many attempts", () => {
  test("429 after exhausting maxAttempts", async () => {
    verificationService.runVerificationCheck.mockResolvedValue({
      found: false, reason: "not found",
    });

    const { cookie } = await registerAndGetCookie("ck3@x.com", "CkOrg3");
    const svc = await createService(cookie);
    await createChallenge(cookie, svc.id, "dns_txt");

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/api/v1/services/${svc.id}/verification/check`)
        .set("Cookie", cookie);
    }

    const res = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/check`)
      .set("Cookie", cookie);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
  });
});

// ─── POST /check — expired challenge ──────────────────────────────────────────

describe("POST /check — expired challenge", () => {
  test("410 when challenge has expired", async () => {
    const { cookie } = await registerAndGetCookie("ck4@x.com", "CkOrg4");
    const svc = await createService(cookie);
    await createChallenge(cookie, svc.id, "dns_txt");

    await VerificationChallenge.updateMany(
      { serviceId: svc.id, status: "pending" },
      { $set: { status: "expired", expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/check`)
      .set("Cookie", cookie);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("CHALLENGE_EXPIRED");
  });
});

// ─── POST /check — no challenge ───────────────────────────────────────────────

describe("POST /check — no challenge", () => {
  test("404 when no challenge exists", async () => {
    const { cookie } = await registerAndGetCookie("ck5@x.com", "CkOrg5");
    const svc = await createService(cookie);

    const res = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/check`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NO_CHALLENGE");
  });
});

// ─── POST /check — tenant isolation ───────────────────────────────────────────

describe("POST /check — tenant isolation", () => {
  test("org B cannot check org A's service", async () => {
    const { cookie: c1 } = await registerAndGetCookie("ck6a@x.com", "CkOrg6A");
    const { cookie: c2 } = await registerAndGetCookie("ck6b@x.com", "CkOrg6B");
    const svc = await createService(c1);
    await createChallenge(c1, svc.id, "dns_txt");

    const res = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/check`)
      .set("Cookie", c2);
    expect(res.status).toBe(404);
  });
});

// ─── POST /regenerate ─────────────────────────────────────────────────────────

describe("POST /regenerate", () => {
  test("issues a new token and invalidates the old one", async () => {
    const { cookie } = await registerAndGetCookie("rg1@x.com", "RgOrg1");
    const svc = await createService(cookie);

    const r1 = await createChallenge(cookie, svc.id, "dns_txt");
    const oldToken = r1.body.data.token;

    const r2 = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/regenerate`)
      .set("Cookie", cookie)
      .send({ method: "dns_txt" });

    expect(r2.status).toBe(201);
    expect(r2.body.data.token).not.toBe(oldToken);

    const old = await VerificationChallenge.findOne({ token: oldToken });
    expect(old.status).toBe("expired");
  });

  test("409 if service already verified", async () => {
    const { cookie } = await registerAndGetCookie("rg2@x.com", "RgOrg2");
    const svc = await createService(cookie);
    await Service.findByIdAndUpdate(svc.id, { verificationStatus: "verified" });

    const res = await request(app)
      .post(`/api/v1/services/${svc.id}/verification/regenerate`)
      .set("Cookie", cookie)
      .send({ method: "dns_txt" });
    expect(res.status).toBe(409);
  });
});

// ─── SSRF guard direct unit tests ────────────────────────────────────────────

describe("ssrfGuard.assertSafeHost", () => {
  const { assertSafeHost } = require("../../utils/ssrfGuard");

  test("throws SSRF_BLOCKED for localhost", async () => {
    await expect(assertSafeHost("localhost")).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  test("throws SSRF_DNS_FAILED for unresolvable host", async () => {
    await expect(
      assertSafeHost("this-host-does-not-exist-aira-test-12345.invalid")
    ).rejects.toMatchObject({ code: "SSRF_DNS_FAILED" });
  });
});

describe("ssrfGuard.safeFetch — private IP rejection", () => {
  const { safeFetch } = require("../../utils/ssrfGuard");

  const BLOCKED_URLS = [
    "http://localhost/test",
    "http://127.0.0.1/test",
  ];

  BLOCKED_URLS.forEach((url) => {
    test(`blocks ${url}`, async () => {
      await expect(safeFetch(url)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    });
  });
});
