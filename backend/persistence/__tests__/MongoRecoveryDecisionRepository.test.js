"use strict";

jest.mock(
  "../../models/RecoveryDecision",
  () => ({
    findOne:
      jest.fn(),

    create:
      jest.fn(),
  })
);

jest.mock(
  "../../models/RecoveryDecisionRun",
  () => ({
    create:
      jest.fn(),
  })
);

const RecoveryDecision =
  require(
    "../../models/RecoveryDecision"
  );

const RecoveryDecisionRun =
  require(
    "../../models/RecoveryDecisionRun"
  );

const MongoRecoveryDecisionRepository =
  require(
    "../mongo/MongoRecoveryDecisionRepository"
  );

describe(
  "MongoRecoveryDecisionRepository",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();
      }
    );

    test(
      "findCurrent remains organization/environment/incident scoped",
      async () => {
        const query = {
          session:
            jest
              .fn()
              .mockResolvedValue(
                null
              ),
        };

        RecoveryDecision
          .findOne
          .mockReturnValue(
            query
          );

        const transaction = {
          kind:
            "mongo",

          session: {
            id:
              1,
          },
        };

        await new MongoRecoveryDecisionRepository()
          .findCurrent(
            {
              organizationId:
                "org",

              environmentId:
                "env",

              incidentId:
                "incident",
            },
            transaction
          );

        expect(
          RecoveryDecision
            .findOne
        ).toHaveBeenCalledWith({
          organizationId:
            "org",

          environmentId:
            "env",

          incidentId:
            "incident",

          isCurrent:
            true,
        });

        expect(
          query.session
        ).toHaveBeenCalledWith(
          transaction.session
        );
      }
    );

    test(
      "createRun participates in supplied Mongo transaction",
      async () => {
        RecoveryDecisionRun
          .create
          .mockResolvedValue([
            {
              _id:
                "run-id",
            },
          ]);

        const transaction = {
          kind:
            "mongo",

          session: {
            id:
              1,
          },
        };

        await new MongoRecoveryDecisionRepository()
          .createRun(
            {
              runId:
                "run-1",
            },
            transaction
          );

        expect(
          RecoveryDecisionRun
            .create
        ).toHaveBeenCalledWith(
          [
            {
              runId:
                "run-1",
            },
          ],
          {
            session:
              transaction.session,
          }
        );
      }
    );
  }
);