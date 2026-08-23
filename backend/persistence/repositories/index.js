"use strict";

// ============================================================================
// AIRA PERSISTENCE REPOSITORY FACTORY
// ============================================================================
//
// Phase 13 — Enterprise Data Architecture
//
// Responsibilities:
//
// - expose database-neutral repository instances
// - keep MongoDB authoritative before PostgreSQL cutover
// - allow explicit PostgreSQL provider selection
// - enable controlled Mongo-primary/PostgreSQL-shadow reads
// - preserve provider-specific transaction semantics
// - preserve provider-specific identifier policies
//
// IMPORTANT:
//
// MIGRATION_MODE=shadow does NOT make PostgreSQL authoritative.
//
// In shadow mode:
//
// MongoDB = client-visible primary
// PostgreSQL = comparison-only secondary
//
// ============================================================================


// ============================================================================
// CONFIGURATION
// ============================================================================

const provider =
  String(
    process.env
      .PERSISTENCE_PROVIDER ||
    "mongo"
  )
    .trim()
    .toLowerCase();

const migrationMode =
  String(
    process.env
      .MIGRATION_MODE ||
    "disabled"
  )
    .trim()
    .toLowerCase();

const supportedProviders =
  new Set([
    "mongo",
    "postgres",
  ]);

if (
  !supportedProviders
    .has(
      provider
    )
) {
  throw Object.assign(
    new Error(
      `Unsupported persistence provider: ${provider}`
    ),
    {
      code:
        "PERSISTENCE_PROVIDER_INVALID",
    }
  );
}


// ============================================================================
// BUILD ACTIVE REPOSITORY SET
// ============================================================================

let repositories;

if (
  provider ===
  "postgres"
) {
  repositories =
    buildPostgresRepositories();
} else {
  repositories =
    buildMongoRepositories();

  /*
   * --------------------------------------------------------------------------
   * PHASE 13.5C — SHADOW READS
   * --------------------------------------------------------------------------
   *
   * Mongo remains authoritative.
   *
   * We wrap only repositories that have explicitly completed shadow-read
   * implementation and verification.
   *
   * PostgreSQL repository construction itself does not establish a database
   * connection because AIRA's PostgreSQL pool is lazy.
   * --------------------------------------------------------------------------
   */
  if (
    migrationMode ===
    "shadow"
  ) {
    repositories =
      applyShadowRepositories(
        repositories
      );
  }
}


// ============================================================================
// PUBLIC EXPORTS
// ============================================================================

module.exports = {
  ...repositories,

  persistenceProvider:
    provider,

  migrationMode,
};


// ============================================================================
// MONGO REPOSITORIES
// ============================================================================

