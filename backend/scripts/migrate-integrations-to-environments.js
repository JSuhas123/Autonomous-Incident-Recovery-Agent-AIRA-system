"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const {
  IntegrationConnection,
} = require("../models/IntegrationConnection");

const Service = require("../models/Service");
const Environment = require("../models/Environment");
const Organization = require("../models/Organization");

function log(message) {
  console.log(
    `[integration-migration] ${message}`
  );
}

function warn(message) {
  console.warn(
    `[integration-migration] WARN: ${message}`
  );
}

/**
 * Resolve environment conservatively.
 *
 * Priority:
 *
 * 1. Existing environmentId, if valid.
 * 2. All linked services agree on exactly one environment.
 * 3. Organization default environment only when there are
 *    no serviceIds and the org has an explicit defaultEnvironmentId.
 *
 * We never guess between multiple environments.
 */
async function resolveEnvironment(connection) {
  if (connection.environmentId) {
    const environment =
      await Environment.findOne({
        _id:
          connection.environmentId,

        organizationId:
          connection.organizationId,

        status: {
          $ne:
            "archived",
        },
      });

    if (!environment) {
      warn(
        [
          `Integration ${connection._id} has invalid environmentId`,
          `environment=${connection.environmentId}`,
          `organization=${connection.organizationId}`,
        ].join(" | ")
      );

      return null;
    }

    return environment;
  }

  /**
   * If the integration is attached to services, those services
   * are the strongest evidence for its environment.
   */
  if (
    Array.isArray(
      connection.serviceIds
    ) &&
    connection.serviceIds.length >
      0
  ) {
    const services =
      await Service.find({
        _id: {
          $in:
            connection.serviceIds,
        },

        organizationId:
          connection.organizationId,

        status: {
          $ne:
            "archived",
        },
      })
        .select(
          "_id environmentId"
        )
        .lean();

    if (
      services.length !==
      connection.serviceIds.length
    ) {
      warn(
        [
          `Integration ${connection._id}`,
          "references missing or cross-org services",
        ].join(" | ")
      );

      return null;
    }

    const environmentIds = [
      ...new Set(
        services
          .map(
            (service) =>
              service.environmentId
                ?.toString()
          )
          .filter(Boolean)
      ),
    ];

    if (
      environmentIds.length !==
      1
    ) {
      warn(
        [
          `Integration ${connection._id}`,
          `cannot determine one environment from linked services`,
          `environments=${environmentIds.join(",") || "none"}`,
        ].join(" | ")
      );

      return null;
    }

    return Environment.findOne({
      _id:
        environmentIds[0],

      organizationId:
        connection.organizationId,

      status: {
        $ne:
          "archived",
      },
    });
  }

  /**
   * Integration has no linked services.
   *
   * Only use an explicitly configured default environment.
   * Do not silently choose the first environment.
   */
  const organization =
    await Organization.findById(
      connection.organizationId
    );

  if (!organization) {
    warn(
      `Integration ${connection._id} references missing organization`
    );

    return null;
  }

  const defaultEnvironmentId =
    organization.settings
      ?.defaultEnvironmentId;

  if (!defaultEnvironmentId) {
    warn(
      [
        `Integration ${connection._id}`,
        "has no serviceIds and organization has no explicit default environment",
      ].join(" | ")
    );

    return null;
  }

  return Environment.findOne({
    _id:
      defaultEnvironmentId,

    organizationId:
      organization._id,

    status: {
      $ne:
        "archived",
    },
  });
}

async function validateLinkedServices(
  connection,
  environment
) {
  if (
    !connection.serviceIds ||
    connection.serviceIds.length ===
      0
  ) {
    return true;
  }

  const count =
    await Service.countDocuments({
      _id: {
        $in:
          connection.serviceIds,
      },

      organizationId:
        connection.organizationId,

      environmentId:
        environment._id,

      status: {
        $ne:
          "archived",
      },
    });

  return (
    count ===
    connection.serviceIds.length
  );
}

async function migrateConnections() {
  const connections =
    await IntegrationConnection.find(
      {}
    );

  log(
    `Found ${connections.length} integration records`
  );

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (
    const connection
    of connections
  ) {
    try {
      const environment =
        await resolveEnvironment(
          connection
        );

      if (!environment) {
        failed += 1;
        continue;
      }

      const servicesValid =
        await validateLinkedServices(
          connection,
          environment
        );

      if (!servicesValid) {
        warn(
          [
            `Integration ${connection._id}`,
            "contains serviceIds outside resolved environment",
            `environment=${environment._id}`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      const wasMigrated =
        Boolean(
          connection.environmentId
        );

      connection.environmentId =
        environment._id;

      await connection.save();

      if (wasMigrated) {
        alreadyMigrated += 1;

        log(
          [
            "Already migrated integration",
            `integration=${connection._id}`,
            `environment=${environment._id}`,
          ].join(" | ")
        );
      } else {
        migrated += 1;

        log(
          [
            "Migrated integration",
            `integration=${connection._id}`,
            `environment=${environment._id}`,
          ].join(" | ")
        );
      }
    } catch (error) {
      failed += 1;

      warn(
        `Failed integration ${connection._id}: ${error.message}`
      );
    }
  }

  return {
    total:
      connections.length,

    migrated,

    alreadyMigrated,

    failed,
  };
}

async function verifyConnections() {
  const invalid =
    await IntegrationConnection.find({
      $or: [
        {
          environmentId:
            null,
        },
        {
          environmentId: {
            $exists:
              false,
          },
        },
      ],
    })
      .select(
        "_id name organizationId provider serviceIds"
      )
      .lean();

  if (
    invalid.length >
    0
  ) {
    warn(
      `${invalid.length} integrations still have no environmentId`
    );

    for (
      const connection
      of invalid
    ) {
      warn(
        [
          "UNMAPPED INTEGRATION",
          `integration=${connection._id}`,
          `name="${connection.name}"`,
          `provider=${connection.provider}`,
          `org=${connection.organizationId}`,
          `services=${connection.serviceIds?.length || 0}`,
        ].join(" | ")
      );
    }

    return false;
  }

  log(
    "Verification passed: every integration has environmentId"
  );

  return true;
}

async function inspectIndexes() {
  const indexes =
    await IntegrationConnection
      .collection
      .indexes();

  log(
    "Integration indexes:"
  );

  for (
    const index
    of indexes
  ) {
    log(
      `${index.name}: ${JSON.stringify(
        index.key
      )}${
        index.unique
          ? " UNIQUE"
          : ""
      }`
    );
  }
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

  log(
    "Connected to MongoDB"
  );

  const result =
    await migrateConnections();

  log(
    [
      "Integration migration summary",
      `total=${result.total}`,
      `migrated=${result.migrated}`,
      `alreadyMigrated=${result.alreadyMigrated}`,
      `failed=${result.failed}`,
    ].join(" | ")
  );

  const valid =
    await verifyConnections();

  if (!valid) {
    warn(
      "Integration migration incomplete. Index synchronization will not continue."
    );

    await mongoose.disconnect();

    process.exitCode = 1;
    return;
  }

  await IntegrationConnection
    .createIndexes();

  log(
    "Integration indexes synchronized"
  );

  await inspectIndexes();

  log(
    "Integration environment migration completed successfully"
  );

  await mongoose.disconnect();
}

run().catch(
  async (error) => {
    console.error(
      "[integration-migration] FAILED:",
      error
    );

    try {
      await mongoose.disconnect();
    } catch {
      // Ignore disconnect failure.
    }

    process.exit(1);
  }
);