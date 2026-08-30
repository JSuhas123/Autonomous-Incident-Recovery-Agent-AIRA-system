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
  IntegrationResilienceService,

  isRetryableOperation,

  isRetryableError,
} =
  require(
    "../../services/integrations/integrationResilienceService"
  );

const {
  IntegrationRuntimeGovernance,
} =
  require(
    "../../services/integrations/integrationRuntimeGovernance"
  );

const {
  sanitizeIntegrationValue,
} =
  require(
    "../../services/integrations/integrationSecurity"
  );

const PostgresIntegrationInvocationAuditRepository =
  require(
    "../../persistence/postgres/PostgresIntegrationInvocationAuditRepository"
  );


describe(
  "Phase 20.14 Integration Reliability",
  () => {
    test(
      "read-oriented evidence query operations are retryable",
      () => {
        expect(
          isRetryableOperation(
            "queryMetrics"
          )
        ).toBe(
          true
        );


        expect(
          isRetryableOperation(
            "queryLogs"
          )
        ).toBe(
          true
        );


        expect(
          isRetryableOperation(
            "healthCheck"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "executeCapability is never automatically retried",
      () => {
        expect(
          isRetryableOperation(
            "executeCapability"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "sendNotification and receiveSignals are not automatically retried",
      () => {
        expect(
          isRetryableOperation(
            "sendNotification"
          )
        ).toBe(
          false
        );


        expect(
          isRetryableOperation(
            "receiveSignals"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "transient network/provider failures are retryable",
      () => {
        expect(
          isRetryableError({
            code:
              "ECONNRESET",
          })
        ).toBe(
          true
        );


        expect(
          isRetryableError({
            status:
              503,
          })
        ).toBe(
          true
        );


        expect(
          isRetryableError({
            code:
              "INTEGRATION_TIMEOUT",
          })
        ).toBe(
          true
        );
      }
    );


    test(
      "query retries are bounded and eventually succeed",
      async () => {
        let calls =
          0;


        const service =
          new IntegrationResilienceService({
            maxIntegrationAttempts:
              3,

            sleep:
              async () => {},
          });


        const result =
          await service
            .execute({
              operation:
                "queryMetrics",

              connection: {
                consecutiveFailures:
                  0,
              },

              invoke:
                async () => {
                  calls +=
                    1;


                  if (
                    calls <
                    3
                  ) {
                    throw Object.assign(
                      new Error(
                        "temporary failure"
                      ),
                      {
                        code:
                          "ECONNRESET",
                      }
                    );
                  }


                  return {
                    ok:
                      true,
                  };
                },
            });


        expect(
          calls
        ).toBe(
          3
        );


        expect(
          result.attemptCount
        ).toBe(
          3
        );


        expect(
          result.value.ok
        ).toBe(
          true
        );
      }
    );


    test(
      "execution side effect gets only one provider attempt",
      async () => {
        let calls =
          0;


        const service =
          new IntegrationResilienceService({
            maxIntegrationAttempts:
              3,

            sleep:
              async () => {},
          });


        await expect(
          service
            .execute({
              operation:
                "executeCapability",

              connection: {
                consecutiveFailures:
                  0,
              },

              invoke:
                async () => {
                  calls +=
                    1;


                  throw Object.assign(
                    new Error(
                      "network lost"
                    ),
                    {
                      code:
                        "ECONNRESET",
                    }
                  );
                },
            })
        ).rejects
          .toMatchObject({
            code:
              "ECONNRESET",
          });


        expect(
          calls
        ).toBe(
          1
        );
      }
    );


    test(
      "circuit opens after persisted failure threshold",
      async () => {
        const service =
          new IntegrationResilienceService({
            integrationCircuitFailureThreshold:
              3,

            integrationCircuitCooldownMs:
              60_000,

            now:
              () =>
                new Date(
                  "2026-08-30T01:00:00.000Z"
                ),
          });


        await expect(
          service
            .execute({
              operation:
                "queryMetrics",

              connection: {
                consecutiveFailures:
                  3,

                lastErrorAt:
                  "2026-08-30T00:59:30.000Z",
              },

              invoke:
                jest.fn(),
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_CIRCUIT_OPEN",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "healthCheck remains allowed as recovery probe while circuit is open",
      async () => {
        const service =
          new IntegrationResilienceService({
            now:
              () =>
                new Date(
                  "2026-08-30T01:00:00.000Z"
                ),

            sleep:
              async () => {},
          });


        const result =
          await service
            .execute({
              operation:
                "healthCheck",

              connection: {
                consecutiveFailures:
                  100,

                lastErrorAt:
                  "2026-08-30T00:59:59.000Z",
              },

              invoke:
                async () => ({
                  healthy:
                    true,
                }),
            });


        expect(
          result.value.healthy
        ).toBe(
          true
        );
      }
    );


    test(
      "successful operation resets persisted connection failure state",
      async () => {
        const connectionStore = {
          updateConnection:
            jest.fn(
              async (
                input
              ) =>
                input
            ),
        };


        const service =
          new IntegrationResilienceService({
            connectionStore,

            now:
              () =>
                new Date(
                  "2026-08-30T01:00:00.000Z"
                ),
          });


        await service
          .recordSuccess({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            connection: {
              id:
                "connection-uuid",

              status:
                "degraded",

              metadata:
                {},
            },

            operation:
              "queryMetrics",

            durationMs:
              20,
          });


        const patch =
          connectionStore
            .updateConnection
            .mock
            .calls[0][0]
            .patch;


        expect(
          patch.healthStatus
        ).toBe(
          "healthy"
        );


        expect(
          patch.status
        ).toBe(
          "connected"
        );


        expect(
          patch.consecutiveFailures
        ).toBe(
          0
        );


        expect(
          patch.metadata
            .resilience
            .circuitState
        ).toBe(
          "CLOSED"
        );
      }
    );


    test(
      "repeated failure persists unhealthy/open state",
      async () => {
        const connectionStore = {
          updateConnection:
            jest.fn(
              async (
                input
              ) =>
                input
            ),
        };


        const service =
          new IntegrationResilienceService({
            connectionStore,

            integrationCircuitFailureThreshold:
              3,

            now:
              () =>
                new Date(
                  "2026-08-30T01:00:00.000Z"
                ),
          });


        await service
          .recordFailure({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            connection: {
              id:
                "connection-uuid",

              status:
                "connected",

              consecutiveFailures:
                2,

              metadata:
                {},
            },

            operation:
              "queryMetrics",

            durationMs:
              50,

            error:
              new Error(
                "provider unavailable"
              ),
          });


        const patch =
          connectionStore
            .updateConnection
            .mock
            .calls[0][0]
            .patch;


        expect(
          patch.consecutiveFailures
        ).toBe(
          3
        );


        expect(
          patch.healthStatus
        ).toBe(
          "unhealthy"
        );


        expect(
          patch.status
        ).toBe(
          "degraded"
        );


        expect(
          patch.metadata
            .resilience
            .circuitState
        ).toBe(
          "OPEN"
        );
      }
    );
  }
);


describe(
  "Phase 20.15 Governance and Security",
  () => {
    test(
      "disabled governance blocks runtime invocation",
      async () => {
        const governance =
          new IntegrationRuntimeGovernance({
            getGovernance:
              async () => ({
                enabled:
                  false,
              }),
          });


        await expect(
          governance
            .assertAllowed({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env",

              integrationId:
                "int_1",

              provider:
                "datadog",

              operation:
                "queryMetrics",

              capability:
                "query_metrics",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_DISABLED_BY_GOVERNANCE",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "query governance flag is enforced",
      async () => {
        const governance =
          new IntegrationRuntimeGovernance({
            getGovernance:
              async () => ({
                enabled:
                  true,

                allow_queries:
                  false,

                allowed_capabilities:
                  [],

                denied_capabilities:
                  [],
              }),
          });


        await expect(
          governance
            .assertAllowed({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env",

              integrationId:
                "int_1",

              provider:
                "datadog",

              operation:
                "queryMetrics",

              capability:
                "query_metrics",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_QUERY_BLOCKED",
          });
      }
    );


    test(
      "execution requires explicit governance row",
      async () => {
        const governance =
          new IntegrationRuntimeGovernance({
            getGovernance:
              async () =>
                null,
          });


        await expect(
          governance
            .assertAllowed({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env",

              integrationId:
                "int_exec",

              provider:
                "kubernetes",

              operation:
                "executeCapability",

              capability:
                "execute_capability",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_GOVERNANCE_REQUIRED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "allow_execution false blocks even previously authorized execution",
      async () => {
        const governance =
          new IntegrationRuntimeGovernance({
            getGovernance:
              async () => ({
                enabled:
                  true,

                allow_execution:
                  false,

                allowed_capabilities: [
                  "execute_capability",
                ],

                denied_capabilities:
                  [],
              }),
          });


        await expect(
          governance
            .assertAllowed({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env",

              integrationId:
                "int_exec",

              provider:
                "kubernetes",

              operation:
                "executeCapability",

              capability:
                "execute_capability",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_BLOCKED_BY_GOVERNANCE",
          });
      }
    );


    test(
      "denied capability overrides integration capability presence",
      async () => {
        const governance =
          new IntegrationRuntimeGovernance({
            getGovernance:
              async () => ({
                enabled:
                  true,

                allow_queries:
                  true,

                allowed_capabilities:
                  [],

                denied_capabilities: [
                  "query_metrics",
                ],
              }),
          });


        await expect(
          governance
            .assertAllowed({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env",

              integrationId:
                "int_1",

              provider:
                "datadog",

              operation:
                "queryMetrics",

              capability:
                "query_metrics",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_CAPABILITY_DENIED",
          });
      }
    );


    test(
      "credential access disabled prevents runtime secret resolution",
      async () => {
        const governance =
          new IntegrationRuntimeGovernance({
            getGovernance:
              async () => ({
                enabled:
                  true,

                credential_access_mode:
                  "disabled",
              }),
          });


        await expect(
          governance
            .assertCredentialAccess({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env",

              integrationId:
                "int_1",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_CREDENTIAL_ACCESS_DISABLED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "central sanitizer removes runtime decrypted secret and redacts credentials",
      () => {
        const safe =
          sanitizeIntegrationValue({
            _decryptedSecret:
              "must-disappear",

            password:
              "hide",

            apiKey:
              "hide",

            credentialAvailable:
              true,

            authorizationDecisionId:
              "decision-123",

            nested: {
              accessToken:
                "hide",

              secretWasAvailable:
                true,
            },
          });


        expect(
          safe
            ._decryptedSecret
        ).toBeUndefined();


        expect(
          safe.password
        ).toBe(
          "[REDACTED]"
        );


        expect(
          safe.apiKey
        ).toBe(
          "[REDACTED]"
        );


        expect(
          safe
            .credentialAvailable
        ).toBe(
          true
        );


        expect(
          safe
            .authorizationDecisionId
        ).toBe(
          "decision-123"
        );


        expect(
          safe.nested
            .accessToken
        ).toBe(
          "[REDACTED]"
        );


        expect(
          safe.nested
            .secretWasAvailable
        ).toBe(
          true
        );
      }
    );


    test(
      "invocation audit repository uses tenant scope and never authorizes",
      async () => {
        const scope = {
          run:
            jest.fn(
              async (
                requestedScope,
                work
              ) => {
                const client = {
                  query:
                    jest.fn(
                      async (
                        sql
                      ) => {
                        expect(
                          sql
                        ).toContain(
                          "integrations.invocation_audit"
                        );


                        return {
                          rows: [
                            {
                              id:
                                "audit-uuid",

                              invocation_id:
                                "int_inv_1",

                              organization_id:
                                "org-uuid",

                              environment_id:
                                "env-uuid",

                              connection_id:
                                "connection-uuid",

                              integration_public_id:
                                "int_1",

                              provider:
                                "datadog",

                              operation:
                                "queryMetrics",

                              capability:
                                "query_metrics",

                              outcome:
                                "SUCCESS",

                              attempt_count:
                                1,

                              duration_ms:
                                25,

                              error_code:
                                null,

                              authorization_id:
                                null,

                              execution_request_id:
                                null,

                              metadata:
                                {},

                              execution_authorized:
                                false,

                              created_at:
                                new Date(),
                            },
                          ],
                        };
                      }
                    ),
                };


                return work(
                  client,
                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",
                  }
                );
              }
            ),
        };


        const repository =
          new PostgresIntegrationInvocationAuditRepository({
            scope,
          });


        const result =
          await repository
            .append({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              invocationId:
                "int_inv_1",

              connectionId:
                "connection-uuid",

              integrationPublicId:
                "int_1",

              provider:
                "datadog",

              operation:
                "queryMetrics",

              capability:
                "query_metrics",

              outcome:
                "SUCCESS",

              metadata: {
                password:
                  "must-redact",
              },
            });


        expect(
          scope.run
        ).toHaveBeenCalledWith(
          {
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",
          },

          expect.any(
            Function
          ),

          null
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "migration defines append-only audit, RLS and never-authorize constraint",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              __dirname,
              "../../persistence/postgres/migrations/0080_integration_runtime_audit.sql"
            ),
            "utf8"
          );


        expect(
          migration
        ).toContain(
          "integrations.invocation_audit"
        );


        expect(
          migration
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );


        expect(
          migration
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          migration
        ).toContain(
          "integration invocation audit is append-only"
        );


        expect(
          migration
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );
  }
);