"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const {
  Incident,
} = require("../models/Incident");

const Monitor = require("../models/Monitor");
const Service = require("../models/Service");

function log(message) {
  console.log(
    `[incident-migration] ${message}`
  );
}

function warn(message) {
  console.warn(
    `[incident-migration] WARN: ${message}`
  );
}

async function resolveEnvironmentForIncident(
  incident
) {
  /**
   * Already migrated:
   * verify ownership still matches either Monitor or Service.
   */
  if (incident.environmentId) {
    if (incident.monitorId) {
      const monitor =
        await Monitor.findOne({
          _id:
            incident.monitorId,

          organizationId:
            incident.organizationId,

          environmentId:
            incident.environmentId,
        });

      if (monitor) {
        return {
          environmentId:
            monitor.environmentId,

          serviceId:
            monitor.serviceId,

          tenantId:
            monitor.tenantId,

          source:
            "monitor",
        };
      }
    }

    const service =
      await Service.findOne({
        _id:
          incident.serviceId,

        organizationId:
          incident.organizationId,

        environmentId:
          incident.environmentId,
      });

    if (service) {
      return {
        environmentId:
          service.environmentId,

        serviceId:
          service._id,

        tenantId:
          service.tenantId,

        source:
          "service",
      };
    }

    warn(
      [
        `Incident ${incident._id} already has environmentId`,
        `but ownership cannot be verified`,
        `environment=${incident.environmentId}`,
        `service=${incident.serviceId}`,
        `monitor=${incident.monitorId || "-"}`,
      ].join(" | ")
    );

    return null;
  }

  /**
   * Preferred lineage:
   *
   * Incident
   *   -> Monitor
   *      -> environmentId
   */
  if (incident.monitorId) {
    const monitor =
      await Monitor.findOne({
        _id:
          incident.monitorId,

        organizationId:
          incident.organizationId,
      });

    if (
      monitor &&
      monitor.environmentId
    ) {
      return {
        environmentId:
          monitor.environmentId,

        serviceId:
          monitor.serviceId,

        tenantId:
          monitor.tenantId,

        source:
          "monitor",
      };
    }
  }

  /**
   * Fallback for manual/integration incidents:
   *
   * Incident
   *   -> Service
   *      -> environmentId
   */
  if (incident.serviceId) {
    const service =
      await Service.findOne({
        _id:
          incident.serviceId,

        organizationId:
          incident.organizationId,
      });

    if (
      service &&
      service.environmentId
    ) {
      return {
        environmentId:
          service.environmentId,

        serviceId:
          service._id,

        tenantId:
          service.tenantId,

        source:
          "service",
      };
    }
  }

  warn(
    [
      `Unable to map incident ${incident._id}`,
      `title="${incident.title}"`,
      `organization=${incident.organizationId}`,
      `service=${incident.serviceId || "-"}`,
      `monitor=${incident.monitorId || "-"}`,
    ].join(" | ")
  );

  return null;
}

async function migrateIncidents() {
  const incidents =
    await Incident.find({});

  log(
    `Found ${incidents.length} incident records`
  );

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (
    const incident
    of incidents
  ) {
    try {
      const resolved =
        await resolveEnvironmentForIncident(
          incident
        );

      if (!resolved) {
        failed += 1;
        continue;
      }

      const wasAlreadyMigrated =
        Boolean(
          incident.environmentId
        );

      incident.environmentId =
        resolved.environmentId;

      /**
       * Repair service/tenant lineage from canonical source.
       */
      incident.serviceId =
        resolved.serviceId;

      if (resolved.tenantId) {
        incident.tenantId =
          resolved.tenantId;
      }

      /**
       * Rebuild fingerprint because environmentId is now part
       * of incident identity.
       *
       * This avoids carrying old org-only fingerprints forward.
       */
      const {
        buildFingerprint,
      } =
        require("../models/Incident");

      const rawFingerprint =
        buildFingerprint({
          organizationId:
            incident.organizationId,

          environmentId:
            incident.environmentId,

          serviceId:
            incident.serviceId,

          monitorId:
            incident.monitorId,

          source:
            incident.source ||
            "monitor",

          errorCode:
            incident.evidence?.[
              incident.evidence.length -
                1
            ]?.errorCode ||
            "http_failure",
        });

      const crypto =
        require("crypto");

      incident.fingerprint =
        crypto
          .createHash("sha256")
          .update(rawFingerprint)
          .digest("hex")
          .slice(0, 16);

      await incident.save();

      if (
        wasAlreadyMigrated
      ) {
        alreadyMigrated += 1;

        log(
          [
            "Already migrated incident",
            `incident=${incident._id}`,
            `environment=${incident.environmentId}`,
            `verifiedVia=${resolved.source}`,
          ].join(" | ")
        );
      } else {
        migrated += 1;

        log(
          [
            "Migrated incident",
            `incident=${incident._id}`,
            `environment=${incident.environmentId}`,
            `verifiedVia=${resolved.source}`,
          ].join(" | ")
        );
      }
    } catch (error) {
      failed += 1;

      warn(
        `Failed incident ${incident._id}: ${error.message}`
      );
    }
  }

  return {
    total:
      incidents.length,

    migrated,

    alreadyMigrated,

    failed,
  };
}

async function verifyIncidents() {
  const invalid =
    await Incident.find({
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
        "_id title organizationId serviceId monitorId"
      )
      .lean();

  if (
    invalid.length >
    0
  ) {
    warn(
      `${invalid.length} incidents still have no environmentId`
    );

    for (
      const incident
      of invalid
    ) {
      warn(
        [
          "UNMAPPED INCIDENT",
          `incident=${incident._id}`,
          `title="${incident.title}"`,
          `org=${incident.organizationId}`,
          `service=${incident.serviceId || "-"}`,
          `monitor=${incident.monitorId || "-"}`,
        ].join(" | ")
      );
    }

    return false;
  }

  log(
    "Verification passed: every incident has environmentId"
  );

  return true;
}

async function inspectIndexes() {
  const indexes =
    await Incident.collection.indexes();

  log(
    "Incident indexes:"
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

async function ensureIndexes() {
  await Incident.createIndexes();

  log(
    "Incident indexes synchronized"
  );
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
    await migrateIncidents();

  log(
    [
      "Incident migration summary",
      `total=${result.total}`,
      `migrated=${result.migrated}`,
      `alreadyMigrated=${result.alreadyMigrated}`,
      `failed=${result.failed}`,
    ].join(" | ")
  );

  const valid =
    await verifyIncidents();

  if (!valid) {
    warn(
      "Incident migration incomplete. Index synchronization will not continue."
    );

    await mongoose.disconnect();

    process.exitCode = 1;
    return;
  }

  await ensureIndexes();

  await inspectIndexes();

  log(
    "Incident environment migration completed successfully"
  );

  await mongoose.disconnect();
}

run().catch(
  async (error) => {
    console.error(
      "[incident-migration] FAILED:",
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