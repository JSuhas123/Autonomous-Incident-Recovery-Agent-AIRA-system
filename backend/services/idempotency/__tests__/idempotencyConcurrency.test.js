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

// ============================================================================
// IN-MEMORY ATOMIC REPOSITORY
//
// This intentionally simulates Mongo's unique-key + conditional-update
// behavior so the concurrency contract can be tested without requiring a
// live Mongo instance in the unit suite.
// ============================================================================

class AtomicIdempotencyRepository {
  constructor() {
    this.records =
      new Map();

    this.lock =
      Promise.resolve();
  }

  key(
    input
  ) {
    return [
      input.organizationId,
      input.environmentId,
      input.operation,
      input.idempotencyKey,
    ].join(
      "::"
    );
  }

  async atomic(
    fn
  ) {
    const previous =
      this.lock;

    let release;

    this.lock =
      new Promise(
        (
          resolve
        ) => {
          release =
            resolve;
        }
      );

    await previous;

    try {
      return await fn();
    } finally {
      release();
    }
  }

  async create(
    input
  ) {
    return this.atomic(
      async () => {
        const key =
          this.key(
            input
          );

        if (
          this.records.has(
            key
          )
        ) {
          throw Object.assign(
            new Error(
              "duplicate key"
            ),
            {
              code:
                11000,
            }
          );
        }

        const record = {
          _id:
            `record-${this.records.size + 1}`,

          ...clone(
            input
          ),
        };

        this.records.set(
          key,
          record
        );

        return clone(
          record
        );
      }
    );
  }

  async findOne(
    filter
  ) {
    const key =
      this.key(
        filter
      );

    const value =
      this.records.get(
        key
      );

    return value
      ? clone(
          value
        )
      : null;
  }

  async findOneAndUpdate(
    filter,
    update
  ) {
    return this.atomic(
      async () => {
        const key =
          this.key(
            filter
          );

        const current =
          this.records.get(
            key
          );

        if (
          !current
        ) {
          return null;
        }

        if (
          !matchesFilter(
            current,
            filter
          )
        ) {
          return null;
        }

        const next = {
          ...current,
        };

        applyUpdate(
          next,
          update
        );

        this.records.set(
          key,
          next
        );

        return clone(
          next
        );
      }
    );
  }

  async updateOne(
    filter,
    update
  ) {
    return this.atomic(
      async () => {
        const record =
          Array.from(
            this.records.values()
          )
            .find(
              (
                candidate
              ) =>
                String(
                  candidate._id
                ) ===
                String(
                  filter._id
                )
            );

        if (
          !record
        ) {
          return {
            acknowledged:
              true,

            modifiedCount:
              0,
          };
        }

        applyUpdate(
          record,
          update
        );

        return {
          acknowledged:
            true,

          modifiedCount:
            1,
        };
      }
    );
  }

  seed(
    record
  ) {
    const key =
      this.key(
        record
      );

    this.records.set(
      key,
      clone(
        record
      )
    );
  }

  get(
    input
  ) {
    const value =
      this.records.get(
        this.key(
          input
        )
      );

    return value
      ? clone(
          value
        )
      : null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

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
      "idem_v1_concurrency",

    requestFingerprint:
      "fingerprint_sha256_concurrency",

    executionRequestId:
      "execution-1",

    leaseMs:
      60000,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function clone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}

function getPath(
  object,
  path
) {
  return String(
    path
  )
    .split(
      "."
    )
    .reduce(
      (
        current,
        part
      ) =>
        current == null
          ? undefined
          : current[part],
      object
    );
}

function matchesFilter(
  record,
  filter
) {
  for (
    const [
      key,
      expected,
    ]
    of Object.entries(
      filter
    )
  ) {
    if (
      [
        "organizationId",
        "environmentId",
        "operation",
        "idempotencyKey",
      ].includes(
        key
      )
    ) {
      continue;
    }

    const actual =
      getPath(
        record,
        key
      );

    if (
      expected &&
      typeof expected ===
        "object" &&
      !Array.isArray(
        expected
      )
    ) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(
            expected,
            "$lte"
          )
      ) {
        if (
          new Date(
            actual
          ).getTime() >
          new Date(
            expected.$lte
          ).getTime()
        ) {
          return false;
        }

        continue;
      }
    }

    if (
      String(
        actual
      ) !==
      String(
        expected
      )
    ) {
      return false;
    }
  }

  return true;
}

function applyUpdate(
  record,
  update
) {
  if (
    update.$set
  ) {
    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        update.$set
      )
    ) {
      setPath(
        record,
        key,
        cloneValue(
          value
        )
      );
    }
  }

  if (
    update.$inc
  ) {
    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        update.$inc
      )
    ) {
      const current =
        Number(
          getPath(
            record,
            key
          ) ||
          0
        );

      setPath(
        record,
        key,
        current +
          Number(
            value
          )
      );
    }
  }
}

