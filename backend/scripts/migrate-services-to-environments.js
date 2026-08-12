"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const Service = require("../models/Service");
const Environment = require("../models/Environment");
const Organization = require("../models/Organization");

function log(message) {
  console.log(`[service-migration] ${message}`);
}

function warn(message) {
  console.warn(`[service-migration] WARN: ${message}`);
}

async function resolveEnvironmentForService(service) {
  /**
   * Already migrated.
   */
  if (service.environmentId) {
    const existingEnvironment =
      await Environment.findOne({
        _id: service.environmentId,
        organizationId: service.organizationId,
      });

    if (existingEnvironment) {
      return existingEnvironment;
    }

    warn(
      `Service ${service._id} has environmentId=${service.environmentId} but the environment cannot be resolved`
    );

    return null;
  }

  /**
   * Legacy services identify environment using:
   *
   * environment:
   *   development
   *   testing
   *   staging
   *   production
   */
  if (!service.environment) {
    warn(
      `Service ${service._id} (${service.name}) has no legacy environment value`
    );

    return null;
  }

  const environment =
    await Environment.findOne({
      organizationId: service.organizationId,
      type: service.environment,
      status: {
        $ne: "archived",
      },
    });

  if (environment) {
    return environment;
  }

  /**
   * Some organizations may not yet have the required environment.
   *
   * We deliberately do NOT guess or silently assign the default
   * environment because that could place production data in the
   * wrong operational boundary.
   */
  warn(
    [
      `Unable to map service ${service._id}`,
      `name="${service.name}"`,
      `organization=${service.organizationId}`,
      `legacyEnvironment="${service.environment}"`,
    ].join(" | ")
  );

  return null;
}

async function migrateServices() {
  const services =
    await Service.find({});

  log(`Found ${services.length} service records`);

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (const service of services) {
    try {
      if (!service.organizationId) {
        warn(
          `Service ${service._id} has no organizationId`
        );

        failed += 1;
        continue;
      }

      const organization =
        await Organization.findById(
          service.organizationId
        );

      if (!organization) {
        warn(
          `Service ${service._id} references missing organization ${service.organizationId}`
        );

        failed += 1;
        continue;
      }

      if (service.environmentId) {
        const existingEnvironment =
          await resolveEnvironmentForService(
            service
          );

        if (existingEnvironment) {
          alreadyMigrated += 1;

          log(
            `Already migrated: ${service.name} -> ${existingEnvironment.name}`
          );
        } else {
          failed += 1;
        }

        continue;
      }

      const environment =
        await resolveEnvironmentForService(
          service
        );

      if (!environment) {
        failed += 1;
        continue;
      }

      service.environmentId =
        environment._id;

      /**
       * Keep the legacy string synchronized for compatibility.
       */
      service.environment =
        environment.type;

      await service.save();

      migrated += 1;

      log(
        [
          `Migrated`,
          `${service.name}`,
          `service=${service._id}`,
          `environment=${environment.name}`,
          `environmentId=${environment._id}`,
        ].join(" | ")
      );
    } catch (error) {
      failed += 1;

      warn(
        `Failed service ${service._id}: ${error.message}`
      );
    }
  }

  return {
    migrated,
    alreadyMigrated,
    failed,
    total: services.length,
  };
}

async function inspectServiceIndexes() {
  const collection =
    Service.collection;

  const indexes =
    await collection.indexes();

  log("Current Service indexes:");

  for (const index of indexes) {
    log(
      `${index.name}: ${JSON.stringify(index.key)}${
        index.unique ? " UNIQUE" : ""
      }`
    );
  }

  return indexes;
}

async function dropLegacyUniqueIndex(
  indexes
) {
  const legacyIndex =
    indexes.find(
      (index) =>
        index.unique === true &&
        index.key?.organizationId === 1 &&
        index.key?.slug === 1 &&
        Object.keys(index.key).length === 2
    );

  if (!legacyIndex) {
    log(
      "Legacy organizationId+slug unique index not found"
    );

    return false;
  }

  log(
    `Dropping legacy index ${legacyIndex.name}`
  );

  await Service.collection.dropIndex(
    legacyIndex.name
  );

  log(
    `Dropped ${legacyIndex.name}`
  );

  return true;
}

