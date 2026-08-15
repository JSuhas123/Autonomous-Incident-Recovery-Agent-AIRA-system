"use strict";

const {
  RecoveryRetryOrchestrator,
  RETRY_ORCHESTRATION_STATUS,
} =
  require(
    "../recoveryRetryOrchestrator"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "../incidentLifecycleContracts"
  );

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

    verificationId:
      "verification-1",

    recoveryDecisionId:
      "recovery-1",

    executionRequestId:
      "execution-1",

    diagnosisId:
      "diagnosis-1",

    diagnosisRevision:
      2,

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

    incident: {
      lifecycleState:
        INCIDENT_LIFECYCLE_STATE
          .REGRESSED,

      status:
        INCIDENT_LIFECYCLE_STATE
          .REGRESSED,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "RecoveryRetryOrchestrator",
  () => {
    test(
      "creates fresh recovery retry request",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput()
            );

        expect(
          result.status
        )
          .toBe(
            RETRY_ORCHESTRATION_STATUS
              .READY
          );

        expect(
          result.retryRequest
            .attempt
        )
          .toBe(
            2
          );

        expect(
          result.retryRequest
            .requiresFreshRecoveryDecision
        )
          .toBe(
            true
          );

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
      }
    );

    test(
      "transitions incident to retry pending",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput()
            );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .RETRY_PENDING
          );
      }
    );

    test(
      "queues retry request when provider exists",
      async () => {
        const enqueue =
          jest.fn();

        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput(),
              {
                enqueueRecoveryRetry:
                  enqueue,
              }
            );

        expect(
          enqueue
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.retryQueued
        )
          .toBe(
            true
          );
      }
    );

    test(
      "does not directly start recovery",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput()
            );

        expect(
          result.recoveryStarted
        )
          .toBe(
            false
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "blocks retry when not allowed",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput({
                retryAllowed:
                  false,
              })
            );

        expect(
          result.status
        )
          .toBe(
            RETRY_ORCHESTRATION_STATUS
              .BLOCKED
          );
      }
    );

    test(
      "blocks when verification did not request retry",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput({
                routingResult: {
                  route:
                    "ESCALATE",
                },
              })
            );

        expect(
          result.ready
        )
          .toBe(
            false
          );
      }
    );

    test(
      "critic rejection prevents automated retry",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput({
                criticResult: {
                  rejected:
                    true,

                  requiresManualReview:
                    false,
                },
              })
            );

        expect(
          result.status
        )
          .toBe(
            RETRY_ORCHESTRATION_STATUS
              .BLOCKED
          );
      }
    );

    test(
      "manual review prevents retry",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput({
                criticResult: {
                  rejected:
                    false,

                  requiresManualReview:
                    true,
                },
              })
            );

        expect(
          result.ready
        )
          .toBe(
            false
          );
      }
    );

    test(
      "maximum attempts produces exhausted state",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput({
                currentAttempt:
                  3,

                maxAttempts:
                  3,
              })
            );

        expect(
          result.status
        )
          .toBe(
            RETRY_ORCHESTRATION_STATUS
              .EXHAUSTED
          );

        expect(
          result.exhausted
        )
          .toBe(
            true
          );
      }
    );

    test(
      "uses external incident provider",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const getIncident =
          jest.fn(
            async () => ({
              lifecycleState:
                INCIDENT_LIFECYCLE_STATE
                  .REGRESSED,
            })
          );

        const input =
          baseInput();

        delete input.incident;

        const result =
          await service
            .prepareRetry(
              input,
              {
                getIncident,
              }
            );

        expect(
          result.ready
        )
          .toBe(
            true
          );

        expect(
          getIncident
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "generates unique retry request IDs",
      () => {
        const service =
          new RecoveryRetryOrchestrator();

        const first =
          service
            .generateRetryRequestId(
              baseInput()
            );

        const second =
          service
            .generateRetryRequestId(
              baseInput()
            );

        expect(
          first
        )
          .toMatch(
            /^retry_/
          );

        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );

    test(
      "never carries execution authorization",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        const result =
          await service
            .prepareRetry(
              baseInput()
            );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.retryRequest
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsafe execution authorization input",
      async () => {
        const service =
          new RecoveryRetryOrchestrator();

        await expect(
          service.prepareRetry({
            ...baseInput(),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_RETRY_UNSAFE_INPUT",
          });
      }
    );
  }
);