"use strict";

require("dotenv").config();

const mongoose =
  require("mongoose");

const KubernetesClusterSnapshot =
  require(
    "../models/KubernetesClusterSnapshot"
  );

const KubernetesResource =
  require(
    "../models/KubernetesResource"
  );

const KubernetesResourceRelation =
  require(
    "../models/KubernetesResourceRelation"
  );

const {
  IntegrationConnection,
} =
  require(
    "../models/IntegrationConnection"
  );

function log(message) {
  console.log(
    `[k8s-migration] ${message}`
  );
}

function warn(message) {
  console.warn(
    `[k8s-migration] WARN: ${message}`
  );
}

// ---------------------------------------------------------------------------
// Integration ownership resolution
// ---------------------------------------------------------------------------

async function resolveIntegrationOwnership(
  integrationId,
  organizationId = null
) {
  if (!integrationId) {
    return null;
  }

  const query = {
    _id:
      integrationId,
  };

  if (organizationId) {
    query.organizationId =
      organizationId;
  }

  const integration =
    await IntegrationConnection
      .findOne(query)
      .select(
        "_id organizationId environmentId tenantId provider"
      )
      .lean();

  if (!integration) {
    return null;
  }

  if (
    integration.provider !==
    "kubernetes"
  ) {
    warn(
      [
        `Integration ${integrationId}`,
        `provider=${integration.provider}`,
        "is referenced by Kubernetes inventory",
      ].join(" | ")
    );
  }

  if (
    !integration.organizationId ||
    !integration.environmentId
  ) {
    return null;
  }

  return {
    organizationId:
      integration.organizationId,

    environmentId:
      integration.environmentId,

    tenantId:
      integration.tenantId,
  };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

async function migrateSnapshots() {
  const records =
    await KubernetesClusterSnapshot
      .find({});

  log(
    `Found ${records.length} Kubernetes snapshot record(s)`
  );

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (
    const snapshot
    of records
  ) {
    try {
      const ownership =
        await resolveIntegrationOwnership(
          snapshot.integrationId,
          snapshot.organizationId
        );

      if (!ownership) {
        warn(
          [
            `Unable to map snapshot ${snapshot._id}`,
            `integration=${snapshot.integrationId}`,
            `org=${snapshot.organizationId}`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      const wasMigrated =
        Boolean(
          snapshot.environmentId
        );

      snapshot.organizationId =
        ownership.organizationId;

      snapshot.environmentId =
        ownership.environmentId;

      if (ownership.tenantId) {
        snapshot.tenantId =
          String(
            ownership.tenantId
          );
      }

      await snapshot.save();

      if (wasMigrated) {
        alreadyMigrated += 1;
      } else {
        migrated += 1;
      }
    } catch (error) {
      failed += 1;

      warn(
        `Snapshot ${snapshot._id} failed: ${error.message}`
      );
    }
  }

  return {
    total:
      records.length,
    migrated,
    alreadyMigrated,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

async function migrateResources() {
  const records =
    await KubernetesResource
      .find({});

  log(
    `Found ${records.length} Kubernetes resource record(s)`
  );

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (
    const resource
    of records
  ) {
    try {
      const ownership =
        await resolveIntegrationOwnership(
          resource.integrationId,
          resource.organizationId
        );

      if (!ownership) {
        warn(
          [
            `Unable to map resource ${resource._id}`,
            `kind=${resource.kind}`,
            `name=${resource.name}`,
            `integration=${resource.integrationId}`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      const wasMigrated =
        Boolean(
          resource.environmentId
        );

      resource.organizationId =
        ownership.organizationId;

      resource.environmentId =
        ownership.environmentId;

      if (ownership.tenantId) {
        resource.tenantId =
          String(
            ownership.tenantId
          );
      }

      await resource.save();

      if (wasMigrated) {
        alreadyMigrated += 1;
      } else {
        migrated += 1;
      }
    } catch (error) {
      failed += 1;

      warn(
        `Resource ${resource._id} failed: ${error.message}`
      );
    }
  }

  return {
    total:
      records.length,
    migrated,
    alreadyMigrated,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

async function migrateRelations() {
  const records =
    await KubernetesResourceRelation
      .find({});

  log(
    `Found ${records.length} Kubernetes relationship record(s)`
  );

  let migrated = 0;
  let alreadyMigrated = 0;
  let failed = 0;

  for (
    const relation
    of records
  ) {
    try {
      /**
       * First validate both resources.
       *
       * Relationship ownership must agree with both
       * source and target resources.
       */
      const [
        source,
        target,
      ] =
        await Promise.all([
          KubernetesResource
            .findById(
              relation.sourceResourceId
            )
            .select(
              "organizationId environmentId integrationId tenantId"
            )
            .lean(),

          KubernetesResource
            .findById(
              relation.targetResourceId
            )
            .select(
              "organizationId environmentId integrationId tenantId"
            )
            .lean(),
        ]);

      if (
        !source ||
        !target
      ) {
        warn(
          [
            `Unable to map relation ${relation._id}`,
            "source or target resource missing",
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      const sameOwnership =
        String(
          source.organizationId
        ) ===
          String(
            target.organizationId
          ) &&
        String(
          source.environmentId
        ) ===
          String(
            target.environmentId
          ) &&
        String(
          source.integrationId
        ) ===
          String(
            target.integrationId
          );

      if (!sameOwnership) {
        warn(
          [
            `Relation ${relation._id}`,
            "crosses Kubernetes ownership boundaries",
            `source=${source._id}`,
            `target=${target._id}`,
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      if (
        !source.environmentId
      ) {
        warn(
          [
            `Relation ${relation._id}`,
            "source resource has no environmentId",
          ].join(" | ")
        );

        failed += 1;
        continue;
      }

      const wasMigrated =
        Boolean(
          relation.environmentId
        );

      relation.organizationId =
        source.organizationId;

      relation.environmentId =
        source.environmentId;

      relation.integrationId =
        source.integrationId;

      relation.tenantId =
        String(
          source.tenantId
        );

      await relation.save();

      if (wasMigrated) {
        alreadyMigrated += 1;
      } else {
        migrated += 1;
      }
    } catch (error) {
      failed += 1;

      warn(
        `Relation ${relation._id} failed: ${error.message}`
      );
    }
  }

  return {
    total:
      records.length,
    migrated,
    alreadyMigrated,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verifyModel(
  Model,
  label
) {
  const invalid =
    await Model.countDocuments({
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
          integrationId:
            null,
        },
        {
          integrationId: {
            $exists:
              false,
          },
        },
      ],
    });

  if (
    invalid > 0
  ) {
    warn(
      `${label}: ${invalid} record(s) missing canonical ownership`
    );

    return false;
  }

  log(
    `${label}: ownership verification passed`
  );

  return true;
}

// ---------------------------------------------------------------------------
// Legacy indexes
// ---------------------------------------------------------------------------

async function dropIndexIfPresent(
  collection,
  indexName,
  label
) {
  const indexes =
    await collection.indexes();

  const index =
    indexes.find(
      (candidate) =>
        candidate.name ===
        indexName
    );

  if (!index) {
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

async function removeLegacyIndexes() {
  /**
   * Old KubernetesResource uniqueness:
   *
   * tenantId +
   * integrationId +
   * kind +
   * namespace +
   * name
   */
  await dropIndexIfPresent(
    KubernetesResource.collection,

    "tenantId_1_integrationId_1_kind_1_namespace_1_name_1",

    "KubernetesResource"
  );

  /**
   * Old KubernetesResourceRelation uniqueness:
   *
   * tenantId +
   * integrationId +
   * source +
   * target +
   * relationType
   */
  await dropIndexIfPresent(
    KubernetesResourceRelation
      .collection,

    "tenantId_1_integrationId_1_sourceResourceId_1_targetResourceId_1_relationType_1",

    "KubernetesResourceRelation"
  );
}

// ---------------------------------------------------------------------------
// Index creation
// ---------------------------------------------------------------------------

async function synchronizeIndexes() {
  await KubernetesClusterSnapshot
    .createIndexes();

  log(
    "KubernetesClusterSnapshot indexes synchronized"
  );

  await KubernetesResource
    .createIndexes();

  log(
    "KubernetesResource indexes synchronized"
  );

  await KubernetesResourceRelation
    .createIndexes();

  log(
    "KubernetesResourceRelation indexes synchronized"
  );
}

async function inspectIndexes(
  Model,
  label
) {
  const indexes =
    await Model.collection
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
// Main
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

  const snapshotResult =
    await migrateSnapshots();

  log(
    [
      "Snapshot migration",
      `total=${snapshotResult.total}`,
      `migrated=${snapshotResult.migrated}`,
      `alreadyMigrated=${snapshotResult.alreadyMigrated}`,
      `failed=${snapshotResult.failed}`,
    ].join(" | ")
  );

  const resourceResult =
    await migrateResources();

  log(
    [
      "Resource migration",
      `total=${resourceResult.total}`,
      `migrated=${resourceResult.migrated}`,
      `alreadyMigrated=${resourceResult.alreadyMigrated}`,
      `failed=${resourceResult.failed}`,
    ].join(" | ")
  );

  /**
   * Relations run after resources because they derive
   * canonical ownership from the migrated resources.
   */
  const relationResult =
    await migrateRelations();

  log(
    [
      "Relationship migration",
      `total=${relationResult.total}`,
      `migrated=${relationResult.migrated}`,
      `alreadyMigrated=${relationResult.alreadyMigrated}`,
      `failed=${relationResult.failed}`,
    ].join(" | ")
  );

  const [
    snapshotsValid,
    resourcesValid,
    relationsValid,
  ] =
    await Promise.all([
      verifyModel(
        KubernetesClusterSnapshot,
        "KubernetesClusterSnapshot"
      ),

      verifyModel(
        KubernetesResource,
        "KubernetesResource"
      ),

      verifyModel(
        KubernetesResourceRelation,
        "KubernetesResourceRelation"
      ),
    ]);

  if (
    !snapshotsValid ||
    !resourcesValid ||
    !relationsValid
  ) {
    warn(
      "Kubernetes migration incomplete. Index migration aborted."
    );

    await mongoose.disconnect();

    process.exitCode =
      1;

    return;
  }

  await removeLegacyIndexes();

  await synchronizeIndexes();

  await inspectIndexes(
    KubernetesClusterSnapshot,
    "KubernetesClusterSnapshot"
  );

  await inspectIndexes(
    KubernetesResource,
    "KubernetesResource"
  );

  await inspectIndexes(
    KubernetesResourceRelation,
    "KubernetesResourceRelation"
  );

  log(
    "Kubernetes environment migration completed successfully"
  );

  await mongoose.disconnect();
}

run().catch(
  async (error) => {
    console.error(
      "[k8s-migration] FAILED:",
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