async function ensureEnvironmentUniqueIndex() {
  const collection =
    Service.collection;

  const indexes =
    await collection.indexes();

  const expected =
    indexes.find(
      (index) =>
        index.unique === true &&
        index.key?.organizationId === 1 &&
        index.key?.environmentId === 1 &&
        index.key?.slug === 1
    );

  if (expected) {
    log(
      `Environment-scoped unique index already exists: ${expected.name}`
    );

    return;
  }

  log(
    "Creating environment-scoped unique service index"
  );

  await collection.createIndex(
    {
      organizationId: 1,
      environmentId: 1,
      slug: 1,
    },
    {
      unique: true,

      partialFilterExpression: {
        environmentId: {
          $type: "objectId",
        },
      },

      name:
        "organizationId_1_environmentId_1_slug_1",
    }
  );

  log(
    "Environment-scoped unique index created"
  );
}

async function verifyMigration() {
  const missingEnvironmentId =
    await Service.find({
      status: {
        $ne: "archived",
      },

      $or: [
        {
          environmentId: null,
        },
        {
          environmentId: {
            $exists: false,
          },
        },
      ],
    })
      .select(
        "_id name organizationId environment"
      )
      .lean();

  if (
    missingEnvironmentId.length >
    0
  ) {
    warn(
      `${missingEnvironmentId.length} non-archived services still have no environmentId`
    );

    for (
      const service
      of missingEnvironmentId
    ) {
      warn(
        [
          `UNMAPPED`,
          `service=${service._id}`,
          `name="${service.name}"`,
          `org=${service.organizationId}`,
          `legacyEnvironment=${service.environment}`,
        ].join(" | ")
      );
    }

    return false;
  }

  log(
    "Verification passed: every non-archived service has environmentId"
  );

  return true;
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is required"
    );
  }

  await mongoose.connect(
    process.env.MONGODB_URI
  );

  log("Connected to MongoDB");

  /**
   * ---------------------------------------------------------------
   * STEP 1 — migrate data first
   * ---------------------------------------------------------------
   */
  const result =
    await migrateServices();

  log(
    [
      "Migration summary",
      `total=${result.total}`,
      `migrated=${result.migrated}`,
      `alreadyMigrated=${result.alreadyMigrated}`,
      `failed=${result.failed}`,
    ].join(" | ")
  );

  /**
   * ---------------------------------------------------------------
   * STEP 2 — verify before changing uniqueness
   * ---------------------------------------------------------------
   */
  const migrationValid =
    await verifyMigration();

  if (!migrationValid) {
    warn(
      "Migration is incomplete. Index changes will NOT be performed."
    );

    warn(
      "Resolve the unmapped service records and run the script again."
    );

    await mongoose.disconnect();

    process.exitCode = 1;
    return;
  }

  /**
   * ---------------------------------------------------------------
   * STEP 3 — inspect indexes
   * ---------------------------------------------------------------
   */
  const indexes =
    await inspectServiceIndexes();

  /**
   * ---------------------------------------------------------------
   * STEP 4 — remove obsolete organization-wide uniqueness
   * ---------------------------------------------------------------
   */
  await dropLegacyUniqueIndex(
    indexes
  );

  /**
   * ---------------------------------------------------------------
   * STEP 5 — ensure new uniqueness
   * ---------------------------------------------------------------
   */
  await ensureEnvironmentUniqueIndex();

  /**
   * ---------------------------------------------------------------
   * STEP 6 — final verification
   * ---------------------------------------------------------------
   */
  await verifyMigration();

  log(
    "Service environment migration completed successfully"
  );

  await mongoose.disconnect();
}

run().catch(
  async (error) => {
    console.error(
      "[service-migration] FAILED:",
      error
    );

    try {
      await mongoose.disconnect();
    } catch {
      // Ignore disconnect errors after failure.
    }

    process.exit(1);
  }
);