"use strict";

const {
  VerificationPlanBuilderService,
} =
  require(
    "../verificationPlanBuilderService"
  );

const {
  HealthVerificationService,
} =
  require(
    "../healthVerificationService"
  );

const {
  MetricsVerificationService,
} =
  require(
    "../metricsVerificationService"
  );

const {
  LogVerificationService,
} =
  require(
    "../logVerificationService"
  );

const {
  IncidentStateVerificationService,
} =
  require(
    "../incidentStateVerificationService"
  );

const {
  RecoveryEvidenceAggregator,
} =
  require(
    "../recoveryEvidenceAggregator"
  );

const {
  VerificationDecisionEngine,
} =
  require(
    "../verificationDecisionEngine"
  );

const {
  VerificationDecisionCritic,
} =
  require(
    "../verificationDecisionCritic"
  );

const {
  RecoveryOutcomeRoutingService,
  RECOVERY_ROUTE,
} =
  require(
    "../recoveryOutcomeRoutingService"
  );

const {
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
} =
  require(
    "../verificationContracts"
  );

// ============================================================================
// BASE INPUT
// ============================================================================

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    executionRequestId:
      "request-1",

    authorizationId:
      "auth-1",

    recoveryDecisionId:
      "recovery-1",

    executionPlan: {
      planId:
        "plan-1",

      planHash:
        "planhash-1",

      executionAuthorized:
        false,

      verificationHooks: [
        {
          id:
            "health",

          dimension:
            "HEALTH",

          type:
            "service_health",

          description:
            "Payment API must be healthy.",

          required:
            true,

          expectedValue:
            "healthy",

          timeoutMs:
            1000,

          parameters: {
            serviceId:
              "payment-api",
          },
        },

        {
          id:
            "cpu",

          dimension:
            "METRICS",

          type:
            "cpu_recovery",

          description:
            "CPU must return below recovery threshold.",

          required:
            true,

          threshold:
            70,

          timeoutMs:
            1000,
        },

        {
          id:
            "logs",

          dimension:
            "LOGS",

          type:
            "error_fingerprint_cleared",

          description:
            "Original incident error must disappear.",

          required:
            true,

          threshold:
            0,

          timeoutMs:
            1000,

          parameters: {
            fingerprint:
              "ECONNREFUSED postgres:5432",
          },
        },

        {
          id:
            "alerts",

          dimension:
            "INCIDENT_STATE",

          type:
            "alerts_cleared",

          description:
            "Incident alerts must clear.",

          required:
            true,

          threshold:
            0,

          timeoutMs:
            1000,
        },
      ],
    },

    playbook: {
      playbookId:
        "restart-payment-api",

      postconditions:
        [],
    },

    incident: {
      incidentId:
        "incident-1",

      severity:
        "critical",

      errorFingerprint:
        "ECONNREFUSED postgres:5432",

      symptoms: [],
    },

    context: {
      service: {
        id:
          "payment-api",

        namespace:
          "production",
      },
    },

    executionResult: {
      success:
        true,

      changed:
        true,

      rollbackRequired:
        false,
    },

    recoveryAttempt:
      1,

    maxRecoveryAttempts:
      3,

    retryAllowed:
      true,

    rollbackAvailable:
      true,

    executionAuthorized:
      false,

    ...overrides,
  };
}

// ============================================================================
// DEFAULT HEALTHY DEPENDENCIES
// ============================================================================

function healthyDependencies(
  overrides = {}
) {
  return {
    async getServiceHealth() {
      return {
        healthy:
          true,

        status:
          "healthy",

        evidence: [
          {
            source:
              "health-endpoint",

            status:
              200,
          },
        ],
      };
    },

    async getMetricValue({
      metric,
    }) {
      if (
        metric ===
        "cpu"
      ) {
        return {
          value:
            42,

          baseline:
            35,

          evidence: [
            {
              source:
                "prometheus",

              metric:
                "cpu",

              value:
                42,
            },
          ],
        };
      }

      return {
        value:
          0,
      };
    },

    async searchLogs() {
      return {
        matchCount:
          0,

        evidence: [
          {
            source:
              "loki",

            matches:
              0,
          },
        ],
      };
    },

    async getActiveAlerts() {
      return {
        activeCount:
          0,

        evidence: [
          {
            source:
              "alertmanager",

            activeCount:
              0,
          },
        ],
      };
    },

    ...overrides,
  };
}

