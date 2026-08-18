"use strict";

/**
 * Recovery Monitoring Agent
 *
 * Phase 12.10
 *
 * Observes execution trajectory AFTER deterministic execution.
 *
 * SAFETY:
 *
 * Recovery observation != recovery verification.
 *
 * This agent:
 * - does not execute infrastructure
 * - does not rollback infrastructure
 * - does not approve execution
 * - does not close incidents
 * - does not declare AUTO_RESOLVED
 * - does not replace RunbookVerificationService
 *
 * It may only describe trajectory and recommend CONTINUE / WAIT / ESCALATE.
 */

const {
  BaseAgent,
} =
  require(
    "../runtime/baseAgent"
  );

const {
  AGENT_STATUS,
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  AGENT_MANUAL_REASON,
  RECOVERY_STATE,
  RECOVERY_VERIFICATION_STATE,
  MONITORING_RECOMMENDATION,
  createEvidenceItem,
  createRecoveryObservation,
} =
  require(
    "../contracts/agentContracts"
  );

const {
  getReasoningProvider,
} =
  require(
    "../runtime/reasoningProvider"
  );

const AGENT_NAME =
  "RecoveryMonitoringAgent";

const AGENT_VERSION =
  "2.0.0";

const OUTPUT_SCHEMA = {
  required: [
    "state",
    "confidence",
    "recommendation",
  ],

  properties: {
    state: {
      type:
        "string",
    },

    confidence: {
      type:
        "number",
    },

    evidenceIds: {
      type:
        "array",
    },

    observations: {
      type:
        "array",
    },

    concerns: {
      type:
        "array",
    },

    recommendation: {
      type:
        "string",
    },
  },
};

