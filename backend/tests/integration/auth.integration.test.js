"use strict";

// Fast Argon2 params must be set before any module loads the service
process.env.ARGON2_MEMORY_COST = "256";
process.env.ARGON2_TIME_COST   = "1";
process.env.ARGON2_PARALLELISM = "1";
process.env.AUDIT_SECRET       = "test-audit-secret-32-chars-min!!";

const express       = require("express");
const cookieParser  = require("cookie-parser");
const mongoose      = require("mongoose");
const request       = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const authRoutes             = require("../../routes/authRoutes");
const User                   = require("../../models/User");
const PasswordCredential     = require("../../models/PasswordCredential");
const Organization           = require("../../models/Organization");
const OrganizationMembership = require("../../models/OrganizationMembership");
const TenantConfig           = require("../../models/TenantConfig");
const UserSession            = require("../../models/UserSession");
const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");
const { sessionAuthMiddleware } = require("../../middleware/sessionAuthMiddleware");
const { requireOrgAccess }     = require("../../middleware/orgAuthMiddleware");
const { ORGANIZATION_ROLES }   = require("../../constants/roles");
const { getCookieName }        = require("../../services/identity/sessionService");

let replSet;
let app;

const VALID_REG = {
  fullName: "Jane Smith",
  email: "jane@example.com",
  password: "SecurePass@123",
  organizationName: "Test Corp",
};

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { serverSelectionTimeoutMS: 30000 });

  // Pre-create all collections so they exist before transactions run.
  // MongoDB does not allow collection creation inside a transaction.
  await Promise.all([
    User.createCollection(),
    PasswordCredential.createCollection(),
    Organization.createCollection(),
    OrganizationMembership.createCollection(),
    TenantConfig.createCollection(),
    UserSession.createCollection(),
    AuthenticationAuditEvent.createCollection(),
  ]);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", authRoutes);

  // Test-only route to exercise sessionAuthMiddleware + orgAuthMiddleware
  app.get(
    "/test/org/:tenantId",
    sessionAuthMiddleware,
    requireOrgAccess(),
    (req, res) => res.json({ ok: true, role: req.auth.role })
  );

  // Minimal error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message, code: err.code, details: err.details });
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function doRegister(overrides = {}) {
  return request(app)
    .post("/api/v1/auth/register")
    .send({ ...VALID_REG, ...overrides });
}

async function doLogin(email = VALID_REG.email, password = VALID_REG.password, rememberMe = false) {
  return request(app)
    .post("/api/v1/auth/login")
    .send({ email, password, rememberMe });
}

const TEST_ORIGIN = "http://localhost:5173";

function cookieAgent(cookieHeader, csrfToken = null) {
  return {
    get: (url) => request(app).get(url).set("Cookie", cookieHeader),
    post: (url) => {
      let r = request(app).post(url).set("Cookie", cookieHeader).set("Origin", TEST_ORIGIN);
      if (csrfToken) r = r.set("X-CSRF-Token", csrfToken);
      return r;
    },
  };
}

