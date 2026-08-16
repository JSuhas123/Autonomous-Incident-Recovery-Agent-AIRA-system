"use strict";

const {
  WorkflowRecoveryPlanner,
} =
  require(
    "../workflowRecoveryPlanner"
  );

const {
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
  "WorkflowRecoveryPlanner",
  () => {
    function queryResult(
      value
    ) {
      return {
        sort:
          jest.fn()
            .mockReturnThis(),

        lean:
          jest.fn()
            .mockResolvedValue(
              value
            ),
      };
    }


    function createPlanner({
      checkpoints = [],
      execution = null,
      verification = null,
      lifecycle = null,
      outbox = [],
    } = {}) {
      return new WorkflowRecoveryPlanner({
        RuntimeCheckpoint: {
          find:
            jest.fn(
              () =>
                queryResult(
                  checkpoints
                )
            ),
        },

        ExecutionRequest: {
          findOne:
            jest.fn(
              () =>
                queryResult(
                  execution
                )
            ),
        },

        RecoveryVerification: {
          findOne:
            jest.fn(
              () =>
                queryResult(
                  verification
                )
            ),
        },

        IncidentLifecycle: {
          findOne:
            jest.fn(
              () =>
                queryResult(
                  lifecycle
                )
            ),
        },

        WorkflowOutboxEvent: {
          find:
            jest.fn(
              () =>
                queryResult(
                  outbox
                )
            ),
        },
      });
    }


    const scope = {
      organizationId:
        "org-1",

      environmentId:
        "prod",

      incidentId:
        "incident-1",

      executionAuthorized:
        false,
    };


    test(
      "completed lifecycle requires no replay",
      async () => {
        const planner =
          createPlanner({
            lifecycle: {
              state:
                "CLOSED",
            },
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result.decision
        )
          .toBe(
            REPLAY_DECISION
              .NO_ACTION
          );

        expect(
          result.resumeStage
        )
          .toBeNull();
      }
    );


    test(
      "completed verification resumes lifecycle",
      async () => {
        const planner =
          createPlanner({
            verification: {
              status:
                "COMPLETED",
            },
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result
        )
          .toMatchObject({
            decision:
              REPLAY_DECISION
                .RESUME,

            safety:
              REPLAY_SAFETY
                .SAFE,

            resumeStage:
              RUNTIME_STAGE
                .LIFECYCLE,
          });
      }
    );


    test(
      "completed execution resumes verification",
      async () => {
        const planner =
          createPlanner({
            execution: {
              status:
                "COMPLETED",
            },
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result.resumeStage
        )
          .toBe(
            RUNTIME_STAGE
              .VERIFICATION
          );

        expect(
          result.replayRequired
        )
          .toBe(
            true
          );
      }
    );


    test(
      "ambiguous execution requires reconciliation",
      async () => {
        const planner =
          createPlanner({
            checkpoints: [
              {
                stage:
                  RUNTIME_STAGE
                    .EXECUTION,

                status:
                  "PROCESSING",

                resumeSafety:
                  "SAFE",
              },
            ],

            execution: {
              status:
                "EXECUTING",
            },
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result
        )
          .toMatchObject({
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

            reconciliationRequired:
              true,
          });
      }
    );


    test(
      "completed recovery decision resumes execution",
      async () => {
        const planner =
          createPlanner({
            checkpoints: [
              {
                stage:
                  RUNTIME_STAGE
                    .RECOVERY_DECISION,

                status:
                  "COMPLETED",

                resumeSafety:
                  "SAFE",
              },
            ],
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result
        )
          .toMatchObject({
            decision:
              REPLAY_DECISION
                .RESUME,

            safety:
              REPLAY_SAFETY
                .SAFE,

            resumeStage:
              RUNTIME_STAGE
                .EXECUTION,
          });
      }
    );


    test(
      "manual resume checkpoint requires human review",
      async () => {
        const planner =
          createPlanner({
            checkpoints: [
              {
                stage:
                  RUNTIME_STAGE
                    .EXECUTION,

                status:
                  "FAILED",

                resumeSafety:
                  "MANUAL",
              },
            ],
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result
        )
          .toMatchObject({
            decision:
              REPLAY_DECISION
                .MANUAL_REVIEW,

            safety:
              REPLAY_SAFETY
                .MANUAL_REQUIRED,

            resumeStage:
              RUNTIME_STAGE
                .EXECUTION,

            manualReviewRequired:
              true,
          });
      }
    );


    test(
      "missing durable evidence fails to automatic replay",
      async () => {
        const planner =
          createPlanner();

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result
        )
          .toMatchObject({
            decision:
              REPLAY_DECISION
                .MANUAL_REVIEW,

            safety:
              REPLAY_SAFETY
                .UNKNOWN,

            reason:
              REPLAY_REASON
                .MISSING_DURABLE_EVIDENCE,

            replayRequired:
              false,
          });
      }
    );


    test(
      "planner snapshot preserves outbox evidence",
      async () => {
        const planner =
          createPlanner({
            outbox: [
              {
                eventId:
                  "outbox-1",

                status:
                  "FAILED",
              },
            ],
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result.snapshot
            .outboxEvents
        )
          .toHaveLength(
            1
          );

        expect(
          result.snapshot
            .outboxEvents[0]
            .eventId
        )
          .toBe(
            "outbox-1"
          );
      }
    );

    test(
  "manual checkpoint preserves stage and never falls through to unknown",
  async () => {
    const planner =
      createPlanner({
        checkpoints: [
          {
            stage:
              RUNTIME_STAGE
                .EXECUTION,

            status:
              "FAILED",

            resumeSafety:
              "MANUAL",
          },
        ],
      });

    const result =
      await planner
        .plan(
          scope
        );

    expect(
      result.decision
    )
      .toBe(
        REPLAY_DECISION
          .MANUAL_REVIEW
      );

    expect(
      result.safety
    )
      .toBe(
        REPLAY_SAFETY
          .MANUAL_REQUIRED
      );

    expect(
      result.resumeStage
    )
      .toBe(
        RUNTIME_STAGE
          .EXECUTION
      );

    expect(
      result.manualReviewRequired
    )
      .toBe(
        true
      );

    expect(
      result.replayRequired
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

    test(
      "planner cannot accept execution authority",
      async () => {
        const planner =
          createPlanner();

        await expect(
          planner.plan({
            ...scope,

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "REPLAY_EXECUTION_AUTHORITY_FORBIDDEN",
          });
      }
    );


    test(
      "checkpoint completion can drive replay without domain record",
      async () => {
        const planner =
          createPlanner({
            checkpoints: [
              {
                stage:
                  RUNTIME_STAGE
                    .EXECUTION,

                status:
                  "COMPLETED",

                resumeSafety:
                  "SAFE",
              },
            ],
          });

        const result =
          await planner
            .plan(
              scope
            );

        expect(
          result.resumeStage
        )
          .toBe(
            RUNTIME_STAGE
              .VERIFICATION
          );
      }
    );
  }
);