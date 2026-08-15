"use strict";

const {
  ClosureEligibilityGuard,
} =
  require(
    "../closureEligibilityGuard"
  );

const {
  IncidentLifecycleStateMachine,
} =
  require(
    "../incidentLifecycleStateMachine"
  );

const {
  IncidentClosureService,
} =
  require(
    "../incidentClosureService"
  );

const {
  RecoveryRetryOrchestrator,
} =
  require(
    "../recoveryRetryOrchestrator"
  );

const {
  RollbackHandoffOrchestrator,
} =
  require(
    "../rollbackHandoffOrchestrator"
  );

const {
  EscalationService,
} =
  require(
    "../escalationService"
  );

const {
  StabilityObservationService,
} =
  require(
    "../stabilityObservationService"
  );

const {
  RegressionReopenEngine,
  REGRESSION_ACTION,
} =
  require(
    "../regressionReopenEngine"
  );

const {
  LifecycleNotificationService,
} =
  require(
    "../lifecycleNotificationService"
  );

const {
  LifecycleAuditService,
  AUDIT_EVENT_TYPE,
} =
  require(
    "../lifecycleAuditService"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  STABILITY_RESULT,
  CLOSURE_DECISION,
  ESCALATION_REASON,
  LIFECYCLE_EVENT,
  LIFECYCLE_ACTION,
} =
  require(
    "../incidentLifecycleContracts"
  );

// ============================================================================
// HELPERS
// ============================================================================

function recoveredVerification(
  overrides = {}
) {
  return {
    verificationId:
      "verification-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    executionRequestId:
      "execution-1",

    recoveryDecisionId:
      "recovery-1",

    executionPlanId:
      "plan-1",

    executionPlanHash:
      "planhash-1",

    decision:
      "RECOVERED",

    recovered:
      true,

    recoveryConfirmed:
      true,

    criticResult: {
      accepted:
        true,

      rejected:
        false,

      requiresManualReview:
        false,

      recoveryConfirmed:
        true,
    },

    evidencePackage: {
      required: {
        planned:
          4,

        passed:
          4,

        failed:
          0,

        missing:
          0,

        inconclusive:
          0,
      },

      hasConflicts:
        false,
    },

    routingResult: {
      route:
        "CLOSE_INCIDENT",

      ready:
        true,
    },

    ...overrides,
  };
}

function incident(
  state
) {
  return {
    incidentId:
      "incident-1",

    lifecycleState:
      state,

    status:
      state,

    save:
      jest.fn(
        async () => {}
      ),
  };
}

function healthySamples() {
  return [
    {
      healthy:
        true,

      healthScore:
        1,
    },

    {
      healthy:
        true,

      healthScore:
        0.96,
    },

    {
      healthy:
        true,

      healthScore:
        0.94,
    },
  ];
}

