"use strict";

const {
  IdempotencyClaimService,
} =
  require(
    "../idempotencyClaimService"
  );

const {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_DECISION,
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

function baseInput(
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
      "idem_v1_test",

    requestFingerprint:
      "fingerprint_sha256_test",

    ownerId:
      "worker-1",

    executionRequestId:
      "execution-1",

    leaseMs:
      60000,

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
      "idem_v1_test",

    requestFingerprint:
      "fingerprint_sha256_test",

    status:
      IDEMPOTENCY_STATUS
        .PROCESSING,

    ownerId:
      "worker-existing",

    claimToken:
      "claim-existing",

    attemptCount:
      1,

    duplicateCount:
      0,

    leaseExpiresAt:
      new Date(
        Date.now() +
        60000
      ),

    ...overrides,
  };
}

function repository({
  createResult,
  createError,
  findOneResult,
  findOneAndUpdateResult,
} = {}) {
  return {
    create:
      jest.fn(
        async () => {
          if (
            createError
          ) {
            throw createError;
          }

          return createResult;
        }
      ),

    findOne:
      jest.fn(
        async () =>
          findOneResult
      ),

    findOneAndUpdate:
      jest.fn(
        async () =>
          findOneAndUpdateResult
      ),

    updateOne:
      jest.fn(
        async () => ({
          acknowledged:
            true,
        })
      ),
  };
}

function duplicateError() {
  return Object.assign(
    new Error(
      "duplicate key"
    ),
    {
      code:
        11000,
    }
  );
}

describe(
  "IdempotencyClaimService",
  () => {
    test(
      "acquires new operation",
      async () => {
        const created =
          record({
            ownerId:
              "worker-1",
          });

        const repo =
          repository({
            createResult:
              created,
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput()
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .ACQUIRED
          );

        expect(
          result.acquired
        )
          .toBe(
            true
          );

        expect(
          repo.create
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "completed operation returns duplicate completed",
      async () => {
        const existing =
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
            createError:
              duplicateError(),

            findOneResult:
              existing,
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput()
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .DUPLICATE_COMPLETED
          );

        expect(
          result.acquired
        )
          .toBe(
            false
          );

        expect(
          result.previousResult
        )
          .toEqual({
            success:
              true,
          });
      }
    );

    test(
      "active processing claim blocks duplicate worker",
      async () => {
        const existing =
          record({
            status:
              IDEMPOTENCY_STATUS
                .PROCESSING,

            leaseExpiresAt:
              new Date(
                Date.now() +
                60000
              ),
          });

        const repo =
          repository({
            createError:
              duplicateError(),

            findOneResult:
              existing,
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput()
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .DUPLICATE_PROCESSING
          );

        expect(
          result.acquired
        )
          .toBe(
            false
          );
      }
    );

    test(
      "expired processing claim is reclaimed",
      async () => {
        const now =
          new Date(
            "2026-01-01T00:10:00Z"
          );

        const existing =
          record({
            status:
              IDEMPOTENCY_STATUS
                .PROCESSING,

            leaseExpiresAt:
              new Date(
                "2026-01-01T00:00:00Z"
              ),
          });

        const reclaimed =
          record({
            ownerId:
              "worker-1",

            leaseExpiresAt:
              new Date(
                "2026-01-01T00:11:00Z"
              ),
          });

        const repo =
          repository({
            createError:
              duplicateError(),

            findOneResult:
              existing,

            findOneAndUpdateResult:
              reclaimed,
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput({
              now,
            })
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .RECLAIM_STALE
          );

        expect(
          result.acquired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "retryable failed operation may be acquired again",
      async () => {
        const existing =
          record({
            status:
              IDEMPOTENCY_STATUS
                .FAILED,

            failure: {
              retryable:
                true,
            },
          });

        const retried =
          record({
            status:
              IDEMPOTENCY_STATUS
                .PROCESSING,

            ownerId:
              "worker-1",
          });

        const repo =
          repository({
            createError:
              duplicateError(),

            findOneResult:
              existing,

            findOneAndUpdateResult:
              retried,
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput()
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .RETRY_FAILED
          );

        expect(
          result.acquired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "non retryable failed operation is rejected",
      async () => {
        const repo =
          repository({
            createError:
              duplicateError(),

            findOneResult:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .FAILED,

                failure: {
                  retryable:
                    false,
                },
              }),
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput()
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .REJECTED
          );

        expect(
          result.acquired
        )
          .toBe(
            false
          );
      }
    );

    test(
      "same key with different fingerprint is rejected",
      async () => {
        const repo =
          repository({
            createError:
              duplicateError(),

            findOneResult:
              record({
                requestFingerprint:
                  "fingerprint-old",
              }),
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput({
              requestFingerprint:
                "fingerprint-new",
            })
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .REJECTED
          );

        expect(
          result.code
        )
          .toBe(
            "IDEMPOTENCY_FINGERPRINT_MISMATCH"
          );
      }
    );

    test(
      "expired terminal record is rejected",
      async () => {
        const repo =
          repository({
            createError:
              duplicateError(),

            findOneResult:
              record({
                status:
                  IDEMPOTENCY_STATUS
                    .EXPIRED,
              }),
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput()
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .REJECTED
          );
      }
    );

    test(
      "duplicate counter is incremented for active duplicate",
      async () => {
        const existing =
          record();

        const repo =
          repository({
            createError:
              duplicateError(),

            findOneResult:
              existing,
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        await service.acquire(
          baseInput()
        );

        expect(
          repo.updateOne
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "generates unique claim tokens",
      () => {
        const service =
          new IdempotencyClaimService();

        const first =
          service
            .generateClaimToken();

        const second =
          service
            .generateClaimToken();

        expect(
          first
        )
          .toMatch(
            /^claim_/
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
      "requires owner id",
      async () => {
        const service =
          new IdempotencyClaimService();

        await expect(
          service.acquire(
            baseInput({
              ownerId:
                null,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_CLAIM_OWNER_REQUIRED",
          });
      }
    );

    test(
      "requires idempotency key",
      async () => {
        const service =
          new IdempotencyClaimService();

        await expect(
          service.acquire(
            baseInput({
              idempotencyKey:
                null,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_CLAIM_KEY_REQUIRED",
          });
      }
    );

    test(
      "never grants execution authorization",
      async () => {
        const repo =
          repository({
            createResult:
              record(),
          });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.acquire(
            baseInput()
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
      "rejects unsafe execution authorization input",
      async () => {
        const service =
          new IdempotencyClaimService();

        await expect(
          service.acquire(
            baseInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_CLAIM_UNSAFE_INPUT",
          });
      }
    );
  }
);