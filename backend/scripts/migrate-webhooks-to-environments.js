"use strict";

require("dotenv").config();

const mongoose =
  require("mongoose");

const webhookIngestionService =
  require(
    "../services/integrations/webhookIngestionService"
  );

function log(message) {
  console.log(
    `[webhook-migration] ${message}`
  );
}

function warn(message) {
  console.warn(
    `[webhook-migration] WARN: ${message}`
  );
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verifyConfigs(
  WebhookConfig
) {
  const invalid =
    await WebhookConfig.find({
      $or: [
        {
          organizationId:
            null,
        },
        {
          organizationId: {
            $exists:
              false,
          },
        },
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
        "_id tenantId organizationId environmentId"
      )
      .lean();

  if (
    invalid.length > 0
  ) {
    warn(
      `${invalid.length} webhook configs are missing organization/environment ownership`
    );

    for (
      const config
      of invalid
    ) {
      warn(
        [
          "UNMAPPED WEBHOOK CONFIG",
          `config=${config._id}`,
          `tenant=${config.tenantId || "-"}`,
          `org=${config.organizationId || "-"}`,
          `env=${config.environmentId || "-"}`,
        ].join(" | ")
      );
    }

    return false;
  }

  log(
    "Verification passed: every WebhookConfig has organizationId + environmentId"
  );

  return true;
}

async function verifyEvents(
  WebhookEvent
) {
  const invalid =
    await WebhookEvent.find({
      $or: [
        {
          organizationId:
            null,
        },
        {
          organizationId: {
            $exists:
              false,
          },
        },
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
        {
          sourceId:
            null,
        },
        {
          sourceId: {
            $exists:
              false,
          },
        },
      ],
    })
      .select(
        "_id tenantId source sourceId eventId organizationId environmentId"
      )
      .lean();

  if (
    invalid.length > 0
  ) {
    warn(
      `${invalid.length} webhook events are missing canonical ownership`
    );

    for (
      const event
      of invalid
    ) {
      warn(
        [
          "UNMAPPED WEBHOOK EVENT",
          `event=${event._id}`,
          `externalEvent=${event.eventId || "-"}`,
          `tenant=${event.tenantId || "-"}`,
          `source=${event.source || "-"}`,
          `sourceId=${event.sourceId || "-"}`,
          `org=${event.organizationId || "-"}`,
          `env=${event.environmentId || "-"}`,
        ].join(" | ")
      );
    }

    return false;
  }

  log(
    "Verification passed: every WebhookEvent has canonical ownership"
  );

  return true;
}

// ---------------------------------------------------------------------------
// Legacy index cleanup
// ---------------------------------------------------------------------------

async function dropIndexIfExists(
  collection,
  indexName,
  label
) {
  const indexes =
    await collection.indexes();

  const exists =
    indexes.some(
      (index) =>
        index.name ===
        indexName
    );

  if (!exists) {
    log(
      `${label}: legacy index ${indexName} not found`
    );

    return;
  }

  await collection.dropIndex(
    indexName
  );

  log(
    `${label}: dropped legacy index ${indexName}`
  );
}

async function removeLegacyIndexes(
  WebhookConfig,
  WebhookEvent
) {
  /**
   * OLD WebhookConfig schema:
   *
   * tenantId: {
   *   unique: true
   * }
   *
   * That generated:
   *
   * tenantId_1 UNIQUE
   *
   * This is invalid now because one tenant may have
   * webhook configs in multiple environments.
   */
  const configIndexes =
    await WebhookConfig
      .collection
      .indexes();

  const tenantIndex =
    configIndexes.find(
      (index) =>
        index.name ===
        "tenantId_1"
    );

  if (
    tenantIndex &&
    tenantIndex.unique ===
      true
  ) {
    await WebhookConfig
      .collection
      .dropIndex(
        "tenantId_1"
      );

    log(
      "WebhookConfig: dropped legacy UNIQUE tenantId_1 index"
    );
  } else if (
    tenantIndex
  ) {
    log(
      "WebhookConfig: tenantId_1 already has correct non-unique form"
    );
  } else {
    log(
      "WebhookConfig: tenantId_1 legacy index not found"
    );
  }

  /**
   * OLD WebhookEvent schema:
   *
   * eventId: {
   *   unique: true
   * }
   *
   * External event IDs must now only be unique within
   * environment + source.
   */
  const eventIndexes =
    await WebhookEvent
      .collection
      .indexes();

  const eventIdIndex =
    eventIndexes.find(
      (index) =>
        index.name ===
        "eventId_1"
    );

  if (
    eventIdIndex &&
    eventIdIndex.unique ===
      true
  ) {
    await WebhookEvent
      .collection
      .dropIndex(
        "eventId_1"
      );

    log(
      "WebhookEvent: dropped legacy UNIQUE eventId_1 index"
    );
  } else if (
    eventIdIndex
  ) {
    /**
     * The new schema does not need a standalone
     * eventId index at all.
     */
    await WebhookEvent
      .collection
      .dropIndex(
        "eventId_1"
      );

    log(
      "WebhookEvent: dropped legacy eventId_1 index"
    );
  } else {
    log(
      "WebhookEvent: legacy eventId_1 index not found"
    );
  }

  /**
   * Remove the old standalone organization-agnostic
   * timestamp/source indexes only if desired later.
   *
   * They are harmless, so this migration intentionally
   * leaves them alone.
   */
}

// ---------------------------------------------------------------------------
// Index synchronization
// ---------------------------------------------------------------------------

async function createIndexes(
  WebhookConfig,
  WebhookEvent
) {
  await WebhookConfig
    .createIndexes();

  log(
    "WebhookConfig indexes synchronized"
  );

  await WebhookEvent
    .createIndexes();

  log(
    "WebhookEvent indexes synchronized"
  );
}

async function inspectIndexes(
  model,
  label
) {
  const indexes =
    await model
      .collection
      .indexes();

  log(
    `${label} indexes:`
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

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function run() {
  if (
    !process.env.MONGODB_URI
  ) {
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

  const WebhookConfig =
    webhookIngestionService
      .WebhookConfig;

  const WebhookEvent =
    webhookIngestionService
      .WebhookEvent;

  const configCount =
    await WebhookConfig
      .countDocuments();

  const eventCount =
    await WebhookEvent
      .countDocuments();

  log(
    `Found ${configCount} webhook config record(s)`
  );

  log(
    `Found ${eventCount} webhook event record(s)`
  );

  const configsValid =
    await verifyConfigs(
      WebhookConfig
    );

  const eventsValid =
    await verifyEvents(
      WebhookEvent
    );

  if (
    !configsValid ||
    !eventsValid
  ) {
    warn(
      "Webhook migration cannot safely infer environment ownership for legacy records."
    );

    warn(
      "No records were modified. Resolve legacy records manually before continuing."
    );

    await mongoose.disconnect();

    process.exitCode =
      1;

    return;
  }

  /**
   * Critical:
   *
   * Drop incompatible indexes BEFORE asking
   * Mongoose to create the new indexes.
   */
  await removeLegacyIndexes(
    WebhookConfig,
    WebhookEvent
  );

  await createIndexes(
    WebhookConfig,
    WebhookEvent
  );

  await inspectIndexes(
    WebhookConfig,
    "WebhookConfig"
  );

  await inspectIndexes(
    WebhookEvent,
    "WebhookEvent"
  );

  log(
    "Webhook environment migration completed successfully"
  );

  await mongoose.disconnect();
}

run().catch(
  async (error) => {
    console.error(
      "[webhook-migration] FAILED:",
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