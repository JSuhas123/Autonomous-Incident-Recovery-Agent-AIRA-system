"use strict";

process.env.ARGON2_MEMORY_COST =
  process.env.ARGON2_MEMORY_COST || "256";

process.env.ARGON2_TIME_COST =
  process.env.ARGON2_TIME_COST || "1";

process.env.ARGON2_PARALLELISM =
  process.env.ARGON2_PARALLELISM || "1";

process.env.AUDIT_SECRET =
  process.env.AUDIT_SECRET ||
  "test-audit-secret-32-chars-min!!";

const express =
  require("express");

const cookieParser =
  require("cookie-parser");

const mongoose =
  require("mongoose");

const request =
  require("supertest");

const {
  MongoMemoryReplSet,
} =
  require(
    "mongodb-memory-server"
  );

// ============================================================================
// ROUTES
// ============================================================================

const authRoutes =
  require(
    "../../routes/authRoutes"
  );

// ============================================================================
// MIDDLEWARE
// ============================================================================

const {
  sessionAuthMiddleware,
} =
  require(
    "../../middleware/sessionAuthMiddleware"
  );

const {
  requestContextMiddleware,
} =
  require(
    "../../middleware/requestContextMiddleware"
  );

const {
  environmentContextMiddleware,
} =
  require(
    "../../middleware/environmentContextMiddleware"
  );

// ============================================================================
// CORE MODELS
// ============================================================================

const User =
  require(
    "../../models/User"
  );

const PasswordCredential =
  require(
    "../../models/PasswordCredential"
  );

const Organization =
  require(
    "../../models/Organization"
  );

const OrganizationMembership =
  require(
    "../../models/OrganizationMembership"
  );

const TenantConfig =
  require(
    "../../models/TenantConfig"
  );

const UserSession =
  require(
    "../../models/UserSession"
  );

const AuthenticationAuditEvent =
  require(
    "../../models/AuthenticationAuditEvent"
  );

const Environment =
  require(
    "../../models/Environment"
  );

// ============================================================================
// STATE
// ============================================================================

let replSet =
  null;

// ============================================================================
// UTILITIES
// ============================================================================

function uniqueModels(models) {
  const seen =
    new Set();

  return models.filter(
    (Model) => {
      if (!Model) {
        return false;
      }

      const name =
        Model.modelName ||
        Model.collection?.name;

      if (!name) {
        return true;
      }

      if (
        seen.has(name)
      ) {
        return false;
      }

      seen.add(name);

      return true;
    }
  );
}

// ============================================================================
// DATABASE
// ============================================================================

async function startPhase1Database(
  extraModels = []
) {
  if (
    mongoose.connection
      .readyState !== 0
  ) {
    await mongoose.disconnect();
  }

  replSet =
    await MongoMemoryReplSet
      .create({
        replSet: {
          count: 1,
        },
      });

  await mongoose.connect(
    replSet.getUri(),
    {
      serverSelectionTimeoutMS:
        30000,
    }
  );

  const models =
    uniqueModels([
      User,
      PasswordCredential,
      Organization,
      OrganizationMembership,
      TenantConfig,
      UserSession,
      AuthenticationAuditEvent,
      Environment,
      ...extraModels,
    ]);

  for (
    const Model
    of models
  ) {
    try {
      await Model
        .createCollection();
    } catch (error) {
      /*
       * createCollection may legitimately report that
       * a collection already exists because another model
       * initialized it first.
       */
      if (
        error.codeName !==
          "NamespaceExists" &&
        error.code !== 48
      ) {
        throw error;
      }
    }
  }

  return replSet;
}

async function resetPhase1Database() {
  const collections =
    mongoose.connection
      .collections;

  await Promise.all(
    Object
      .values(
        collections
      )
      .map(
        (collection) =>
          collection.deleteMany({})
      )
  );
}

async function stopPhase1Database() {
  if (
    mongoose.connection
      .readyState !== 0
  ) {
    await mongoose.disconnect();
  }

  if (replSet) {
    await replSet.stop();

    replSet =
      null;
  }
}

// ============================================================================
// EXPRESS APP
// ============================================================================