function buildMongoRepositories() {
  const MongoUserRepository =
    require(
      "../mongo/MongoUserRepository"
    );

  const MongoPasswordCredentialRepository =
    require(
      "../mongo/MongoPasswordCredentialRepository"
    );

  const MongoOrganizationMembershipRepository =
    require(
      "../mongo/MongoOrganizationMembershipRepository"
    );

  const MongoOrganizationRepository = require("../mongo/MongoOrganizationRepository");
  const MongoEnvironmentRepository = require("../mongo/MongoEnvironmentRepository");
  const MongoTenantConfigRepository = require("../mongo/MongoTenantConfigRepository");

  const MongoUserSessionRepository =
    require(
      "../mongo/MongoUserSessionRepository"
    );
  const MongoEmailVerificationTokenRepository = require("../mongo/MongoEmailVerificationTokenRepository");
  const MongoPasswordResetTokenRepository = require("../mongo/MongoPasswordResetTokenRepository");
  const MongoAuthenticationAuditEventRepository = require("../mongo/MongoAuthenticationAuditEventRepository");
  const MongoSubscriptionRepository =
  require(
    "../mongo/MongoSubscriptionRepository"
  );
  const MongoIncidentRepository =
    require(
      "../mongo/MongoIncidentRepository"
    );

  const MongoIncidentEventRepository =
    require(
      "../mongo/MongoIncidentEventRepository"
    );

  const MongoIncidentLifecycleRepository =
    require(
      "../mongo/MongoIncidentLifecycleRepository"
    );

  const MongoSignalRepository =
    require(
      "../mongo/MongoSignalRepository"
    );

  const MongoSignalCorrelationRepository =
    require(
      "../mongo/MongoSignalCorrelationRepository"
    );

  const MongoCorrelationTopologyRepository =
    require(
      "../mongo/MongoCorrelationTopologyRepository"
    );

  const MongoAgentIntelligenceRunRepository =
    require(
      "../mongo/MongoAgentIntelligenceRunRepository"
    );

  const MongoIncidentDiagnosisRepository =
    require(
      "../mongo/MongoIncidentDiagnosisRepository"
    );

  const MongoDecisionTraceRepository =
    require(
      "../mongo/MongoDecisionTraceRepository"
    );

  const MongoRecoveryDecisionRepository =
    require(
      "../mongo/MongoRecoveryDecisionRepository"
    );

  const MongoExecutionAuthorizationRepository =
    require(
      "../mongo/MongoExecutionAuthorizationRepository"
    );

  const MongoRuntimeRecoveryCheckpointRepository =
    require(
      "../mongo/MongoRuntimeRecoveryCheckpointRepository"
    );

  const MongoApprovalRepository =
    require(
      "../mongo/MongoApprovalRepository"
    );

  const MongoAuditRepository =
    require(
      "../mongo/MongoAuditRepository"
    );

  const MongoPolicyRepository =
    require(
      "../mongo/MongoPolicyRepository"
    );

  const MongoWorkflowOutboxRepository =
    require(
      "../mongo/MongoWorkflowOutboxRepository"
    );

  const MongoPersistenceTransactionManager =
    require(
      "../transactions/MongoPersistenceTransactionManager"
    );

  const MongoIdentifierPolicy =
    require(
      "../identifiers/MongoIdentifierPolicy"
    );

  return {
    userRepository:
      new MongoUserRepository(),

    passwordCredentialRepository:
      new MongoPasswordCredentialRepository(),

    organizationMembershipRepository:
      new MongoOrganizationMembershipRepository(),

    organizationRepository: new MongoOrganizationRepository(),
    environmentRepository: new MongoEnvironmentRepository(),
    tenantConfigRepository: new MongoTenantConfigRepository(),

    userSessionRepository:
      new MongoUserSessionRepository(),

    emailVerificationTokenRepository: new MongoEmailVerificationTokenRepository(),
    passwordResetTokenRepository: new MongoPasswordResetTokenRepository(),
    authenticationAuditEventRepository: new MongoAuthenticationAuditEventRepository(),
    subscriptionRepository:
  new MongoSubscriptionRepository(),
    incidentRepository:
      new MongoIncidentRepository(),

    incidentEventRepository:
      new MongoIncidentEventRepository(),

    incidentLifecycleRepository:
      new MongoIncidentLifecycleRepository(),

    signalRepository:
      new MongoSignalRepository(),

    signalCorrelationRepository:
      new MongoSignalCorrelationRepository(),

    correlationTopologyRepository:
      new MongoCorrelationTopologyRepository(),

    agentIntelligenceRunRepository:
      new MongoAgentIntelligenceRunRepository(),

    incidentDiagnosisRepository:
      new MongoIncidentDiagnosisRepository(),

    decisionTraceRepository:
      new MongoDecisionTraceRepository(),

    recoveryDecisionRepository:
      new MongoRecoveryDecisionRepository(),

    executionAuthorizationRepository:
      new MongoExecutionAuthorizationRepository(),

    runtimeRecoveryCheckpointRepository:
      new MongoRuntimeRecoveryCheckpointRepository(),

    approvalRepository:
      new MongoApprovalRepository(),

    auditRepository:
      new MongoAuditRepository(),

    policyRepository:
      new MongoPolicyRepository(),

    workflowOutboxRepository:
      new MongoWorkflowOutboxRepository(),

    persistenceTransactionManager:
      new MongoPersistenceTransactionManager(),

    persistenceIdentifierPolicy:
      new MongoIdentifierPolicy(),
  };
}


// ============================================================================
// POSTGRESQL REPOSITORIES
// ============================================================================

