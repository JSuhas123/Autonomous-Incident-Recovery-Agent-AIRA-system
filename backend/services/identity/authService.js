"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");

const User = require("../../models/User");
const PasswordCredential = require("../../models/PasswordCredential");
const Organization = require("../../models/Organization");
const OrganizationMembership = require("../../models/OrganizationMembership");
const TenantConfig = require("../../models/TenantConfig");
const { hashPassword, verifyPassword, needsRehash } = require("./passwordService");
const { createSession } = require("./sessionService");
const { record: auditRecord } = require("./identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../../constants/authEvents");
const { ORGANIZATION_ROLES } = require("../../constants/roles");

function generateSlug(name) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org";
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function slugToTenantId(slug) {
  return slug
    .replace(/-/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 50);
}

// Attempt transaction; if standalone MongoDB rejects txnNumber, retry without.
// The code-20 error ("Transaction numbers are only allowed on a ReplicaSet member")
// only fires on the FIRST transactional operation, so fn() has not yet written
// anything and can safely be retried without a session.
async function withTransaction(fn) {
  let session = null;
  let transactionActive = false;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    transactionActive = true;
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session && transactionActive) {
      try { await session.abortTransaction(); } catch (_) { /* ignore */ }
    }
    // Standalone MongoDB: transaction not supported — retry without session
    if (err.code === 20 || (err.message && err.message.includes("Transaction numbers"))) {
      return fn(null);
    }
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

// ---------------------------------------------------------------------------
// Retry helper — re-provisions TenantConfig for a provisioning_failed org
// without creating duplicate identity records. Only called when the user already
// exists but their organization never finished provisioning.
// ---------------------------------------------------------------------------
async function _retryProvisionTenantConfig(user, organization, ip, userAgent) {
  const { tenantId, name: organizationName } = organization;

  try {
    await TenantConfig.findOneAndUpdate(
      { tenantId },
      { $setOnInsert: { tenantId, name: organizationName, status: "active", settings: {}, apiKeys: [], admins: [] } },
      { upsert: true }
    );
    await Organization.updateOne({ _id: organization._id }, { status: "active" });
  } catch (tenantErr) {
    await auditRecord(AUTH_EVENT_TYPES.REGISTRATION_FAILED, AUTH_EVENT_OUTCOMES.FAILURE, {
      userId: user._id,
      organizationId: organization._id,
      reasonCode: "TENANT_PROVISIONING_RETRY_FAILED",
      metadata: { message: tenantErr.message },
    });
    const err = new Error("Organization provisioning is still failing. Please contact support.");
    err.status = 503;
    err.code = "TENANT_PROVISIONING_FAILED";
    throw err;
  }

  const membership = await OrganizationMembership.findOne({ userId: user._id, organizationId: organization._id });
  const { session, rawToken, csrfToken } = await createSession({
    userId: user._id,
    organizationId: organization._id,
    rememberMe: false,
    ip,
    userAgent,
  });

  await auditRecord(AUTH_EVENT_TYPES.REGISTRATION_SUCCEEDED, AUTH_EVENT_OUTCOMES.SUCCESS, {
    userId: user._id,
    organizationId: organization._id,
    sessionId: session._id,
    metadata: { retried: true },
  });

  return {
    rawToken,
    session,
    csrfToken,
    user: safeUser(user),
    organization: safeOrg(organization),
    membership: membership ? safeMembership(membership) : null,
  };
}

