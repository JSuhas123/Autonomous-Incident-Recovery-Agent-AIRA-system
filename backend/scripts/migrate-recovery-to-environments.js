'use strict';

require('dotenv').config();

const mongoose = require('mongoose');

const Runbook =
  require('../models/Runbook');

const Playbook =
  require('../models/Playbook');

const RunbookExecution =
  require('../models/RunbookExecution');

const PlaybookExecution =
  require('../models/PlaybookExecution');

const DecisionTrace =
  require('../models/DecisionTrace');

const ApprovalRequest =
  require('../models/ApprovalRequest');

const Organization =
  require('../models/Organization');

const Environment =
  require('../models/Environment');

const PREFIX =
  '[recovery-migration]';

// ============================================================================
// LOGGING
// ============================================================================

function log(...args) {
  console.log(
    PREFIX,
    ...args
  );
}

function warn(...args) {
  console.warn(
    PREFIX,
    ...args
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function isSystemOwned(document) {
  return (
    document?.owner?.ownerType ===
    'system'
  );
}

async function resolveEnvironmentForTenantRecord(
  record
) {
  if (
    record.environmentId &&
    record.organizationId
  ) {
    return {
      organizationId:
        record.organizationId,

      environmentId:
        record.environmentId,
    };
  }

  const organizationId =
    record.organizationId ||
    record.orgId ||
    null;

  if (!organizationId) {
    return null;
  }

  const organization =
    await Organization
      .findById(
        organizationId
      )
      .lean();

  if (!organization) {
    return null;
  }

  if (
    organization.defaultEnvironmentId
  ) {
    const environment =
      await Environment
        .findOne({
          _id:
            organization
              .defaultEnvironmentId,

          organizationId:
            organization._id,
        })
        .lean();

    if (environment) {
      return {
        organizationId:
          organization._id,

        environmentId:
          environment._id,
      };
    }
  }

  const environments =
    await Environment
      .find({
        organizationId:
          organization._id,
      })
      .sort({
        createdAt:
          1,
      })
      .limit(2)
      .lean();

  if (
    environments.length ===
    1
  ) {
    return {
      organizationId:
        organization._id,

      environmentId:
        environments[0]._id,
    };
  }

  return null;
}

async function verifyTenantOwnership(
  Model,
  label,
  {
    allowSystem = false,
  } = {}
) {
  const docs =
    await Model
      .find({})
      .lean();

  const invalid =
    docs.filter(
      (doc) => {
        if (
          allowSystem &&
          isSystemOwned(doc)
        ) {
          return false;
        }

        return (
          !doc.organizationId ||
          !doc.environmentId
        );
      }
    );

  if (
    invalid.length >
    0
  ) {
    throw new Error(
      `${label}: ${invalid.length} record(s) still missing organizationId/environmentId`
    );
  }

  log(
    `Verification passed: ${label}`
  );
}

// ============================================================================
// RUNBOOKS
// ============================================================================

async function migrateRunbooks() {
  const docs =
    await Runbook.find({});

  log(
    `Found ${docs.length} runbook record(s)`
  );

  let migrated =
    0;

  let skippedSystem =
    0;

  let unresolved =
    0;

  for (
    const doc
    of docs
  ) {
    if (
      isSystemOwned(doc)
    ) {
      skippedSystem++;

      continue;
    }

    if (
      doc.organizationId &&
      doc.environmentId
    ) {
      continue;
    }

    const resolved =
      await resolveEnvironmentForTenantRecord(
        doc
      );

    if (!resolved) {
      unresolved++;

      warn(
        `Runbook ${doc._id} unresolved`
      );

      continue;
    }

    doc.organizationId =
      resolved.organizationId;

    doc.environmentId =
      resolved.environmentId;

    await doc.save();

    migrated++;
  }

  log(
    `Runbook summary | migrated=${migrated} | system=${skippedSystem} | unresolved=${unresolved}`
  );

  if (
    unresolved >
    0
  ) {
    throw new Error(
      `${unresolved} tenant runbook(s) could not be assigned to an environment`
    );
  }

  await Runbook.syncIndexes();

  log(
    'Runbook indexes synchronized'
  );

  await verifyTenantOwnership(
    Runbook,
    'Runbook',
    {
      allowSystem:
        true,
    }
  );
}

// ============================================================================
// PLAYBOOKS
// ============================================================================

async function migratePlaybooks() {
  const docs =
    await Playbook.find({});

  log(
    `Found ${docs.length} playbook record(s)`
  );

  let migrated =
    0;

  let skippedSystem =
    0;

  let unresolved =
    0;

  for (
    const doc
    of docs
  ) {
    if (
      isSystemOwned(doc)
    ) {
      skippedSystem++;

      continue;
    }

    if (
      doc.organizationId &&
      doc.environmentId
    ) {
      continue;
    }

    const resolved =
      await resolveEnvironmentForTenantRecord(
        doc
      );

    if (!resolved) {
      unresolved++;

      warn(
        `Playbook ${doc._id} unresolved`
      );

      continue;
    }

    doc.organizationId =
      resolved.organizationId;

    doc.environmentId =
      resolved.environmentId;

    await doc.save();

    migrated++;
  }

  log(
    `Playbook summary | migrated=${migrated} | system=${skippedSystem} | unresolved=${unresolved}`
  );

  if (
    unresolved >
    0
  ) {
    throw new Error(
      `${unresolved} tenant playbook(s) could not be assigned to an environment`
    );
  }

  await Playbook.syncIndexes();

  log(
    'Playbook indexes synchronized'
  );

  await verifyTenantOwnership(
    Playbook,
    'Playbook',
    {
      allowSystem:
        true,
    }
  );
}

// ============================================================================
// RUNTIME RECORDS
// ============================================================================

async function migrateRuntimeModel(
  Model,
  label
) {
  const docs =
    await Model.find({});

  log(
    `Found ${docs.length} ${label} record(s)`
  );

  let migrated =
    0;

  let unresolved =
    0;

  for (
    const doc
    of docs
  ) {
    if (
      doc.organizationId &&
      doc.environmentId
    ) {
      continue;
    }

    const resolved =
      await resolveEnvironmentForTenantRecord(
        doc
      );

    if (!resolved) {
      unresolved++;

      warn(
        `${label} ${doc._id} unresolved`
      );

      continue;
    }

    doc.organizationId =
      resolved.organizationId;

    doc.environmentId =
      resolved.environmentId;

    /**
     * Keep legacy orgId aligned while it still exists.
     */
    if (
      'orgId' in
      doc.toObject()
    ) {
      doc.orgId =
        String(
          resolved.organizationId
        );
    }

    await doc.save();

    migrated++;
  }

  log(
    `${label} summary | migrated=${migrated} | unresolved=${unresolved}`
  );

  if (
    unresolved >
    0
  ) {
    throw new Error(
      `${unresolved} ${label} record(s) could not be assigned to an environment`
    );
  }

  await Model.syncIndexes();

  log(
    `${label} indexes synchronized`
  );

  await verifyTenantOwnership(
    Model,
    label
  );
}

// ============================================================================
// INDEX OUTPUT
// ============================================================================

async function printIndexes(
  Model,
  label
) {
  const indexes =
    await Model.collection.indexes();

  log(
    `${label} indexes:`
  );

  for (
    const index
    of indexes
  ) {
    const flags =
      [
        index.unique
          ? 'UNIQUE'
          : null,

        index.expireAfterSeconds !==
        undefined
          ? `TTL=${index.expireAfterSeconds}`
          : null,
      ]
        .filter(Boolean)
        .join(' ');

    log(
      `${index.name}: ${JSON.stringify(index.key)}${flags ? ` ${flags}` : ''}`
    );
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const mongoUri =
    process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI is required'
    );
  }

  await mongoose.connect(
    mongoUri
  );

  log(
    'Connected to MongoDB'
  );

  await migrateRunbooks();

  await migratePlaybooks();

  await migrateRuntimeModel(
    RunbookExecution,
    'RunbookExecution'
  );

  await migrateRuntimeModel(
    PlaybookExecution,
    'PlaybookExecution'
  );

  await migrateRuntimeModel(
    DecisionTrace,
    'DecisionTrace'
  );

  await migrateRuntimeModel(
    ApprovalRequest,
    'ApprovalRequest'
  );

  await printIndexes(
    Runbook,
    'Runbook'
  );

  await printIndexes(
    Playbook,
    'Playbook'
  );

  await printIndexes(
    RunbookExecution,
    'RunbookExecution'
  );

  await printIndexes(
    PlaybookExecution,
    'PlaybookExecution'
  );

  await printIndexes(
    DecisionTrace,
    'DecisionTrace'
  );

  await printIndexes(
    ApprovalRequest,
    'ApprovalRequest'
  );

  log(
    'Recovery environment migration completed successfully'
  );
}

// ============================================================================
// RUN
// ============================================================================

main()
  .catch(
    (error) => {
      console.error(
        `${PREFIX} FAILED:`,
        error
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await mongoose.disconnect();
    }
  );