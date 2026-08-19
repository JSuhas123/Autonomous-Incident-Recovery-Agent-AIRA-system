"use strict";

const MongoIncidentRepository =
  require(
    "../mongo/MongoIncidentRepository"
  );

const MongoIncidentEventRepository =
  require(
    "../mongo/MongoIncidentEventRepository"
  );

  const MongoSignalRepository =
  require(
    "../mongo/MongoSignalRepository"
  );

const MongoIncidentLifecycleRepository =
  require(
    "../mongo/MongoIncidentLifecycleRepository"
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

const MongoPersistenceTransactionManager =
  require(
    "../transactions/MongoPersistenceTransactionManager"
  );

const MongoIdentifierPolicy =
  require(
    "../identifiers/MongoIdentifierPolicy"
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
/**
 * Phase 13 — Persistence Provider
 *
 * MongoDB remains the active persistence implementation while AIRA is
 * establishing stable domain repository boundaries.
 *
 * Business services must import repository instances from this module.
 *
 * PostgreSQL adapters will later replace individual implementations
 * behind this boundary only after:
 *
 * - PostgreSQL schema exists;
 * - backfill is complete;
 * - parity tests pass;
 * - tenant isolation passes;
 * - concurrency semantics are reproduced;
 * - rollback is available.
 */

const incidentRepository =
  new MongoIncidentRepository();

const incidentEventRepository =
  new MongoIncidentEventRepository();

const incidentLifecycleRepository =
  new MongoIncidentLifecycleRepository();

const signalRepository =
  new MongoSignalRepository();  

const signalCorrelationRepository =
  new MongoSignalCorrelationRepository();

const correlationTopologyRepository =
  new MongoCorrelationTopologyRepository();

const agentIntelligenceRunRepository =
  new MongoAgentIntelligenceRunRepository();

const incidentDiagnosisRepository =
  new MongoIncidentDiagnosisRepository();

const decisionTraceRepository =
  new MongoDecisionTraceRepository();

const persistenceTransactionManager =
  new MongoPersistenceTransactionManager();

const persistenceIdentifierPolicy =
  new MongoIdentifierPolicy();

const recoveryDecisionRepository =
  new MongoRecoveryDecisionRepository();

const executionAuthorizationRepository =
  new MongoExecutionAuthorizationRepository();

const runtimeRecoveryCheckpointRepository =
  new MongoRuntimeRecoveryCheckpointRepository();

const approvalRepository =
  new MongoApprovalRepository();

const auditRepository =
  new MongoAuditRepository();

const policyRepository =
  new MongoPolicyRepository();

module.exports = {
  incidentRepository,

  incidentEventRepository,

  incidentLifecycleRepository,

  signalRepository,

  signalCorrelationRepository,

  correlationTopologyRepository,

  agentIntelligenceRunRepository,

  incidentDiagnosisRepository,

  decisionTraceRepository,

  persistenceTransactionManager,

  persistenceIdentifierPolicy,

  recoveryDecisionRepository,

executionAuthorizationRepository,

runtimeRecoveryCheckpointRepository,

approvalRepository,

auditRepository,

policyRepository,
};