class RecoveryMonitoringAgent
  extends BaseAgent {

  constructor(
    config = {}
  ) {
    super(
      AGENT_NAME,
      AGENT_VERSION
    );

    this._config =
      config;

    this._reasoning =
      config.reasoningProvider ||
      null;
  }

  validateInput(
    context
  ) {
    const base =
      super.validateInput(
        context
      );

    if (
      !base.valid
    ) {
      return base;
    }

    const errors =
      [];

    if (
      !context
        .playbookExecutionId &&
      !context
        .verificationResults
        ?.length &&
      !context
        .rollbackResults
        ?.length
    ) {
      errors.push(
        "Recovery monitoring requires execution or verification context"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  }

  async execute(
    context
  ) {
    const startedAt =
      new Date();

    const provider =
      this._reasoning ||
      getReasoningProvider();

    try {
      const {
        incidentId,
        correlationId,
        playbookExecutionId,
        verificationResults,
        rollbackResults,
        service,
        resource,
        incident,
      } =
        context;

      const evidenceItems =
        [];

      // ======================================================================
      // 1. DETERMINISTIC VERIFICATION EVIDENCE
      // ======================================================================

      if (
        verificationResults
          ?.length >
        0
      ) {
        evidenceItems.push(
          createEvidenceItem({
            id:
              `ev-verify-${incidentId}`,

            type:
              EVIDENCE_TYPE
                .VERIFICATION_RESULT,

            source:
              "runbook-verification-service",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .KUBERNETES_API,

            resource:
              resource ||
              {},

            serviceId:
              service
                ?.id ||
              null,

            summary:
              `${verificationResults.length} deterministic verification result(s)`,

            structuredData: {
              results:
                verificationResults,
            },

            correlationId,

            trustLevel:
              "CANONICAL",

            provenance: {
              collector:
                "RecoveryMonitoringAgent",

              retrievalMethod:
                "deterministic_verification_result_read",

              sourceRef:
                playbookExecutionId
                  ? `PlaybookExecution:${playbookExecutionId}`
                  : `Incident:${incidentId}`,

              canonicalStore:
                "RunbookVerificationService",
            },
          })
        );
      }

      // ======================================================================
      // 2. ROLLBACK EVIDENCE
      // ======================================================================

      if (
        rollbackResults
          ?.length >
        0
      ) {
        evidenceItems.push(
          createEvidenceItem({
            id:
              `ev-rollback-${incidentId}`,

            type:
              EVIDENCE_TYPE
                .EXECUTION_RESULT,

            source:
              "runbook-rollback-engine",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .KUBERNETES_API,

            resource:
              resource ||
              {},

            serviceId:
              service
                ?.id ||
              null,

            summary:
              `${rollbackResults.length} rollback result(s)`,

            structuredData: {
              results:
                rollbackResults,
            },

            correlationId,

            trustLevel:
              "CANONICAL",

            provenance: {
              collector:
                "RecoveryMonitoringAgent",

              retrievalMethod:
                "rollback_result_read",

              sourceRef:
                playbookExecutionId
                  ? `PlaybookExecution:${playbookExecutionId}`
                  : `Incident:${incidentId}`,

              canonicalStore:
                "RunbookRollbackEngine",
            },
          })
        );
      }

      // ======================================================================
      // 3. AI OBSERVATION — READ ONLY
      // ======================================================================

      const reasoning =
        await provider
          .reason({
            task:
              "recoveryMonitoring",

            systemInstructions:
              MONITORING_SYSTEM_PROMPT,

            structuredInput: {
              incidentId,

              playbookExecutionId,

              /*
               * These are deterministic observations.
               */
              verificationResults:
                verificationResults ||
                [],

              rollbackResults:
                rollbackResults ||
                [],

              service,

              resource,

              incident,
            },

            outputSchema:
              OUTPUT_SCHEMA,

            metadata: {
              incidentId,

              correlationId,
            },
          });

      if (
        reasoning
          .manualRequired
      ) {
        return this._manual(
          startedAt,

          reasoning
            .manualReason ||
            AGENT_MANUAL_REASON
              .REASONING_FAILED,

          {
            evidenceUsed:
              evidenceItems
                .map(
                  (
                    evidence
                  ) =>
                    evidence.id
                ),

            nextRecommendedStage:
              "DETERMINISTIC_VERIFICATION",
          }
        );
      }

      const output =
        reasoning.output ||
        {};

      const rawState =
        String(
          output.state ||
          RECOVERY_STATE.STABLE
        )
          .toUpperCase()
          .replace(
            /\s+/g,
            "_"
          );

      const state =
        RECOVERY_STATE[
          rawState
        ] ||
        RECOVERY_STATE.STABLE;

      const rawRecommendation =
        String(
          output.recommendation ||
          MONITORING_RECOMMENDATION.WAIT
        )
          .toUpperCase()
          .replace(
            /\s+/g,
            "_"
          );

      let recommendation =
        MONITORING_RECOMMENDATION[
          rawRecommendation
        ] ||
        MONITORING_RECOMMENDATION.WAIT;

      if (
        state ===
          RECOVERY_STATE.WORSENING ||
        state ===
          RECOVERY_STATE.MANUAL_REQUIRED
      ) {
        recommendation =
          MONITORING_RECOMMENDATION
            .ESCALATE;
      }

      const deterministicVerificationIds =
        (
          verificationResults ||
          []
        )
          .map(
            (
              result
            ) =>
              result
                ?.verificationId ||
              result
                ?.id ||
              null
          )
          .filter(
            Boolean
          );

      const verificationState =
        _deriveVerificationState(
          verificationResults
        );

      const observation =
        createRecoveryObservation({
          state,

          confidence:
            typeof output
              .confidence ===
              "number"
              ? Math.min(
                  1,
                  Math.max(
                    0,
                    output
                      .confidence
                  )
                )
              : 0.5,

          evidenceIds:
            evidenceItems
              .map(
                (
                  evidence
                ) =>
                  evidence.id
              ),

          observations:
            Array.isArray(
              output
                .observations
            )
              ? output
                  .observations
              : [],

          concerns:
            Array.isArray(
              output
                .concerns
            )
              ? output
                  .concerns
              : [],

          recommendation,

          playbookExecutionId,

          verificationState,

          deterministicVerificationIds,

          rollbackObserved:
            Boolean(
              rollbackResults
                ?.length
            ),

          worsening:
            state ===
              RECOVERY_STATE.WORSENING ||
            state ===
              RECOVERY_STATE.MANUAL_REQUIRED,
        });

      return this._success(
        startedAt,

        {
          observation,
        },

        {
          confidence:
            observation
              .confidence,

          evidenceUsed:
            evidenceItems
              .map(
                (
                  evidence
                ) =>
                  evidence.id
              ),

          nextRecommendedStage:
            recommendation ===
              MONITORING_RECOMMENDATION
                .ESCALATE
              ? "HUMAN_ESCALATION"
              : "DETERMINISTIC_VERIFICATION",

          modelMetadata:
            reasoning
              .modelMetadata ||
            null,

          model:
            reasoning
              .modelMetadata
              ?.model,

          provider:
            reasoning
              .modelMetadata
              ?.provider,

          fallbackUsed:
            Boolean(
              reasoning
                .fallbackUsed
            ),

          warnings:
            reasoning
              .warnings ||
            [],
        }
      );
    } catch (
      error
    ) {
      return this._fail(
        startedAt,
        error
      );
    }
  }

  validateOutput(
    record
  ) {
    const base =
      super.validateOutput(
        record
      );

    if (
      !base.valid
    ) {
      return base;
    }

    if (
      record.status ===
        AGENT_STATUS.SUCCESS
    ) {
      const observation =
        record
          .result
          ?.observation;

      if (
        !observation
      ) {
        return {
          valid:
            false,

          errors: [
            "Recovery observation is required",
          ],
        };
      }

      if (
        observation
          .finalRecoveryDeclared ===
        true
      ) {
        return {
          valid:
            false,

          errors: [
            "RecoveryMonitoringAgent cannot declare final recovery",
          ],
        };
      }

      if (
        observation
          .executionAuthorized ===
        true ||
        observation
          .incidentResolutionAuthorized ===
        true
      ) {
        return {
          valid:
            false,

          errors: [
            "RecoveryMonitoringAgent cannot authorize execution or incident resolution",
          ],
        };
      }
    }

    return {
      valid:
        true,

      errors:
        [],
    };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),

      reads: [
        "context.verificationResults",
        "context.rollbackResults",
        "context.playbookExecutionId",
        "context.incident",
        "context.service",
        "context.resource",
      ],

      writes: [
        "context.recoveryObservation",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,

      executionAuthorization:
        false,

      incidentResolution:
        false,
    };
  }
}

function _deriveVerificationState(
  verificationResults
) {
  if (
    !Array.isArray(
      verificationResults
    ) ||
    verificationResults.length ===
      0
  ) {
    return RECOVERY_VERIFICATION_STATE
      .NOT_STARTED;
  }

  const states =
    verificationResults
      .map(
        (
          result
        ) =>
          String(
            result
              ?.status ||
            result
              ?.outcome ||
            result
              ?.result ||
            ""
          )
            .trim()
            .toUpperCase()
      );

  if (
    states.some(
      (
        value
      ) =>
        [
          "FAILED",
          "FAILURE",
          "UNHEALTHY",
          "REGRESSION",
        ].includes(
          value
        )
    )
  ) {
    return RECOVERY_VERIFICATION_STATE
      .FAILED;
  }

  if (
    states.length >
      0 &&
    states.every(
      (
        value
      ) =>
        [
          "SUCCESS",
          "PASSED",
          "PASS",
          "VERIFIED",
          "HEALTHY",
        ].includes(
          value
        )
    )
  ) {
    return RECOVERY_VERIFICATION_STATE
      .VERIFIED;
  }

  return RECOVERY_VERIFICATION_STATE
    .INCONCLUSIVE;
}

const MONITORING_SYSTEM_PROMPT =
  `
You are the AIRA Recovery Monitoring Agent.

You observe deterministic recovery/execution results.

You are NOT the recovery verifier.

Rules:

1. Never declare AUTO_RESOLVED.
2. Never state that the incident is finally resolved.
3. Never authorize infrastructure execution.
4. Never approve or bypass policy.
5. Never trigger rollback directly.
6. Never mutate infrastructure.
7. Report only trajectory:
   IMPROVING, STABLE, RECOVERED, DEGRADED, WORSENING,
   STALLED, ROLLBACK_IN_PROGRESS, MANUAL_REQUIRED.
8. RECOVERED means "appears recovered from observed evidence" only.
   Final recovery still requires deterministic verification.
9. If worsening, recommendation MUST be ESCALATE.
10. Return ONLY valid JSON.
`
    .trim();

module.exports = {
  RecoveryMonitoringAgent,
};