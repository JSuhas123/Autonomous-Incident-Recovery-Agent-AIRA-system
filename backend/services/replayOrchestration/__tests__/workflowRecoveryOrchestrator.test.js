"use strict";

const {
  WorkflowRecoveryOrchestrator,
} =
  require(
    "../workflowRecoveryOrchestrator"
  );

const {
  REPLAY_SOURCE,
  REPLAY_MODE,
  REPLAY_DECISION,
  REPLAY_SAFETY,
  REPLAY_REASON,
} =
  require(
    "../replayOrchestrationContracts"
  );

const {
  RUNTIME_STAGE,
} =
  require(
    "../../recoveryRuntime/recoveryRuntimeContracts"
  );


describe(
  "WorkflowRecoveryOrchestrator",
  () => {
    const request = {
      organizationId:
        "org-1",

      environmentId:
        "prod",

      incidentId:
        "incident-1",

      source:
        REPLAY_SOURCE
          .PROCESS_RESTART,

      mode:
        REPLAY_MODE
          .RESUME,

      replayRequestId:
        "replay-1",

      correlationId:
        "correlation-1",

      executionAuthorized:
        false,
    };


    function plannerResult(
      overrides = {}
    ) {
      return {
        decision:
          REPLAY_DECISION
            .RESUME,

        safety:
          REPLAY_SAFETY
            .SAFE,

        resumeStage:
          RUNTIME_STAGE
            .VERIFICATION,

        reason:
          "EXECUTION_COMPLETE_VERIFICATION_INCOMPLETE",

        replayRequired:
          true,

        reconciliationRequired:
          false,

        manualReviewRequired:
          false,

        blocked:
          false,

        snapshot: {
          executionRequest: {
            executionRequestId:
              "execution-request-1",

            executionPlanId:
              "execution-plan-1",

            executionPlanHash:
              "execution-plan-hash-1",

            executionPlan: {
              steps: [],
            },

            verificationId:
              "verification-1",

            verificationPlanId:
              "verification-plan-1",

            verificationPlanHash:
              "verification-plan-hash-1",
          },

          verification:
            null,

          lifecycle:
            null,

          outboxEvents: [],
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    function createOrchestrator({
      plan =
        plannerResult(),

      dispatchReplay =
        jest.fn()
          .mockResolvedValue({
            persisted:
              true,

            duplicate:
              false,

            eventId:
              "outbox-1",

            executionAuthorized:
              false,
          }),
    } = {}) {
      const planner = {
        plan:
          jest.fn()
            .mockResolvedValue(
              plan
            ),
      };

      const orchestrator =
        new WorkflowRecoveryOrchestrator({
          planner,

          dispatchReplay,

          now:
            () =>
              new Date(
                "2026-08-16T16:00:00.000Z"
              ),
        });

      return {
        orchestrator,
        planner,
        dispatchReplay,
      };
    }


    // =========================================================================
    // VERIFICATION RESUME
    // =========================================================================

    test(
      "safe verification replay reconstructs job and dispatches durable intent",
      async () => {
        const {
          orchestrator,
          planner,
          dispatchReplay,
        } =
          createOrchestrator();

        const result =
          await orchestrator
            .recover(
              request
            );

        expect(
          planner.plan
        )
          .toHaveBeenCalledWith(
            request
          );

        expect(
          dispatchReplay
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          dispatchReplay
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              stage:
                RUNTIME_STAGE
                  .VERIFICATION,

              job:
                expect.objectContaining({
                  organizationId:
                    "org-1",

                  environmentId:
                    "prod",

                  incidentId:
                    "incident-1",

                  executionRequestId:
                    "execution-request-1",

                  executionPlanId:
                    "execution-plan-1",

                  executionPlanHash:
                    "execution-plan-hash-1",

                  verificationId:
                    "verification-1",

                  verificationPlanId:
                    "verification-plan-1",

                  verificationPlanHash:
                    "verification-plan-hash-1",

                  executionAuthorized:
                    false,
                }),

              executionAuthorized:
                false,
            })
          );

        expect(
          result
        )
          .toMatchObject({
            processed:
              true,

            replayed:
              true,

            dispatched:
              true,

            outcome:
              "RESUME_DISPATCHED",

            resumeStage:
              RUNTIME_STAGE
                .VERIFICATION,

            executionAuthorized:
              false,
          });
      }
    );


    // =========================================================================
    // EXECUTION RESUME
    // =========================================================================

    test(
      "execution replay carries authorization reference but never authority",
      async () => {
        const plan =
          plannerResult({
            resumeStage:
              RUNTIME_STAGE
                .EXECUTION,

            reason:
              "RECOVERY_DECISION_COMPLETE_EXECUTION_INCOMPLETE",

            snapshot: {
              executionRequest: {
                executionRequestId:
                  "execution-request-1",

                executionPlanId:
                  "execution-plan-1",

                executionPlanHash:
                  "execution-plan-hash-1",

                authorizationId:
                  "authorization-1",

                recoveryDecisionId:
                  "decision-1",

                executionPlan: {
                  steps: [],
                },
              },

              verification:
                null,

              lifecycle:
                null,

              outboxEvents: [],
            },
          });

        const {
          orchestrator,
          dispatchReplay,
        } =
          createOrchestrator({
            plan,
          });

        const result =
          await orchestrator
            .recover(
              request
            );

        const call =
          dispatchReplay
            .mock
            .calls[0][0];

        expect(
          call.job
            .authorizationId
        )
          .toBe(
            "authorization-1"
          );

        expect(
          call.job
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          call.job
            .authorizationGranted
        )
          .toBeUndefined();

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // =========================================================================
    // LIFECYCLE RESUME
    // =========================================================================

    test(
      "completed verification reconstructs lifecycle replay job",
      async () => {
        const plan =
          plannerResult({
            resumeStage:
              RUNTIME_STAGE
                .LIFECYCLE,

            reason:
              "VERIFICATION_COMPLETE_LIFECYCLE_INCOMPLETE",

            snapshot: {
              executionRequest: {
                executionRequestId:
                  "execution-request-1",
              },

              verification: {
                executionRequestId:
                  "execution-request-1",

                verificationId:
                  "verification-1",

                verificationPlanId:
                  "verification-plan-1",

                verificationPlanHash:
                  "verification-plan-hash-1",

                outcome:
                  "RECOVERED",
              },

              lifecycle:
                null,

              outboxEvents: [],
            },
          });

        const {
          orchestrator,
          dispatchReplay,
        } =
          createOrchestrator({
            plan,
          });

        await orchestrator
          .recover(
            request
          );

        expect(
          dispatchReplay
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              stage:
                RUNTIME_STAGE
                  .LIFECYCLE,

              job:
                expect.objectContaining({
                  executionRequestId:
                    "execution-request-1",

                  verificationId:
                    "verification-1",

                  verificationPlanId:
                    "verification-plan-1",

                  verificationPlanHash:
                    "verification-plan-hash-1",

                  verificationOutcome:
                    "RECOVERED",

                  executionAuthorized:
                    false,
                }),
            })
          );
      }
    );


    // =========================================================================
    // NO ACTION
    // =========================================================================

    test(
      "completed workflow does not dispatch replay",
      async () => {
        const plan =
          plannerResult({
            decision:
              REPLAY_DECISION
                .NO_ACTION,

            safety:
              REPLAY_SAFETY
                .SAFE,

            resumeStage:
              null,

            reason:
              REPLAY_REASON
                .WORKFLOW_ALREADY_COMPLETE,

            replayRequired:
              false,
          });

        const {
          orchestrator,
          dispatchReplay,
        } =
          createOrchestrator({
            plan,
          });

        const result =
          await orchestrator
            .recover(
              request
            );

        expect(
          dispatchReplay
        )
          .not
          .toHaveBeenCalled();

        expect(
          result
        )
          .toMatchObject({
            replayed:
              false,

            dispatched:
              false,

            outcome:
              "NO_ACTION",

            executionAuthorized:
              false,
          });
      }
    );


    // =========================================================================
    // RECONCILIATION
    // =========================================================================

    test(
      "ambiguous execution never auto replays",
      async () => {
        const plan =
          plannerResult({
            decision:
              REPLAY_DECISION
                .RECONCILE,

            safety:
              REPLAY_SAFETY
                .RECONCILE_REQUIRED,

            resumeStage:
              RUNTIME_STAGE
                .EXECUTION,

            reason:
              REPLAY_REASON
                .AMBIGUOUS_EXECUTION_STATE,

            replayRequired:
              false,

            reconciliationRequired:
              true,
          });

        const {
          orchestrator,
          dispatchReplay,
        } =
          createOrchestrator({
            plan,
          });

        const result =
          await orchestrator
            .recover(
              request
            );

        expect(
          dispatchReplay
        )
          .not
          .toHaveBeenCalled();

        expect(
          result
        )
          .toMatchObject({
            outcome:
              "RECONCILIATION_REQUIRED",

            reconciliationRequired:
              true,

            replayed:
              false,

            executionAuthorized:
              false,
          });
      }
    );


    // =========================================================================
    // MANUAL REVIEW
    // =========================================================================

    test(
      "manual-required recovery never auto dispatches",
      async () => {
        const plan =
          plannerResult({
            decision:
              REPLAY_DECISION
                .MANUAL_REVIEW,

            safety:
              REPLAY_SAFETY
                .MANUAL_REQUIRED,

            resumeStage:
              RUNTIME_STAGE
                .EXECUTION,

            reason:
              "CHECKPOINT_REQUIRES_MANUAL_RESUME",

            replayRequired:
              false,

            manualReviewRequired:
              true,
          });

        const {
          orchestrator,
          dispatchReplay,
        } =
          createOrchestrator({
            plan,
          });

        const result =
          await orchestrator
            .recover(
              request
            );

        expect(
          dispatchReplay
        )
          .not
          .toHaveBeenCalled();

        expect(
          result
            .manualReviewRequired
        )
          .toBe(
            true
          );
      }
    );


    // =========================================================================
    // INSPECT ONLY
    // =========================================================================

    test(
      "inspect-only mode never dispatches even when plan is safe",
      async () => {
        const {
          orchestrator,
          dispatchReplay,
        } =
          createOrchestrator();

        const result =
          await orchestrator
            .recover({
              ...request,

              mode:
                REPLAY_MODE
                  .INSPECT_ONLY,
            });

        expect(
          dispatchReplay
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.outcome
        )
          .toBe(
            "INSPECTED"
          );
      }
    );


    // =========================================================================
    // IDENTITY FAILURE
    // =========================================================================

    test(
      "missing immutable execution plan hash fails closed",
      async () => {
        const plan =
          plannerResult({
            resumeStage:
              RUNTIME_STAGE
                .EXECUTION,

            snapshot: {
              executionRequest: {
                executionRequestId:
                  "execution-request-1",

                executionPlanId:
                  "execution-plan-1",

                executionPlanHash:
                  null,
              },

              verification:
                null,

              lifecycle:
                null,

              outboxEvents: [],
            },
          });

        const {
          orchestrator,
          dispatchReplay,
        } =
          createOrchestrator({
            plan,
          });

        await expect(
          orchestrator.recover(
            request
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_JOB_IDENTITY_REQUIRED",

            stage:
              RUNTIME_STAGE
                .EXECUTION,

            field:
              "executionPlanHash",

            retryable:
              false,
          });

        expect(
          dispatchReplay
        )
          .not
          .toHaveBeenCalled();
      }
    );


    // =========================================================================
    // DISPATCHER REQUIRED
    // =========================================================================

    test(
      "safe replay fails closed when durable dispatcher is missing",
      async () => {
        const planner = {
          plan:
            jest.fn()
              .mockResolvedValue(
                plannerResult()
              ),
        };

        const orchestrator =
          new WorkflowRecoveryOrchestrator({
            planner,
          });

        await expect(
          orchestrator.recover(
            request
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_DISPATCHER_NOT_CONFIGURED",

            retryable:
              false,
          });
      }
    );


    // =========================================================================
    // AUTHORITY FIREWALL — REQUEST
    // =========================================================================

    test(
      "replay request cannot inject execution authority",
      async () => {
        const {
          orchestrator,
          planner,
          dispatchReplay,
        } =
          createOrchestrator();

        await expect(
          orchestrator.recover({
            ...request,

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_EXECUTION_AUTHORITY_FORBIDDEN",
          });

        expect(
          planner.plan
        )
          .not
          .toHaveBeenCalled();

        expect(
          dispatchReplay
        )
          .not
          .toHaveBeenCalled();
      }
    );


    // =========================================================================
    // AUTHORITY FIREWALL — DISPATCH RESULT
    // =========================================================================

    test(
      "durable dispatcher cannot return execution authority",
      async () => {
        const {
          orchestrator,
        } =
          createOrchestrator({
            dispatchReplay:
              jest.fn()
                .mockResolvedValue({
                  persisted:
                    true,

                  executionAuthorized:
                    true,
                }),
          });

        await expect(
          orchestrator.recover(
            request
          )
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_EXECUTION_AUTHORITY_FORBIDDEN",
          });
      }
    );


    // =========================================================================
    // DEPENDENCY OVERRIDE
    // =========================================================================

    test(
      "recover can use per-call durable dispatcher dependency",
      async () => {
        const planner = {
          plan:
            jest.fn()
              .mockResolvedValue(
                plannerResult()
              ),
        };

        const orchestrator =
          new WorkflowRecoveryOrchestrator({
            planner,
          });

        const dispatchReplay =
          jest.fn()
            .mockResolvedValue({
              persisted:
                true,

              eventId:
                "outbox-override",

              executionAuthorized:
                false,
            });

        const result =
          await orchestrator
            .recover(
              request,
              {
                dispatchReplay,
              }
            );

        expect(
          dispatchReplay
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.dispatched
        )
          .toBe(
            true
          );
      }
    );
  }
);