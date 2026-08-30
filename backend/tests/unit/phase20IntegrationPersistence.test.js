"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const PostgresIntegrationConnectionRepository =
  require(
    "../../persistence/postgres/PostgresIntegrationConnectionRepository"
  );

const PostgresIntegrationCredentialRepository =
  require(
    "../../persistence/postgres/PostgresIntegrationCredentialRepository"
  );

const IntegrationConnectionStore =
  require(
    "../../services/integrations/integrationConnectionStore"
  );

const {
  IntegrationCredentialProvider,
} =
  require(
    "../../services/integrations/credentialProvider"
  );


function buildScope(
  queryHandler
) {
  return {
    run:
      jest.fn(
        async (
          _scope,
          work
        ) => {
          const client = {
            query:
              jest.fn(
                queryHandler
              ),
          };


          return work(
            client,
            {
              organizationUuid:
                "11111111-1111-1111-1111-111111111111",

              environmentUuid:
                "22222222-2222-2222-2222-222222222222",
            }
          );
        }
      ),
  };
}


describe(
  "Phase 20.3-20.5 PostgreSQL integration persistence",
  () => {
    test(
      "0079 creates canonical PostgreSQL integration tables with RLS and never-authorize constraints",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              __dirname,
              "../../persistence/postgres/migrations/0079_integration_platform_foundation.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toMatch(
          /CREATE TABLE IF NOT EXISTS integrations\.connections/i
        );


        expect(
          migration
        ).toMatch(
          /CREATE TABLE IF NOT EXISTS integrations\.credential_references/i
        );


        expect(
          migration
        ).toMatch(
          /integrations_connections_never_authorize/i
        );


        expect(
          migration
        ).toMatch(
          /integrations_credential_never_authorize/i
        );


        expect(
          migration
        ).toMatch(
          /ALTER TABLE[\s\S]*integrations\.connections[\s\S]*FORCE ROW LEVEL SECURITY/i
        );


        expect(
          migration
        ).toMatch(
          /ALTER TABLE[\s\S]*integrations\.credential_references[\s\S]*FORCE ROW LEVEL SECURITY/i
        );
      }
    );


    test(
      "connection repository creates PostgreSQL canonical connection and never returns execution authority",
      async () => {
        const row = {
          id:
            "33333333-3333-3333-3333-333333333333",

          public_id:
            "int_conn_test",

          organization_id:
            "11111111-1111-1111-1111-111111111111",

          environment_id:
            "22222222-2222-2222-2222-222222222222",

          provider:
            "kubernetes",

          name:
            "Production Cluster",

          external_account_id:
            null,

          service_ids:
            [],

          capabilities:
            [
              "discover_resources",
            ],

          non_secret_config:
            {},

          status:
            "draft",

          health_status:
            "unknown",

          connected_at:
            null,

          disconnected_at:
            null,

          disabled_at:
            null,

          disabled_reason:
            null,

          last_health_check_at:
            null,

          last_event_at:
            null,

          last_successful_event_at:
            null,

          last_error_at:
            null,

          error_summary:
            null,

          consecutive_failures:
            0,

          last_latency_ms:
            null,

          created_by_user_id:
            null,

          updated_by_user_id:
            null,

          metadata:
            {},

          execution_authorized:
            false,

          created_at:
            new Date(),

          updated_at:
            new Date(),
        };


        const repository =
          new PostgresIntegrationConnectionRepository({
            scope:
              buildScope(
                async () => ({
                  rows:
                    [
                      row,
                    ],

                  rowCount:
                    1,
                })
              ),
          });


        const connection =
          await repository
            .createConnection({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              provider:
                "Kubernetes",

              name:
                "Production Cluster",

              capabilities:
                [
                  "discover_resources",
                ],
            });


        expect(
          connection.provider
        ).toBe(
          "kubernetes"
        );


        expect(
          connection.executionAuthorized
        ).toBe(
          false
        );


        expect(
          connection
        ).not.toHaveProperty(
          "encryptedSecretReference"
        );
      }
    );


    test(
      "safe credential metadata never exposes reference_value",
      async () => {
        const repository =
          new PostgresIntegrationCredentialRepository({
            scope:
              buildScope(
                async (
                  sql
                ) => {
                  if (
                    String(
                      sql
                    ).includes(
                      "FROM\n          integrations.connections"
                    )
                  ) {
                    return {
                      rows: [
                        {
                          id:
                            "33333333-3333-3333-3333-333333333333",

                          organization_id:
                            "11111111-1111-1111-1111-111111111111",

                          environment_id:
                            "22222222-2222-2222-2222-222222222222",
                        },
                      ],
                    };
                  }


                  return {
                    rows: [
                      {
                        id:
                          "44444444-4444-4444-4444-444444444444",

                        public_id:
                          "int_cred_test",

                        organization_id:
                          "11111111-1111-1111-1111-111111111111",

                        environment_id:
                          "22222222-2222-2222-2222-222222222222",

                        connection_id:
                          "33333333-3333-3333-3333-333333333333",

                        provider_type:
                          "local_encrypted",

                        secret_version:
                          "v1",

                        status:
                          "active",

                        rotated_at:
                          new Date(),

                        revoked_at:
                          null,

                        metadata:
                          {},

                        execution_authorized:
                          false,

                        created_at:
                          new Date(),

                        updated_at:
                          new Date(),
                      },
                    ],
                  };
                }
              ),
          });


        const result =
          await repository
            .upsertCredentialReference({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              connectionId:
                "33333333-3333-3333-3333-333333333333",

              referenceValue:
                "encrypted-value",

              secretVersion:
                "v1",
            });


        expect(
          result.hasCredential
        ).toBe(
          true
        );


        expect(
          result
        ).not.toHaveProperty(
          "referenceValue"
        );


        expect(
          result
        ).not.toHaveProperty(
          "reference_value"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "local credential provider encrypts and resolves secret without granting authorization",
      async () => {
        const provider =
          new IntegrationCredentialProvider();


        const reference =
          await provider
            .createReference(
              "phase20-secret"
            );


        expect(
          reference.providerType
        ).toBe(
          "local_encrypted"
        );


        expect(
          reference.referenceValue
        ).not.toBe(
          "phase20-secret"
        );


        expect(
          reference.executionAuthorized
        ).toBe(
          false
        );


        const resolved =
          await provider
            .resolveReference(
              reference
            );


        expect(
          resolved
        ).toBe(
          "phase20-secret"
        );
      }
    );


    test(
      "connection store uses PostgreSQL repositories rather than Mongoose model",
      async () => {
        const connectionRepository = {
          createConnection:
            jest.fn(
              async () => ({
                id:
                  "connection-1",

                publicId:
                  "int_conn_1",

                provider:
                  "prometheus",

                executionAuthorized:
                  false,
              })
            ),
        };


        const credentialRepository = {
          upsertCredentialReference:
            jest.fn(
              async () => ({
                publicId:
                  "int_cred_1",

                hasCredential:
                  true,

                executionAuthorized:
                  false,
              })
            ),
        };


        const credentialProvider = {
          createReference:
            jest.fn(
              async () => ({
                providerType:
                  "local_encrypted",

                referenceValue:
                  "encrypted",

                secretVersion:
                  "v1",

                executionAuthorized:
                  false,
              })
            ),
        };


        const store =
          new IntegrationConnectionStore({
            connectionRepository,

            credentialRepository,

            credentialProvider,
          });


        const result =
          await store
            .createConnection({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              provider:
                "prometheus",

              name:
                "Prometheus",

              secret:
                "secret",
            });


        expect(
          connectionRepository
            .createConnection
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          credentialRepository
            .upsertCredentialReference
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "Phase 20 store has no dependency on legacy IntegrationConnection mongoose model",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "../../services/integrations/integrationConnectionStore.js"
            ),
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /models\/IntegrationConnection/
        );


        expect(
          source
        ).toMatch(
          /PostgresIntegrationConnectionRepository/
        );
      }
    );
  }
);