async function register(data, { ip = null, userAgent = null } = {}) {
  const { fullName, email, password, organizationName } = data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ normalizedEmail });
  if (existing) {
    // Allow retry: if the user exists but their organization is provisioning_failed,
    // attempt to re-provision TenantConfig and re-activate without duplicating records.
    if (existing.primaryOrganizationId) {
      const existingOrg = await Organization.findById(existing.primaryOrganizationId);
      if (existingOrg && existingOrg.status === "provisioning_failed") {
        return _retryProvisionTenantConfig(existing, existingOrg, ip, userAgent);
      }
    }
    const err = new Error("An account with this email address already exists");
    err.status = 409;
    err.code = "EMAIL_IN_USE";
    throw err;
  }

  const passwordHash = await hashPassword(password);

  // Generate unique slug/tenantId with up to 3 retries
  let slug = generateSlug(organizationName);
  let tenantId = slugToTenantId(slug);
  for (let i = 0; i < 3; i++) {
    const [bySlug, byTenant] = await Promise.all([
      Organization.findOne({ slug }),
      Organization.findOne({ tenantId }),
    ]);
    if (!bySlug && !byTenant) break;
    slug = generateSlug(organizationName);
    tenantId = slugToTenantId(slug);
  }

  let registrationResult;
  try {
    registrationResult = await withTransaction(async (txSession) => {
      const opts = txSession ? { session: txSession } : {};

      const [savedUser] = await User.create(
        [{ fullName, email, status: "active" }],
        opts
      );

      await PasswordCredential.create(
        [{ userId: savedUser._id, passwordHash, algorithm: "argon2id", hashVersion: 1, passwordChangedAt: new Date() }],
        opts
      );

      const [savedOrg] = await Organization.create(
        [{ name: organizationName, slug, tenantId, status: "active", createdByUserId: savedUser._id }],
        opts
      );

      const [savedMembership] = await OrganizationMembership.create(
        [{ userId: savedUser._id, organizationId: savedOrg._id, role: ORGANIZATION_ROLES.OWNER, status: "active", joinedAt: new Date() }],
        opts
      );

      await User.updateOne({ _id: savedUser._id }, { primaryOrganizationId: savedOrg._id }, opts);
      savedUser.primaryOrganizationId = savedOrg._id;

      return { user: savedUser, organization: savedOrg, membership: savedMembership };
    });
  } catch (err) {
    // Handle MongoDB duplicate key (race condition on normalizedEmail)
    if (err.code === 11000 && err.keyPattern?.normalizedEmail) {
      const conflict = new Error("An account with this email address already exists");
      conflict.status = 409;
      conflict.code = "EMAIL_IN_USE";
      await auditRecord(AUTH_EVENT_TYPES.REGISTRATION_FAILED, AUTH_EVENT_OUTCOMES.FAILURE, { reasonCode: "EMAIL_IN_USE", ipHash: ip });
      throw conflict;
    }
    await auditRecord(AUTH_EVENT_TYPES.REGISTRATION_FAILED, AUTH_EVENT_OUTCOMES.FAILURE, {
      reasonCode: err.code || "REGISTRATION_ERROR",
      ipHash: ip,
      metadata: { message: err.message },
    });
    throw err;
  }

  const { user, organization, membership } = registrationResult;

  // Sync TenantConfig (legacy machine-auth entity) outside the transaction to avoid
  // catalog-change WriteConflict when the collection does not yet exist.
  // If this fails, mark the organization as provisioning_failed so the user cannot
  // silently receive a usable session against a broken tenant.
  try {
    await TenantConfig.findOneAndUpdate(
      { tenantId },
      { $setOnInsert: { tenantId, name: organizationName, status: "active", settings: {}, apiKeys: [], admins: [] } },
      { upsert: true }
    );
  } catch (tenantErr) {
    await Organization.updateOne({ _id: organization._id }, { status: "provisioning_failed" });
    await auditRecord(AUTH_EVENT_TYPES.REGISTRATION_FAILED, AUTH_EVENT_OUTCOMES.FAILURE, {
      userId: user._id,
      organizationId: organization._id,
      reasonCode: "TENANT_PROVISIONING_FAILED",
      metadata: { message: tenantErr.message },
    });
    const err = new Error("Account created but organization provisioning failed. Please contact support or retry.");
    err.status = 503;
    err.code = "TENANT_PROVISIONING_FAILED";
    throw err;
  }

  const { session, rawToken, csrfToken } = await createSession({
    userId: user._id,
    organizationId: organization._id,
    rememberMe: false,
    ip,
    userAgent,
  });

  await auditRecord(AUTH_EVENT_TYPES.REGISTRATION_SUCCEEDED, AUTH_EVENT_OUTCOMES.SUCCESS, {
    userId: user._id,
    organizationId: organization._id,
    sessionId: session._id,
    ipHash: ip,
  });
  await auditRecord(AUTH_EVENT_TYPES.SESSION_CREATED, AUTH_EVENT_OUTCOMES.SUCCESS, {
    userId: user._id,
    sessionId: session._id,
  });

  return {
    rawToken,
    session,
    csrfToken,
    user: safeUser(user),
    organization: safeOrg(organization),
    membership: safeMembership(membership),
  };
}

