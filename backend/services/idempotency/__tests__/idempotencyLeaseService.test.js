"use strict";

const {
  IdempotencyLeaseService,
} =
  require(
    "../idempotencyLeaseService"
  );

const {
  IDEMPOTENCY_STATUS,
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

    ownerId:
      "worker-1",

    claimToken:
      "claim-1",

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

    status:
      IDEMPOTENCY_STATUS
        .PROCESSING,

    ownerId:
      "worker-1",

    claimToken:
      "claim-1",

    leaseExpiresAt:
      new Date(
        Date.now() +
        60000
      ),

    ...overrides,
  };
}

function repository({
  updatedRecord =
    null,

  existingRecord =
    null,

  staleRecords =
    [],
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

    find:
      jest.fn(
        () => ({
          sort:
            jest.fn(
              () => ({
                limit:
                  jest.fn(
                    async () =>
                      staleRecords
                  ),
              })
            ),
        })
      ),
  };
}

describe(
  "IdempotencyLeaseService",
  () => {
    test(
      "owner heartbeat renews lease",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record(),
          });

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        const now =
          new Date(
            "2026-01-01T00:00:00Z"
          );

        const result =
          await service.heartbeat(
            baseInput({
              now,
            })
          );

        expect(
          result.renewed
        )
          .toBe(
            true
          );

        expect(
          result.leaseExpiresAt
        )
          .toEqual(
            new Date(
              "2026-01-01T00:01:00Z"
            )
          );
      }
    );

    test(
      "heartbeat uses owner and claim token fencing",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record(),
          });

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        await service.heartbeat(
          baseInput()
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
      "stale owner cannot renew lease",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              record({
                ownerId:
                  "worker-2",
              }),
          });

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.heartbeat(
            baseInput()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_LEASE_OWNER_MISMATCH",
          });
      }
    );

    test(
      "stale claim token cannot renew lease",
      async () => {
        const repo =
          repository({
            updatedRecord:
              null,

            existingRecord:
              record({
                claimToken:
                  "claim-new",
              }),
          });

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.heartbeat(
            baseInput({
              claimToken:
                "claim-old",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_LEASE_CLAIM_TOKEN_MISMATCH",
          });
      }
    );

    test(
      "completed record cannot receive heartbeat",
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
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.heartbeat(
            baseInput()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_LEASE_NOT_PROCESSING",
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
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        await expect(
          service.heartbeat(
            baseInput()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_LEASE_RECORD_NOT_FOUND",
          });
      }
    );

    test(
      "finds stale processing claims",
      async () => {
        const stale =
          [
            record({
              leaseExpiresAt:
                new Date(
                  "2026-01-01T00:00:00Z"
                ),
            }),
          ];

        const repo =
          repository({
            staleRecords:
              stale,
          });

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service
            .findStaleClaims({
              organizationId:
                "org-1",

              environmentId:
                "prod",

              now:
                new Date(
                  "2026-01-01T00:10:00Z"
                ),
            });

        expect(
          result.staleCount
        )
          .toBe(
            1
          );

        expect(
          result.records
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "stale query only selects processing records with expired leases",
      async () => {
        const repo =
          repository();

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        const now =
          new Date(
            "2026-01-01T00:10:00Z"
          );

        await service
          .findStaleClaims({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            now,
          });

        const query =
          repo
            .find
            .mock
            .calls[0][0];

        expect(
          query.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .PROCESSING
          );

        expect(
          query.leaseExpiresAt
        )
          .toEqual({
            $lte:
              now,
          });
      }
    );

    test(
      "stale lookup may be scoped to operation",
      async () => {
        const repo =
          repository();

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        await service
          .findStaleClaims({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .VERIFICATION,
          });

        const query =
          repo
            .find
            .mock
            .calls[0][0];

        expect(
          query.operation
        )
          .toBe(
            IDEMPOTENCY_OPERATION
              .VERIFICATION
          );
      }
    );

    test(
      "requires claim token for heartbeat",
      async () => {
        const service =
          new IdempotencyLeaseService();

        await expect(
          service.heartbeat(
            baseInput({
              claimToken:
                null,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_LEASE_CLAIM_TOKEN_REQUIRED",
          });
      }
    );

    test(
      "heartbeat never authorizes execution",
      async () => {
        const repo =
          repository({
            updatedRecord:
              record(),
          });

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service.heartbeat(
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
      "stale lookup never authorizes execution",
      async () => {
        const repo =
          repository();

        const service =
          new IdempotencyLeaseService({
            IdempotencyRecord:
              repo,
          });

        const result =
          await service
            .findStaleClaims({
              organizationId:
                "org-1",

              environmentId:
                "prod",
            });

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
          new IdempotencyLeaseService();

        await expect(
          service.heartbeat(
            baseInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "IDEMPOTENCY_LEASE_UNSAFE_INPUT",
          });
      }
    );
  }
);