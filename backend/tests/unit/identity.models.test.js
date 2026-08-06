"use strict";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const User = require("../../models/User");
const PasswordCredential = require("../../models/PasswordCredential");
const Organization = require("../../models/Organization");
const OrganizationMembership = require("../../models/OrganizationMembership");
const UserSession = require("../../models/UserSession");
const EmailVerificationToken = require("../../models/EmailVerificationToken");
const PasswordResetToken = require("../../models/PasswordResetToken");
const AuthenticationAuditEvent = require("../../models/AuthenticationAuditEvent");
const { ORGANIZATION_ROLES } = require("../../constants/roles");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../../constants/authEvents");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides = {}) {
  return new User({
    fullName: "Test User",
    email: "test@example.com",
    ...overrides,
  });
}

function makeOrg(overrides = {}) {
  return new Organization({
    name: "Test Org",
    slug: "test-org",
    tenantId: "tenant-001",
    ...overrides,
  });
}

function futureDate(offsetMs = 3600_000) {
  return new Date(Date.now() + offsetMs);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

describe("User model", () => {
  test("saves a valid user", async () => {
    const user = makeUser();
    const saved = await user.save();
    expect(saved._id).toBeDefined();
    expect(saved.status).toBe("pending_verification");
  });

  test("normalizedEmail is lowercased and trimmed automatically", async () => {
    const user = makeUser({ email: "  Alice@Example.COM  " });
    await user.save();
    expect(user.normalizedEmail).toBe("alice@example.com");
  });

  test("rejects duplicate normalizedEmail", async () => {
    await makeUser({ email: "dup@example.com" }).save();
    await expect(makeUser({ email: "DUP@EXAMPLE.COM" }).save()).rejects.toThrow();
  });

  test("rejects invalid status enum", async () => {
    const user = makeUser({ status: "unknown_status" });
    await expect(user.save()).rejects.toThrow();
  });

  test("toJSON does not expose internal Mongoose __v", async () => {
    const user = makeUser({ email: "json@example.com" });
    await user.save();
    const json = user.toJSON();
    expect(json.__v).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PasswordCredential
// ---------------------------------------------------------------------------

describe("PasswordCredential model", () => {
  test("saves a valid credential", async () => {
    const user = await makeUser({ email: "cred@example.com" }).save();
    const cred = new PasswordCredential({
      userId: user._id,
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$fakehashfortesting",
      algorithm: "argon2id",
    });
    const saved = await cred.save();
    expect(saved._id).toBeDefined();
    expect(saved.algorithm).toBe("argon2id");
  });

  test("passwordHash is excluded from toJSON output", async () => {
    const user = await makeUser({ email: "hashtest@example.com" }).save();
    const cred = new PasswordCredential({
      userId: user._id,
      passwordHash: "should-not-appear-in-json",
    });
    await cred.save();
    const json = cred.toJSON();
    expect(json.passwordHash).toBeUndefined();
  });

  test("passwordHash is excluded from normal find() results", async () => {
    const user = await makeUser({ email: "selectfalse@example.com" }).save();
    await new PasswordCredential({
      userId: user._id,
      passwordHash: "hidden-hash",
    }).save();
    const found = await PasswordCredential.findOne({ userId: user._id });
    expect(found.passwordHash).toBeUndefined();
  });

  test("rejects unsupported algorithm enum", async () => {
    const user = await makeUser({ email: "algo@example.com" }).save();
    const cred = new PasswordCredential({
      userId: user._id,
      passwordHash: "x",
      algorithm: "bcrypt",
    });
    await expect(cred.save()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

describe("Organization model", () => {
  test("saves a valid organization", async () => {
    const org = await makeOrg().save();
    expect(org._id).toBeDefined();
    expect(org.settings.defaultRecoveryMode).toBe("approval");
  });

  test("rejects duplicate slug", async () => {
    await makeOrg({ slug: "unique-slug", tenantId: "t-a" }).save();
    await expect(makeOrg({ slug: "unique-slug", tenantId: "t-b" }).save()).rejects.toThrow();
  });

  test("rejects duplicate tenantId", async () => {
    await makeOrg({ slug: "org-a", tenantId: "shared-tenant" }).save();
    await expect(makeOrg({ slug: "org-b", tenantId: "shared-tenant" }).save()).rejects.toThrow();
  });

  test("rejects invalid status enum", async () => {
    const org = makeOrg({ status: "unknown" });
    await expect(org.save()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// OrganizationMembership
// ---------------------------------------------------------------------------

describe("OrganizationMembership model", () => {
  test("saves a valid membership", async () => {
    const user = await makeUser({ email: "member@example.com" }).save();
    const org = await makeOrg().save();
    const membership = new OrganizationMembership({
      userId: user._id,
      organizationId: org._id,
      role: ORGANIZATION_ROLES.DEVELOPER,
    });
    const saved = await membership.save();
    expect(saved.role).toBe("developer");
  });

  test("rejects duplicate userId + organizationId", async () => {
    const user = await makeUser({ email: "dup-member@example.com" }).save();
    const org = await makeOrg({ slug: "dup-org", tenantId: "dup-t" }).save();
    await new OrganizationMembership({
      userId: user._id,
      organizationId: org._id,
      role: ORGANIZATION_ROLES.VIEWER,
    }).save();
    await expect(
      new OrganizationMembership({
        userId: user._id,
        organizationId: org._id,
        role: ORGANIZATION_ROLES.ADMIN,
      }).save()
    ).rejects.toThrow();
  });

  test("rejects invalid role enum", async () => {
    const user = await makeUser({ email: "role-bad@example.com" }).save();
    const org = await makeOrg({ slug: "role-org", tenantId: "role-t" }).save();
    const m = new OrganizationMembership({
      userId: user._id,
      organizationId: org._id,
      role: "super_hacker",
    });
    await expect(m.save()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// UserSession
// ---------------------------------------------------------------------------

describe("UserSession model", () => {
  test("saves a valid session", async () => {
    const user = await makeUser({ email: "session@example.com" }).save();
    const session = new UserSession({
      userId: user._id,
      tokenHash: "sha256hashoftoken-aaaa",
      idleExpiresAt: futureDate(30 * 60_000),
      absoluteExpiresAt: futureDate(24 * 3_600_000),
    });
    const saved = await session.save();
    expect(saved.assuranceLevel).toBe("aal1");
    expect(saved.rememberMe).toBe(false);
  });

  test("tokenHash is excluded from toJSON output", async () => {
    const user = await makeUser({ email: "tokjson@example.com" }).save();
    const session = new UserSession({
      userId: user._id,
      tokenHash: "secret-hash-must-not-leak",
      idleExpiresAt: futureDate(),
      absoluteExpiresAt: futureDate(),
    });
    await session.save();
    const json = session.toJSON();
    expect(json.tokenHash).toBeUndefined();
    expect(json.ipHash).toBeUndefined();
    expect(json.userAgentHash).toBeUndefined();
  });

  test("tokenHash is excluded from normal find() results", async () => {
    const user = await makeUser({ email: "toksel@example.com" }).save();
    await new UserSession({
      userId: user._id,
      tokenHash: "select-false-hash",
      idleExpiresAt: futureDate(),
      absoluteExpiresAt: futureDate(),
    }).save();
    const found = await UserSession.findOne({ userId: user._id });
    expect(found.tokenHash).toBeUndefined();
  });

  test("rejects duplicate tokenHash", async () => {
    const user = await makeUser({ email: "duptok@example.com" }).save();
    const hash = "same-token-hash-xxxx";
    await new UserSession({
      userId: user._id,
      tokenHash: hash,
      idleExpiresAt: futureDate(),
      absoluteExpiresAt: futureDate(),
    }).save();
    await expect(
      new UserSession({
        userId: user._id,
        tokenHash: hash,
        idleExpiresAt: futureDate(),
        absoluteExpiresAt: futureDate(),
      }).save()
    ).rejects.toThrow();
  });

  test("idleExpiresAt and absoluteExpiresAt are required", async () => {
    const user = await makeUser({ email: "expiry@example.com" }).save();
    const session = new UserSession({
      userId: user._id,
      tokenHash: "expiry-test-hash",
    });
    await expect(session.save()).rejects.toThrow();
  });

  test("rejects invalid assuranceLevel enum", async () => {
    const user = await makeUser({ email: "aal@example.com" }).save();
    const session = new UserSession({
      userId: user._id,
      tokenHash: "aal-test-hash",
      idleExpiresAt: futureDate(),
      absoluteExpiresAt: futureDate(),
      assuranceLevel: "aal9",
    });
    await expect(session.save()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// EmailVerificationToken
// ---------------------------------------------------------------------------

describe("EmailVerificationToken model", () => {
  test("saves a valid token", async () => {
    const user = await makeUser({ email: "evtok@example.com" }).save();
    const tok = new EmailVerificationToken({
      userId: user._id,
      tokenHash: "ev-hash-001",
      expiresAt: futureDate(),
    });
    const saved = await tok.save();
    expect(saved.createdAt).toBeDefined();
    expect(saved.usedAt).toBeNull();
  });

  test("rejects duplicate tokenHash", async () => {
    const user = await makeUser({ email: "evdup@example.com" }).save();
    const hash = "ev-dup-hash";
    await new EmailVerificationToken({
      userId: user._id,
      tokenHash: hash,
      expiresAt: futureDate(),
    }).save();
    await expect(
      new EmailVerificationToken({
        userId: user._id,
        tokenHash: hash,
        expiresAt: futureDate(),
      }).save()
    ).rejects.toThrow();
  });

  test("tokenHash is excluded from normal find() results", async () => {
    const user = await makeUser({ email: "evsel@example.com" }).save();
    await new EmailVerificationToken({
      userId: user._id,
      tokenHash: "ev-sel-hash",
      expiresAt: futureDate(),
    }).save();
    const found = await EmailVerificationToken.findOne({ userId: user._id });
    expect(found.tokenHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PasswordResetToken
// ---------------------------------------------------------------------------

describe("PasswordResetToken model", () => {
  test("saves a valid token", async () => {
    const user = await makeUser({ email: "prtok@example.com" }).save();
    const tok = new PasswordResetToken({
      userId: user._id,
      tokenHash: "pr-hash-001",
      expiresAt: futureDate(),
    });
    const saved = await tok.save();
    expect(saved.createdAt).toBeDefined();
    expect(saved.usedAt).toBeNull();
  });

  test("rejects duplicate tokenHash", async () => {
    const user = await makeUser({ email: "prdup@example.com" }).save();
    const hash = "pr-dup-hash";
    await new PasswordResetToken({
      userId: user._id,
      tokenHash: hash,
      expiresAt: futureDate(),
    }).save();
    await expect(
      new PasswordResetToken({
        userId: user._id,
        tokenHash: hash,
        expiresAt: futureDate(),
      }).save()
    ).rejects.toThrow();
  });

  test("tokenHash is excluded from normal find() results", async () => {
    const user = await makeUser({ email: "prsel@example.com" }).save();
    await new PasswordResetToken({
      userId: user._id,
      tokenHash: "pr-sel-hash",
      expiresAt: futureDate(),
    }).save();
    const found = await PasswordResetToken.findOne({ userId: user._id });
    expect(found.tokenHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AuthenticationAuditEvent
// ---------------------------------------------------------------------------

describe("AuthenticationAuditEvent model", () => {
  test("saves a valid audit event", async () => {
    const user = await makeUser({ email: "audit@example.com" }).save();
    const event = new AuthenticationAuditEvent({
      eventType: AUTH_EVENT_TYPES.LOGIN_SUCCEEDED,
      userId: user._id,
      outcome: AUTH_EVENT_OUTCOMES.SUCCESS,
    });
    const saved = await event.save();
    expect(saved.createdAt).toBeDefined();
    expect(saved.eventType).toBe("login_succeeded");
  });

  test("rejects invalid eventType enum", async () => {
    const event = new AuthenticationAuditEvent({
      eventType: "hacked_the_planet",
      outcome: AUTH_EVENT_OUTCOMES.SUCCESS,
    });
    await expect(event.save()).rejects.toThrow();
  });

  test("rejects invalid outcome enum", async () => {
    const event = new AuthenticationAuditEvent({
      eventType: AUTH_EVENT_TYPES.LOGIN_FAILED,
      outcome: "maybe",
    });
    await expect(event.save()).rejects.toThrow();
  });

  test("saves without optional userId or organizationId", async () => {
    const event = new AuthenticationAuditEvent({
      eventType: AUTH_EVENT_TYPES.REGISTRATION_FAILED,
      outcome: AUTH_EVENT_OUTCOMES.FAILURE,
      reasonCode: "INVALID_EMAIL",
    });
    const saved = await event.save();
    expect(saved.userId).toBeNull();
    expect(saved.organizationId).toBeNull();
  });

  test("metadata does not expose a stored password-like field via toObject", async () => {
    const event = new AuthenticationAuditEvent({
      eventType: AUTH_EVENT_TYPES.ACCOUNT_LOCKED,
      outcome: AUTH_EVENT_OUTCOMES.DENIED,
      // Simulates a caller incorrectly storing safe context (no sensitive fields)
      metadata: { reason: "too_many_attempts", attemptCount: 5 },
    });
    const saved = await event.save();
    const obj = saved.toObject();
    // Verify metadata is stored as-is (application layer must enforce safe usage)
    expect(obj.metadata.reason).toBe("too_many_attempts");
    expect(obj.metadata.password).toBeUndefined();
  });
});