async function login(data, { ip = null, userAgent = null } = {}) {
  const { email, password, rememberMe = false } = data;
  const normalizedEmail = email.toLowerCase().trim();

  const credentialsError = (() => {
    const err = new Error("Invalid email or password");
    err.status = 401;
    err.code = "INVALID_CREDENTIALS";
    return err;
  })();

  const user = await User.findOne({ normalizedEmail });

  if (!user) {
    await auditRecord(AUTH_EVENT_TYPES.LOGIN_FAILED, AUTH_EVENT_OUTCOMES.FAILURE, {
      reasonCode: "USER_NOT_FOUND",
      ipHash: ip,
    });
    // Constant-time defence: always hash even when no user found
    await hashPassword("aira-timing-defense-constant-input").catch(() => {});
    throw credentialsError;
  }

  if (user.status === "suspended") {
    await auditRecord(AUTH_EVENT_TYPES.LOGIN_FAILED, AUTH_EVENT_OUTCOMES.DENIED, { userId: user._id, reasonCode: "ACCOUNT_SUSPENDED", ipHash: ip });
    const err = new Error("Account suspended. Contact support.");
    err.status = 403;
    err.code = "ACCOUNT_SUSPENDED";
    throw err;
  }
  if (user.status === "disabled") {
    await auditRecord(AUTH_EVENT_TYPES.LOGIN_FAILED, AUTH_EVENT_OUTCOMES.DENIED, { userId: user._id, reasonCode: "ACCOUNT_DISABLED", ipHash: ip });
    const err = new Error("Account disabled. Contact support.");
    err.status = 403;
    err.code = "ACCOUNT_DISABLED";
    throw err;
  }

  const credential = await PasswordCredential.findOne({ userId: user._id }).select("+passwordHash");
  if (!credential) {
    await auditRecord(AUTH_EVENT_TYPES.LOGIN_FAILED, AUTH_EVENT_OUTCOMES.FAILURE, { userId: user._id, reasonCode: "NO_CREDENTIAL", ipHash: ip });
    await hashPassword("aira-timing-defense-constant-input").catch(() => {});
    throw credentialsError;
  }

  if (credential.lockedUntil && credential.lockedUntil > new Date()) {
    await auditRecord(AUTH_EVENT_TYPES.LOGIN_FAILED, AUTH_EVENT_OUTCOMES.DENIED, { userId: user._id, reasonCode: "ACCOUNT_LOCKED", ipHash: ip });
    const err = new Error("Account locked. Try again later.");
    err.status = 403;
    err.code = "ACCOUNT_LOCKED";
    throw err;
  }

  const valid = await verifyPassword(credential.passwordHash, password);

  if (!valid) {
    const newCount = (credential.failedAttempts || 0) + 1;
    const lockUntil = newCount >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await PasswordCredential.updateOne(
      { _id: credential._id },
      { failedAttempts: newCount, lastFailedAt: new Date(), ...(lockUntil ? { lockedUntil: lockUntil } : {}) }
    );
    if (lockUntil) {
      await auditRecord(AUTH_EVENT_TYPES.ACCOUNT_LOCKED, AUTH_EVENT_OUTCOMES.DENIED, { userId: user._id, ipHash: ip });
    }
    await auditRecord(AUTH_EVENT_TYPES.LOGIN_FAILED, AUTH_EVENT_OUTCOMES.FAILURE, { userId: user._id, reasonCode: "INVALID_PASSWORD", ipHash: ip });
    throw credentialsError;
  }

  // Reset failure counters and optionally rehash
  await PasswordCredential.updateOne({ _id: credential._id }, { failedAttempts: 0, lockedUntil: null, lastFailedAt: null });
  if (needsRehash(credential.passwordHash)) {
    const newHash = await hashPassword(password);
    await PasswordCredential.updateOne({ _id: credential._id }, { passwordHash: newHash, passwordChangedAt: new Date() });
  }

  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

  const membership = await OrganizationMembership.findOne({ userId: user._id, status: "active" });
  const organization = membership ? await Organization.findById(membership.organizationId) : null;

  const { session, rawToken, csrfToken } = await createSession({
    userId: user._id,
    organizationId: organization?._id || null,
    rememberMe,
    ip,
    userAgent,
  });

  await auditRecord(AUTH_EVENT_TYPES.LOGIN_SUCCEEDED, AUTH_EVENT_OUTCOMES.SUCCESS, {
    userId: user._id,
    organizationId: organization?._id,
    sessionId: session._id,
    ipHash: ip,
  });
  await auditRecord(AUTH_EVENT_TYPES.SESSION_CREATED, AUTH_EVENT_OUTCOMES.SUCCESS, { userId: user._id, sessionId: session._id });

  return {
    rawToken,
    session,
    csrfToken,
    user: safeUser(user),
    organization: organization ? safeOrg(organization) : null,
    membership: membership ? safeMembership(membership) : null,
  };
}

function safeUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    primaryOrganizationId: user.primaryOrganizationId || null,
    emailVerifiedAt: user.emailVerifiedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
  };
}

function safeOrg(org) {
  return {
    id: org._id,
    name: org.name,
    slug: org.slug,
    tenantId: org.tenantId,
    status: org.status,
    createdAt: org.createdAt,
  };
}

function safeMembership(m) {
  return { id: m._id, role: m.role, status: m.status, joinedAt: m.joinedAt || null };
}

module.exports = { register, login, safeUser, safeOrg, safeMembership };
