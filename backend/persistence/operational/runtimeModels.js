"use strict";

/**
 * Phase 13 Remaining Runtime Models
 *
 * PolicyVersion and Runbook are legacy document-shaped domains that still
 * have Mongoose-shaped service consumers.
 *
 * The model facade below is backed by PostgreSQL operational.documents via
 * mongooseCompat. There is no direct Mongo/Mongoose runtime dependency.
 */

const mongoose =
  require(
    "./mongooseCompat"
  );


const policyVersionSchema =
  new mongoose.Schema(
    {},
    {
      strict:
        false,
    }
  );


const runbookSchema =
  new mongoose.Schema(
    {},
    {
      strict:
        false,
    }
  );


const PolicyVersion =
  mongoose.model(
    "PolicyVersion",
    policyVersionSchema,
    "policy_versions"
  );


const Runbook =
  mongoose.model(
    "Runbook",
    runbookSchema,
    "runbooks"
  );


module.exports = {
  PolicyVersion,

  Runbook,
};