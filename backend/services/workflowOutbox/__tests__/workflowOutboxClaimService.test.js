"use strict";

const {
  WorkflowOutboxClaimService,
} =
  require(
    "../workflowOutboxClaimService"
  );

const {
  OUTBOX_STATUS,
} =
  require(
    "../workflowOutboxContracts"
  );

function getPath(
  object,
  path
) {
  return path
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
    path.split(
      "."
    );

  const last =
    parts.pop();

  let current =
    object;

  for (
    const part
    of parts
  ) {
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

  current[last] =
    value;
}

function matches(
  record,
  query,
  now
) {
  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      query
    )
  ) {
    if (
      key ===
      "$or"
    ) {
      const passes =
        value.some(
          (
            condition
          ) =>
            matches(
              record,
              condition,
              now
            )
        );

      if (
        !passes
      ) {
        return false;
      }

      continue;
    }

    if (
      key ===
      "$expr"
    ) {
      const [
        left,
        right,
      ] =
        value.$lt;

      const leftValue =
        getPath(
          record,
          left.replace(
            /^\$/,
            ""
          )
        );

      const rightValue =
        getPath(
          record,
          right.replace(
            /^\$/,
            ""
          )
        );

      if (
        !(
          leftValue <
          rightValue
        )
      ) {
        return false;
      }

      continue;
    }

    const actual =
      getPath(
        record,
        key
      );

    if (
      value &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value
      ) &&
      !(
        value instanceof
        Date
      )
    ) {
      if (
        "$in" in
        value
      ) {
        if (
          !value.$in
            .includes(
              actual
            )
        ) {
          return false;
        }

        continue;
      }

      if (
        "$lte" in
        value
      ) {
        if (
          actual != null &&
          new Date(
            actual
          ) >
            value.$lte
        ) {
          return false;
        }

        continue;
      }

      if (
        "$gt" in
        value
      ) {
        if (
          actual == null ||
          new Date(
            actual
          ) <=
            value.$gt
        ) {
          return false;
        }

        continue;
      }
    }

    if (
      actual !==
      value
    ) {
      return false;
    }
  }

  return true;
}

function createModelStub(
  initialRecord
) {
  const record =
    JSON.parse(
      JSON.stringify(
        initialRecord
      )
    );

  return {
    record,

    async findOne(
      query
    ) {
      return matches(
        record,
        query
      )
        ? record
        : null;
    },

    async findOneAndUpdate(
      query,
      update
    ) {
      if (
        !matches(
          record,
          query
        )
      ) {
        return null;
      }

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
            getPath(
              record,
              key
            ) || 0;

          setPath(
            record,
            key,
            current +
              value
          );
        }
      }

      return record;
    },
  };
}