function extractCookieHeader(res) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.join("; ");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/register", () => {
  test("201 with safe user/org/membership in body", async () => {
    const res = await doRegister();
    if (res.status !== 201) console.error("register 500 body:", JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(VALID_REG.email);
    expect(res.body.organization.name).toBe(VALID_REG.organizationName);
    expect(res.body.membership.role).toBe(ORGANIZATION_ROLES.OWNER);
  });

  test("creates User, PasswordCredential, Organization, Membership, TenantConfig", async () => {
    await doRegister();
    const user = await User.findOne({ normalizedEmail: "jane@example.com" });
    expect(user).not.toBeNull();
    const cred = await PasswordCredential.findOne({ userId: user._id });
    expect(cred).not.toBeNull();
    const org = await Organization.findOne({ name: VALID_REG.organizationName });
    expect(org).not.toBeNull();
    const membership = await OrganizationMembership.findOne({ userId: user._id });
    expect(membership?.role).toBe(ORGANIZATION_ROLES.OWNER);
    const tc = await TenantConfig.findOne({ tenantId: org.tenantId });
    expect(tc).not.toBeNull();
  });

  test("sets session cookie on success", async () => {
    const res = await doRegister();
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const sessionCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c) => c.startsWith(getCookieName()));
    expect(sessionCookie).toBeDefined();
  });

  test("session cookie has HttpOnly and SameSite=Lax and Path=/", async () => {
    const res = await doRegister();
    const raw = res.headers["set-cookie"];
    const cookie = (Array.isArray(raw) ? raw : [raw]).find((c) => c.includes(getCookieName()));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  test("response body contains no password, passwordHash or tokenHash", async () => {
    const res = await doRegister();
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/password/i);
    expect(bodyStr).not.toMatch(/tokenHash/i);
  });

  test("409 on duplicate email", async () => {
    await doRegister();
    const res = await doRegister();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_IN_USE");
  });

  test("400 on missing fullName", async () => {
    const res = await doRegister({ fullName: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("400 on password shorter than 12 characters", async () => {
    const res = await doRegister({ password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("transactional rollback — User not persisted when Organization creation fails", async () => {
    jest.spyOn(Organization, "create").mockRejectedValueOnce(new Error("Simulated org failure"));
    await expect(doRegister({ email: "rollback@example.com" })).resolves.toMatchObject({ status: 500 });
    const user = await User.findOne({ normalizedEmail: "rollback@example.com" });
    expect(user).toBeNull();
    jest.restoreAllMocks();
  });

  test("Owner role membership created", async () => {
    await doRegister();
    const user = await User.findOne({ normalizedEmail: "jane@example.com" });
    const m = await OrganizationMembership.findOne({ userId: user._id });
    expect(m.role).toBe("owner");
    expect(m.status).toBe("active");
  });

  test("creates registration_succeeded audit event", async () => {
    await doRegister();
    const evt = await AuthenticationAuditEvent.findOne({ eventType: "registration_succeeded" });
    expect(evt).not.toBeNull();
    expect(evt.outcome).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await doRegister();
  });

  test("200 with safe user/org/membership", async () => {
    const res = await doLogin();
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(VALID_REG.email);
    expect(res.body.membership.role).toBe(ORGANIZATION_ROLES.OWNER);
  });

  test("sets session cookie on success", async () => {
    const res = await doLogin();
    const cookies = res.headers["set-cookie"];
    const sessionCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c) => c.startsWith(getCookieName()));
    expect(sessionCookie).toBeDefined();
  });

  test("401 on wrong password — generic message", async () => {
    const res = await doLogin(VALID_REG.email, "WrongPassword123");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.error).toBe("Invalid email or password");
  });

  test("401 on non-existent email — same generic message", async () => {
    const res = await doLogin("nobody@example.com", "AnyPassword123");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.error).toBe("Invalid email or password");
  });

  test("403 on suspended account", async () => {
    await User.updateOne({ normalizedEmail: "jane@example.com" }, { status: "suspended" });
    const res = await doLogin();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_SUSPENDED");
  });

  test("passwordHash is not returned in login response", async () => {
    const res = await doLogin();
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/passwordHash/i);
    expect(bodyStr).not.toMatch(/tokenHash/i);
  });

  test("PasswordCredential.findOne omits passwordHash by default", async () => {
    const user = await User.findOne({ normalizedEmail: "jane@example.com" });
    const cred = await PasswordCredential.findOne({ userId: user._id });
    expect(cred.passwordHash).toBeUndefined();
  });

  test("creates login_succeeded audit event", async () => {
    await doLogin();
    const evt = await AuthenticationAuditEvent.findOne({ eventType: "login_succeeded" });
    expect(evt).not.toBeNull();
    expect(evt.outcome).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// GET /session
// ---------------------------------------------------------------------------

describe("GET /api/v1/auth/session", () => {
  let sessionCookie;

  beforeEach(async () => {
    const res = await doRegister();
    sessionCookie = extractCookieHeader(res);
  });

  test("200 with user/org/session info when authenticated", async () => {
    const res = await cookieAgent(sessionCookie).get("/api/v1/auth/session");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.email).toBe(VALID_REG.email);
    expect(res.body.session.assuranceLevel).toBe("aal1");
  });

  test("401 without cookie", async () => {
    const res = await request(app).get("/api/v1/auth/session");
    expect(res.status).toBe(401);
  });

  test("401 on expired idle session", async () => {
    const user = await User.findOne({ normalizedEmail: "jane@example.com" });
    await UserSession.updateMany({ userId: user._id }, { idleExpiresAt: new Date(Date.now() - 1000) });
    const res = await cookieAgent(sessionCookie).get("/api/v1/auth/session");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });

  test("401 on expired absolute session", async () => {
    const user = await User.findOne({ normalizedEmail: "jane@example.com" });
    await UserSession.updateMany({ userId: user._id }, {
      absoluteExpiresAt: new Date(Date.now() - 1000),
      idleExpiresAt: new Date(Date.now() + 99999),
    });
    const res = await cookieAgent(sessionCookie).get("/api/v1/auth/session");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });

  test("401 on revoked session", async () => {
    const user = await User.findOne({ normalizedEmail: "jane@example.com" });
    await UserSession.updateMany({ userId: user._id }, { status: "revoked" });
    const res = await cookieAgent(sessionCookie).get("/api/v1/auth/session");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_REVOKED");
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/logout", () => {
  test("204 and session is revoked", async () => {
    const regRes = await doRegister();
    const cookie = extractCookieHeader(regRes);
    const csrfToken = regRes.body.csrfToken;
    const res = await cookieAgent(cookie, csrfToken).post("/api/v1/auth/logout");
    expect(res.status).toBe(204);

    const after = await cookieAgent(cookie).get("/api/v1/auth/session");
    expect(after.status).toBe(401);
  });

  test("Set-Cookie clears the session cookie on logout", async () => {
    const regRes = await doRegister();
    const cookie = extractCookieHeader(regRes);
    const csrfToken = regRes.body.csrfToken;
    const res = await cookieAgent(cookie, csrfToken).post("/api/v1/auth/logout");
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cleared = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .find((c) => c.includes(getCookieName()));
    expect(cleared).toMatch(/Max-Age=0|Expires=/i);
  });

  test("creates logout audit event", async () => {
    const regRes = await doRegister();
    const cookie = extractCookieHeader(regRes);
    const csrfToken = regRes.body.csrfToken;
    await cookieAgent(cookie, csrfToken).post("/api/v1/auth/logout");
    const evt = await AuthenticationAuditEvent.findOne({ eventType: "logout" });
    expect(evt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Logout-all
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/logout-all", () => {
  test("revokes all sessions and returns 204", async () => {
    await doRegister();
    const login1 = await doLogin();
    const login2 = await doLogin();
    const cookie1 = extractCookieHeader(login1);
    const cookie2 = extractCookieHeader(login2);
    const csrfToken1 = login1.body.csrfToken;

    const res = await cookieAgent(cookie1, csrfToken1).post("/api/v1/auth/logout-all");
    expect(res.status).toBe(204);

    // Both sessions should now be revoked
    const after1 = await cookieAgent(cookie1).get("/api/v1/auth/session");
    const after2 = await cookieAgent(cookie2).get("/api/v1/auth/session");
    expect(after1.status).toBe(401);
    expect(after2.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// orgAuthMiddleware
// ---------------------------------------------------------------------------

describe("orgAuthMiddleware (GET /test/org/:tenantId)", () => {
  test("403 when session tenant does not match URL tenant", async () => {
    const regRes = await doRegister();
    const cookie = extractCookieHeader(regRes);

    // Create a second unrelated org/tenant
    await Organization.create({ name: "Other Org", slug: "other-org-x1", tenantId: "other_tenant_x1", status: "active" });

    const res = await request(app)
      .get("/test/org/other_tenant_x1")
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CROSS_TENANT_ACCESS");
  });

  test("200 when session tenant matches URL tenant", async () => {
    const regRes = await doRegister();
    const org = await Organization.findOne({ name: VALID_REG.organizationName });
    const cookie = extractCookieHeader(regRes);
    const res = await request(app)
      .get(`/test/org/${org.tenantId}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.role).toBe("owner");
  });
});

// ---------------------------------------------------------------------------
// Audit immutability
// ---------------------------------------------------------------------------

describe("AuthenticationAuditEvent immutability", () => {
  test("updateOne throws on audit records", async () => {
    await doRegister();
    await expect(
      AuthenticationAuditEvent.updateOne({ eventType: "registration_succeeded" }, { reasonCode: "tampered" })
    ).rejects.toThrow("immutable");
  });
});