function setPath(
  object,
  path,
  value
) {
  const parts =
    String(
      path
    ).split(
      "."
    );

  let current =
    object;

  for (
    let index = 0;
    index <
      parts.length -
        1;
    index +=
      1
  ) {
    const part =
      parts[index];

    if (
      !current[part] ||
      typeof current[part] !==
        "object"
    ) {
      current[part] =
        {};
    }

    current =
      current[part];
  }

  current[
    parts[
      parts.length -
        1
    ]
  ] =
    value;
}

function cloneValue(
  value
) {
  if (
    value instanceof Date
  ) {
    return new Date(
      value
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return clone(
      value
    );
  }

  return value;
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "Idempotency Concurrency",
  () => {
    test(
      "exactly one worker acquires simultaneous initial claims",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const workers =
          Array.from(
            {
              length:
                20,
            },
            (
              _,
              index
            ) =>
              service.acquire(
                baseInput({
                  ownerId:
                    `worker-${index + 1}`,
                })
              )
          );

        const results =
          await Promise.all(
            workers
          );

        const acquired =
          results.filter(
            (
              result
            ) =>
              result.acquired ===
              true
          );

        const duplicates =
          results.filter(
            (
              result
            ) =>
              result.decision ===
                IDEMPOTENCY_DECISION
                  .DUPLICATE_PROCESSING
          );

        expect(
          acquired
        )
          .toHaveLength(
            1
          );

        expect(
          duplicates
        )
          .toHaveLength(
            19
          );

        expect(
          acquired[0]
            .decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .ACQUIRED
          );
      }
    );

    test(
      "simultaneous workers result in only one persisted owner",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        await Promise.all(
          Array.from(
            {
              length:
                25,
            },
            (
              _,
              index
            ) =>
              service.acquire(
                baseInput({
                  ownerId:
                    `worker-${index + 1}`,
                })
              )
          )
        );

        expect(
          repository
            .records
            .size
        )
          .toBe(
            1
          );

        const persisted =
          repository.get(
            baseInput()
          );

        expect(
          persisted.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .PROCESSING
          );

        expect(
          persisted.attemptCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "exactly one worker reclaims an expired processing lease",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const now =
          new Date(
            "2026-08-15T10:00:00.000Z"
          );

        repository.seed({
          _id:
            "record-stale",

          organizationId:
            "org-1",

          environmentId:
            "prod",

          operation:
            IDEMPOTENCY_OPERATION
              .EXECUTION,

          idempotencyKey:
            "idem_v1_concurrency",

          requestFingerprint:
            "fingerprint_sha256_concurrency",

          status:
            IDEMPOTENCY_STATUS
              .PROCESSING,

          ownerId:
            "dead-worker",

          claimToken:
            "claim-dead",

          claimedAt:
            new Date(
              "2026-08-15T09:00:00.000Z"
            ),

          heartbeatAt:
            new Date(
              "2026-08-15T09:00:30.000Z"
            ),

          leaseExpiresAt:
            new Date(
              "2026-08-15T09:01:00.000Z"
            ),

          attemptCount:
            1,

          duplicateCount:
            0,
        });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all(
            Array.from(
              {
                length:
                  20,
              },
              (
                _,
                index
              ) =>
                service.acquire(
                  baseInput({
                    ownerId:
                      `recovery-worker-${index + 1}`,

                    now,
                  })
                )
            )
          );

        const reclaimed =
          results.filter(
            (
              result
            ) =>
              result.decision ===
                IDEMPOTENCY_DECISION
                  .RECLAIM_STALE &&
              result.acquired ===
                true
          );

        const blocked =
          results.filter(
            (
              result
            ) =>
              result.decision ===
                IDEMPOTENCY_DECISION
                  .DUPLICATE_PROCESSING
          );

        expect(
          reclaimed
        )
          .toHaveLength(
            1
          );

        expect(
          blocked
        )
          .toHaveLength(
            19
          );

        const persisted =
          repository.get(
            baseInput()
          );

        expect(
          persisted.ownerId
        )
          .toBe(
            reclaimed[0]
              .ownerId
          );

        expect(
          persisted.attemptCount
        )
          .toBe(
            2
          );
      }
    );

    test(
      "stale workers receive different result from reclaim winner",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const now =
          new Date(
            "2026-08-15T10:00:00.000Z"
          );

        repository.seed({
          _id:
            "record-stale",

          organizationId:
            "org-1",

          environmentId:
            "prod",

          operation:
            IDEMPOTENCY_OPERATION
              .EXECUTION,

          idempotencyKey:
            "idem_v1_concurrency",

          requestFingerprint:
            "fingerprint_sha256_concurrency",

          status:
            IDEMPOTENCY_STATUS
              .PROCESSING,

          ownerId:
            "old-owner",

          claimToken:
            "old-token",

          leaseExpiresAt:
            new Date(
              "2026-08-15T09:00:00.000Z"
            ),

          attemptCount:
            1,

          duplicateCount:
            0,
        });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all(
            Array.from(
              {
                length:
                  10,
              },
              (
                _,
                index
              ) =>
                service.acquire(
                  baseInput({
                    ownerId:
                      `worker-${index}`,

                    now,
                  })
                )
            )
          );

        expect(
          results.filter(
            (
              result
            ) =>
              result.acquired
          )
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "exactly one worker reacquires a retryable failed operation",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        repository.seed({
          _id:
            "record-failed",

          organizationId:
            "org-1",

          environmentId:
            "prod",

          operation:
            IDEMPOTENCY_OPERATION
              .EXECUTION,

          idempotencyKey:
            "idem_v1_concurrency",

          requestFingerprint:
            "fingerprint_sha256_concurrency",

          status:
            IDEMPOTENCY_STATUS
              .FAILED,

          ownerId:
            null,

          claimToken:
            null,

          leaseExpiresAt:
            null,

          attemptCount:
            1,

          duplicateCount:
            0,

          failure: {
            code:
              "TEMPORARY_PROVIDER_FAILURE",

            message:
              "Temporary provider failure",

            retryable:
              true,

            failedAt:
              new Date(
                "2026-08-15T09:00:00.000Z"
              ),
          },
        });

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all(
            Array.from(
              {
                length:
                  20,
              },
              (
                _,
                index
              ) =>
                service.acquire(
                  baseInput({
                    ownerId:
                      `retry-worker-${index + 1}`,
                  })
                )
            )
          );

        const retryWinners =
          results.filter(
            (
              result
            ) =>
              result.decision ===
                IDEMPOTENCY_DECISION
                  .RETRY_FAILED &&
              result.acquired ===
                true
          );

        expect(
          retryWinners
        )
          .toHaveLength(
            1
          );

        const persisted =
          repository.get(
            baseInput()
          );

        expect(
          persisted.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .PROCESSING
          );

        expect(
          persisted.attemptCount
        )
          .toBe(
            2
          );
      }
    );

    test(
      "concurrent claims never create multiple claim tokens in storage",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all(
            Array.from(
              {
                length:
                  50,
              },
              (
                _,
                index
              ) =>
                service.acquire(
                  baseInput({
                    ownerId:
                      `worker-${index}`,
                  })
                )
            )
          );

        const winners =
          results.filter(
            (
              result
            ) =>
              result.acquired
          );

        expect(
          winners
        )
          .toHaveLength(
            1
          );

        const persisted =
          repository.get(
            baseInput()
          );

        expect(
          persisted.claimToken
        )
          .toBe(
            winners[0]
              .claimToken
          );
      }
    );

    test(
      "different tenants may concurrently acquire the same external key",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all([
            service.acquire(
              baseInput({
                organizationId:
                  "org-a",

                ownerId:
                  "worker-a",
              })
            ),

            service.acquire(
              baseInput({
                organizationId:
                  "org-b",

                ownerId:
                  "worker-b",
              })
            ),
          ]);

        expect(
          results.every(
            (
              result
            ) =>
              result.acquired ===
              true
          )
        )
          .toBe(
            true
          );

        expect(
          repository
            .records
            .size
        )
          .toBe(
            2
          );
      }
    );

    test(
      "different environments may concurrently acquire same key",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all([
            service.acquire(
              baseInput({
                environmentId:
                  "prod",

                ownerId:
                  "worker-prod",
              })
            ),

            service.acquire(
              baseInput({
                environmentId:
                  "staging",

                ownerId:
                  "worker-stage",
              })
            ),
          ]);

        expect(
          results[0]
            .acquired
        )
          .toBe(
            true
          );

        expect(
          results[1]
            .acquired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "different operations may independently own same key",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all([
            service.acquire(
              baseInput({
                operation:
                  IDEMPOTENCY_OPERATION
                    .EXECUTION,

                ownerId:
                  "execution-worker",
              })
            ),

            service.acquire(
              baseInput({
                operation:
                  IDEMPOTENCY_OPERATION
                    .VERIFICATION,

                ownerId:
                  "verification-worker",
              })
            ),
          ]);

        expect(
          results[0]
            .acquired
        )
          .toBe(
            true
          );

        expect(
          results[1]
            .acquired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "same key with conflicting fingerprint never acquires second worker",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const first =
          await service.acquire(
            baseInput({
              ownerId:
                "worker-1",

              requestFingerprint:
                "fingerprint-a",
            })
          );

        const second =
          await service.acquire(
            baseInput({
              ownerId:
                "worker-2",

              requestFingerprint:
                "fingerprint-b",
            })
          );

        expect(
          first.acquired
        )
          .toBe(
            true
          );

        expect(
          second.acquired
        )
          .toBe(
            false
          );

        expect(
          second.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .REJECTED
          );

        expect(
          second.code
        )
          .toBe(
            "IDEMPOTENCY_FINGERPRINT_MISMATCH"
          );
      }
    );

    test(
      "concurrency layer never grants execution authorization",
      async () => {
        const repository =
          new AtomicIdempotencyRepository();

        const service =
          new IdempotencyClaimService({
            IdempotencyRecord:
              repository,
          });

        const results =
          await Promise.all(
            Array.from(
              {
                length:
                  10,
              },
              (
                _,
                index
              ) =>
                service.acquire(
                  baseInput({
                    ownerId:
                      `worker-${index}`,
                  })
                )
            )
          );

        for (
          const result
          of results
        ) {
          expect(
            result.executionAuthorized
          )
            .toBe(
              false
            );
        }
      }
    );
  }
);