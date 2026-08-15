"use strict";

const {
  IdempotencyCompletionService,
} =
  require(
    "../idempotencyCompletionService"
  );

const {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

function input(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    operation:
      IDEMPOTENCY_OPERATION
        .EXECUTION,

    idempotencyKey:
      "idem_v1_execution",

    ownerId:
      "worker-1",

    claimToken:
      "claim-1",

    executionAuthorized:
      false,

    ...overrides,
  };
}

function record(
  overrides = {}
) {
  return {
    _id:
      "record-1",

    organizationId:
      "org-1",

    environmentId:
      "prod",

    operation:
      IDEMPOTENCY_OPERATION
        .EXECUTION,

    idempotencyKey:
      "idem_v1_execution",

    status:
      IDEMPOTENCY_STATUS
        .PROCESSING,

    ownerId:
      "worker-1",

    claimToken:
      "claim-1",

    ...overrides,
  };
}

function repository({
  updatedRecord =
    null,

  existingRecord =
    null,
} = {}) {
  return {
    findOneAndUpdate:
      jest.fn(
        async () =>
          updatedRecord
      ),

    findOne:
      jest.fn(
        async () =>
          existingRecord
      ),
  };
}

describe(
  "IdempotencyCompletionService",
  () => {
    test(
      "owner can complete processing claim",
      async () => {
        const completed =
          record({
            status:
              IDEMPOTENCY_STATUS
                .COMPLETED,

            result: {
              success:
                true,
            },
          });

        const repo =
          repository({
            updatedRecord:
              completed,
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.complete({
            ...input(),

            result: {
              success:
                true,
            },
          });

        expect(
          result.finalized
        )
          .toBe(
            true
          );

        expect(
          result.completed
        )
          .toBe(
            true
          );

        expect(
          result.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .COMPLETED
          );
      }
    );

    test(
      "completion uses ownership compare and set",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .COMPLETED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await service.complete(
          input()
        );

        const filter =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][0];

        expect(
          filter
        )
          .toMatchObject({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              "idem_v1_execution",

            status:
              IDEMPOTENCY_STATUS
                .PROCESSING,

            ownerId:
              "worker-1",

            claimToken:
              "claim-1",
          });
      }
    );

    test(
      "owner can mark claim failed",
      async () => {
        const failed =
          record({
            status:
              IDEMPOTENCY_STATUS
                .FAILED,

            failure: {
              code:
                "DEPENDENCY_TIMEOUT",

              retryable:
                true,
            },
          });

        const repo =
          repository({
            updatedRecord:
              failed,
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.fail({
            ...input(),

            failure: {
              code:
                "DEPENDENCY_TIMEOUT",

              message:
                "Dependency timed out.",

              retryable:
                true,
            },
          });

        expect(
          result.finalized
        )
          .toBe(
            true
          );

        expect(
          result.failed
        )
          .toBe(
            true
          );

        expect(
          result.retryable
        )
          .toBe(
            true
          );

        expect(
          result.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .FAILED
          );
      }
    );

    test(
      "failed operation stores normalized failure",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .FAILED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await service.fail({
          ...input(),

          now:
            new Date(
              "2026-01-01T00:00:00Z"
            ),

          failure: {
            code:
              "TEMPORARY_ERROR",

            message:
              "Temporary failure",

            retryable:
              true,
          },
        });

        const update =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1];

        expect(
          update.$set.failure
        )
          .toMatchObject({
            code:
              "TEMPORARY_ERROR",

            message:
              "Temporary failure",

            retryable:
              true,
          });

        expect(
          update
            .$set
            .failure
            .failedAt
        )
          .toEqual(
            new Date(
              "2026-01-01T00:00:00Z"
            )
          );
      }
    );

    test(
      "stale owner cannot complete claim",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              record({
                ownerId:
                  "worker-2",

                claimToken:
                  "claim-2",
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.complete(
            input()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_OWNER_MISMATCH",
          });
      }
    );

    test(
      "stale claim token cannot complete claim",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              record({
                ownerId:
                  "worker-1",

                claimToken:
                  "claim-new",
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.complete(
            input({
              claimToken:
                "claim-old",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_CLAIM_TOKEN_MISMATCH",
          });
      }
    );

    test(
      "stale owner cannot mark claim failed",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              record({
                ownerId:
                  "worker-2",

                claimToken:
                  "claim-2",
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.fail({
            ...input(),

            failure: {
              retryable:
                true,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_OWNER_MISMATCH",
          });
      }
    );

    test(
      "completed record cannot later be failed",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .COMPLETED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.fail(
            input()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_ALREADY_FINALIZED",

            currentStatus:
              IDEMPOTENCY_STATUS
                .COMPLETED,
          });
      }
    );

    test(
      "failed record cannot later be completed",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .FAILED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.complete(
            input()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_ALREADY_FINALIZED",

            currentStatus:
              IDEMPOTENCY_STATUS
                .FAILED,
          });
      }
    );

    test(
      "missing record fails closed",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              null,
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.complete(
            input()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_RECORD_NOT_FOUND",
          });
      }
    );

    test(
      "completion clears active lease",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .COMPLETED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await service.complete(
          input()
        );

        const update =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1];

        expect(
          update
            .$set
            .leaseExpiresAt
        )
          .toBeNull();
      }
    );

    test(
      "failure clears active lease",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .FAILED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        await service.fail(
          input()
        );

        const update =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1];

        expect(
          update
            .$set
            .leaseExpiresAt
        )
          .toBeNull();
      }
    );

    test(
      "completion never grants execution authorization",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .COMPLETED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.complete(
            input()
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
      "failure never grants execution authorization",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .FAILED,
              }),
          });

        const service =
          new IdempotencyCompletionService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.fail(
            input()
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
      "unsafe authorization input is rejected",
      async () => {
        const service =
          new IdempotencyCompletionService();

        await expect(
          service.complete(
            input({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_COMPLETION_UNSAFE_INPUT",
          });
      }
    );
  }
);