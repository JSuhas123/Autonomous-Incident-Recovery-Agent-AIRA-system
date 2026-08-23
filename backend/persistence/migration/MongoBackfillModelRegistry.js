"use strict";

/**
 * Phase 13.5B
 *
 * Canonical Mongo source-model registry.
 *
 * Responsibilities:
 *
 * - map migration domains to actual Mongoose models
 * - normalize mixed module export shapes
 * - identify ownership semantics
 * - identify logical identity fields
 * - distinguish physical vs derived domains
 */

const IncidentModule =
  require(
    "../../models/Incident"
  );

const IncidentEventModule =
  require(
    "../../models/IncidentEvent"
  );

const IncidentLifecycleModule =
  require(
    "../../models/IncidentLifecycle"
  );

const IncidentLifecycleTransitionModule =
  require(
    "../../models/IncidentLifecycleTransition"
  );

const SignalModule =
  require(
    "../../models/Signal"
  );

const SignalCorrelationModule =
  require(
    "../../models/SignalCorrelation"
  );

const AgentIntelligenceRunModule =
  require(
    "../../models/AgentIntelligenceRun"
  );

const IncidentDiagnosisModule =
  require(
    "../../models/IncidentDiagnosis"
  );

const DecisionTraceModule =
  require(
    "../../models/DecisionTrace"
  );

const RecoveryDecisionModule =
  require(
    "../../models/RecoveryDecision"
  );

const RecoveryDecisionRunModule =
  require(
    "../../models/RecoveryDecisionRun"
  );

const ExecutionAuthorizationModule =
  require(
    "../../models/ExecutionAuthorization"
  );

const ExecutionRequestModule =
  require(
    "../../models/ExecutionRequest"
  );

const RuntimeRecoveryCheckpointModule =
  require(
    "../../models/RuntimeRecoveryCheckpoint"
  );

const ApprovalRequestModule =
  require(
    "../../models/ApprovalRequest"
  );

const AuditEventModule =
  require(
    "../../models/AuditEvent"
  );

const PolicyDefinitionModule =
  require(
    "../../models/PolicyDefinition"
  );

const WorkflowOutboxEventModule =
  require(
    "../../models/WorkflowOutboxEvent"
  );

function resolveModel(
  moduleValue,
  preferredExport = null
) {
  if (
    !moduleValue
  ) {
    return null;
  }

  if (
    preferredExport &&
    moduleValue[
      preferredExport
    ]
  ) {
    return moduleValue[
      preferredExport
    ];
  }

  if (
    typeof moduleValue ===
      "function" &&
    moduleValue.modelName
  ) {
    return moduleValue;
  }

  if (
    moduleValue.default &&
    typeof moduleValue.default ===
      "function"
  ) {
    return moduleValue.default;
  }

  const candidate =
    Object.values(
      moduleValue
    )
      .find(
        (
          value
        ) =>
          typeof value ===
            "function" &&
          value.modelName
      );

  if (
    candidate
  ) {
    return candidate;
  }

  throw Object.assign(
    new Error(
      "Unable to resolve Mongoose model export"
    ),
    {
      code:
        "MIGRATION_MONGO_MODEL_RESOLUTION_FAILED",
    }
  );
}

