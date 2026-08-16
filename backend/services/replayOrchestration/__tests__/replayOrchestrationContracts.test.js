"use strict";

const {
  REPLAY_SOURCE,
  REPLAY_MODE,
  REPLAY_DECISION,
  REPLAY_SAFETY,
  REPLAY_STATUS,
  REPLAY_ERROR_CODE,

  isReplaySource,
  isReplayMode,
  isReplayDecision,
  isReplaySafety,
  isReplayStatus,
  isTerminalReplayStatus,

  assertReplayRequest,
  assertNoReplayExecutionAuthority,
  canAutoResume,
  assertExecutableReplayPlan,
} =
  require(
    "../replayOrchestrationContracts"
  );


describe(
  "Replay Orchestration Contracts",
  () => {
    function request(
      overrides = {}
    ) {
      return {
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

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    test(
      "defines canonical replay sources",
      () => {
        expect(
          isReplaySource(
            REPLAY_SOURCE
              .AUTOMATIC_RECOVERY
          )
        )
          .toBe(
            true
          );

        expect(
          isReplaySource(
            REPLAY_SOURCE
              .MANUAL
          )
        )
          .toBe(
            true
          );

        expect(
          isReplaySource(
            "RANDOM_SOURCE"
          )
        )
          .toBe(
            false
          );
      }
    );


    test(
      "defines canonical replay modes",
      () => {
        expect(
          isReplayMode(
            REPLAY_MODE
              .RESUME
          )
        )
          .toBe(
            true
          );

        expect(
          isReplayMode(
            REPLAY_MODE
              .RECONCILE
          )
        )
          .toBe(
            true
          );

        expect(
          isReplayMode(
            "RESTART_EVERYTHING"
          )
        )
          .toBe(
            false
          );
      }
    );


    test(
      "defines decision and safety contracts",
      () => {
        expect(
          isReplayDecision(
            REPLAY_DECISION
              .RESUME
          )
        )
          .toBe(
            true
          );

        expect(
          isReplaySafety(
            REPLAY_SAFETY
              .SAFE
          )
        )
          .toBe(
            true
          );

        expect(
          isReplaySafety(
            REPLAY_SAFETY
              .UNSAFE
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "recognizes terminal replay states",
      () => {
        expect(
          isTerminalReplayStatus(
            REPLAY_STATUS
              .COMPLETED
          )
        )
          .toBe(
            true
          );

        expect(
          isTerminalReplayStatus(
            REPLAY_STATUS
              .BLOCKED
          )
        )
          .toBe(
            true
          );

        expect(
          isTerminalReplayStatus(
            REPLAY_STATUS
              .RUNNING
          )
        )
          .toBe(
            false
          );

        expect(
          isReplayStatus(
            REPLAY_STATUS
              .WAITING_RECONCILIATION
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "valid replay request passes",
      () => {
        expect(
          assertReplayRequest(
            request()
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "missing tenant scope fails closed",
      () => {
        expect(
          () =>
            assertReplayRequest(
              request({
                environmentId:
                  null,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                REPLAY_ERROR_CODE
                  .SCOPE_REQUIRED,

              field:
                "environmentId",
            })
          );
      }
    );


    test(
      "invalid replay mode fails closed",
      () => {
        expect(
          () =>
            assertReplayRequest(
              request({
                mode:
                  "RUN_EVERYTHING_AGAIN",
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                REPLAY_ERROR_CODE
                  .MODE_INVALID,
            })
          );
      }
    );


    test(
      "replay request cannot grant execution authority",
      () => {
        expect(
          () =>
            assertReplayRequest(
              request({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                REPLAY_ERROR_CODE
                  .AUTHORITY_FORBIDDEN,

              retryable:
                false,
            })
          );
      }
    );


    test(
      "authorizationGranted is also rejected",
      () => {
        expect(
          () =>
            assertNoReplayExecutionAuthority({
              authorizationGranted:
                true,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                REPLAY_ERROR_CODE
                  .AUTHORITY_FORBIDDEN,
            })
          );
      }
    );


    test(
      "only SAFE RESUME plans can automatically resume",
      () => {
        expect(
          canAutoResume({
            decision:
              REPLAY_DECISION
                .RESUME,

            safety:
              REPLAY_SAFETY
                .SAFE,
          })
        )
          .toBe(
            true
          );

        expect(
          canAutoResume({
            decision:
              REPLAY_DECISION
                .RESUME,

            safety:
              REPLAY_SAFETY
                .MANUAL_REQUIRED,
          })
        )
          .toBe(
            false
          );

        expect(
          canAutoResume({
            decision:
              REPLAY_DECISION
                .RECONCILE,

            safety:
              REPLAY_SAFETY
                .SAFE,
          })
        )
          .toBe(
            false
          );
      }
    );


    test(
      "safe executable replay plan passes",
      () => {
        expect(
          assertExecutableReplayPlan({
            decision:
              REPLAY_DECISION
                .RESUME,

            safety:
              REPLAY_SAFETY
                .SAFE,

            resumeStage:
              "VERIFICATION",

            executionAuthorized:
              false,
          })
        )
          .toBe(
            true
          );
      }
    );


    test(
      "manual-required plan cannot auto execute",
      () => {
        expect(
          () =>
            assertExecutableReplayPlan({
              decision:
                REPLAY_DECISION
                  .MANUAL_REVIEW,

              safety:
                REPLAY_SAFETY
                  .MANUAL_REQUIRED,

              resumeStage:
                "EXECUTION",

              executionAuthorized:
                false,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                REPLAY_ERROR_CODE
                  .PLAN_INVALID,

              retryable:
                false,
            })
          );
      }
    );


    test(
      "safe plan still requires explicit resume stage",
      () => {
        expect(
          () =>
            assertExecutableReplayPlan({
              decision:
                REPLAY_DECISION
                  .RESUME,

              safety:
                REPLAY_SAFETY
                  .SAFE,

              executionAuthorized:
                false,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                REPLAY_ERROR_CODE
                  .STAGE_REQUIRED,
            })
          );
      }
    );


    test(
      "replay plan itself can never carry execution authority",
      () => {
        expect(
          () =>
            assertExecutableReplayPlan({
              decision:
                REPLAY_DECISION
                  .RESUME,

              safety:
                REPLAY_SAFETY
                  .SAFE,

              resumeStage:
                "EXECUTION",

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                REPLAY_ERROR_CODE
                  .AUTHORITY_FORBIDDEN,
            })
          );
      }
    );
  }
);
