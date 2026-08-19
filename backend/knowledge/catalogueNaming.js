"use strict";

/**
 * AIRA Knowledge Catalogue Naming
 *
 * Phase 13.1
 *
 * Canonical naming rules for Playbooks and Runbooks.
 *
 * IMPORTANT:
 * Existing production identifiers are not automatically renamed.
 * Phase 13 distinguishes:
 *
 *   CANONICAL
 *   LEGACY_VALID
 *   INVALID
 *
 * This prevents catalogue cleanup from breaking historical incidents,
 * mappings, persisted references, approvals, or execution records.
 */

const PLAYBOOK_ID_PATTERN =
  /^PB-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{3}$/;

const RUNBOOK_ID_PATTERN =
  /^RB-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

const PLAYBOOK_FILE_PATTERN =
  /^pb-[a-z0-9]+(?:-[a-z0-9]+)+-\d{3}\.ya?ml$/;

const RUNBOOK_FILE_PATTERN =
  /^(?:rb-[a-z0-9]+(?:-[a-z0-9]+)+|[a-z0-9]+(?:-[a-z0-9]+)+)\.ya?ml$/;


/*
 * Canonical domain vocabulary for Phase 13+.
 *
 * We intentionally keep provider-specific domains such as AWS/AZURE/GCP
 * because their operational procedures frequently differ.
 */
const DOMAIN_CODES =
  Object.freeze({
    K8S:
      "kubernetes",

    CTR:
      "containers",

    DB:
      "databases",

    CACHE:
      "cache",

    MQ:
      "messaging",

    KAFKA:
      "kafka",

    RABBIT:
      "rabbitmq",

    NET:
      "networking",

    OBS:
      "observability",

    CICD:
      "cicd",

    AWS:
      "aws",

    AZURE:
      "azure",

    GCP:
      "gcp",

    STORAGE:
      "storage",

    SEC:
      "security",

    AUTH:
      "authentication",

    APP:
      "application",

    API:
      "api",
  });


const LEGACY_PLAYBOOK_IDS =
  Object.freeze({
    "PB-K8S-OOM-001":
      "PB-K8S-OOMKILLED-001",

    "PB-K8S-IMAGEPULL-001":
      "PB-K8S-IMAGEPULLBACKOFF-001",

    "PB-K8S-DEPLOY-UNHEALTHY-001":
      "PB-K8S-DEPLOYMENT-UNHEALTHY-001",

    "PB-DB-CONN-EXHAUST-001":
      "PB-DB-CONNECTION-EXHAUSTION-001",

    "PB-API-RATELIMIT-001":
      "PB-API-RATE-LIMIT-001",

    "PB-OBS-ALERT-PIPELINE-001":
      "PB-OBS-ALERT-PIPELINE-FAILURE-001",

    "PB-OBS-TELEMETRY-COLLECTOR-001":
      "PB-OBS-TELEMETRY-COLLECTOR-FAILURE-001",
  });


const LEGACY_RUNBOOK_IDS =
  Object.freeze({
    /*
     * Old generic Kubernetes restart definition.
     *
     * Do not delete or rename automatically because existing Playbooks,
     * incidents or audit records may reference it.
     */
    "RB-K8S-POD-RESTART":
      "RB-K8S-RESTART-POD",
  });


const VAGUE_PLAYBOOK_IDS =
  Object.freeze({
    "PB-MQ-RECOVERY-001":
      "Playbook describes a generic recovery action rather than a specific incident condition.",

    "PB-CACHE-INVALIDATION-001":
      "Playbook describes an operational action rather than the incident condition requiring recovery.",
  });


function normalizeId(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toUpperCase();
}


function extractDomainCode(
  identifier
) {
  const normalized =
    normalizeId(
      identifier
    );

  const parts =
    normalized
      .split(
        "-"
      );

  if (
    parts.length <
    3
  ) {
    return null;
  }

  return parts[1] ||
    null;
}


function getDomainName(
  identifier
) {
  const code =
    extractDomainCode(
      identifier
    );

  if (
    !code
  ) {
    return null;
  }

  return DOMAIN_CODES[
    code
  ] ||
    null;
}


