"use strict";

jest.mock(
  "../../models/IncidentEvent",
  () => ({
    create:
      jest.fn(),

    findOne:
      jest.fn(),

    findOneAndUpdate:
      jest.fn(),

    find:
      jest.fn(),
  })
);

const IncidentEvent =
  require(
    "../../models/IncidentEvent"
  );

const MongoIncidentEventRepository =
  require(
    "../mongo/MongoIncidentEventRepository"
  );

describe(
  "MongoIncidentEventRepository",
  () => {
    let repository;

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoIncidentEventRepository();
      }
    );

    test(
      "create delegates to IncidentEvent.create",
      async () => {
        const data = {
          eventId:
            "evt-1",

          status:
            "pending",
        };

        const expected = {
          _id:
            "mongo-event-id",
        };

        IncidentEvent
          .create
          .mockResolvedValue(
            expected
          );

        const result =
          await repository
            .create(
              data
            );

        expect(
          IncidentEvent.create
        ).toHaveBeenCalledWith(
          data
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "findByEventId delegates to IncidentEvent.findOne",
      async () => {
        const expected = {
          eventId:
            "evt-1",
        };

        IncidentEvent
          .findOne
          .mockResolvedValue(
            expected
          );

        const result =
          await repository
            .findByEventId(
              "evt-1"
            );

        expect(
          IncidentEvent.findOne
        ).toHaveBeenCalledWith({
          eventId:
            "evt-1",
        });

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "save delegates to the mongoose document",
      async () => {
        const expected = {
          eventId:
            "evt-1",
        };

        const event = {
          save:
            jest
              .fn()
              .mockResolvedValue(
                expected
              ),
        };

        const result =
          await repository
            .save(
              event
            );

        expect(
          event.save
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "save rejects non-document values",
      async () => {
        await expect(
          repository.save({
            eventId:
              "evt-1",
          })
        ).rejects.toMatchObject({
          code:
            "INVALID_INCIDENT_EVENT_DOCUMENT",
        });
      }
    );

    test(
      "markProcessed performs an atomic status update",
      async () => {
        const expected = {
          eventId:
            "evt-1",

          status:
            "processed",
        };

        IncidentEvent
          .findOneAndUpdate
          .mockResolvedValue(
            expected
          );

        const result =
          await repository
            .markProcessed(
              "evt-1",
              42
            );

        expect(
          IncidentEvent
            .findOneAndUpdate
        ).toHaveBeenCalledWith(
          {
            eventId:
              "evt-1",
          },
          {
            $set: {
              status:
                "processed",

              processedAt:
                expect.any(
                  Date
                ),

              processingTimeMs:
                42,
            },
          },
          {
            new:
              true,
          }
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "listForIncident remains tenant/environment scoped and ordered",
      async () => {
        const lean =
          jest
            .fn()
            .mockResolvedValue([
              {
                eventId:
                  "evt-1",
              },
            ]);

        const limit =
          jest
            .fn()
            .mockReturnValue({
              lean,
            });

        const sort =
          jest
            .fn()
            .mockReturnValue({
              limit,
            });

        IncidentEvent
          .find
          .mockReturnValue({
            sort,
          });

        const result =
          await repository
            .listForIncident(
              {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              },
              "incident-1",
              5000
            );

        expect(
          IncidentEvent.find
        ).toHaveBeenCalledWith({
          organizationId:
            "org-1",

          environmentId:
            "env-1",

          incidentId:
            "incident-1",
        });

        expect(
          sort
        ).toHaveBeenCalledWith({
          occurredAt:
            1,
        });

        /*
         * Repository protects Mongo from unbounded queries.
         */
        expect(
          limit
        ).toHaveBeenCalledWith(
          1000
        );

        expect(
          result
        ).toEqual([
          {
            eventId:
              "evt-1",
          },
        ]);
      }
    );
  }
);