// ============================================================================
// PIPELINE RUNNER
// ============================================================================

async function runVerificationPipeline({
  input =
    baseInput(),

  dependencies =
    healthyDependencies(),

  previousVerificationResult =
    null,
} = {}) {
  const planBuilder =
    new VerificationPlanBuilderService();

  const healthVerifier =
    new HealthVerificationService();

  const metricsVerifier =
    new MetricsVerificationService();

  const logVerifier =
    new LogVerificationService();

  const incidentVerifier =
    new IncidentStateVerificationService();

  const aggregator =
    new RecoveryEvidenceAggregator();

  const decisionEngine =
    new VerificationDecisionEngine();

  const critic =
    new VerificationDecisionCritic();

  const router =
    new RecoveryOutcomeRoutingService();

  // ==========================================================================
  // 1. PLAN
  // ==========================================================================

  const verificationPlan =
    planBuilder.build({
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      executionRequestId:
        input.executionRequestId,

      authorizationId:
        input.authorizationId,

      recoveryDecisionId:
        input.recoveryDecisionId,

      executionPlan:
        input.executionPlan,

      playbook:
        input.playbook,

      incident:
        input.incident,

      context:
        input.context,

      executionAuthorized:
        false,
    });

  const commonInput = {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,

    incidentId:
      input.incidentId,

    executionRequestId:
      input.executionRequestId,

    authorizationId:
      input.authorizationId,

    recoveryDecisionId:
      input.recoveryDecisionId,

    verificationPlan,

    incident:
      input.incident,

    context:
      input.context,

    executionAuthorized:
      false,
  };

  // ==========================================================================
  // 2. VERIFIERS
  // ==========================================================================

  const [
    healthResult,
    metricsResult,
    logsResult,
    incidentStateResult,
  ] =
    await Promise.all([
      healthVerifier.verify(
        commonInput,
        dependencies
      ),

      metricsVerifier.verify(
        commonInput,
        dependencies
      ),

      logVerifier.verify(
        commonInput,
        dependencies
      ),

      incidentVerifier.verify(
        commonInput,
        dependencies
      ),
    ]);

  // ==========================================================================
  // 3. AGGREGATE
  // ==========================================================================

  const evidencePackage =
    aggregator.aggregate({
      ...commonInput,

      healthResult,

      metricsResult,

      logsResult,

      incidentStateResult,
    });

  // ==========================================================================
  // 4. DECIDE
  // ==========================================================================

  const decisionResult =
    decisionEngine.decide({
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      executionRequestId:
        input.executionRequestId,

      authorizationId:
        input.authorizationId,

      recoveryDecisionId:
        input.recoveryDecisionId,

      executionPlanId:
        input.executionPlan
          .planId,

      executionPlanHash:
        input.executionPlan
          .planHash,

      evidencePackage,

      executionResult:
        input.executionResult,

      rollbackAvailable:
        input.rollbackAvailable,

      retryAllowed:
        input.retryAllowed,

      recoveryAttempt:
        input.recoveryAttempt,

      maxRecoveryAttempts:
        input.maxRecoveryAttempts,

      previousVerificationResult,

      executionAuthorized:
        false,
    });

  // ==========================================================================
  // 5. CRITIC
  // ==========================================================================

  const criticResult =
    critic.review({
      decisionResult,

      evidencePackage,

      executionAuthorized:
        false,
    });

  // ==========================================================================
  // 6. ROUTE
  // ==========================================================================

  const routingResult =
    router.route({
      decisionResult,

      criticResult,

      rollbackAvailable:
        input.rollbackAvailable,

      retryAllowed:
        input.retryAllowed,

      recoveryAttempt:
        input.recoveryAttempt,

      maxRecoveryAttempts:
        input.maxRecoveryAttempts,

      retryBlocked:
        false,

      executionAuthorized:
        false,
    });

  return {
    verificationPlan,

    healthResult,

    metricsResult,

    logsResult,

    incidentStateResult,

    evidencePackage,

    decisionResult,

    criticResult,

    routingResult,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "Phase 9 Verification E2E",
  () => {
    // ========================================================================
    // 1. HAPPY PATH
    // ========================================================================

    test(
      "healthy post-execution system is independently confirmed recovered",
      async () => {
        const result =
          await runVerificationPipeline();

        expect(
          result.verificationPlan
            .checks
        )
          .toHaveLength(
            4
          );

        expect(
          result.healthResult
            .passedCount
        )
          .toBe(
            1
          );

        expect(
          result.metricsResult
            .passedCount
        )
          .toBe(
            1
          );

        expect(
          result.logsResult
            .passedCount
        )
          .toBe(
            1
          );

        expect(
          result.incidentStateResult
            .passedCount
        )
          .toBe(
            1
          );

        expect(
          result.evidencePackage
            .requiredSuccessRate
        )
          .toBe(
            1
          );

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .RECOVERED
          );

        expect(
          result.decisionResult
            .confidence
        )
          .toBe(
            VERIFICATION_CONFIDENCE
              .HIGH
          );

        expect(
          result.criticResult
            .accepted
        )
          .toBe(
            true
          );

        expect(
          result.criticResult
            .recoveryConfirmed
        )
          .toBe(
            true
          );

        expect(
          result.routingResult
            .route
        )
          .toBe(
            RECOVERY_ROUTE
              .CLOSE_INCIDENT
          );
      }
    );

    // ========================================================================
    // 2. EXECUTION SUCCESS != RECOVERY
    // ========================================================================

    test(
      "successful execution is not considered recovered when service remains unhealthy",
      async () => {
        const dependencies =
          healthyDependencies({
            async getServiceHealth() {
              return {
                healthy:
                  false,

                status:
                  "unhealthy",

                reason:
                  "Service still returning 503.",
              };
            },
          });

        const result =
          await runVerificationPipeline({
            dependencies,
          });

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );

        expect(
          result.criticResult
            .recoveryConfirmed
        )
          .toBe(
            false
          );

        expect(
          result.routingResult
            .route
        )
          .not
          .toBe(
            RECOVERY_ROUTE
              .CLOSE_INCIDENT
          );
      }
    );

    // ========================================================================
    // 3. METRIC FAILURE
    // ========================================================================

    test(
      "high CPU after remediation prevents recovery confirmation",
      async () => {
        const dependencies =
          healthyDependencies({
            async getMetricValue({
              metric,
            }) {
              if (
                metric ===
                "cpu"
              ) {
                return {
                  value:
                    96,

                  baseline:
                    35,
                };
              }

              return {
                value:
                  0,
              };
            },
          });

        const result =
          await runVerificationPipeline({
            dependencies,
          });

        expect(
          result.metricsResult
            .failedCount
        )
          .toBe(
            1
          );

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );
      }
    );

    // ========================================================================
    // 4. ORIGINAL ERROR REMAINS
    // ========================================================================

    test(
      "remaining incident error fingerprint prevents recovery",
      async () => {
        const dependencies =
          healthyDependencies({
            async searchLogs() {
              return {
                matchCount:
                  8,
              };
            },
          });

        const result =
          await runVerificationPipeline({
            dependencies,
          });

        expect(
          result.logsResult
            .failedCount
        )
          .toBe(
            1
          );

        expect(
          result.evidencePackage
            .required
            .failed
        )
          .toBeGreaterThan(
            0
          );

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );
      }
    );

    // ========================================================================
    // 5. ALERTS REMAIN
    // ========================================================================

    test(
      "active alerts after remediation prevent recovery",
      async () => {
        const dependencies =
          healthyDependencies({
            async getActiveAlerts() {
              return {
                activeCount:
                  3,
              };
            },
          });

        const result =
          await runVerificationPipeline({
            dependencies,
          });

        expect(
          result.incidentStateResult
            .failedCount
        )
          .toBe(
            1
          );

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );
      }
    );

    // ========================================================================
    // 6. MISSING REQUIRED EVIDENCE
    // ========================================================================

    test(
      "missing required telemetry remains inconclusive instead of partially recovered",
      async () => {
        const dependencies =
          healthyDependencies();

        delete dependencies
          .searchLogs;

        const result =
          await runVerificationPipeline({
            dependencies,
          });

        expect(
          result.logsResult
            .inconclusiveCount
        )
          .toBe(
            1
          );

        expect(
          result.evidencePackage
            .required
            .inconclusive
        )
          .toBe(
            1
          );

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .INCONCLUSIVE
          );

        expect(
          result.decisionResult
            .nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .COLLECT_MORE_EVIDENCE
          );

        expect(
          result.routingResult
            .route
        )
          .toBe(
            RECOVERY_ROUTE
              .COLLECT_MORE_EVIDENCE
          );
      }
    );

    // ========================================================================
    // 7. CONFLICTING SIGNALS
    // ========================================================================

    test(
      "healthy service with remaining incident alert creates conflicting evidence",
      async () => {
        const dependencies =
          healthyDependencies({
            async getActiveAlerts() {
              return {
                activeCount:
                  1,
              };
            },
          });

        const result =
          await runVerificationPipeline({
            dependencies,
          });

        expect(
          result.evidencePackage
            .hasConflicts
        )
          .toBe(
            true
          );

        /*
         * Required failure is stronger than conflict/manual review.
         * Therefore NOT_RECOVERED is the expected safety outcome.
         */
        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );

        expect(
          result.routingResult
            .route
        )
          .not
          .toBe(
            RECOVERY_ROUTE
              .CLOSE_INCIDENT
          );
      }
    );

    // ========================================================================
    // 8. EXECUTION FAILED AND ROLLBACK REQUIRED
    // ========================================================================

    test(
      "failed execution with rollback requirement routes to rollback request",
      async () => {
        const input =
          baseInput({
            executionResult: {
              success:
                false,

              changed:
                true,

              rollbackRequired:
                true,
            },

            rollbackAvailable:
              true,
          });

        const result =
          await runVerificationPipeline({
            input,
          });

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );

        expect(
          result.decisionResult
            .nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .ROLLBACK
          );

        expect(
          result.routingResult
            .route
        )
          .toBe(
            RECOVERY_ROUTE
              .REQUEST_ROLLBACK
          );

        expect(
          result.routingResult
            .rollbackStarted
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 9. RETRY ROUTING
    // ========================================================================

    test(
      "failed verification may request retry when rollback is unavailable and attempts remain",
      async () => {
        const dependencies =
          healthyDependencies({
            async getServiceHealth() {
              return {
                healthy:
                  false,

                status:
                  "unhealthy",
              };
            },
          });

        const input =
          baseInput({
            rollbackAvailable:
              false,

            retryAllowed:
              true,

            recoveryAttempt:
              1,

            maxRecoveryAttempts:
              3,
          });

        const result =
          await runVerificationPipeline({
            input,
            dependencies,
          });

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .NOT_RECOVERED
          );

        expect(
          result.decisionResult
            .nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .RETRY_RECOVERY
          );

        expect(
          result.routingResult
            .route
        )
          .toBe(
            RECOVERY_ROUTE
              .REQUEST_RETRY
          );

        expect(
          result.routingResult
            .retryStarted
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 10. RETRY EXHAUSTED
    // ========================================================================

    test(
      "failed verification escalates when retry attempts are exhausted",
      async () => {
        const dependencies =
          healthyDependencies({
            async getServiceHealth() {
              return {
                healthy:
                  false,
              };
            },
          });

        const input =
          baseInput({
            rollbackAvailable:
              false,

            retryAllowed:
              true,

            recoveryAttempt:
              3,

            maxRecoveryAttempts:
              3,
          });

        const result =
          await runVerificationPipeline({
            input,
            dependencies,
          });

        expect(
          result.decisionResult
            .nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .ESCALATE
          );

        expect(
          result.routingResult
            .route
        )
          .toBe(
            RECOVERY_ROUTE
              .ESCALATE
          );

        expect(
          result.routingResult
            .requiresOperator
        )
          .toBe(
            true
          );
      }
    );

    // ========================================================================
    // 11. REGRESSION
    // ========================================================================

    test(
      "materially worse verification score is classified as regression",
      async () => {
        const dependencies =
          healthyDependencies({
            async getServiceHealth() {
              return {
                healthy:
                  false,
              };
            },

            async getMetricValue({
              metric,
            }) {
              if (
                metric ===
                "cpu"
              ) {
                return {
                  value:
                    99,
                };
              }

              return {
                value:
                  0,
              };
            },

            async searchLogs() {
              return {
                matchCount:
                  10,
              };
            },

            async getActiveAlerts() {
              return {
                activeCount:
                  3,
              };
            },
          });

        const result =
          await runVerificationPipeline({
            dependencies,

            previousVerificationResult: {
              overallScore:
                0.95,
            },
          });

        expect(
          result.decisionResult
            .decision
        )
          .toBe(
            VERIFICATION_DECISION
              .REGRESSED
          );

        expect(
          result.decisionResult
            .nextAction
        )
          .toBe(
            VERIFICATION_NEXT_ACTION
              .ROLLBACK
          );

        expect(
          result.routingResult
            .route
        )
          .toBe(
            RECOVERY_ROUTE
              .REQUEST_ROLLBACK
          );
      }
    );

    // ========================================================================
    // 12. PLAN IMMUTABILITY
    // ========================================================================

    test(
      "verification plan is immutable and hash-bound",
      async () => {
        const result =
          await runVerificationPipeline();

        expect(
          Object.isFrozen(
            result.verificationPlan
          )
        )
          .toBe(
            true
          );

        expect(
          result.verificationPlan
            .planHash
        )
          .toMatch(
            /^verifyhash_/
          );

        expect(
          result.evidencePackage
            .verificationPlanHash
        )
          .toBe(
            result.verificationPlan
              .planHash
          );

        expect(
          result.decisionResult
            .metadata
            .verificationPlanHash
        )
          .toBe(
            result.verificationPlan
              .planHash
          );
      }
    );

    // ========================================================================
    // 13. CRITIC CANNOT BE BYPASSED
    // ========================================================================

    test(
      "tampered recovered decision is rejected by critic",
      async () => {
        const planBuilder =
          new VerificationPlanBuilderService();

        const aggregator =
          new RecoveryEvidenceAggregator();

        const critic =
          new VerificationDecisionCritic();

        const input =
          baseInput();

        const verificationPlan =
          planBuilder.build({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,

            executionRequestId:
              input.executionRequestId,

            executionPlan:
              input.executionPlan,

            playbook:
              input.playbook,

            incident:
              input.incident,

            context:
              input.context,

            executionAuthorized:
              false,
          });

        const evidencePackage =
          aggregator.aggregate({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,

            executionRequestId:
              input.executionRequestId,

            verificationPlan,

            healthResult: {
              checks:
                [],

              passedCount:
                0,

              failedCount:
                0,

              inconclusiveCount:
                0,
            },

            metricsResult: {
              checks:
                [],

              passedCount:
                0,

              failedCount:
                0,

              inconclusiveCount:
                0,
            },

            logsResult: {
              checks:
                [],

              passedCount:
                0,

              failedCount:
                0,

              inconclusiveCount:
                0,
            },

            incidentStateResult: {
              checks:
                [],

              passedCount:
                0,

              failedCount:
                0,

              inconclusiveCount:
                0,
            },

            executionAuthorized:
              false,
          });

        const fakeRecoveredDecision = {
          verificationId:
            "fake-verification",

          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          executionRequestId:
            input.executionRequestId,

          decision:
            VERIFICATION_DECISION
              .RECOVERED,

          confidence:
            VERIFICATION_CONFIDENCE
              .HIGH,

          nextAction:
            VERIFICATION_NEXT_ACTION
              .CLOSE_INCIDENT,

          recovered:
            true,

          overallScore:
            1,

          metadata: {
            verificationPlanId:
              verificationPlan
                .verificationPlanId,

            verificationPlanHash:
              verificationPlan
                .planHash,
          },

          executionAuthorized:
            false,
        };

        const criticResult =
          critic.review({
            decisionResult:
              fakeRecoveredDecision,

            evidencePackage,

            executionAuthorized:
              false,
          });

        expect(
          criticResult.rejected
        )
          .toBe(
            true
          );

        expect(
          criticResult.recoveryConfirmed
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 14. PHASE 9 NEVER AUTHORIZES EXECUTION
    // ========================================================================

    test(
      "entire verification pipeline remains outside execution authorization boundary",
      async () => {
        const result =
          await runVerificationPipeline();

        expect(
          result.verificationPlan
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.healthResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.metricsResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.logsResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.incidentStateResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.evidencePackage
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.decisionResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.criticResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.routingResult
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 15. ROUTING DOES NOT EXECUTE SIDE EFFECTS
    // ========================================================================

    test(
      "confirmed recovery routes toward closure but does not close incident itself",
      async () => {
        const result =
          await runVerificationPipeline();

        expect(
          result.routingResult
            .route
        )
          .toBe(
            RECOVERY_ROUTE
              .CLOSE_INCIDENT
          );

        expect(
          result.routingResult
            .incidentClosed
        )
          .toBe(
            false
          );

        expect(
          result.routingResult
            .retryStarted
        )
          .toBe(
            false
          );

        expect(
          result.routingResult
            .rollbackStarted
        )
          .toBe(
            false
          );
      }
    );
  }
);