function validatePlaybookId(
  identifier
) {
  const id =
    normalizeId(
      identifier
    );

  const errors =
    [];

  const warnings =
    [];

  if (
    !id
  ) {
    errors.push(
      "Playbook ID is required"
    );

    return {
      valid:
        false,

      classification:
        "INVALID",

      id,

      errors,

      warnings,

      canonicalId:
        null,
    };
  }

  if (
    !PLAYBOOK_ID_PATTERN
      .test(
        id
      )
  ) {
    errors.push(
      `Playbook ID "${id}" does not match PB-<DOMAIN>-<CONDITION>-<NNN>`
    );
  }

  const domainCode =
    extractDomainCode(
      id
    );

  if (
    domainCode &&
    !DOMAIN_CODES[
      domainCode
    ]
  ) {
    warnings.push(
      `Unknown playbook domain code "${domainCode}"`
    );
  }

  if (
    VAGUE_PLAYBOOK_IDS[
      id
    ]
  ) {
    warnings.push(
      VAGUE_PLAYBOOK_IDS[
        id
      ]
    );
  }

  const recommended =
    LEGACY_PLAYBOOK_IDS[
      id
    ] ||
    null;

  if (
    recommended
  ) {
    warnings.push(
      `Legacy-valid playbook ID. Recommended canonical ID: ${recommended}`
    );
  }

  return {
    valid:
      errors.length ===
      0,

    classification:
      errors.length >
      0
        ? "INVALID"
        : recommended
          ? "LEGACY_VALID"
          : "CANONICAL",

    id,

    domainCode,

    domain:
      getDomainName(
        id
      ),

    canonicalId:
      recommended ||
      id,

    errors,

    warnings,
  };
}


function validateRunbookId(
  identifier
) {
  const id =
    normalizeId(
      identifier
    );

  const errors =
    [];

  const warnings =
    [];

  if (
    !id
  ) {
    errors.push(
      "Runbook ID is required"
    );

    return {
      valid:
        false,

      classification:
        "INVALID",

      id,

      errors,

      warnings,

      canonicalId:
        null,
    };
  }

  if (
    !RUNBOOK_ID_PATTERN
      .test(
        id
      )
  ) {
    errors.push(
      `Runbook ID "${id}" does not match RB-<DOMAIN>-<VERB>-<TARGET>`
    );
  }

  const domainCode =
    extractDomainCode(
      id
    );

  if (
    domainCode &&
    !DOMAIN_CODES[
      domainCode
    ]
  ) {
    warnings.push(
      `Unknown runbook domain code "${domainCode}"`
    );
  }

  const recommended =
    LEGACY_RUNBOOK_IDS[
      id
    ] ||
    null;

  if (
    recommended
  ) {
    warnings.push(
      `Legacy-valid runbook ID. Recommended canonical ID: ${recommended}`
    );
  }

  return {
    valid:
      errors.length ===
      0,

    classification:
      errors.length >
      0
        ? "INVALID"
        : recommended
          ? "LEGACY_VALID"
          : "CANONICAL",

    id,

    domainCode,

    domain:
      getDomainName(
        id
      ),

    canonicalId:
      recommended ||
      id,

    errors,

    warnings,
  };
}


function validatePlaybookFilename(
  filename
) {
  return PLAYBOOK_FILE_PATTERN
    .test(
      String(
        filename ||
        ""
      )
        .trim()
        .toLowerCase()
    );
}


function validateRunbookFilename(
  filename
) {
  return RUNBOOK_FILE_PATTERN
    .test(
      String(
        filename ||
        ""
      )
        .trim()
        .toLowerCase()
    );
}


module.exports = {
  PLAYBOOK_ID_PATTERN,
  RUNBOOK_ID_PATTERN,
  PLAYBOOK_FILE_PATTERN,
  RUNBOOK_FILE_PATTERN,

  DOMAIN_CODES,

  LEGACY_PLAYBOOK_IDS,
  LEGACY_RUNBOOK_IDS,
  VAGUE_PLAYBOOK_IDS,

  normalizeId,
  extractDomainCode,
  getDomainName,

  validatePlaybookId,
  validateRunbookId,

  validatePlaybookFilename,
  validateRunbookFilename,
};