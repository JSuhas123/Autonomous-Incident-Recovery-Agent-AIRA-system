"use strict";

const {
  RuntimeRecoveryCoordinator,
} =
  require(
    "../runtimeRecoveryCoordinator"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_DECISION,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntimeContracts"
  );

const {
  DETECTION_CLASS,
} =
  require(
    "../runtimeStaleOperationDetector"
  );

function detection(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    operationKey:
      "operation-1",

    stage:
      RUNTIME_STAGE
        .VERIFICATION,

    status:
      CHECKPOINT_STATUS
        .PENDING,

    classification:
      DETECTION_CLASS
        .PENDING,

    recoveryCandidate:
      true,

    mutationReconciliationRequired:
      false,

    ...overrides,
  };
}

function checkpoint(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    operationKey:
      "operation-1",

    stage:
      RUNTIME_STAGE
        .VERIFICATION,

    status:
      CHECKPOINT_STATUS
        .PENDING,

    resumeSafety:
      RESUME_SAFETY
        .UNKNOWN,

    workflowIdentity: {
      verificationId:
        "verification-1",
    },

    owner: {
      workerId:
        null,

      claimToken:
        null,

      leaseExpiresAt:
        null,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

function detector(
  items = []
) {
  return {
    scan:
      jest.fn(
        async () => ({
          scanned:
            items.length,

          items,

          executionAuthorized:
            false,
        })
      ),
  };
}

function persistence(
  {
    found,
    abandoned,
  } = {}
) {
  return {
    findByIdentity:
      jest.fn(
        async () =>
          found ||
          null
      ),

    markAbandoned:
      jest.fn(
        async () =>
          abandoned || {
            abandoned:
              false,

            checkpoint:
              null,

            executionAuthorized:
              false,
          }
      ),
  };
}

function resolver(
  resolution
) {
  return {
    resolve:
      jest.fn(
        () =>
          resolution
      ),
  };
}

describe(
  "RuntimeRecoveryCoordinator",
  () => {
    test(
      "pending checkpoint creates START plan",
      async () => {
        const cp =
          checkpoint();

        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection(),
              ]),

            persistence:
              persistence({
                found:
                  cp,
              }),

            resolver:
              resolver({
                decision:
                  RESUME_DECISION
                    .START,

                reason:
                  "CHECKPOINT_PENDING",

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,

                previousResult:
                  null,

                executionAuthorized:
                  false,
              }),
          });

        const result =
          await service.recover({
            executionAuthorized:
              false,
          });

        expect(
          result.start
        )
          .toHaveLength(
            1
          );

        expect(
          result.plans[0]
            .decision
        )
          .toBe(
            RESUME_DECISION
              .START
          );
      }
    );

    test(
      "stale verification is marked abandoned before resolution",
      async () => {
        const stale =
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .PROCESSING,

            resumeSafety:
              RESUME_SAFETY
                .SAFE,
          });

        const abandonedCheckpoint =
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .ABANDONED,

            resumeSafety:
              RESUME_SAFETY
                .SAFE,
          });

        const persist =
          persistence({
            found:
              stale,

            abandoned: {
              abandoned:
                true,

              checkpoint:
                abandonedCheckpoint,

              executionAuthorized:
                false,
            },
          });

        const resolve =
          resolver({
            decision:
              RESUME_DECISION
                .RESUME,

            reason:
              "LEASE_EXPIRED",

            resumeSafety:
              RESUME_SAFETY
                .SAFE,

            previousResult:
              null,

            executionAuthorized:
              false,
          });

        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection({
                  status:
                    CHECKPOINT_STATUS
                      .PROCESSING,

                  classification:
                    DETECTION_CLASS
                      .STALE,
                }),
              ]),

            persistence:
              persist,

            resolver:
              resolve,
          });

        const result =
          await service.recover({
            now:
              new Date(
                "2026-08-15T10:00:00.000Z"
              ),
          });

        expect(
          persist.markAbandoned
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          resolve.resolve
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              checkpoint:
                abandonedCheckpoint,
            })
          );

        expect(
          result.resume
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "stale execution is marked reconciliation-required",
      async () => {
        const staleExecution =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .EXECUTION,

            status:
              CHECKPOINT_STATUS
                .PROCESSING,
          });

        const abandonedExecution =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .EXECUTION,

            status:
              CHECKPOINT_STATUS
                .ABANDONED,

            resumeSafety:
              RESUME_SAFETY
                .REQUIRES_RECONCILIATION,
          });

        const persist =
          persistence({
            found:
              staleExecution,

            abandoned: {
              abandoned:
                true,

              checkpoint:
                abandonedExecution,
            },
          });

        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection({
                  stage:
                    RUNTIME_STAGE
                      .EXECUTION,

                  status:
                    CHECKPOINT_STATUS
                      .PROCESSING,

                  classification:
                    DETECTION_CLASS
                      .STALE,

                  mutationReconciliationRequired:
                    true,
                }),
              ]),

            persistence:
              persist,

            resolver:
              resolver({
                decision:
                  RESUME_DECISION
                    .MANUAL_INTERVENTION,

                reason:
                  "EXECUTION_RECONCILIATION_REQUIRED",

                resumeSafety:
                  RESUME_SAFETY
                    .REQUIRES_RECONCILIATION,

                previousResult:
                  null,
              }),
          });

        const result =
          await service.recover({});

        const abandonInput =
          persist
            .markAbandoned
            .mock
            .calls[0][0];

        expect(
          abandonInput.resumeSafety
        )
          .toBe(
            RESUME_SAFETY
              .REQUIRES_RECONCILIATION
          );

        expect(
          result.manualIntervention
        )
          .toHaveLength(
            1
          );

        expect(
          result.plans[0]
            .mutationReconciliationRequired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "live operation is never abandoned",
      async () => {
        const cp =
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .PROCESSING,
          });

        const persist =
          persistence({
            found:
              cp,
          });

        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection({
                  status:
                    CHECKPOINT_STATUS
                      .PROCESSING,

                  classification:
                    DETECTION_CLASS
                      .LIVE,

                  recoveryCandidate:
                    false,
                }),
              ]),

            persistence:
              persist,

            resolver:
              resolver({
                decision:
                  RESUME_DECISION
                    .WAIT,

                reason:
                  "CHECKPOINT_STILL_OWNED",

                resumeSafety:
                  RESUME_SAFETY
                    .UNKNOWN,
              }),
          });

        const result =
          await service.recover({
            onlyRecoverable:
              false,
          });

        expect(
          persist.markAbandoned
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.wait
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "completed checkpoint is skipped",
      async () => {
        const cp =
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .COMPLETED,

            result: {
              success:
                true,
            },
          });

        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection({
                  status:
                    CHECKPOINT_STATUS
                      .COMPLETED,

                  classification:
                    DETECTION_CLASS
                      .COMPLETED,

                  recoveryCandidate:
                    false,
                }),
              ]),

            persistence:
              persistence({
                found:
                  cp,
              }),

            resolver:
              resolver({
                decision:
                  RESUME_DECISION
                    .SKIP_COMPLETED,

                reason:
                  "CHECKPOINT_ALREADY_COMPLETED",

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,

                previousResult: {
                  success:
                    true,
                },
              }),
          });

        const result =
          await service.recover({
            onlyRecoverable:
              false,
          });

        expect(
          result.skipCompleted
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "safe failed verification may produce retry plan",
      async () => {
        const cp =
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .FAILED,

            resumeSafety:
              RESUME_SAFETY
                .SAFE,

            error: {
              retryable:
                true,
            },
          });

        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection({
                  status:
                    CHECKPOINT_STATUS
                      .FAILED,

                  classification:
                    DETECTION_CLASS
                      .FAILED,
                }),
              ]),

            persistence:
              persistence({
                found:
                  cp,
              }),

            resolver:
              resolver({
                decision:
                  RESUME_DECISION
                    .RETRY_SAFE,

                reason:
                  "FAILED_STAGE_EXPLICITLY_RETRYABLE",

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,
              }),
          });

        const result =
          await service.recover({});

        expect(
          result.retrySafe
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "disappearing checkpoint fails closed",
      async () => {
        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection(),
              ]),

            persistence:
              persistence({
                found:
                  null,
              }),

            resolver:
              resolver({
                decision:
                  RESUME_DECISION
                    .START,
              }),
          });

        const result =
          await service.recover({});

        expect(
          result.blocked
        )
          .toHaveLength(
            1
          );

        expect(
          result.blocked[0]
            .reason
        )
          .toBe(
            "CHECKPOINT_DISAPPEARED_DURING_RECOVERY"
          );
      }
    );

    test(
      "coordinator never grants execution authorization",
      async () => {
        const cp =
          checkpoint();

        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector([
                detection(),
              ]),

            persistence:
              persistence({
                found:
                  cp,
              }),

            resolver:
              resolver({
                decision:
                  RESUME_DECISION
                    .START,

                reason:
                  "CHECKPOINT_PENDING",

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,
              }),
          });

        const result =
          await service.recover({
            executionAuthorized:
              false,
          });

        expect(
          result.executionStarted
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

        expect(
          result.plans[0]
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "coordinator rejects execution authorization",
      async () => {
        const service =
          new RuntimeRecoveryCoordinator({
            detector:
              detector(),
          });

        await expect(
          service.recover({
            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "RUNTIME_RECOVERY_UNSAFE_AUTHORIZATION",
          });
      }
    );
  }
);