const DEFINITIONS =
  Object.freeze({
    incidents: {
      model:
        resolveModel(
          IncidentModule,
          "Incident"
        ),

      ownership:
        "environment",

      publicIdField:
        "_id",

      migrationMode:
        "write",
    },

    incidentEvents: {
      model:
        resolveModel(
          IncidentEventModule
        ),

      ownership:
        "environment",

      publicIdField:
        "eventId",

      migrationMode:
        "write",
    },

    incidentLifecycleTransitions: {
      model:
        resolveModel(
          IncidentLifecycleTransitionModule
        ),

      ownership:
        "environment",

      publicIdField:
        "transitionId",

      migrationMode:
        "write",
    },

    incidentLifecycle: {
      model:
        resolveModel(
          IncidentLifecycleModule
        ),

      ownership:
        "environment",

      publicIdField:
        "incidentId",

      migrationMode:
        "write",
    },

    signals: {
      model:
        resolveModel(
          SignalModule,
          "Signal"
        ),

      ownership:
        "environment",

      publicIdField:
        "signalId",

      migrationMode:
        "write",
    },

    signalCorrelations: {
      model:
        resolveModel(
          SignalCorrelationModule,
          "SignalCorrelation"
        ),

      ownership:
        "environment",

      publicIdField:
        "correlationGroupId",

      migrationMode:
        "write",
    },

    /*
     * No physical source migration occurs for this domain in 13.5B.
     *
     * PostgreSQL exposes topology relationship reads, not a writer.
     */
    correlationTopology: {
      model:
        null,

      ownership:
        "environment",

      publicIdField:
        null,

      migrationMode:
        "derived",
    },

    agentIntelligenceRuns: {
      model:
        resolveModel(
          AgentIntelligenceRunModule
        ),

      ownership:
        "environment",

      publicIdField:
        "runId",

      migrationMode:
        "write",
    },

    incidentDiagnoses: {
      model:
        resolveModel(
          IncidentDiagnosisModule
        ),

      ownership:
        "environment",

      publicIdField:
        "diagnosisId",

      migrationMode:
        "write",
    },

    decisionTraces: {
      model:
        resolveModel(
          DecisionTraceModule
        ),

      ownership:
        "environment",

      publicIdField:
        "decisionId",

      migrationMode:
        "write",
    },

    recoveryDecisionRuns: {
      model:
        resolveModel(
          RecoveryDecisionRunModule
        ),

      ownership:
        "environment",

      publicIdField:
        "runId",

      migrationMode:
        "write",
    },

    recoveryDecisions: {
      model:
        resolveModel(
          RecoveryDecisionModule
        ),

      ownership:
        "environment",

      publicIdField:
        "decisionId",

      migrationMode:
        "write",
    },

    executionAuthorizations: {
      model:
        resolveModel(
          ExecutionAuthorizationModule
        ),

      ownership:
        "environment",

      publicIdField:
        "authorizationId",

      migrationMode:
        "write",
    },

    executionRequests: {
      model:
        resolveModel(
          ExecutionRequestModule
        ),

      ownership:
        "environment",

      publicIdField:
        "executionRequestId",

      migrationMode:
        "write",
    },

    runtimeRecoveryCheckpoints: {
      model:
        resolveModel(
          RuntimeRecoveryCheckpointModule
        ),

      ownership:
        "environment",

      publicIdField:
        "_id",

      migrationMode:
        "write",
    },

    approvals: {
      model:
        resolveModel(
          ApprovalRequestModule
        ),

      ownership:
        "environment",

      publicIdField:
        "approvalId",

      migrationMode:
        "write",
    },

    audit: {
      model:
        resolveModel(
          AuditEventModule
        ),

      ownership:
        "tenant",

      publicIdField:
        "eventId",

      migrationMode:
        "write",
    },

    policies: {
      model:
        resolveModel(
          PolicyDefinitionModule
        ),

      ownership:
        "tenant",

      publicIdField:
        "policyId",

      migrationMode:
        "write",
    },

    workflowOutbox: {
      model:
        resolveModel(
          WorkflowOutboxEventModule
        ),

      ownership:
        "environment",

      publicIdField:
        "eventId",

      migrationMode:
        "write",
    },
  });

class MongoBackfillModelRegistry {
  list() {
    return Object.entries(
      DEFINITIONS
    )
      .map(
        ([
          name,
          definition,
        ]) => ({
          name,

          ...definition,
        })
      );
  }

  has(
    domain
  ) {
    return Boolean(
      DEFINITIONS[
        domain
      ]
    );
  }

  get(
    domain
  ) {
    const definition =
      DEFINITIONS[
        domain
      ];

    if (
      !definition
    ) {
      throw Object.assign(
        new Error(
          `Unknown Mongo backfill domain: ${domain}`
        ),
        {
          code:
            "MIGRATION_DOMAIN_UNKNOWN",

          domain,
        }
      );
    }

    return {
      name:
        domain,

      ...definition,
    };
  }
}

module.exports =
  MongoBackfillModelRegistry;

module.exports
  .DEFINITIONS =
  DEFINITIONS;

module.exports
  .resolveModel =
  resolveModel;