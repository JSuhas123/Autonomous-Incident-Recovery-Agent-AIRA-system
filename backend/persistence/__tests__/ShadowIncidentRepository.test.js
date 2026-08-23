"use strict";

const ShadowIncidentRepository =
  require(
    "../migration/ShadowIncidentRepository"
  );

describe(
  "ShadowIncidentRepository",
  () => {
    function createSetup() {
      const mongoResult = {
        _id:
          "incident-1",

        organizationId:
          "org-1",

        environmentId:
          "env-1",

        status:
          "open",
      };

      const primaryRepository = {
        findOne:
          jest.fn()
            .mockResolvedValue(
              mongoResult
            ),

        findMany:
          jest.fn()
            .mockResolvedValue([
              mongoResult,
            ]),

        create:
          jest.fn(),

        save:
          jest.fn(),
      };

      const shadowRepository = {
        findOne:
          jest.fn()
            .mockResolvedValue({
              ...mongoResult,
            }),
      };

      const shadowReadService = {
        read:
          jest.fn(
            async ({
              primaryRead,
              shadowRead,
            }) => {
              const primary =
                await primaryRead();

              await shadowRead();

              return primary;
            }
          ),
      };

      const repository =
        new ShadowIncidentRepository({
          primaryRepository,

          shadowRepository,

          shadowReadService,
        });

      return {
        repository,

        primaryRepository,

        shadowRepository,

        shadowReadService,

        mongoResult,
      };
    }

    test(
      "findOne routes scoped point read through shadow service",
      async () => {
        const setup =
          createSetup();

        const result =
          await setup
            .repository
            .findOne({
              _id:
                "incident-1",

              organizationId:
                "org-1",

              environmentId:
                "env-1",
            });

        expect(
          result
        )
          .toBe(
            setup.mongoResult
          );

        expect(
          setup
            .shadowReadService
            .read
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              domain:
                "incidents",

              operation:
                "findOne",

              identity:
                "incident-1",
            })
          );

        expect(
          setup
            .primaryRepository
            .findOne
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          setup
            .shadowRepository
            .findOne
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "unscoped read remains Mongo-only",
      async () => {
        const setup =
          createSetup();

        await setup
          .repository
          .findOne({
            _id:
              "incident-1",
          });

        expect(
          setup
            .primaryRepository
            .findOne
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          setup
            .shadowReadService
            .read
        )
          .not
          .toHaveBeenCalled();

        expect(
          setup
            .shadowRepository
            .findOne
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "transactional read remains primary-only",
      async () => {
        const setup =
          createSetup();

        const transaction = {
          kind:
            "mongo",

          session: {},
        };

        await setup
          .repository
          .findOne(
            {
              _id:
                "incident-1",

              organizationId:
                "org-1",

              environmentId:
                "env-1",
            },
            transaction
          );

        expect(
          setup
            .primaryRepository
            .findOne
        )
          .toHaveBeenCalledWith(
            expect.any(
              Object
            ),
            transaction
          );

        expect(
          setup
            .shadowReadService
            .read
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "findMany remains Mongo-only in 13.5C-3B",
      async () => {
        const setup =
          createSetup();

        const result =
          await setup
            .repository
            .findMany({
              organizationId:
                "org-1",

              environmentId:
                "env-1",
            });

        expect(
          result
        )
          .toHaveLength(
            1
          );

        expect(
          setup
            .primaryRepository
            .findMany
        )
          .toHaveBeenCalled();

        expect(
          setup
            .shadowReadService
            .read
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "writes remain Mongo-primary only",
      async () => {
        const setup =
          createSetup();

        setup
          .primaryRepository
          .create
          .mockResolvedValue(
            setup.mongoResult
          );

        await setup
          .repository
          .create({
            organizationId:
              "org-1",

            environmentId:
              "env-1",
          });

        expect(
          setup
            .primaryRepository
            .create
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          setup
            .shadowReadService
            .read
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);