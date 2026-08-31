"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  OpenTelemetryIngestionService,
} =
  require(
    "../../services/integrations/opentelemetryIngestionService"
  );


const PostgresOpenTelemetrySignalRepository =
  require(
    "../../persistence/postgres/PostgresOpenTelemetrySignalRepository"
  );


const backendRoot =
  path.resolve(
    __dirname,
    "../.."
  );


function context() {
  return {
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    tenantId:
      "aira-dev-org",

    integrationId:
      "00000000-0000-4000-8000-000000000001",
  };
}


function logPayload(
  body =
    "phase21-otel-test"
) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            {
              key:
                "service.name",

              value: {
                stringValue:
                  "phase21-fixture",
              },
            },
          ],
        },

        scopeLogs: [
          {
            scope: {
              name:
                "phase21-test",

              version:
                "1.0.0",
            },

            logRecords: [
              {
                timeUnixNano:
                  "1788163200000000000",

                severityText:
                  "INFO",

                body: {
                  stringValue:
                    body,
                },

                attributes: [
                  {
                    key:
                      "event.name",

                    value: {
                      stringValue:
                        "phase21.capacity",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}


describe(
  "Phase 21.10B-O OpenTelemetry PostgreSQL cutover",

  () => {
    test(
      "service source no longer imports mongoose compatibility persistence",

      () => {
        const source =
          fs.readFileSync(
            path.join(
              backendRoot,

              "services",
              "integrations",
              "opentelemetryIngestionService.js"
            ),

            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /mongooseCompat/
        );


        expect(
          source
        ).not.toMatch(
          /mongoose\.Schema/
        );


        expect(
          source
        ).not.toMatch(
          /OpenTelemetrySignal\s*\.\s*updateOne/
        );


        expect(
          source
        ).not.toMatch(
          /OpenTelemetrySignal\s*\.\s*find/
        );


        expect(
          source
        ).toMatch(
          /PostgresOpenTelemetrySignalRepository/
        );
      }
    );


    test(
      "migration creates tenant-scoped non-authorizing canonical table",

      () => {
        const migration =
          fs.readFileSync(
            path.join(
              backendRoot,

              "persistence",
              "postgres",
              "migrations",
              "0083_opentelemetry_signal_persistence.sql"
            ),

            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /integrations\.opentelemetry_signals/
        );


        expect(
          migration
        ).toMatch(
          /ENABLE ROW LEVEL SECURITY/
        );


        expect(
          migration
        ).toMatch(
          /FORCE ROW LEVEL SECURITY/
        );


        expect(
          migration
        ).toMatch(
          /tenancy\.current_organization_id\(\)/
        );


        expect(
          migration
        ).toMatch(
          /tenancy\.current_environment_id\(\)/
        );


        expect(
          migration
        ).toMatch(
          /execution_authorized\s*=\s*FALSE/i
        );
      }
    );


    test(
      "ingestion delegates normalized signal persistence to PostgreSQL repository",

      async () => {
        const repository = {
          insertIfAbsent:
            jest.fn(
              async ({
                signal,
              }) => ({
                inserted:
                  true,

                signal: {
                  ...signal,

                  id:
                    "signal-uuid",

                  executionAuthorized:
                    false,
                },

                executionAuthorized:
                  false,
              })
            ),
        };


        const service =
          new OpenTelemetryIngestionService({
            repository,
          });


        const result =
          await service.ingest(
            context(),

            logPayload()
          );


        expect(
          repository
            .insertIfAbsent
        ).toHaveBeenCalledTimes(
          1
        );


        const call =
          repository
            .insertIfAbsent
            .mock
            .calls[0][0];


        expect(
          call.organizationId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          call.environmentId
        ).toBe(
          "env_aira_development"
        );


        expect(
          call.tenantId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          call.signal
            .signalType
        ).toBe(
          "log"
        );


        expect(
          result.accepted
        ).toBe(
          1
        );


        expect(
          result.duplicates
        ).toBe(
          0
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "duplicate PostgreSQL signal remains idempotent",

      async () => {
        const repository = {
          insertIfAbsent:
            jest.fn(
              async () => ({
                inserted:
                  false,

                signal:
                  null,

                executionAuthorized:
                  false,
              })
            ),
        };


        const service =
          new OpenTelemetryIngestionService({
            repository,
          });


        const result =
          await service.ingest(
            context(),

            logPayload()
          );


        expect(
          result.accepted
        ).toBe(
          0
        );


        expect(
          result.duplicates
        ).toBe(
          1
        );
      }
    );


    test(
      "bounded signal queries delegate to PostgreSQL repository",

      async () => {
        const repository = {
          querySignals:
            jest.fn(
              async () => [
                {
                  signalType:
                    "metric",

                  executionAuthorized:
                    false,
                },
              ]
            ),
        };


        const service =
          new OpenTelemetryIngestionService({
            repository,
          });


        const result =
          await service.queryMetrics(
            context(),

            {
              serviceName:
                "phase21-fixture",

              limit:
                50,
            }
          );


        expect(
          repository
            .querySignals
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            tenantId:
              "aira-dev-org",

            signalType:
              "metric",

            serviceName:
              "phase21-fixture",

            limit:
              50,
          })
        );


        expect(
          result
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "PostgreSQL repository itself remains non-authorizing",

      () => {
        const source =
          fs.readFileSync(
            path.join(
              backendRoot,

              "persistence",
              "postgres",
              "PostgresOpenTelemetrySignalRepository.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toMatch(
          /executionAuthorized:\s*false/
        );


        expect(
          source
        ).toMatch(
          /ON CONFLICT/
        );


        expect(
          source
        ).toMatch(
          /DO NOTHING/
        );
      }
    );


    test(
      "repository class is loadable",

      () => {
        expect(
          typeof PostgresOpenTelemetrySignalRepository
        ).toBe(
          "function"
        );
      }
    );
  }
);