function unstableSamples() {
  return [
    {
      healthy:
        true,
    },

    {
      healthy:
        false,
    },

    {
      healthy:
        true,
    },
  ];
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "Phase 10 Lifecycle E2E",
  () => {
    // ========================================================================
    // 1. VERIFIED RECOVERY CANNOT CLOSE IMMEDIATELY
    // ========================================================================

    test(
      "verified recovery must enter stability observation before closure",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .WAIT_FOR_STABILITY
          );

        expect(
          result.nextState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );

        expect(
          result.incidentClosed
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 2. RECOVERED → STABILITY OBSERVATION
    // ========================================================================

    test(
      "recovered incident transitions into stability observation",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const transition =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .RECOVERED,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,

            reason:
              "Verified recovery requires stability observation.",

            executionAuthorized:
              false,
          });

        expect(
          transition.allowed
        )
          .toBe(
            true
          );

        expect(
          transition.toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );
      }
    );

    // ========================================================================
    // 3. STABILITY PASSES
    // ========================================================================

    test(
      "healthy recovery remains stable after observation window",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            startedAt:
              new Date(
                "2026-01-01T00:00:00Z"
              ),

            now:
              new Date(
                "2026-01-01T00:06:00Z"
              ),

            windowMs:
              300000,

            minimumSamples:
              3,

            maximumFailureRatio:
              0,

            samples:
              healthySamples(),

            executionAuthorized:
              false,
          });

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .STABLE
          );

        expect(
          result.completed
        )
          .toBe(
            true
          );
      }
    );

    // ========================================================================
    // 4. STABLE RECOVERY BECOMES CLOSURE ELIGIBLE
    // ========================================================================

    test(
      "stable verified recovery becomes eligible for resolution",
      () => {
        const guard =
          new ClosureEligibilityGuard();

        const result =
          guard.evaluate({
            verification:
              recoveredVerification(),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .STABLE,

              completed:
                true,
            },
          });

        expect(
          result.decision
        )
          .toBe(
            CLOSURE_DECISION
              .ELIGIBLE
          );

        expect(
          result.nextState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED
          );
      }
    );

    // ========================================================================
    // 5. RESOLVE → CLOSE
    // ========================================================================

    test(
      "stable verified incident resolves then closes",
      async () => {
        const doc =
          incident(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );

        const guard =
          new ClosureEligibilityGuard();

        const closure =
          new IncidentClosureService();

        const eligibility =
          guard.evaluate({
            verification:
              recoveredVerification(),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .STABLE,

              completed:
                true,
            },
          });

        const result =
          await closure.finalize({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            verificationId:
              "verification-1",

            closureEligibility:
              eligibility,

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .STABLE,

              completed:
                true,
            },

            incident:
              doc,

            executionAuthorized:
              false,
          });

        expect(
          result.closed
        )
          .toBe(
            true
          );

        expect(
          doc.lifecycleState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .CLOSED
          );

        expect(
          doc.save
        )
          .toHaveBeenCalledTimes(
            2
          );
      }
    );

    // ========================================================================
    // 6. UNSTABLE RECOVERY REGRESSES
    // ========================================================================

    test(
      "unstable recovery is classified as regression",
      async () => {
        const stability =
          new StabilityObservationService();

        const regression =
          new RegressionReopenEngine();

        const stabilityResult =
          stability.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            startedAt:
              new Date(
                "2026-01-01T00:00:00Z"
              ),

            now:
              new Date(
                "2026-01-01T00:06:00Z"
              ),

            windowMs:
              300000,

            minimumSamples:
              3,

            samples:
              unstableSamples(),

            executionAuthorized:
              false,
          });

        expect(
          stabilityResult.result
        )
          .toBe(
            STABILITY_RESULT
              .UNSTABLE
          );

        const result =
          await regression.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            verificationId:
              "verification-1",

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .STABILITY_OBSERVATION
              ),

            stabilityResult,

            retryAllowed:
              true,

            currentAttempt:
              1,

            maxAttempts:
              3,

            rollbackAvailable:
              true,

            executionAuthorized:
              false,
          });

        expect(
          result.regressionDetected
        )
          .toBe(
            true
          );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .REGRESSED
          );
      }
    );

    // ========================================================================
    // 7. REGRESSION → RETRY
    // ========================================================================

    test(
      "regression requests retry while attempts remain",
      async () => {
        const regression =
          new RegressionReopenEngine();

        const result =
          await regression.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .STABILITY_OBSERVATION
              ),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .UNSTABLE,

              completed:
                true,
            },

            retryAllowed:
              true,

            currentAttempt:
              1,

            maxAttempts:
              3,

            rollbackAvailable:
              true,

            preferRollback:
              false,

            executionAuthorized:
              false,
          });

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .REQUEST_RETRY
          );
      }
    );

    // ========================================================================
    // 8. RETRY REQUIRES FRESH AUTHORIZATION
    // ========================================================================

    test(
      "retry handoff never reuses prior execution authorization",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service.prepareRetry({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            verificationId:
              "verification-1",

            recoveryDecisionId:
              "recovery-1",

            executionRequestId:
              "execution-1",

            routingResult: {
              route:
                "REQUEST_RETRY",
            },

            criticResult: {
              accepted:
                true,

              rejected:
                false,

              requiresManualReview:
                false,
            },

            retryAllowed:
              true,

            currentAttempt:
              1,

            maxAttempts:
              3,

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .REGRESSED
              ),

            executionAuthorized:
              false,
          });

        expect(
          result.retryRequest
            .requiresFreshAuthorization
        )
          .toBe(
            true
          );

        expect(
          result.retryRequest
            .previousAuthorizationReusable
        )
          .toBe(
            false
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 9. REGRESSION → ROLLBACK
    // ========================================================================

    test(
      "regression may request rollback when preferred and available",
      async () => {
        const regression =
          new RegressionReopenEngine();

        const result =
          await regression.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .STABILITY_OBSERVATION
              ),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .UNSTABLE,

              completed:
                true,
            },

            retryAllowed:
              true,

            currentAttempt:
              1,

            maxAttempts:
              3,

            rollbackAvailable:
              true,

            preferRollback:
              true,

            executionAuthorized:
              false,
          });

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .REQUEST_ROLLBACK
          );
      }
    );

    // ========================================================================
    // 10. ROLLBACK HANDOFF IS BOUND TO ORIGINAL PLAN
    // ========================================================================

    test(
      "rollback handoff binds request to original immutable execution plan",
      async () => {
        const service =
          new RollbackHandoffOrchestrator();

        const result =
          await service.prepareRollback({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            verificationId:
              "verification-1",

            recoveryDecisionId:
              "recovery-1",

            executionRequestId:
              "execution-1",

            executionPlanId:
              "plan-1",

            executionPlanHash:
              "planhash-1",

            routingResult: {
              route:
                "REQUEST_ROLLBACK",
            },

            criticResult: {
              accepted:
                true,

              rejected:
                false,

              requiresManualReview:
                false,
            },

            rollbackAvailable:
              true,

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .REGRESSED
              ),

            executionAuthorized:
              false,
          });

        expect(
          result.rollbackRequest
            .originalExecutionPlanId
        )
          .toBe(
            "plan-1"
          );

        expect(
          result.rollbackRequest
            .originalExecutionPlanHash
        )
          .toBe(
            "planhash-1"
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 11. NO RETRY / ROLLBACK → ESCALATE
    // ========================================================================

    test(
      "regression escalates when automated continuation is unavailable",
      async () => {
        const regression =
          new RegressionReopenEngine();

        const result =
          await regression.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .STABILITY_OBSERVATION
              ),

            stabilityResult: {
              result:
                STABILITY_RESULT
                  .UNSTABLE,

              completed:
                true,
            },

            retryAllowed:
              false,

            rollbackAvailable:
              false,

            executionAuthorized:
              false,
          });

        expect(
          result.action
        )
          .toBe(
            REGRESSION_ACTION
              .ESCALATE
          );

        expect(
          result.escalationReason
        )
          .toBe(
            ESCALATION_REASON
              .STABILITY_REGRESSION
          );
      }
    );

    // ========================================================================
    // 12. ESCALATION CREATES OPERATOR HANDOFF
    // ========================================================================

    test(
      "escalation creates operator-bound control state",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service.escalate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            reason:
              ESCALATION_REASON
                .STABILITY_REGRESSION,

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .REGRESSED
              ),

            executionAuthorized:
              false,
          });

        expect(
          result.escalated
        )
          .toBe(
            true
          );

        expect(
          result.requiresOperator
        )
          .toBe(
            true
          );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .ESCALATED
          );
      }
    );

    // ========================================================================
    // 13. NOTIFICATION NORMALIZATION
    // ========================================================================

    test(
      "critical regression can produce normalized notification",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            eventType:
              LIFECYCLE_EVENT
                .STABILITY_FAILED,

            lifecycleState:
              INCIDENT_LIFECYCLE_STATE
                .REGRESSED,

            executionAuthorized:
              false,
          });

        expect(
          result.notification
            .requiresAcknowledgement
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 14. AUDIT TRAIL
    // ========================================================================

    test(
      "lifecycle transition creates immutable tamper-evident audit record",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            eventType:
              AUDIT_EVENT_TYPE
                .STATE_TRANSITION,

            lifecycleEvent:
              LIFECYCLE_EVENT
                .INCIDENT_REOPENED,

            lifecycleAction:
              LIFECYCLE_ACTION
                .REOPEN_INCIDENT,

            fromState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .REGRESSED,

            reason:
              "Stability regression.",

            executionAuthorized:
              false,
          });

        expect(
          Object.isFrozen(
            result.record
          )
        )
          .toBe(
            true
          );

        expect(
          result.record
            .integrityHash
        )
          .toMatch(
            /^auditsha256_[a-f0-9]{64}$/
          );
      }
    );

    // ========================================================================
    // 15. RECOVERED CANNOT BYPASS STABILITY
    // ========================================================================

    test(
      "state machine forbids recovered directly to closed",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          () =>
            machine.transition({
              fromState:
                INCIDENT_LIFECYCLE_STATE
                  .RECOVERED,

              toState:
                INCIDENT_LIFECYCLE_STATE
                  .CLOSED,

              executionAuthorized:
                false,
            })
        )
          .toThrow(
            "Invalid incident lifecycle transition"
          );
      }
    );

    // ========================================================================
    // 16. CLOSED IS TERMINAL
    // ========================================================================

    test(
      "closed incident cannot automatically reopen",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          machine.canTransition(
            INCIDENT_LIFECYCLE_STATE
              .CLOSED,

            INCIDENT_LIFECYCLE_STATE
              .REGRESSED
          )
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 17. ENTIRE PHASE 10 REMAINS OUTSIDE EXECUTION AUTHORITY
    // ========================================================================

    test(
      "phase 10 components never grant infrastructure execution authorization",
      async () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const guard =
          new ClosureEligibilityGuard();

        const stability =
          new StabilityObservationService();

        const transition =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .RECOVERED,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,

            executionAuthorized:
              false,
          });

        const eligibility =
          guard.evaluate({
            verification:
              recoveredVerification(),

            executionAuthorized:
              false,
          });

        const stabilityResult =
          stability.evaluate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            startedAt:
              new Date(
                "2026-01-01T00:00:00Z"
              ),

            now:
              new Date(
                "2026-01-01T00:06:00Z"
              ),

            windowMs:
              300000,

            minimumSamples:
              3,

            samples:
              healthySamples(),

            executionAuthorized:
              false,
          });

        expect(
          transition.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          eligibility.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          stabilityResult.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);