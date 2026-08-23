"use strict";

const IncidentVerificationAdapter =
  require(
    "./adapters/IncidentVerificationAdapter"
  );

const IncidentEventVerificationAdapter =
  require(
    "./adapters/IncidentEventVerificationAdapter"
  );

const IncidentLifecycleTransitionVerificationAdapter =
  require(
    "./adapters/IncidentLifecycleTransitionVerificationAdapter"
  );

const IncidentLifecycleVerificationAdapter =
  require(
    "./adapters/IncidentLifecycleVerificationAdapter"
  );

const SignalVerificationAdapter =
  require(
    "./adapters/SignalVerificationAdapter"
  );

const SignalCorrelationVerificationAdapter =
  require(
    "./adapters/SignalCorrelationVerificationAdapter"
  );

const AgentIntelligenceRunVerificationAdapter =
  require(
    "./adapters/AgentIntelligenceRunVerificationAdapter"
  );

const IncidentDiagnosisVerificationAdapter =
  require(
    "./adapters/IncidentDiagnosisVerificationAdapter"
  );

const DecisionTraceVerificationAdapter =
  require(
    "./adapters/DecisionTraceVerificationAdapter"
  );

const RecoveryDecisionRunVerificationAdapter =
  require(
    "./adapters/RecoveryDecisionRunVerificationAdapter"
  );

const RecoveryDecisionVerificationAdapter =
  require(
    "./adapters/RecoveryDecisionVerificationAdapter"
  );

const ExecutionAuthorizationVerificationAdapter =
  require(
    "./adapters/ExecutionAuthorizationVerificationAdapter"
  );

const ExecutionRequestVerificationAdapter =
  require(
    "./adapters/ExecutionRequestVerificationAdapter"
  );

const RuntimeRecoveryCheckpointVerificationAdapter =
  require(
    "./adapters/RuntimeRecoveryCheckpointVerificationAdapter"
  );

const ApprovalVerificationAdapter =
  require(
    "./adapters/ApprovalVerificationAdapter"
  );

const AuditVerificationAdapter =
  require(
    "./adapters/AuditVerificationAdapter"
  );

const PolicyVerificationAdapter =
  require(
    "./adapters/PolicyVerificationAdapter"
  );

const WorkflowOutboxVerificationAdapter =
  require(
    "./adapters/WorkflowOutboxVerificationAdapter"
  );

class DomainVerificationAdapterRegistry {
  constructor(
    options = {}
  ) {
    this.adapters = {
      incidents:
        options.incidentAdapter ||
        new IncidentVerificationAdapter(),

      incidentEvents:
        options.incidentEventAdapter ||
        new IncidentEventVerificationAdapter(),

      incidentLifecycleTransitions:
        options.incidentLifecycleTransitionAdapter ||
        new IncidentLifecycleTransitionVerificationAdapter(),

      incidentLifecycle:
        options.incidentLifecycleAdapter ||
        new IncidentLifecycleVerificationAdapter(),

      signals:
        options.signalAdapter ||
        new SignalVerificationAdapter(),

      signalCorrelations:
        options.signalCorrelationAdapter ||
        new SignalCorrelationVerificationAdapter(),

      agentIntelligenceRuns:
        options.agentIntelligenceRunAdapter ||
        new AgentIntelligenceRunVerificationAdapter(),

      incidentDiagnoses:
        options.incidentDiagnosisAdapter ||
        new IncidentDiagnosisVerificationAdapter(),

      decisionTraces:
        options.decisionTraceAdapter ||
        new DecisionTraceVerificationAdapter(),

      recoveryDecisionRuns:
        options.recoveryDecisionRunAdapter ||
        new RecoveryDecisionRunVerificationAdapter(),

      recoveryDecisions:
        options.recoveryDecisionAdapter ||
        new RecoveryDecisionVerificationAdapter(),

      executionAuthorizations:
        options.executionAuthorizationAdapter ||
        new ExecutionAuthorizationVerificationAdapter(),

      executionRequests:
        options.executionRequestAdapter ||
        new ExecutionRequestVerificationAdapter(),

      runtimeRecoveryCheckpoints:
        options.runtimeRecoveryCheckpointAdapter ||
        new RuntimeRecoveryCheckpointVerificationAdapter(),

      approvals:
        options.approvalAdapter ||
        new ApprovalVerificationAdapter(),

      audit:
        options.auditAdapter ||
        new AuditVerificationAdapter(),

      policies:
        options.policyAdapter ||
        new PolicyVerificationAdapter(),

      workflowOutbox:
        options.workflowOutboxAdapter ||
        new WorkflowOutboxVerificationAdapter(),

      ...(
        options.adapters ||
        {}
      ),
    };
  }

  register(
    domain,
    adapter
  ) {
    if (
      !domain
    ) {
      throw Object.assign(
        new Error(
          "Verification adapter domain is required"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_DOMAIN_REQUIRED",
        }
      );
    }

    if (
      !adapter ||
      typeof adapter !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          `Verification adapter is invalid for domain: ${domain}`
        ),
        {
          code:
            "MIGRATION_VERIFICATION_ADAPTER_INVALID",
        }
      );
    }

    this.adapters[
      domain
    ] =
      adapter;

    return this;
  }

  has(
    domain
  ) {
    return Boolean(
      this.adapters[
        domain
      ]
    );
  }

  get(
    domain
  ) {
    const adapter =
      this.adapters[
        domain
      ];

    if (
      !adapter
    ) {
      throw Object.assign(
        new Error(
          `Verification adapter not found for domain: ${domain}`
        ),
        {
          code:
            "MIGRATION_VERIFICATION_ADAPTER_NOT_FOUND",

          domain,
        }
      );
    }

    return adapter;
  }

  list() {
    return Object.keys(
      this.adapters
    );
  }
}

module.exports =
  DomainVerificationAdapterRegistry;