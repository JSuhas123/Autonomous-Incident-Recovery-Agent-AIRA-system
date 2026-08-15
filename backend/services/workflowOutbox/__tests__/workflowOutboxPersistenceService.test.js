"use strict";

const {
  WorkflowOutboxPersistenceService,
} =
  require(
    "../workflowOutboxPersistenceService"
  );

const {
  WorkflowOutboxIdentity,
} =
  require(
    "../workflowOutboxIdentity"
  );

const {
  OUTBOX_STATUS,
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../workflowOutboxContracts"
  );

function clone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}

function createModelStub() {
  const records =
    [];

  const model = {
    records,

    async findOne(
      query
    ) {
      return (
        records.find(
          (
            record
          ) =>
            Object.entries(
              query
            )
              .every(
                ([
                  key,
                  value,
                ]) =>
                  record[key] ===
                  value
              )
        ) ||
        null
      );
    },

    async create(
      document
    ) {
      if (
        records.some(
          (
            record
          ) =>
            record.eventKey ===
              document.eventKey ||
            record.eventId ===
              document.eventId
        )
      ) {
        const error =
          new Error(
            "E11000 duplicate key error"
          );

        error.code =
          11000;

        throw error;
      }

      const stored =
        clone(
          document
        );

      stored.createdAt =
        new Date();

      stored.updatedAt =
        new Date();

      records.push(
        stored
      );

      return stored;
    },

    find(
      query
    ) {
      let result =
        records.filter(
          (
            record
          ) => {
            if (
              query.status &&
              query.status.$in &&
              !query.status
                .$in
                .includes(
                  record.status
                )
            ) {
              return false;
            }

            const nextAttemptAt =
              record.attempts
                ?.nextAttemptAt
                ? new Date(
                    record
                      .attempts
                      .nextAttemptAt
                  )
                : null;

            if (
              query[
                "attempts.nextAttemptAt"
              ]?.$lte &&
              (
                !nextAttemptAt ||
                nextAttemptAt >
                  query[
                    "attempts.nextAttemptAt"
                  ].$lte
              )
            ) {
              return false;
            }

            const lease =
              record.owner
                ?.leaseExpiresAt
                ? new Date(
                    record.owner
                      .leaseExpiresAt
                  )
                : null;

            if (
              lease &&
              lease >
                query.$or[1][
                  "owner.leaseExpiresAt"
                ].$lte
            ) {
              return false;
            }

            if (
              record.attempts
                .count >=
              record.attempts
                .maxAttempts
            ) {
              return false;
            }

            return true;
          }
        );

      const chain = {
        sort() {
          return chain;
        },

        limit(
          limit
        ) {
          return Promise.resolve(
            result.slice(
              0,
              limit
            )
          );
        },
      };

      return chain;
    },
  };

  return model;
}

