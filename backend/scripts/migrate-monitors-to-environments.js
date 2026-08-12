"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const Monitor = require("../models/Monitor");
const MonitorCheck = require("../models/MonitorCheck");
const Service = require("../models/Service");

function log(message) {
  console.log(`[monitor-migration] ${message}`);
}

function warn(message) {
  console.warn(`[monitor-migration] WARN: ${message}`);
}

async function migrateMonitors() {
  const monitors =
    await Monitor.find({});

  log(
    `Found ${monitors.length} monitor records`
  );

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (const monitor of monitors) {
    try {
      if (monitor.environmentId) {
        const parentService =
          await Service.findOne({
            _id:
              monitor.serviceId,

            organizationId:
              monitor.organizationId,

            environmentId:
              monitor.environmentId,
          });

        if (!parentService) {
          warn(
            [
              `Monitor ${monitor._id} has environmentId`,
              `but parent service ownership does not match`,
              `service=${monitor.serviceId}`,
              `org=${monitor.organizationId}`,
              `env=${monitor.environmentId}`,
            ].join(" | ")
          );

          failed += 1;
          continue;
        }

        alreadyMigrated += 1;

        log(
          `Already migrated monitor ${monitor._id} (${monitor.name})`
        );

        continue;
      }

      const service =
        await Service.findOne({
          _id:
            monitor.serviceId,

          organizationId:
            monitor.organizationId,
        });

      if (!service) {
        warn(
          [
            `Unable to map monitor ${monitor._id}`,
            `name="${monitor.name}"`,
            `service=${monitor.serviceId}`,
            `organization=${monitor.organizationId}`,
            `reason=parent service not found`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      if (!service.environmentId) {
        warn(
          [
            `Unable to map monitor ${monitor._id}`,
            `name="${monitor.name}"`,
            `service=${service._id}`,
            `reason=parent service has no environmentId`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      monitor.environmentId =
        service.environmentId;

      /**
       * Defensive consistency repair.
       *
       * Service is canonical for organization + tenant lineage.
       */
      monitor.organizationId =
        service.organizationId;

      if (service.tenantId) {
        monitor.tenantId =
          service.tenantId;
      }

      await monitor.save();

      migrated += 1;

      log(
        [
          "Migrated monitor",
          `monitor=${monitor._id}`,
          `name="${monitor.name}"`,
          `service=${service._id}`,
          `environmentId=${service.environmentId}`,
        ].join(" | ")
      );
    } catch (error) {
      failed += 1;

      warn(
        `Failed monitor ${monitor._id}: ${error.message}`
      );
    }
  }

  return {
    total:
      monitors.length,

    migrated,

    alreadyMigrated,

    failed,
  };
}

async function migrateMonitorChecks() {
  const checks =
    await MonitorCheck.find({});

  log(
    `Found ${checks.length} monitor check records`
  );

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      if (check.environmentId) {
        const monitor =
          await Monitor.findOne({
            _id:
              check.monitorId,

            organizationId:
              check.organizationId,

            environmentId:
              check.environmentId,
          });

        if (!monitor) {
          warn(
            [
              `MonitorCheck ${check._id} has environmentId`,
              `but monitor ownership does not match`,
              `monitor=${check.monitorId}`,
              `org=${check.organizationId}`,
              `env=${check.environmentId}`,
            ].join(" | ")
          );

          failed += 1;
          continue;
        }

        alreadyMigrated += 1;

        continue;
      }

      const monitor =
        await Monitor.findById(
          check.monitorId
        );

      if (!monitor) {
        warn(
          [
            `Unable to map MonitorCheck ${check._id}`,
            `monitor=${check.monitorId}`,
            `reason=monitor not found`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      if (!monitor.environmentId) {
        warn(
          [
            `Unable to map MonitorCheck ${check._id}`,
            `monitor=${monitor._id}`,
            `reason=monitor has no environmentId`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      /**
       * Monitor is canonical for check ownership.
       */
      check.environmentId =
        monitor.environmentId;

      check.organizationId =
        monitor.organizationId;

      check.serviceId =
        monitor.serviceId;

      check.tenantId =
        monitor.tenantId;

      await check.save();

      migrated += 1;
    } catch (error) {
      failed += 1;

      warn(
        `Failed MonitorCheck ${check._id}: ${error.message}`
      );
    }
  }

  return {
    total:
      checks.length,

    migrated,

    alreadyMigrated,

    failed,
  };
}

async function verifyMonitors() {
  const invalidMonitors =
    await Monitor.find({
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
        "_id name serviceId organizationId"
      )
      .lean();

  if (
    invalidMonitors.length >
    0
  ) {
    warn(
      `${invalidMonitors.length} monitors still have no environmentId`
    );

    for (
      const monitor
      of invalidMonitors
    ) {
      warn(
        [
          "UNMAPPED MONITOR",
          `monitor=${monitor._id}`,
          `name="${monitor.name}"`,
          `service=${monitor.serviceId}`,
          `org=${monitor.organizationId}`,
        ].join(" | ")
      );
    }

    return false;
  }

  log(
    "Verification passed: every monitor has environmentId"
  );

  return true;
}

async function verifyMonitorChecks() {
  const invalidChecks =
    await MonitorCheck.find({
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
        "_id monitorId serviceId organizationId"
      )
      .lean();

  if (
    invalidChecks.length >
    0
  ) {
    warn(
      `${invalidChecks.length} MonitorChecks still have no environmentId`
    );

    for (
      const check
      of invalidChecks
    ) {
      warn(
        [
          "UNMAPPED CHECK",
          `check=${check._id}`,
          `monitor=${check.monitorId}`,
          `service=${check.serviceId}`,
          `org=${check.organizationId}`,
        ].join(" | ")
      );
    }

    return false;
  }

  log(
    "Verification passed: every MonitorCheck has environmentId"
  );

  return true;
}

async function inspectIndexes(
  model,
  label
) {
  const indexes =
    await model.collection.indexes();

  log(`${label} indexes:`);

  for (const index of indexes) {
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

  const monitorResult =
    await migrateMonitors();

  log(
    [
      "Monitor migration summary",
      `total=${monitorResult.total}`,
      `migrated=${monitorResult.migrated}`,
      `alreadyMigrated=${monitorResult.alreadyMigrated}`,
      `failed=${monitorResult.failed}`,
    ].join(" | ")
  );

  const monitorsValid =
    await verifyMonitors();

  if (!monitorsValid) {
    warn(
      "Monitor migration incomplete. MonitorCheck migration will not continue."
    );

    await mongoose.disconnect();

    process.exitCode = 1;
    return;
  }

  const checkResult =
    await migrateMonitorChecks();

  log(
    [
      "MonitorCheck migration summary",
      `total=${checkResult.total}`,
      `migrated=${checkResult.migrated}`,
      `alreadyMigrated=${checkResult.alreadyMigrated}`,
      `failed=${checkResult.failed}`,
    ].join(" | ")
  );

  const checksValid =
    await verifyMonitorChecks();

  if (!checksValid) {
    warn(
      "MonitorCheck migration incomplete."
    );

    await mongoose.disconnect();

    process.exitCode = 1;
    return;
  }

  await inspectIndexes(
    Monitor,
    "Monitor"
  );

  await inspectIndexes(
    MonitorCheck,
    "MonitorCheck"
  );

  log(
    "Monitor environment migration completed successfully"
  );

  await mongoose.disconnect();
}

run().catch(
  async (error) => {
    console.error(
      "[monitor-migration] FAILED:",
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