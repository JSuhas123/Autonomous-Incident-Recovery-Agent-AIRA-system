"use strict";

/**
 * Phase 13.5
 *
 * Canonical MongoDB -> PostgreSQL migration domain registry.
 *
 * IMPORTANT:
 * Order is dependency-aware.
 *
 * Do not create another competing migration ordering elsewhere.
 */

const DOMAIN_DEFINITIONS =
  Object.freeze([
    // ========================================================================
    // INCIDENT CORE
    // ========================================================================

    {
      name:
        "incidents",

      repository:
        "incidentRepository",

      order:
        100,

      migrationMode:
        "write",
    },

    {
      name:
        "incidentEvents",

      repository:
        "incidentEventRepository",

      order:
        110,

      migrationMode:
        "write",
    },

    {
      name:
        "incidentLifecycleTransitions",

      repository:
        "incidentLifecycleRepository",

      order:
        120,

      migrationMode:
        "write",
    },

    {
      name:
        "incidentLifecycle",

      repository:
        "incidentLifecycleRepository",

      order:
        130,

      migrationMode:
        "write",
    },

    // ========================================================================
    // SIGNAL CORE
    // ========================================================================

    {
      name:
        "signals",

      repository:
        "signalRepository",

      order:
        200,

      migrationMode:
        "write",
    },

    {
      name:
        "signalCorrelations",

      repository:
        "signalCorrelationRepository",

      order:
        210,

      migrationMode:
        "write",
    },

    /*
     * PostgreSQL CorrelationTopologyRepository currently exposes
     * relationship queries only.
     *
     * It does not expose a persistence/write contract.
     *
     * Therefore this domain is derived/verification-only in 13.5B.
     */
    {
      name:
        "correlationTopology",

      repository:
        "correlationTopologyRepository",

      order:
        220,

      migrationMode:
        "derived",
    },

    // ========================================================================
    // INTELLIGENCE
    // ========================================================================

    {
      name:
        "agentIntelligenceRuns",

      repository:
        "agentIntelligenceRunRepository",

      order:
        300,

      migrationMode:
        "write",
    },

    {
      name:
        "incidentDiagnoses",

      repository:
        "incidentDiagnosisRepository",

      order:
        310,

      migrationMode:
        "write",
    },

    {
      name:
        "decisionTraces",

      repository:
        "decisionTraceRepository",

      order:
        320,

      migrationMode:
        "write",
    },

    // ========================================================================
    // RECOVERY / EXECUTION
    // ========================================================================

    {
      name:
        "recoveryDecisionRuns",

      repository:
        "recoveryDecisionRepository",

      order:
        400,

      migrationMode:
        "write",
    },

    {
      name:
        "recoveryDecisions",

      repository:
        "recoveryDecisionRepository",

      order:
        410,

      migrationMode:
        "write",
    },

    {
      name:
        "executionAuthorizations",

      repository:
        "executionAuthorizationRepository",

      order:
        420,

      migrationMode:
        "write",
    },

    {
      name:
        "executionRequests",

      repository:
        "executionAuthorizationRepository",

      order:
        430,

      migrationMode:
        "write",
    },

    {
      name:
        "runtimeRecoveryCheckpoints",

      repository:
        "runtimeRecoveryCheckpointRepository",

      order:
        440,

      migrationMode:
        "write",
    },

    {
      name:
        "approvals",

      repository:
        "approvalRepository",

      order:
        450,

      migrationMode:
        "write",
    },

    // ========================================================================
    // ENTERPRISE CONTROL / AUDIT
    // ========================================================================

    {
      name:
        "audit",

      repository:
        "auditRepository",

      order:
        500,

      migrationMode:
        "write",
    },

    {
      name:
        "policies",

      repository:
        "policyRepository",

      order:
        600,

      migrationMode:
        "write",
    },

    // ========================================================================
    // DURABLE WORKFLOW
    // ========================================================================

    {
      name:
        "workflowOutbox",

      repository:
        "workflowOutboxRepository",

      order:
        700,

      migrationMode:
        "write",
    },
  ]);

const DOMAIN_MAP =
  new Map(
    DOMAIN_DEFINITIONS
      .map(
        (
          definition
        ) => [
          definition.name,
          definition,
        ]
      )
  );

class MigrationDomainRegistry {
  list() {
    return [
      ...DOMAIN_DEFINITIONS,
    ]
      .sort(
        (
          first,
          second
        ) =>
          first.order -
          second.order
      );
  }

  names() {
    return this
      .list()
      .map(
        (
          definition
        ) =>
          definition.name
      );
  }

  writable() {
    return this
      .list()
      .filter(
        (
          definition
        ) =>
          definition
            .migrationMode ===
          "write"
      );
  }

  derived() {
    return this
      .list()
      .filter(
        (
          definition
        ) =>
          definition
            .migrationMode ===
          "derived"
      );
  }

  has(
    domain
  ) {
    return DOMAIN_MAP
      .has(
        domain
      );
  }

  get(
    domain
  ) {
    const definition =
      DOMAIN_MAP.get(
        domain
      );

    if (
      !definition
    ) {
      throw Object.assign(
        new Error(
          `Unknown migration domain: ${domain}`
        ),
        {
          code:
            "MIGRATION_DOMAIN_UNKNOWN",

          domain,
        }
      );
    }

    return definition;
  }
}

module.exports =
  MigrationDomainRegistry;

module.exports
  .DOMAIN_DEFINITIONS =
  DOMAIN_DEFINITIONS;