describe(
  "WorkflowOutboxClaimService",
  () => {
    const now =
      new Date(
        "2026-08-16T10:00:00.000Z"
      );

    function baseRecord(
      overrides = {}
    ) {
      return {
        eventId:
          "event-1",

        status:
          OUTBOX_STATUS
            .PENDING,

        owner: {
          workerId:
            null,

          claimToken:
            null,

          claimedAt:
            null,

          heartbeatAt:
            null,

          leaseExpiresAt:
            null,
        },

        attempts: {
          count:
            0,

          maxAttempts:
            10,
        },

        failure: {
          code:
            null,

          message:
            null,

          retryable:
            false,

          failedAt:
            null,
        },

        delivery: {},

        deadLetter: {},

        ...overrides,
      };
    }

    test(
      "atomically claims pending event",
      async () => {
        const model =
          createModelStub(
            baseRecord()
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),

            generateClaimToken:
              () =>
                "token-A",
          });

        const result =
          await service
            .claim({
              eventId:
                "event-1",

              ownerId:
                "publisher-A",

              leaseMs:
                60000,
            });

        expect(
          result.claimed
        )
          .toBe(
            true
          );

        expect(
          result.claimToken
        )
          .toBe(
            "token-A"
          );

        expect(
          model.record.status
        )
          .toBe(
            OUTBOX_STATUS
              .PROCESSING
          );

        expect(
          model.record.owner
            .workerId
        )
          .toBe(
            "publisher-A"
          );

        expect(
          model.record.attempts
            .count
        )
          .toBe(
            1
          );
      }
    );

    test(
      "second publisher cannot claim active lease",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-A",

                claimToken:
                  "token-A",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T10:05:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        const result =
          await service
            .claim({
              eventId:
                "event-1",

              ownerId:
                "publisher-B",
            });

        expect(
          result.claimed
        )
          .toBe(
            false
          );

        expect(
          result.decision
        )
          .toBe(
            "LEASE_ACTIVE"
          );
      }
    );

    test(
      "expired lease can be reclaimed with new token",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-A",

                claimToken:
                  "token-A",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T09:55:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),

            generateClaimToken:
              () =>
                "token-B",
          });

        const result =
          await service
            .claim({
              eventId:
                "event-1",

              ownerId:
                "publisher-B",
            });

        expect(
          result.claimed
        )
          .toBe(
            true
          );

        expect(
          result.claimToken
        )
          .toBe(
            "token-B"
          );

        expect(
          model.record.owner
            .workerId
        )
          .toBe(
            "publisher-B"
          );
      }
    );

    test(
      "heartbeat extends active ownership",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-A",

                claimToken:
                  "token-A",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T10:05:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        const result =
          await service
            .heartbeat({
              eventId:
                "event-1",

              ownerId:
                "publisher-A",

              claimToken:
                "token-A",

              leaseMs:
                120000,
            });

        expect(
          result.heartbeated
        )
          .toBe(
            true
          );

        expect(
          new Date(
            model.record.owner
              .leaseExpiresAt
          )
        )
          .toEqual(
            new Date(
              "2026-08-16T10:02:00.000Z"
            )
          );
      }
    );

    test(
      "stale claim token cannot heartbeat",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-B",

                claimToken:
                  "token-B",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T10:05:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        await expect(
          service
            .heartbeat({
              eventId:
                "event-1",

              ownerId:
                "publisher-A",

              claimToken:
                "token-A",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CLAIM_TOKEN_MISMATCH",
          });
      }
    );

    test(
      "current owner can mark delivered",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-A",

                claimToken:
                  "token-A",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T10:05:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        const result =
          await service
            .markDelivered({
              eventId:
                "event-1",

              ownerId:
                "publisher-A",

              claimToken:
                "token-A",

              messageId:
                "msg-1",

              queue:
                "verification",
            });

        expect(
          result.delivered
        )
          .toBe(
            true
          );

        expect(
          model.record.status
        )
          .toBe(
            OUTBOX_STATUS
              .DELIVERED
          );

        expect(
          model.record.delivery
            .messageId
        )
          .toBe(
            "msg-1"
          );
      }
    );

    test(
      "stale publisher cannot mark delivered",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-B",

                claimToken:
                  "token-B",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T10:05:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        await expect(
          service
            .markDelivered({
              eventId:
                "event-1",

              ownerId:
                "publisher-A",

              claimToken:
                "token-A",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CLAIM_TOKEN_MISMATCH",
          });
      }
    );

    test(
      "current owner can mark failed",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-A",

                claimToken:
                  "token-A",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T10:05:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        const nextAttemptAt =
          new Date(
            "2026-08-16T10:01:00.000Z"
          );

        const result =
          await service
            .markFailed({
              eventId:
                "event-1",

              ownerId:
                "publisher-A",

              claimToken:
                "token-A",

              error:
                Object.assign(
                  new Error(
                    "RabbitMQ unavailable"
                  ),
                  {
                    code:
                      "ECONNREFUSED",
                  }
                ),

              retryable:
                true,

              nextAttemptAt,
            });

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
          model.record.status
        )
          .toBe(
            OUTBOX_STATUS
              .FAILED
          );

        expect(
          model.record.failure
            .code
        )
          .toBe(
            "ECONNREFUSED"
          );
      }
    );

    test(
      "current owner can dead-letter event",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "publisher-A",

                claimToken:
                  "token-A",

                leaseExpiresAt:
                  new Date(
                    "2026-08-16T10:05:00.000Z"
                  ),
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        const result =
          await service
            .markDeadLetter({
              eventId:
                "event-1",

              ownerId:
                "publisher-A",

              claimToken:
                "token-A",

              reason:
                "retry budget exhausted",
            });

        expect(
          result.deadLettered
        )
          .toBe(
            true
          );

        expect(
          model.record.status
        )
          .toBe(
            OUTBOX_STATUS
              .DEAD_LETTER
          );
      }
    );

    test(
      "delivered event is never reclaimed",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .DELIVERED,
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        const result =
          await service
            .claim({
              eventId:
                "event-1",

              ownerId:
                "publisher-B",
            });

        expect(
          result.claimed
        )
          .toBe(
            false
          );

        expect(
          result.decision
        )
          .toBe(
            "ALREADY_DELIVERED"
          );
      }
    );

    test(
      "retry-exhausted event cannot be claimed",
      async () => {
        const model =
          createModelStub(
            baseRecord({
              status:
                OUTBOX_STATUS
                  .FAILED,

              attempts: {
                count:
                  10,

                maxAttempts:
                  10,
              },
            })
          );

        const service =
          new WorkflowOutboxClaimService({
            WorkflowOutboxEvent:
              model,

            now:
              () =>
                new Date(
                  now
                ),
          });

        const result =
          await service
            .claim({
              eventId:
                "event-1",

              ownerId:
                "publisher-B",
            });

        expect(
          result.claimed
        )
          .toBe(
            false
          );

        expect(
          result.decision
        )
          .toBe(
            "RETRY_EXHAUSTED"
          );
      }
    );
  }
);