function buildPostgresRepositories() {
  const PostgresUserRepository =
    require(
      "../postgres/PostgresUserRepository"
    );

  const PostgresPasswordCredentialRepository =
    require(
      "../postgres/PostgresPasswordCredentialRepository"
    );

  const PostgresOrganizationMembershipRepository =
    require(
      "../postgres/PostgresOrganizationMembershipRepository"
    );  
    const PostgresSubscriptionRepository =
  require(
    "../postgres/PostgresSubscriptionRepository"
  );
  const PostgresOrganizationRepository = require("../postgres/PostgresOrganizationRepository");
  const PostgresEnvironmentRepository = require("../postgres/PostgresEnvironmentRepository");
  const PostgresTenantConfigRepository = require("../postgres/PostgresTenantConfigRepository");

  const PostgresUserSessionRepository =
    require(
      "../postgres/PostgresUserSessionRepository"
    );
  const PostgresEmailVerificationTokenRepository = require("../postgres/PostgresEmailVerificationTokenRepository");
  const PostgresPasswordResetTokenRepository = require("../postgres/PostgresPasswordResetTokenRepository");
  const PostgresAuthenticationAuditEventRepository = require("../postgres/PostgresAuthenticationAuditEventRepository");

  const PostgresIncidentRepository =
    require(
      "../postgres/PostgresIncidentRepository"
    );

  const PostgresIncidentEventRepository =
    require(
      "../postgres/PostgresIncidentEventRepository"
    );

  const PostgresIncidentLifecycleRepository =
    require(
      "../postgres/PostgresIncidentLifecycleRepository"
    );

  const PostgresSignalRepository =
    require(
      "../postgres/PostgresSignalRepository"
    );

  const PostgresSignalCorrelationRepository =
    require(
      "../postgres/PostgresSignalCorrelationRepository"
    );

  const PostgresCorrelationTopologyRepository =
    require(
      "../postgres/PostgresCorrelationTopologyRepository"
    );

  const PostgresAgentIntelligenceRunRepository =
    require(
      "../postgres/PostgresAgentIntelligenceRunRepository"
    );

  const PostgresIncidentDiagnosisRepository =
    require(
      "../postgres/PostgresIncidentDiagnosisRepository"
    );

  const PostgresDecisionTraceRepository =
    require(
      "../postgres/PostgresDecisionTraceRepository"
    );

  const PostgresRecoveryDecisionRepository =
    require(
      "../postgres/PostgresRecoveryDecisionRepository"
    );

  const PostgresExecutionAuthorizationRepository =
    require(
      "../postgres/PostgresExecutionAuthorizationRepository"
    );

  const PostgresRuntimeRecoveryCheckpointRepository =
    require(
      "../postgres/PostgresRuntimeRecoveryCheckpointRepository"
    );

  const PostgresApprovalRepository =
    require(
      "../postgres/PostgresApprovalRepository"
    );

  const PostgresAuditRepository =
    require(
      "../postgres/PostgresAuditRepository"
    );

  const PostgresPolicyRepository =
    require(
      "../postgres/PostgresPolicyRepository"
    );

  const PostgresWorkflowOutboxRepository =
    require(
      "../postgres/PostgresWorkflowOutboxRepository"
    );

  const PostgresPersistenceTransactionManager =
    require(
      "../transactions/PostgresPersistenceTransactionManager"
    );

  /*
   * IMPORTANT:
   *
   * This concrete implementation actually exists at:
   *
   * persistence/postgres/PostgresIdentifierPolicy.js
   *
   * Do NOT instantiate PersistenceIdentifierPolicy here.
   * PersistenceIdentifierPolicy is the database-neutral contract.
   */
  const PostgresIdentifierPolicy =
    require(
      "../postgres/PostgresIdentifierPolicy"
    );

  return {
    userRepository:
      new PostgresUserRepository(),

    passwordCredentialRepository:
      new PostgresPasswordCredentialRepository(),

    organizationMembershipRepository:
      new PostgresOrganizationMembershipRepository(),

    organizationRepository: new PostgresOrganizationRepository(),
    environmentRepository: new PostgresEnvironmentRepository(),
    tenantConfigRepository: new PostgresTenantConfigRepository(),
    subscriptionRepository:
  new PostgresSubscriptionRepository(),
    userSessionRepository:
      new PostgresUserSessionRepository(),

    emailVerificationTokenRepository: new PostgresEmailVerificationTokenRepository(),
    passwordResetTokenRepository: new PostgresPasswordResetTokenRepository(),
    authenticationAuditEventRepository: new PostgresAuthenticationAuditEventRepository(),

    incidentRepository:
      new PostgresIncidentRepository(),

    incidentEventRepository:
      new PostgresIncidentEventRepository(),

    incidentLifecycleRepository:
      new PostgresIncidentLifecycleRepository(),

    signalRepository:
      new PostgresSignalRepository(),

    signalCorrelationRepository:
      new PostgresSignalCorrelationRepository(),

    correlationTopologyRepository:
      new PostgresCorrelationTopologyRepository(),

    agentIntelligenceRunRepository:
      new PostgresAgentIntelligenceRunRepository(),

    incidentDiagnosisRepository:
      new PostgresIncidentDiagnosisRepository(),

    decisionTraceRepository:
      new PostgresDecisionTraceRepository(),

    recoveryDecisionRepository:
      new PostgresRecoveryDecisionRepository(),

    executionAuthorizationRepository:
      new PostgresExecutionAuthorizationRepository(),

    runtimeRecoveryCheckpointRepository:
      new PostgresRuntimeRecoveryCheckpointRepository(),

    approvalRepository:
      new PostgresApprovalRepository(),

    auditRepository:
      new PostgresAuditRepository(),

    policyRepository:
      new PostgresPolicyRepository(),

    workflowOutboxRepository:
      new PostgresWorkflowOutboxRepository(),

    persistenceTransactionManager:
      new PostgresPersistenceTransactionManager(),

    persistenceIdentifierPolicy:
      new PostgresIdentifierPolicy(),
  };
}


