"use strict";


/**
 * Phase 18 — Production Knowledge System constants.
 *
 * Architectural authority:
 *
 * PostgreSQL
 *   = canonical operational knowledge
 *
 * YAML / domain packs
 *   = authoring/import sources
 *
 * Qdrant
 *   = optional retrieval projection
 *
 * MongoDB
 *   = NOT canonical Phase 18 persistence
 */


const KNOWLEDGE_API_VERSION =
  "aira.io/v1";


const FAILURE_MODE_KIND =
  "FailureMode";


/**
 * Stable logical failure-mode identifier.
 *
 * Examples:
 *
 * FM-POSTGRES-CONNECTION-EXHAUSTION
 * FM-K8S-POD-CRASH-LOOP
 * FM-REDIS-MEMORY-PRESSURE
 */
const FAILURE_MODE_ID_PATTERN =
  /^FM-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;


const KNOWLEDGE_SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;


// ============================================================================
// SCOPE
// ============================================================================

const KNOWLEDGE_SCOPE =
  Object.freeze({

    GLOBAL:
      "GLOBAL",

    ORGANIZATION:
      "ORGANIZATION",

    ENVIRONMENT:
      "ENVIRONMENT",
  });


const KNOWLEDGE_SCOPE_VALUES =
  Object.freeze(
    Object.values(
      KNOWLEDGE_SCOPE
    )
  );


// ============================================================================
// LIFECYCLE
// ============================================================================

const KNOWLEDGE_LIFECYCLE =
  Object.freeze({

    DRAFT:
      "DRAFT",

    VALIDATED:
      "VALIDATED",

    ACTIVE:
      "ACTIVE",

    DEPRECATED:
      "DEPRECATED",

    RETIRED:
      "RETIRED",
  });


const KNOWLEDGE_LIFECYCLE_VALUES =
  Object.freeze(
    Object.values(
      KNOWLEDGE_LIFECYCLE
    )
  );


const KNOWLEDGE_LIFECYCLE_TRANSITIONS =
  Object.freeze({

    DRAFT: [
      "VALIDATED",
      "RETIRED",
    ],

    VALIDATED: [
      "DRAFT",
      "ACTIVE",
      "RETIRED",
    ],

    ACTIVE: [
      "DEPRECATED",
    ],

    DEPRECATED: [
      "RETIRED",
    ],

    RETIRED: [],
  });


// ============================================================================
// FAILURE SEVERITY
// ============================================================================

const FAILURE_MODE_SEVERITY =
  Object.freeze({

    INFO:
      "INFO",

    LOW:
      "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    CRITICAL:
      "CRITICAL",
  });


const FAILURE_MODE_SEVERITY_VALUES =
  Object.freeze(
    Object.values(
      FAILURE_MODE_SEVERITY
    )
  );


// ============================================================================
// EVIDENCE
// ============================================================================

const KNOWLEDGE_EVIDENCE_TYPE =
  Object.freeze({

    METRIC:
      "METRIC",

    LOG:
      "LOG",

    TRACE:
      "TRACE",

    EVENT:
      "EVENT",

    RESOURCE_STATE:
      "RESOURCE_STATE",

    TOPOLOGY:
      "TOPOLOGY",

    RECENT_CHANGE:
      "RECENT_CHANGE",

    KNOWN_GOOD_DIFF:
      "KNOWN_GOOD_DIFF",

    MEMORY:
      "MEMORY",

    SYSTEM_DNA:
      "SYSTEM_DNA",

    CONFIGURATION:
      "CONFIGURATION",

    DEPENDENCY:
      "DEPENDENCY",

    HUMAN_CONFIRMATION:
      "HUMAN_CONFIRMATION",
  });


const KNOWLEDGE_EVIDENCE_TYPE_VALUES =
  Object.freeze(
    Object.values(
      KNOWLEDGE_EVIDENCE_TYPE
    )
  );


const EVIDENCE_REQUIREMENT_RESULT =
  Object.freeze({

    SATISFIED:
      "SATISFIED",

    MISSING:
      "MISSING",

    CONTRADICTED:
      "CONTRADICTED",

    NOT_APPLICABLE:
      "NOT_APPLICABLE",
  });


const EVIDENCE_REQUIREMENT_RESULT_VALUES =
  Object.freeze(
    Object.values(
      EVIDENCE_REQUIREMENT_RESULT
    )
  );


// ============================================================================
// KNOWLEDGE SAFETY
// ============================================================================

const KNOWLEDGE_SAFETY =
  Object.freeze({

    EVIDENCE_ONLY:
      true,

    EXECUTION_AUTHORIZED:
      false,

    GRANTS_EXECUTION_PERMISSION:
      false,

    BYPASSES_POLICY:
      false,

    BYPASSES_AUTHORIZATION:
      false,

    BYPASSES_APPROVAL:
      false,

    BYPASSES_ENTITLEMENTS:
      false,

    BYPASSES_KILL_SWITCH:
      false,
  });


module.exports = {
  KNOWLEDGE_API_VERSION,

  FAILURE_MODE_KIND,

  FAILURE_MODE_ID_PATTERN,

  KNOWLEDGE_SEMVER_PATTERN,

  KNOWLEDGE_SCOPE,

  KNOWLEDGE_SCOPE_VALUES,

  KNOWLEDGE_LIFECYCLE,

  KNOWLEDGE_LIFECYCLE_VALUES,

  KNOWLEDGE_LIFECYCLE_TRANSITIONS,

  FAILURE_MODE_SEVERITY,

  FAILURE_MODE_SEVERITY_VALUES,

  KNOWLEDGE_EVIDENCE_TYPE,

  KNOWLEDGE_EVIDENCE_TYPE_VALUES,

  EVIDENCE_REQUIREMENT_RESULT,

  EVIDENCE_REQUIREMENT_RESULT_VALUES,

  KNOWLEDGE_SAFETY,
};