"use strict";

jest.mock(
  "../../models/IncidentLifecycle",
  () => ({
    findOne:
      jest.fn(),

    findOneAndUpdate:
      jest.fn(),
  })
);

jest.mock(
  "../../models/IncidentLifecycleTransition",
  () => ({
    create:
      jest.fn(),

    find:
      jest.fn(),
  })
);

const IncidentLifecycle =
  require(
    "../../models/IncidentLifecycle"
  );

const IncidentLifecycleTransition =
  require(
    "../../models/IncidentLifecycleTransition"
  );

const MongoIncidentLifecycleRepository =
  require(
    "../mongo/MongoIncidentLifecycleRepository"
  );

describe(
  "MongoIncidentLifecycleRepository",
  () => {
    let repository;

    const scope = {
      organizationId:
        "org-1",

      environmentId:
        "env-1",

      incidentId:
        "incident-1",
    };

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoIncidentLifecycleRepository();
      }
    );

    test(
      "findCurrent is fully scoped",
      async () => {
        const expected = {
          revision:
            3,
        };

        IncidentLifecycle
          .findOne
          .mockResolvedValue(
            expected
          );

        const result =
          await repository
            .findCurrent(
              scope
            );

        expect(
          IncidentLifecycle
            .findOne
        ).toHaveBeenCalledWith(
          scope
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "createTransition delegates immutable transition creation",
      async () => {
        const transition = {
          transitionId:
            "transition-1",

          ...scope,

          revision:
            2,
        };

        await repository
          .createTransition(
            transition
          );

        expect(
          IncidentLifecycleTransition
            .create
        ).toHaveBeenCalledWith(
          transition
        );
      }
    );

    test(
      "upsertCurrent preserves scoped identity",
      async () => {
        const update = {
          lifecycleState:
            "RESOLVED",

          revision:
            3,
        };

        await repository
          .upsertCurrent(
            scope,
            update
          );

        expect(
          IncidentLifecycle
            .findOneAndUpdate
        ).toHaveBeenCalledWith(
          scope,
          {
            $set:
              update,

            $setOnInsert:
              scope,
          },
          {
            new:
              true,

            upsert:
              true,

            setDefaultsOnInsert:
              true,
          }
        );
      }
    );

    test(
      "updateCurrent does not upsert",
      async () => {
        const update = {
          stabilityObservation: {
            stable:
              true,
          },
        };

        await repository
          .updateCurrent(
            scope,
            update
          );

        expect(
          IncidentLifecycle
            .findOneAndUpdate
        ).toHaveBeenCalledWith(
          scope,
          {
            $set:
              update,
          },
          {
            new:
              true,
          }
        );
      }
    );

    test(
      "history is revision ordered and bounded",
      async () => {
        const limit =
          jest
            .fn()
            .mockResolvedValue(
              []
            );

        const sort =
          jest
            .fn()
            .mockReturnValue({
              limit,
            });

        IncidentLifecycleTransition
          .find
          .mockReturnValue({
            sort,
          });

        await repository
          .getHistory(
            scope,
            9000
          );

        expect(
          IncidentLifecycleTransition
            .find
        ).toHaveBeenCalledWith(
          scope
        );

        expect(
          sort
        ).toHaveBeenCalledWith({
          revision:
            1,
        });

        expect(
          limit
        ).toHaveBeenCalledWith(
          500
        );
      }
    );
  }
);