describe(
  "WorkflowOutboxPersistenceService",
  () => {
    let model;
    let identity;
    let service;

    const fixedNow =
      new Date(
        "2026-08-16T10:00:00.000Z"
      );

    beforeEach(
      () => {
        model =
          createModelStub();

        identity =
          new WorkflowOutboxIdentity();

        service =
          new WorkflowOutboxPersistenceService({
            WorkflowOutboxEvent:
              model,

            identity,

            now:
              () =>
                new Date(
                  fixedNow
                ),
          });
      }
    );

    function baseInput(
      overrides = {}
    ) {
      return {
        organizationId:
          "org-1",

        environmentId:
          "prod",

        incidentId:
          "incident-1",

        aggregateType:
          OUTBOX_AGGREGATE_TYPE
            .VERIFICATION,

        aggregateId:
          "verification-1",

        eventType:
          OUTBOX_EVENT_TYPE
            .LIFECYCLE_REQUESTED,

        transitionId:
          "recovered",

        payload: {
          organizationId:
            "org-1",

          environmentId:
            "prod",

          incidentId:
            "incident-1",

          verificationId:
            "verification-1",

          executionAuthorized:
            false,
        },

        ...overrides,
      };
    }

    test(
      "creates durable pending handoff",
      async () => {
        const result =
          await service
            .createOrGet(
              baseInput()
            );

        expect(
          result.created
        )
          .toBe(
            true
          );

        expect(
          result.duplicate
        )
          .toBe(
            false
          );

        expect(
          result.event.status
        )
          .toBe(
            OUTBOX_STATUS
              .PENDING
          );

        expect(
          result.event
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.event
            .attempts
            .count
        )
          .toBe(
            0
          );
      }
    );

    test(
      "same logical handoff returns existing event",
      async () => {
        const first =
          await service
            .createOrGet(
              baseInput()
            );

        const second =
          await service
            .createOrGet(
              baseInput()
            );

        expect(
          first.event
            .eventId
        )
          .toBe(
            second.event
              .eventId
          );

        expect(
          second.created
        )
          .toBe(
            false
          );

        expect(
          second.duplicate
        )
          .toBe(
            true
          );

        expect(
          model.records
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "same event identity with different payload fails closed",
      async () => {
        await service
          .createOrGet(
            baseInput()
          );

        await expect(
          service
            .createOrGet(
              baseInput({
                payload: {
                  organizationId:
                    "org-1",

                  environmentId:
                    "prod",

                  incidentId:
                    "incident-1",

                  verificationId:
                    "verification-1",

                  outcome:
                    "DIFFERENT",

                  executionAuthorized:
                    false,
                },
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_EVENT_PAYLOAD_CONFLICT",
          });
      }
    );

    test(
      "different transition creates different durable handoff",
      async () => {
        await service
          .createOrGet(
            baseInput({
              transitionId:
                "transition-1",
            })
          );

        await service
          .createOrGet(
            baseInput({
              transitionId:
                "transition-2",
            })
          );

        expect(
          model.records
        )
          .toHaveLength(
            2
          );
      }
    );

    test(
      "rejects execution authorization in payload",
      async () => {
        await expect(
          service
            .createOrGet(
              baseInput({
                payload: {
                  executionAuthorized:
                    true,
                },
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );

    test(
      "rejects persisted authorization grant in payload",
      async () => {
        await expect(
          service
            .createOrGet(
              baseInput({
                payload: {
                  authorizationGranted:
                    true,
                },
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );

    test(
      "missing tenant scope fails closed",
      async () => {
        await expect(
          service
            .createOrGet(
              baseInput({
                organizationId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_TENANT_SCOPE_REQUIRED",
          });
      }
    );

    test(
      "missing incident id fails closed",
      async () => {
        await expect(
          service
            .createOrGet(
              baseInput({
                incidentId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_EVENT_REQUIRED",

            field:
              "incidentId",
          });
      }
    );

    test(
      "invalid maxAttempts fails closed",
      async () => {
        await expect(
          service
            .createOrGet(
              baseInput({
                maxAttempts:
                  0,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_PAYLOAD_INVALID",

            field:
              "maxAttempts",
          });
      }
    );

    test(
      "findByEventId remains tenant scoped",
      async () => {
        const created =
          await service
            .createOrGet(
              baseInput()
            );

        const found =
          await service
            .findByEventId({
              eventId:
                created
                  .event
                  .eventId,

              organizationId:
                "org-1",

              environmentId:
                "prod",
            });

        expect(
          found.eventId
        )
          .toBe(
            created
              .event
              .eventId
          );

        const wrongTenant =
          await service
            .findByEventId({
              eventId:
                created
                  .event
                  .eventId,

              organizationId:
                "org-2",

              environmentId:
                "prod",
            });

        expect(
          wrongTenant
        )
          .toBeNull();
      }
    );

    test(
      "findByEventKey remains tenant scoped",
      async () => {
        const created =
          await service
            .createOrGet(
              baseInput()
            );

        const found =
          await service
            .findByEventKey({
              eventKey:
                created
                  .event
                  .eventKey,

              organizationId:
                "org-1",

              environmentId:
                "prod",
            });

        expect(
          found.eventKey
        )
          .toBe(
            created
              .event
              .eventKey
          );
      }
    );

    test(
      "findDeliverable returns pending events ready now",
      async () => {
        await service
          .createOrGet(
            baseInput()
          );

        const events =
          await service
            .findDeliverable({
              now:
                fixedNow,
            });

        expect(
          events
        )
          .toHaveLength(
            1
          );

        expect(
          events[0].status
        )
          .toBe(
            OUTBOX_STATUS
              .PENDING
          );
      }
    );

    test(
      "findDeliverable excludes event with active lease",
      async () => {
        const result =
          await service
            .createOrGet(
              baseInput()
            );

        result.event.owner = {
          workerId:
            "publisher-1",

          claimToken:
            "token-1",

          claimedAt:
            fixedNow,

          heartbeatAt:
            fixedNow,

          leaseExpiresAt:
            new Date(
              "2026-08-16T10:05:00.000Z"
            ),
        };

        model.records[0] =
          result.event;

        const events =
          await service
            .findDeliverable({
              now:
                fixedNow,
            });

        expect(
          events
        )
          .toHaveLength(
            0
          );
      }
    );

    test(
      "findDeliverable excludes exhausted event",
      async () => {
        const result =
          await service
            .createOrGet(
              baseInput({
                maxAttempts:
                  2,
              })
            );

        result.event
          .attempts
          .count =
          2;

        model.records[0] =
          result.event;

        const events =
          await service
            .findDeliverable({
              now:
                fixedNow,
            });

        expect(
          events
        )
          .toHaveLength(
            0
          );
      }
    );

    test(
      "duplicate-key race reloads compatible winning event",
      async () => {
        const input =
          baseInput();

        const expectedIdentity =
          identity
            .createIdentity(
              input
            );

        let firstLookup =
          true;

        model.findOne =
          async (
            query
          ) => {
            if (
              firstLookup
            ) {
              firstLookup =
                false;

              return null;
            }

            return model
              .records
              .find(
                (
                  record
                ) =>
                  record.eventKey ===
                  query.eventKey
              ) ||
              null;
          };

        model.create =
          async (
            document
          ) => {
            const winner = {
              ...clone(
                document
              ),

              eventId:
                expectedIdentity
                  .eventId,

              eventKey:
                expectedIdentity
                  .eventKey,

              payloadFingerprint:
                expectedIdentity
                  .payloadFingerprint,
            };

            model.records.push(
              winner
            );

            const error =
              new Error(
                "E11000 duplicate key error"
              );

            error.code =
              11000;

            throw error;
          };

        const result =
          await service
            .createOrGet(
              input
            );

        expect(
          result.created
        )
          .toBe(
            false
          );

        expect(
          result.duplicate
        )
          .toBe(
            true
          );

        expect(
          result.raced
        )
          .toBe(
            true
          );

        expect(
          result.event
            .eventId
        )
          .toBe(
            expectedIdentity
              .eventId
          );
      }
    );

    test(
      "duplicate-key race with conflicting winner fails closed",
      async () => {
        const input =
          baseInput();

        let firstLookup =
          true;

        model.findOne =
          async (
            query
          ) => {
            if (
              firstLookup
            ) {
              firstLookup =
                false;

              return null;
            }

            return model
              .records
              .find(
                (
                  record
                ) =>
                  record.eventKey ===
                  query.eventKey
              ) ||
              null;
          };

        model.create =
          async (
            document
          ) => {
            model.records.push({
              ...clone(
                document
              ),

              payloadFingerprint:
                "conflicting-fingerprint",
            });

            const error =
              new Error(
                "E11000 duplicate key error"
              );

            error.code =
              11000;

            throw error;
          };

        await expect(
          service
            .createOrGet(
              input
            )
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_EVENT_PAYLOAD_CONFLICT",
          });
      }
    );
  }
);