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
    .split(".")
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
    path.split(".");

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
  query
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
              condition
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
        value instanceof Date
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
  "WorkflowOutbox Lease Recovery",
  () => {
    function baseRecord() {
      return {
        eventId:
          "lease-recovery-event",

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
      };
    }


    test(
      "publisher takeover occurs only after lease expiry and fences stale publisher",
      async () => {
        let currentTime =
          new Date(
            "2026-08-16T10:00:00.000Z"
          );

        let tokenNumber =
          0;

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
                  currentTime
                ),

            generateClaimToken:
              () => {
                tokenNumber +=
                  1;

                return `token-${tokenNumber}`;
              },
          });


        // ---------------------------------------------------------------
        // STEP 1
        // Publisher A obtains ownership.
        // ---------------------------------------------------------------

        const publisherA =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              leaseMs:
                60000,
            });

        expect(
          publisherA.claimed
        )
          .toBe(
            true
          );

        expect(
          publisherA.claimToken
        )
          .toBe(
            "token-1"
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


        // ---------------------------------------------------------------
        // STEP 2
        // Publisher B arrives while A's lease is still alive.
        //
        // B MUST NOT steal ownership.
        // ---------------------------------------------------------------

        currentTime =
          new Date(
            "2026-08-16T10:00:30.000Z"
          );

        const publisherBEarly =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-B",

              leaseMs:
                60000,
            });

        expect(
          publisherBEarly.claimed
        )
          .toBe(
            false
          );

        expect(
          publisherBEarly.decision
        )
          .toBe(
            "LEASE_ACTIVE"
          );

        expect(
          model.record.owner
            .workerId
        )
          .toBe(
            "publisher-A"
          );

        expect(
          model.record.owner
            .claimToken
        )
          .toBe(
            "token-1"
          );

        /*
         * Failed claim attempts must not consume retry budget.
         */
        expect(
          model.record.attempts
            .count
        )
          .toBe(
            1
          );


        // ---------------------------------------------------------------
        // STEP 3
        // A dies.
        //
        // No heartbeat occurs.
        //
        // Advance beyond A's lease.
        // ---------------------------------------------------------------

        currentTime =
          new Date(
            "2026-08-16T10:01:01.000Z"
          );


        // ---------------------------------------------------------------
        // STEP 4
        // Publisher B now takes ownership.
        // ---------------------------------------------------------------

        const publisherB =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-B",

              leaseMs:
                60000,
            });

        expect(
          publisherB.claimed
        )
          .toBe(
            true
          );

        expect(
          publisherB.claimToken
        )
          .toBe(
            "token-3"
          );

        expect(
          publisherB.claimToken
        )
          .not
          .toBe(
            publisherA.claimToken
          );

        expect(
          model.record.owner
            .workerId
        )
          .toBe(
            "publisher-B"
          );

        expect(
          model.record.owner
            .claimToken
        )
          .toBe(
            publisherB.claimToken
          );

        /*
         * Reclaim is a real new delivery attempt.
         */
        expect(
          model.record.attempts
            .count
        )
          .toBe(
            2
          );


        // ---------------------------------------------------------------
        // STEP 5
        // Zombie Publisher A wakes up.
        //
        // Its old claim token MUST be fenced.
        // ---------------------------------------------------------------

        await expect(
          service
            .heartbeat({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              claimToken:
                publisherA
                  .claimToken,

              leaseMs:
                60000,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CLAIM_TOKEN_MISMATCH",
          });


        // ---------------------------------------------------------------
        // STEP 6
        // Zombie Publisher A attempts to commit delivery.
        //
        // This MUST also be rejected.
        // ---------------------------------------------------------------

        await expect(
          service
            .markDelivered({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              claimToken:
                publisherA
                  .claimToken,

              messageId:
                "stale-message",

              queue:
                "execution",
            })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CLAIM_TOKEN_MISMATCH",
          });


        // ---------------------------------------------------------------
        // STEP 7
        // Current owner B commits successfully.
        // ---------------------------------------------------------------

        const delivered =
          await service
            .markDelivered({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-B",

              claimToken:
                publisherB
                  .claimToken,

              messageId:
                "message-B",

              queue:
                "execution",
            });

        expect(
          delivered.delivered
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
            "message-B"
          );


        // ---------------------------------------------------------------
        // STEP 8
        // Once delivered, nobody may reclaim the event.
        // ---------------------------------------------------------------

        currentTime =
          new Date(
            "2026-08-16T10:10:00.000Z"
          );

        const publisherC =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-C",
            });

        expect(
          publisherC.claimed
        )
          .toBe(
            false
          );

        expect(
          publisherC.decision
        )
          .toBe(
            "ALREADY_DELIVERED"
          );

        expect(
          model.record.status
        )
          .toBe(
            OUTBOX_STATUS
              .DELIVERED
          );
      }
    );


    test(
      "heartbeat keeps ownership alive and prevents premature takeover",
      async () => {
        let currentTime =
          new Date(
            "2026-08-16T11:00:00.000Z"
          );

        let tokenNumber =
          0;

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
                  currentTime
                ),

            generateClaimToken:
              () => {
                tokenNumber +=
                  1;

                return `heartbeat-token-${tokenNumber}`;
              },
          });

        const publisherA =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              leaseMs:
                60000,
            });

        expect(
          publisherA.claimed
        )
          .toBe(
            true
          );


        // 30 seconds into original lease.
        currentTime =
          new Date(
            "2026-08-16T11:00:30.000Z"
          );

        const heartbeat =
          await service
            .heartbeat({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              claimToken:
                publisherA
                  .claimToken,

              leaseMs:
                120000,
            });

        expect(
          heartbeat.heartbeated
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
              "2026-08-16T11:02:30.000Z"
            )
          );


        /*
         * We are now past the ORIGINAL lease:
         *
         * original expiry = 11:01:00
         *
         * But heartbeat extended ownership until:
         *
         * 11:02:30
         */

        currentTime =
          new Date(
            "2026-08-16T11:01:30.000Z"
          );

        const publisherB =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-B",
            });

        expect(
          publisherB.claimed
        )
          .toBe(
            false
          );

        expect(
          publisherB.decision
        )
          .toBe(
            "LEASE_ACTIVE"
          );

        expect(
          model.record.owner
            .workerId
        )
          .toBe(
            "publisher-A"
          );
      }
    );


    test(
      "publisher whose own lease expired cannot revive itself with heartbeat",
      async () => {
        let currentTime =
          new Date(
            "2026-08-16T12:00:00.000Z"
          );

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
                  currentTime
                ),

            generateClaimToken:
              () =>
                "publisher-A-token",
          });

        const publisherA =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              leaseMs:
                30000,
            });

        expect(
          publisherA.claimed
        )
          .toBe(
            true
          );

        // Lease expired at 12:00:30.
        currentTime =
          new Date(
            "2026-08-16T12:00:31.000Z"
          );

        await expect(
          service
            .heartbeat({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              claimToken:
                publisherA
                  .claimToken,

              leaseMs:
                60000,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CLAIM_TOKEN_MISMATCH",
          });

        /*
         * Expired ownership remains expired.
         */
        expect(
          new Date(
            model.record.owner
              .leaseExpiresAt
          )
        )
          .toEqual(
            new Date(
              "2026-08-16T12:00:30.000Z"
            )
          );
      }
    );


    test(
      "stale publisher cannot mark failure after ownership takeover",
      async () => {
        let currentTime =
          new Date(
            "2026-08-16T13:00:00.000Z"
          );

        let tokenNumber =
          0;

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
                  currentTime
                ),

            generateClaimToken:
              () => {
                tokenNumber +=
                  1;

                return `failure-token-${tokenNumber}`;
              },
          });

        const publisherA =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              leaseMs:
                30000,
            });

        currentTime =
          new Date(
            "2026-08-16T13:00:31.000Z"
          );

        const publisherB =
          await service
            .claim({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-B",

              leaseMs:
                60000,
            });

        expect(
          publisherB.claimed
        )
          .toBe(
            true
          );

        await expect(
          service
            .markFailed({
              eventId:
                "lease-recovery-event",

              ownerId:
                "publisher-A",

              claimToken:
                publisherA
                  .claimToken,

              error:
                Object.assign(
                  new Error(
                    "stale publisher failure"
                  ),
                  {
                    code:
                      "ECONNRESET",
                  }
                ),

              retryable:
                true,

              nextAttemptAt:
                new Date(
                  "2026-08-16T13:02:00.000Z"
                ),
            })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_CLAIM_TOKEN_MISMATCH",
          });

        /*
         * A stale failure report must not destroy B's active ownership.
         */
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
            "publisher-B"
          );

        expect(
          model.record.owner
            .claimToken
        )
          .toBe(
            publisherB
              .claimToken
          );
      }
    );
  }
);