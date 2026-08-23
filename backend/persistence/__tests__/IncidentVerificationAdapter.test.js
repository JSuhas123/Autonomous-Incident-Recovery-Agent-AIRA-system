"use strict";

const IncidentVerificationAdapter =
  require(
    "../migration/adapters/IncidentVerificationAdapter"
  );

describe(
  "IncidentVerificationAdapter",
  () => {
    test(
      "counts Mongo source records",
      async () => {
        const countDocuments =
          jest.fn(
            async () =>
              3
          );

        const adapter =
          new IncidentVerificationAdapter({
            Incident: {
              countDocuments,
            },

            repository: {},
          });

        const result =
          await adapter
            .countSource({
              organizationId:
                "org-1",

              environmentId:
                "env-1",
            });

        expect(
          result
        ).toBe(
          3
        );

        expect(
          countDocuments
        )
          .toHaveBeenCalledWith({
            organizationId:
              "org-1",

            environmentId:
              "env-1",
          });
      }
    );

    test(
      "counts PostgreSQL target records through scoped repository",
      async () => {
        const repository = {
          findMany:
            jest.fn(
              async () => [
                {
                  _id:
                    "1",
                },
                {
                  _id:
                    "2",
                },
              ]
            ),
        };

        const adapter =
          new IncidentVerificationAdapter({
            Incident:
              {},

            repository,
          });

        const result =
          await adapter
            .countTarget({
              organizationId:
                "org-public",

              environmentId:
                "env-public",
            });

        expect(
          result
        ).toBe(
          2
        );

        expect(
          repository.findMany
        )
          .toHaveBeenCalledWith({
            organizationId:
              "org-public",

            environmentId:
              "env-public",
          });
      }
    );

    test(
      "findTarget resolves using legacy Mongo identity",
      async () => {
        const repository = {
          findOne:
            jest.fn(
              async () => ({
                _id:
                  "mongo-incident-1",
              })
            ),
        };

        const adapter =
          new IncidentVerificationAdapter({
            Incident:
              {},

            repository,
          });

        await adapter
          .findTarget(
            {
              organizationId:
                "org-public",

              environmentId:
                "env-public",
            },
            "mongo-incident-1"
          );

        expect(
          repository.findOne
        )
          .toHaveBeenCalledWith({
            organizationId:
              "org-public",

            environmentId:
              "env-public",

            _id:
              "mongo-incident-1",
          });
      }
    );

    test(
      "canonicalization removes database ownership differences",
      () => {
        const adapter =
          new IncidentVerificationAdapter({
            Incident:
              {},

            repository:
              {},
          });

        const source =
          adapter
            .canonicalizeSource({
              _id:
                "mongo-1",

              organizationId:
                "mongo-org",

              environmentId:
                "mongo-env",

              status:
                "open",

              severity:
                "warning",
            });

        const target =
          adapter
            .canonicalizeTarget({
              _id:
                "mongo-1",

              organizationId:
                "org-public",

              environmentId:
                "env-public",

              status:
                "open",

              severity:
                "warning",
            });

        expect(
          source
        )
          .toEqual(
            target
          );
      }
    );
  }
);