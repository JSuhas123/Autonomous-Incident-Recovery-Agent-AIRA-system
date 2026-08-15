"use strict";

const {
  IdempotentWorkerService,
} =
  require(
    "../idempotentWorkerService"
  );

const {
  IdempotencyClaimService,
} =
  require(
    "../idempotencyClaimService"
  );

const {
  IdempotencyCompletionService,
} =
  require(
    "../idempotencyCompletionService"
  );

const {
  IdempotencyLeaseService,
} =
  require(
    "../idempotencyLeaseService"
  );

const {
  IdempotencyKeyService,
} =
  require(
    "../idempotencyKeyService"
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
// Simulates:
// - unique compound index
// - atomic create
// - atomic conditional update
// - completion/failure writes
// - heartbeat lease writes
// ============================================================================

class AtomicRepository {
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
    const record =
      this.records.get(
        this.key(
          filter
        )
      );

    return record
      ? clone(
          record
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

        const record =
          this.records.get(
            key
          );

        if (
          !record
        ) {
          return null;
        }

        if (
          !matches(
            record,
            filter
          )
        ) {
          return null;
        }

        const next = {
          ...record,
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
                item
              ) =>
                String(
                  item._id
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

  get(
    input
  ) {
    const record =
      this.records.get(
        this.key(
          input
        )
      );

    return record
      ? clone(
          record
        )
      : null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function clone(
  value
) {
  if (
    value ===
      undefined
  ) {
    return undefined;
  }

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
      parts.length - 1;
    index += 1
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
      parts.length - 1
    ]
  ] =
    cloneValue(
      value
    );
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

function matches(
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
        value
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

function createWorkerService(
  repository
) {
  return new IdempotentWorkerService({
    keyService:
      new IdempotencyKeyService(),

    claimService:
      new IdempotencyClaimService({
        IdempotencyRecord:
          repository,
      }),

    completionService:
      new IdempotencyCompletionService({
        IdempotencyRecord:
          repository,
      }),

    leaseService:
      new IdempotencyLeaseService({
        IdempotencyRecord:
          repository,
      }),

    defaultLeaseMs:
      60000,

    defaultHeartbeatMs:
      20000,
  });
}

function executionIdentity() {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    operation:
      IDEMPOTENCY_OPERATION
        .EXECUTION,

    executionRequestId:
      "execution-1",

    executionPlanId:
      "plan-1",

    executionPlanHash:
      "hash-1",
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "Idempotency Duplicate Delivery E2E",
  () => {
    test(
      "many identical concurrent deliveries execute handler exactly once",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        let executionCount =
          0;

        const handler =
          async () => {
            executionCount +=
              1;

            /*
             * Keep the first owner alive long enough for the concurrent
             * deliveries to collide with an active PROCESSING record.
             */
            await new Promise(
              (
                resolve
              ) =>
                setTimeout(
                  resolve,
                  25
                )
            );

            return {
              success:
                true,

              executionId:
                "exec-result-1",
            };
          };

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
                worker.run({
                  identity:
                    executionIdentity(),

                  ownerId:
                    `worker-${index + 1}`,

                  payload: {
                    action:
                      "restart",

                    target:
                      "api",
                  },

                  handler,

                  executionAuthorized:
                    false,
                })
            )
          );

        expect(
          executionCount
        )
          .toBe(
            1
          );

        expect(
          results.filter(
            (
              result
            ) =>
              result.executed ===
              true
          )
        )
          .toHaveLength(
            1
          );

        expect(
          results.filter(
            (
              result
            ) =>
              result.decision ===
                IDEMPOTENCY_DECISION
                  .DUPLICATE_PROCESSING
          ).length
        )
          .toBeGreaterThan(
            0
          );
      }
    );

    test(
      "delivery after completion returns stored result without rerunning handler",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        const handler =
          jest.fn(
            async () => ({
              success:
                true,

              executionId:
                "execution-result-1",
            })
          );

        const first =
          await worker.run({
            identity:
              executionIdentity(),

            ownerId:
              "worker-1",

            payload: {
              action:
                "restart",
            },

            handler,
          });

        const second =
          await worker.run({
            identity:
              executionIdentity(),

            ownerId:
              "worker-2",

            payload: {
              action:
                "restart",
            },

            handler,
          });

        expect(
          first.executed
        )
          .toBe(
            true
          );

        expect(
          second.executed
        )
          .toBe(
            false
          );

        expect(
          second.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .DUPLICATE_COMPLETED
          );

        expect(
          handler
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          second.previousResult
        )
          .toEqual({
            success:
              true,

            executionId:
              "execution-result-1",
          });
      }
    );

    test(
      "completed record is persisted as terminal COMPLETED",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        const identity =
          executionIdentity();

        const key =
          new IdempotencyKeyService()
            .generate(
              identity
            )
            .idempotencyKey;

        await worker.run({
          identity,

          ownerId:
            "worker-1",

          payload: {
            action:
              "restart",
          },

          handler:
            async () => ({
              success:
                true,
            }),
        });

        const record =
          repository.get({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              key,
          });

        expect(
          record.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .COMPLETED
          );

        expect(
          record.leaseExpiresAt
        )
          .toBeNull();
      }
    );

    test(
      "same key with changed payload is rejected and never reruns side effect",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        const handler =
          jest.fn(
            async () => ({
              success:
                true,
            })
          );

        await worker.run({
          identity:
            executionIdentity(),

          ownerId:
            "worker-1",

          payload: {
            replicas:
              3,
          },

          handler,
        });

        const result =
          await worker.run({
            identity:
              executionIdentity(),

          ownerId:
            "worker-2",

          payload: {
            replicas:
              9,
          },

          handler,
        });

        expect(
          result.executed
        )
          .toBe(
            false
          );

        expect(
          result.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .REJECTED
          );

        expect(
          handler
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "different execution plan hash is treated as different logical operation",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        const handler =
          jest.fn(
            async () => ({
              success:
                true,
            })
          );

        await worker.run({
          identity:
            executionIdentity(),

          ownerId:
            "worker-1",

          payload: {
            action:
              "restart",
          },

          handler,
        });

        await worker.run({
          identity: {
            ...executionIdentity(),

            executionPlanHash:
              "hash-2",
          },

          ownerId:
            "worker-2",

          payload: {
            action:
              "restart",
          },

          handler,
        });

        expect(
          handler
        )
          .toHaveBeenCalledTimes(
            2
          );
      }
    );

    test(
      "handler failure is persisted and not incorrectly marked completed",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        const identity =
          executionIdentity();

        const key =
          new IdempotencyKeyService()
            .generate(
              identity
            )
            .idempotencyKey;

        await expect(
          worker.run({
            identity,

            ownerId:
              "worker-1",

            payload: {
              action:
                "restart",
            },

            handler:
              async () => {
                throw Object.assign(
                  new Error(
                    "temporary provider failure"
                  ),
                  {
                    code:
                      "TEMPORARY_PROVIDER_FAILURE",

                    retryable:
                      true,
                  }
                );
              },
          })
        )
          .rejects
          .toThrow(
            "temporary provider failure"
          );

        const record =
          repository.get({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              key,
          });

        expect(
          record.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .FAILED
          );

        expect(
          record.failure
            .retryable
        )
          .toBe(
            true
          );
      }
    );

    test(
      "retryable failed delivery may run once again",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        let attempts =
          0;

        const handler =
          async () => {
            attempts +=
              1;

            if (
              attempts ===
              1
            ) {
              throw Object.assign(
                new Error(
                  "temporary error"
                ),
                {
                  retryable:
                    true,
                }
              );
            }

            return {
              success:
                true,
            };
          };

        await expect(
          worker.run({
            identity:
              executionIdentity(),

            ownerId:
              "worker-1",

            payload: {
              action:
                "restart",
            },

            handler,
          })
        )
          .rejects
          .toThrow(
            "temporary error"
          );

        const retry =
          await worker.run({
            identity:
              executionIdentity(),

            ownerId:
              "worker-2",

            payload: {
              action:
                "restart",
            },

            handler,
          });

        expect(
          attempts
        )
          .toBe(
            2
          );

        expect(
          retry.executed
        )
          .toBe(
            true
          );

        expect(
          retry.decision
        )
          .toBe(
            IDEMPOTENCY_DECISION
              .RETRY_FAILED
          );
      }
    );

    test(
      "non-retryable failed delivery never reruns handler",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        const handler =
          jest.fn(
            async () => {
              throw Object.assign(
                new Error(
                  "unsafe operation"
                ),
                {
                  code:
                    "EXECUTION_POLICY_DENIED",

                  retryable:
                    false,
                }
              );
            }
          );

        await expect(
          worker.run({
            identity:
              executionIdentity(),

            ownerId:
              "worker-1",

            payload: {
              action:
                "restart",
            },

            handler,
          })
        )
          .rejects
          .toThrow(
            "unsafe operation"
          );

        const second =
          await worker.run({
            identity:
              executionIdentity(),

          ownerId:
            "worker-2",

          payload: {
            action:
              "restart",
          },

          handler,
        });

        expect(
          second.executed
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
          handler
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "duplicate delivery results never grant execution authorization",
      async () => {
        const repository =
          new AtomicRepository();

        const worker =
          createWorkerService(
            repository
          );

        const first =
          await worker.run({
            identity:
              executionIdentity(),

            ownerId:
              "worker-1",

            payload: {
              action:
                "restart",
            },

            handler:
              async () => ({
                success:
                  true,
              }),
          });

        const second =
          await worker.run({
            identity:
              executionIdentity(),

            ownerId:
              "worker-2",

            payload: {
              action:
                "restart",
            },

            handler:
              async () => ({
                success:
                  true,
              }),
          });

        expect(
          first.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          second.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);