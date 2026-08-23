"use strict";

const ShadowIncidentEventRepository =
  require(
    "../migration/ShadowIncidentEventRepository"
  );

const ShadowIncidentLifecycleRepository =
  require(
    "../migration/ShadowIncidentLifecycleRepository"
  );

const ShadowSignalRepository =
  require(
    "../migration/ShadowSignalRepository"
  );

describe(
  "Phase 13.5C operational shadow repositories",
  () => {
    const scope = {
      organizationId:
        "org-1",

      environmentId:
        "env-1",
    };

    function shadowService() {
      return {
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
    }

    test(
      "incident event point read shadows PostgreSQL",
      async () => {
        const service =
          shadowService();

        const primary = {
          findByEventId:
            jest.fn()
              .mockResolvedValue({
                eventId:
                  "evt-1",
              }),
        };

        const shadow = {
          findByEventId:
            jest.fn()
              .mockResolvedValue({
                eventId:
                  "evt-1",
              }),
        };

        const repository =
          new ShadowIncidentEventRepository({
            primaryRepository:
              primary,

            shadowRepository:
              shadow,

            shadowReadService:
              service,
          });

        const result =
          await repository
            .findByEventId(
              scope,
              "evt-1"
            );

        expect(
          result.eventId
        )
          .toBe(
            "evt-1"
          );

        expect(
          service.read
        )
          .toHaveBeenCalled();

        expect(
          shadow.findByEventId
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "lifecycle current read shadows PostgreSQL",
      async () => {
        const service =
          shadowService();

        const lifecycleScope = {
          ...scope,

          incidentId:
            "inc-1",
        };

        const primary = {
          findCurrent:
            jest.fn()
              .mockResolvedValue({
                incidentId:
                  "inc-1",

                lifecycleState:
                  "open",
              }),
        };

        const shadow = {
          findCurrent:
            jest.fn()
              .mockResolvedValue({
                incidentId:
                  "inc-1",

                lifecycleState:
                  "open",
              }),
        };

        const repository =
          new ShadowIncidentLifecycleRepository({
            primaryRepository:
              primary,

            shadowRepository:
              shadow,

            shadowReadService:
              service,
          });

        const result =
          await repository
            .findCurrent(
              lifecycleScope
            );

        expect(
          result.lifecycleState
        )
          .toBe(
            "open"
          );

        expect(
          shadow.findCurrent
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "signal database-id read shadows PostgreSQL",
      async () => {
        const service =
          shadowService();

        const primary = {
          findByDatabaseId:
            jest.fn()
              .mockResolvedValue({
                _id:
                  "sig-db-1",
              }),
        };

        const shadow = {
          findByDatabaseId:
            jest.fn()
              .mockResolvedValue({
                _id:
                  "sig-db-1",
              }),
        };

        const repository =
          new ShadowSignalRepository({
            primaryRepository:
              primary,

            shadowRepository:
              shadow,

            shadowReadService:
              service,
          });

        const result =
          await repository
            .findByDatabaseId(
              scope,
              "sig-db-1"
            );

        expect(
          result._id
        )
          .toBe(
            "sig-db-1"
          );

        expect(
          shadow
            .findByDatabaseId
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "transactional reads bypass shadow",
      async () => {
        const service =
          shadowService();

        const transaction = {
          kind:
            "mongo",

          session:
            {},
        };

        const primary = {
          findByEventId:
            jest.fn()
              .mockResolvedValue(
                null
              ),
        };

        const shadow = {
          findByEventId:
            jest.fn(),
        };

        const repository =
          new ShadowIncidentEventRepository({
            primaryRepository:
              primary,

            shadowRepository:
              shadow,

            shadowReadService:
              service,
          });

        await repository
          .findByEventId(
            scope,
            "evt-1",
            transaction
          );

        expect(
          service.read
        )
          .not
          .toHaveBeenCalled();

        expect(
          shadow.findByEventId
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);