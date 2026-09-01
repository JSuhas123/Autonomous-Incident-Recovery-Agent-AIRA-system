"use strict";


const PostgresIncidentRepository =
  require(
    "../../persistence/postgres/PostgresIncidentRepository"
  );


describe(
  "Phase 21.14 PostgreSQL incident diagnosis compatibility",
  () => {
    function repository() {
      return new PostgresIncidentRepository({
        scope: {
          run:
            jest.fn(),
        },
      });
    }


    const resolved = {
      organizationUuid:
        "11111111-1111-1111-1111-111111111111",

      environmentUuid:
        "22222222-2222-2222-2222-222222222222",
    };


    test(
      "supports historical diagnosis incident filter",
      () => {
        const repo =
          repository();


        const result =
          repo.buildFilter(
            {
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              _id: {
                $ne:
                  "f117ec3102355341f4c5b40f",
              },

              createdAt: {
                $gte:
                  new Date(
                    "2026-06-01T00:00:00.000Z"
                  ),
              },

              $or: [
                {
                  serviceId:
                    "8ecfe7f9a1a3bce1ddb24351",
                },

                {
                  fingerprint:
                    "fp-1",
                },

                {
                  signalFingerprint:
                    "sig-fp-1",
                },
              ],
            },

            resolved
          );


        expect(
          result.where
        )
          .toContain(
            "created_at >="
          );


        expect(
          result.where
        )
          .toContain(
            "NOT"
          );


        expect(
          result.where
        )
          .toContain(
            "service_id"
          );


        expect(
          result.where
        )
          .toContain(
            "fingerprint"
          );


        expect(
          result.where
        )
          .toContain(
            "signal_fingerprint"
          );


        expect(
          result.where
        )
          .toContain(
            " OR "
          );


        expect(
          result.values[0]
        )
          .toBe(
            resolved.organizationUuid
          );


        expect(
          result.values[1]
        )
          .toBe(
            resolved.environmentUuid
          );
      }
    );


    test(
      "supports existing status $in query",
      () => {
        const repo =
          repository();


        const result =
          repo.buildFilter(
            {
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              serviceId:
                "service-1",

              status: {
                $in: [
                  "open",
                  "investigating",
                ],
              },
            },

            resolved
          );


        expect(
          result.where
        )
          .toContain(
            "status IN"
          );
      }
    );


    test(
      "rejects unsupported fields instead of silently widening query",
      () => {
        const repo =
          repository();


        expect(
          () =>
            repo.buildFilter(
              {
                organizationId:
                  "aira-dev-org",

                environmentId:
                  "env_aira_development",

                totallyUnknownField:
                  "value",
              },

              resolved
            )
        )
          .toThrow(
            /Unsupported PostgreSQL incident filter/
          );
      }
    );


    test(
      "rejects unsupported operators",
      () => {
        const repo =
          repository();


        expect(
          () =>
            repo.buildFilter(
              {
                organizationId:
                  "aira-dev-org",

                environmentId:
                  "env_aira_development",

                createdAt: {
                  $regex:
                    "bad",
                },
              },

              resolved
            )
        )
          .toThrow(
            /Unsupported PostgreSQL incident operator/
          );
      }
    );
  }
);