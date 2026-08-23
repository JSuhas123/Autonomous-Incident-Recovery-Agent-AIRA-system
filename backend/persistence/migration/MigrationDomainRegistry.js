"use strict";

/**
 * AIRA Phase 13
 *
 * Canonical MongoDB -> PostgreSQL migration domain registry.
 *
 * This file is the SINGLE SOURCE OF TRUTH for:
 *
 * - migration ordering
 * - backfill eligibility
 * - verification eligibility
 * - shadow-read eligibility
 * - cutover eligibility
 * - derived PostgreSQL domains
 *
 * Do not maintain competing domain lists in CLI scripts.
 */

const DOMAIN_DEFINITIONS =
  Object.freeze([
    // ======================================================================
    // INCIDENT CORE
    // ======================================================================

    domain(
      "incidents",
      "incidentRepository",
      100
    ),

    domain(
      "incidentEvents",
      "incidentEventRepository",
      110
    ),

    domain(
      "incidentLifecycleTransitions",
      "incidentLifecycleRepository",
      120,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "incidentLifecycle",
      "incidentLifecycleRepository",
      130
    ),

    // ======================================================================
    // SIGNAL CORE
    // ======================================================================

    domain(
      "signals",
      "signalRepository",
      200
    ),

    domain(
      "signalCorrelations",
      "signalCorrelationRepository",
      210,
      {
        shadowEligible:
          false,
      }
    ),

    /*
     * Topology is reconstructed from canonical PostgreSQL resource /
     * relationship data.
     *
     * It therefore has no Mongo -> PostgreSQL document backfill.
     */
    derivedDomain(
      "correlationTopology",
      "correlationTopologyRepository",
      220
    ),

    // ======================================================================
    // INTELLIGENCE
    // ======================================================================

    domain(
      "agentIntelligenceRuns",
      "agentIntelligenceRunRepository",
      300,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "incidentDiagnoses",
      "incidentDiagnosisRepository",
      310,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "decisionTraces",
      "decisionTraceRepository",
      320,
      {
        shadowEligible:
          false,
      }
    ),

    // ======================================================================
    // RECOVERY / EXECUTION
    // ======================================================================

    domain(
      "recoveryDecisionRuns",
      "recoveryDecisionRepository",
      400,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "recoveryDecisions",
      "recoveryDecisionRepository",
      410,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "executionAuthorizations",
      "executionAuthorizationRepository",
      420,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "executionRequests",
      "executionAuthorizationRepository",
      430,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "runtimeRecoveryCheckpoints",
      "runtimeRecoveryCheckpointRepository",
      440,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "approvals",
      "approvalRepository",
      450,
      {
        shadowEligible:
          false,
      }
    ),

    // ======================================================================
    // ENTERPRISE CONTROL / AUDIT
    // ======================================================================

    domain(
      "audit",
      "auditRepository",
      500,
      {
        shadowEligible:
          false,
      }
    ),

    domain(
      "policies",
      "policyRepository",
      600,
      {
        shadowEligible:
          false,
      }
    ),

    // ======================================================================
    // DURABLE WORKFLOW
    // ======================================================================

    domain(
      "workflowOutbox",
      "workflowOutboxRepository",
      700,
      {
        shadowEligible:
          false,
      }
    ),
  ]);

/**
 * Standard Mongo -> PostgreSQL persisted domain.
 */
function domain(
  name,
  repository,
  order,
  overrides = {}
) {
  return Object.freeze({
    name,

    repository,

    order,

    migrationMode:
      "write",

    requiresBackfill:
      true,

    requiresVerification:
      true,

    shadowEligible:
      true,

    cutoverEligible:
      true,

    ...overrides,
  });
}

/**
 * PostgreSQL-derived domain.
 *
 * There is no canonical Mongo document stream to backfill.
 */
function derivedDomain(
  name,
  repository,
  order,
  overrides = {}
) {
  return Object.freeze({
    name,

    repository,

    order,

    migrationMode:
      "derived",

    requiresBackfill:
      false,

    requiresVerification:
      false,

    shadowEligible:
      false,

    cutoverEligible:
      false,

    ...overrides,
  });
}

const DOMAIN_MAP =
  new Map(
    DOMAIN_DEFINITIONS.map(
      definition => [
        definition.name,
        definition,
      ]
    )
  );

class MigrationDomainRegistry {
  list() {
    return [
      ...DOMAIN_DEFINITIONS,
    ].sort(
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
        definition =>
          definition.name
      );
  }

  has(
    domainName
  ) {
    return DOMAIN_MAP.has(
      domainName
    );
  }

  get(
    domainName
  ) {
    const definition =
      DOMAIN_MAP.get(
        domainName
      );

    if (
      !definition
    ) {
      throw Object.assign(
        new Error(
          `Unknown migration domain: ${domainName}`
        ),
        {
          code:
            "MIGRATION_DOMAIN_UNKNOWN",

          domain:
            domainName,
        }
      );
    }

    return definition;
  }

  writable() {
    return this
      .list()
      .filter(
        definition =>
          definition
            .migrationMode ===
          "write"
      );
  }

  derived() {
    return this
      .list()
      .filter(
        definition =>
          definition
            .migrationMode ===
          "derived"
      );
  }

  backfillable() {
    return this
      .list()
      .filter(
        definition =>
          definition
            .requiresBackfill ===
          true
      );
  }

  verifiable() {
    return this
      .list()
      .filter(
        definition =>
          definition
            .requiresVerification ===
          true
      );
  }

  shadowEligible() {
    return this
      .list()
      .filter(
        definition =>
          definition
            .shadowEligible ===
          true
      );
  }

  cutoverEligible() {
    return this
      .list()
      .filter(
        definition =>
          definition
            .cutoverEligible ===
          true
      );
  }

  capabilities(
    domainName
  ) {
    const definition =
      this.get(
        domainName
      );

    return {
      migrationMode:
        definition
          .migrationMode,

      requiresBackfill:
        definition
          .requiresBackfill,

      requiresVerification:
        definition
          .requiresVerification,

      shadowEligible:
        definition
          .shadowEligible,

      cutoverEligible:
        definition
          .cutoverEligible,
    };
  }
}

module.exports =
  MigrationDomainRegistry;

module.exports
  .DOMAIN_DEFINITIONS =
  DOMAIN_DEFINITIONS;