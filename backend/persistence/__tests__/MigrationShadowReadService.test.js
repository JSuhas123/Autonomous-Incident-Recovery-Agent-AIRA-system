"use strict";

const MigrationShadowReadService =
  require(
    "../migration/MigrationShadowReadService"
  );

describe(
  "MigrationShadowReadService",
  () => {
    function createService({
      state = {
        phase:
          "shadow",

        shadow_reads_enabled:
          true,
      },

      targetValue = {
        id:
          "1",

        name:
          "same",
      },

      targetError =
        null,

      controlScopeError =
        null,
    } = {}) {
      const observationStore = {
        record:
          jest.fn()
            .mockResolvedValue(
              null
            ),
      };

      const stateStore = {
        get:
          jest.fn()
            .mockResolvedValue(
              state
            ),
      };

      const registry = {
        has:
          jest.fn()
            .mockReturnValue(
              false
            ),

        get:
          jest.fn(),
      };

      const controlScopeResolver =
        controlScopeError
          ? jest.fn()
              .mockRejectedValue(
                controlScopeError
              )
          : jest.fn()
              .mockResolvedValue({
                organizationId:
                  "11111111-1111-1111-1111-111111111111",

                environmentId:
                  "22222222-2222-2222-2222-222222222222",
              });

      const logger = {
        warn:
          jest.fn(),
      };

      const service =
        new MigrationShadowReadService({
          stateStore,

          observationStore,

          registry,

          controlScopeResolver,

          logger,
        });

      const primaryRead =
        jest.fn()
          .mockResolvedValue({
            id:
              "1",

            name:
              "same",
          });

      const shadowRead =
        targetError
          ? jest.fn()
              .mockRejectedValue(
                targetError
              )
          : jest.fn()
              .mockResolvedValue(
                targetValue
              );

      return {
        service,

        stateStore,

        observationStore,

        registry,

        controlScopeResolver,

        logger,

        primaryRead,

        shadowRead,
      };
    }

    test(
      "resolves PostgreSQL control scope before reading migration state",
      async () => {
        const setup =
          createService();

        await setup
          .service
          .read({
            scope: {
              organizationId:
                "mongo-org-id",

              environmentId:
                "mongo-env-id",
            },

            domain:
              "incidents",

            operation:
              "findOne",

            primaryRead:
              setup.primaryRead,

            shadowRead:
              setup.shadowRead,
          });

        expect(
          setup
            .controlScopeResolver
        )
          .toHaveBeenCalledWith({
            organizationId:
              "mongo-org-id",

            environmentId:
              "mongo-env-id",
          });

        expect(
          setup
            .stateStore
            .get
        )
          .toHaveBeenCalledWith(
            {
              organizationId:
                "11111111-1111-1111-1111-111111111111",

              environmentId:
                "22222222-2222-2222-2222-222222222222",
            },

            "incidents"
          );
      }
    );

    test(
      "returns Mongo result when shadow data matches",
      async () => {
        const setup =
          createService();

        const result =
          await setup
            .service
            .read({
              scope: {
                organizationId:
                  "mongo-org",

                environmentId:
                  "mongo-env",
              },

              domain:
                "incidents",

              operation:
                "findById",

              primaryRead:
                setup.primaryRead,

              shadowRead:
                setup.shadowRead,
            });

        expect(
          result
        )
          .toEqual({
            id:
              "1",

            name:
              "same",
          });

        expect(
          setup
            .observationStore
            .record
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              scope: {
                organizationId:
                  "11111111-1111-1111-1111-111111111111",

                environmentId:
                  "22222222-2222-2222-2222-222222222222",
              },

              status:
                "match",

              match:
                true,
            })
          );
      }
    );

    test(
      "records mismatch but still returns Mongo result",
      async () => {
        const setup =
          createService({
            targetValue: {
              id:
                "1",

              name:
                "different",
            },
          });

        const result =
          await setup
            .service
            .read({
              scope: {
                organizationId:
                  "mongo-org",

                environmentId:
                  "mongo-env",
              },

              domain:
                "incidents",

              operation:
                "findById",

              primaryRead:
                setup.primaryRead,

              shadowRead:
                setup.shadowRead,
            });

        expect(
          result.name
        )
          .toBe(
            "same"
          );

        expect(
          setup
            .observationStore
            .record
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                "mismatch",

              match:
                false,
            })
          );
      }
    );

    test(
      "PostgreSQL shadow failure does not fail Mongo read",
      async () => {
        const setup =
          createService({
            targetError:
              Object.assign(
                new Error(
                  "postgres unavailable"
                ),
                {
                  code:
                    "POSTGRES_DOWN",
                }
              ),
          });

        await expect(
          setup
            .service
            .read({
              scope: {
                organizationId:
                  "mongo-org",

                environmentId:
                  "mongo-env",
              },

              domain:
                "incidents",

              operation:
                "findById",

              primaryRead:
                setup.primaryRead,

              shadowRead:
                setup.shadowRead,
            })
        )
          .resolves
          .toMatchObject({
            name:
              "same",
          });

        expect(
          setup
            .observationStore
            .record
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              status:
                "error",
            })
          );
      }
    );

    test(
      "control-scope resolution failure does not fail Mongo read",
      async () => {
        const setup =
          createService({
            controlScopeError:
              Object.assign(
                new Error(
                  "identity mapping unavailable"
                ),
                {
                  code:
                    "POSTGRES_IDENTITY_ERROR",
                }
              ),
          });

        const result =
          await setup
            .service
            .read({
              scope: {
                organizationId:
                  "mongo-org",

                environmentId:
                  "mongo-env",
              },

              domain:
                "incidents",

              operation:
                "findOne",

              primaryRead:
                setup.primaryRead,

              shadowRead:
                setup.shadowRead,
            });

        expect(
          result
        )
          .toMatchObject({
            name:
              "same",
          });

        expect(
          setup
            .shadowRead
        )
          .not
          .toHaveBeenCalled();

        expect(
          setup
            .logger
            .warn
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "does not execute shadow read when shadow mode is disabled in state",
      async () => {
        const setup =
          createService({
            state: {
              phase:
                "verified",

              shadow_reads_enabled:
                false,
            },
          });

        await setup
          .service
          .read({
            scope: {
              organizationId:
                "mongo-org",

              environmentId:
                "mongo-env",
            },

            domain:
              "incidents",

            operation:
              "findById",

            primaryRead:
              setup.primaryRead,

            shadowRead:
              setup.shadowRead,
          });

        expect(
          setup
            .shadowRead
        )
          .not
          .toHaveBeenCalled();

        expect(
          setup
            .observationStore
            .record
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "primary read failure still propagates",
      async () => {
        const setup =
          createService();

        setup
          .primaryRead
          .mockRejectedValue(
            Object.assign(
              new Error(
                "mongo unavailable"
              ),
              {
                code:
                  "MONGO_DOWN",
              }
            )
          );

        await expect(
          setup
            .service
            .read({
              scope: {
                organizationId:
                  "mongo-org",

                environmentId:
                  "mongo-env",
              },

              domain:
                "incidents",

              operation:
                "findOne",

              primaryRead:
                setup.primaryRead,

              shadowRead:
                setup.shadowRead,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "MONGO_DOWN",
          });

        expect(
          setup
            .controlScopeResolver
        )
          .not
          .toHaveBeenCalled();

        expect(
          setup
            .shadowRead
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);