function createPhase1App({
  routes = [],
  includeAuth = true,
  errorPrefix =
    "phase1.integration",
} = {}) {
  const app =
    express();

  app.use(
    express.json()
  );

  app.use(
    cookieParser()
  );

  if (
    includeAuth
  ) {
    app.use(
      "/api/v1/auth",
      authRoutes
    );
  }

  /*
   * Route config:
   *
   * {
   *   path: "/api/v1/services",
   *   router: serviceRoutes,
   *   auth: true,
   *   environment: true
   * }
   */

  for (
    const definition
    of routes
  ) {
    if (
      !definition ||
      !definition.path ||
      !definition.router
    ) {
      throw new Error(
        "Invalid Phase 1 route definition"
      );
    }

    const middleware =
      [];

    if (
      definition.auth !==
      false
    ) {
      middleware.push(
        sessionAuthMiddleware
      );

      middleware.push(
        requestContextMiddleware
      );

      if (
        definition.environment !==
        false
      ) {
        middleware.push(
          environmentContextMiddleware
        );
      }
    }

    app.use(
      definition.path,
      ...middleware,
      definition.router
    );
  }

  // eslint-disable-next-line no-unused-vars
  app.use(
    (
      error,
      req,
      res,
      _next
    ) => {
      console.error(
        `[${errorPrefix}]`,
        {
          method:
            req.method,

          path:
            req.path,

          status:
            error.status ||
            500,

          code:
            error.code,

          message:
            error.message,
        }
      );

      return res
        .status(
          error.status ||
          500
        )
        .json({
          error:
            error.message,

          code:
            error.code,
        });
    }
  );

  return app;
}

// ============================================================================
// AUTH + ORGANIZATION BOOTSTRAP
// ============================================================================

async function registerPhase1User({
  app,
  agent = null,
  email =
    "test@example.com",
  organizationName =
    "TestOrg",
  fullName =
    "Test User",
  password =
    "SecureTest123!",
} = {}) {
  if (!app) {
    throw new Error(
      "registerPhase1User requires app"
    );
  }

  const client =
    agent ||
    request.agent(
      app
    );

  const response =
    await client
      .post(
        "/api/v1/auth/register"
      )
      .send({
        fullName,
        email,
        password,
        organizationName,
      });

  expect(
    response.status
  ).toBe(
    201
  );

  // --------------------------------------------------------------------------
  // ORGANIZATION
  // --------------------------------------------------------------------------

  const organization =
    await Organization
      .findOne({
        name:
          organizationName,
      });

  expect(
    organization
  ).toBeTruthy();

  // --------------------------------------------------------------------------
  // MEMBERSHIP
  // --------------------------------------------------------------------------

  const membership =
    await OrganizationMembership
      .findOne({
        organizationId:
          organization._id,

        status: {
          $ne:
            "removed",
        },
      });

  expect(
    membership
  ).toBeTruthy();

  const userId =
    membership.userId;

  expect(
    userId
  ).toBeTruthy();

  // --------------------------------------------------------------------------
  // ENVIRONMENT
  // --------------------------------------------------------------------------

  let environment =
    await Environment
      .findOne({
        organizationId:
          organization._id,

        status:
          "active",
      });

  if (!environment) {
    environment =
      await Environment
        .create({
          organizationId:
            organization._id,

          tenantId:
            organization
              .tenantId,

          name:
            "Production",

          slug:
            "production",

          type:
            "production",

          status:
            "active",

          isDefault:
            true,

          createdBy:
            userId,
        });
  }

  expect(
    environment
  ).toBeTruthy();

  // --------------------------------------------------------------------------
  // DEFAULT ENVIRONMENT
  // --------------------------------------------------------------------------

  organization.settings =
    organization.settings ||
    {};

  organization
    .settings
    .defaultEnvironmentId =
      environment._id;

  await organization.save();

  // --------------------------------------------------------------------------
  // COOKIE
  // --------------------------------------------------------------------------

  const rawCookies =
    response.headers[
      "set-cookie"
    ];

  const cookie =
    (
      Array.isArray(
        rawCookies
      )
        ? rawCookies
        : [rawCookies]
    )
      .filter(Boolean)
      .join("; ");

  expect(
    cookie
  ).toBeTruthy();

  return {
    agent:
      client,

    response,

    cookie,

    csrfToken:
      response.body
        .csrfToken,

    userId:
      userId
        .toString(),

    organization,

    organizationId:
      organization._id
        .toString(),

    membership,

    environment,

    environmentId:
      environment._id
        .toString(),

    tenantId:
      organization
        .tenantId,
  };
}

// ============================================================================
// SECOND ENVIRONMENT
// ============================================================================

async function createPhase1Environment({
  organization,
  userId,
  name =
    "Staging",
  slug =
    "staging",
  type =
    "staging",
} = {}) {
  if (
    !organization
  ) {
    throw new Error(
      "organization is required"
    );
  }

  return Environment.create({
    organizationId:
      organization._id,

    tenantId:
      organization.tenantId,

    name,

    slug,

    type,

    status:
      "active",

    isDefault:
      false,

    createdBy:
      userId,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  startPhase1Database,
  resetPhase1Database,
  stopPhase1Database,

  createPhase1App,

  registerPhase1User,
  createPhase1Environment,

  models: {
    User,
    PasswordCredential,
    Organization,
    OrganizationMembership,
    TenantConfig,
    UserSession,
    AuthenticationAuditEvent,
    Environment,
  },
};