// ============================================================================
// PHASE 13.5C SHADOW REPOSITORIES
// ============================================================================

function applyShadowRepositories(
  primaryRepositories
) {
  if (
    !primaryRepositories
  ) {
    throw Object.assign(
      new Error(
        "Primary repositories are required for shadow mode"
      ),
      {
        code:
          "SHADOW_PRIMARY_REPOSITORIES_REQUIRED",
      }
    );
  }

  const postgresRepositories =
    buildPostgresRepositories();

  const ShadowIncidentRepository =
    require(
      "../migration/ShadowIncidentRepository"
    );

  const ShadowIncidentEventRepository =
    require(
      "../migration/ShadowIncidentEventRepository"
    );

  const ShadowIncidentLifecycleRepository =
    require(
      "../migration/ShadowIncidentLifecycleRepository"
    );

  const ShadowSignalRepository =
    require(
      "../migration/ShadowSignalRepository"
    );

  return {
    ...primaryRepositories,

    incidentRepository:
      new ShadowIncidentRepository({
        primaryRepository:
          primaryRepositories
            .incidentRepository,

        shadowRepository:
          postgresRepositories
            .incidentRepository,
      }),

    incidentEventRepository:
      new ShadowIncidentEventRepository({
        primaryRepository:
          primaryRepositories
            .incidentEventRepository,

        shadowRepository:
          postgresRepositories
            .incidentEventRepository,
      }),

    incidentLifecycleRepository:
      new ShadowIncidentLifecycleRepository({
        primaryRepository:
          primaryRepositories
            .incidentLifecycleRepository,

        shadowRepository:
          postgresRepositories
            .incidentLifecycleRepository,
      }),

    signalRepository:
      new ShadowSignalRepository({
        primaryRepository:
          primaryRepositories
            .signalRepository,

        shadowRepository:
          postgresRepositories
            .signalRepository,
      }),
  };
}


// ============================================================================
// FACTORY EXPORTS
// ============================================================================
//
// These are useful for:
//
// - migration tests
// - provider-specific tests
// - shadow tests
// - cutover validation
//
// ============================================================================

module.exports
  .buildMongoRepositories =
  buildMongoRepositories;

module.exports
  .buildPostgresRepositories =
  buildPostgresRepositories;

module.exports
  .applyShadowRepositories =
  applyShadowRepositories;