"use strict";

const {
  ProviderRegistry,

  PROVIDER_RUNTIME_STATUS,

  PROVIDER_CERTIFICATION_STATUS,
} =
  require(
    "../../services/integrations/providerRegistry"
  );

const {
  IntegrationRuntime,

  validateAuthorizationProof,

  sanitizeResult,
} =
  require(
    "../../services/integrations/integrationRuntime"
  );

const {
  makeStubAdapter,
} =
  require(
    "../../services/integrations/adapterInterface"
  );

const {
  INTEGRATION_OPERATION,
} =
  require(
    "../../constants/integrationPlatform"
  );


function buildCatalogue() {
  return [
    {
      provider:
        "test_provider",

      displayName:
        "Test Provider",

      category:
        "test",

      description:
        "Phase 20 unit-test provider",

      capabilities: [
        "receive_events",
        "query_metrics",
        "get_health",
        "execute_capability",
      ],

      availabilityStatus:
        "available",

      documentationUrl:
        null,

      icon:
        null,

      configSchemaVersion:
        1,
    },

    {
      provider:
        "future_provider",

      displayName:
        "Future Provider",

      category:
        "test",

      description:
        "No adapter yet",

      capabilities: [
        "query_logs",
      ],

      availabilityStatus:
        "coming_soon",

      documentationUrl:
        null,

      icon:
        null,

      configSchemaVersion:
        1,
    },
  ];
}


function buildAdapter() {
  const adapter = {
    ...makeStubAdapter(
      "test_provider",
      [
        "receive_events",
        "query_metrics",
        "get_health",
        "execute_capability",
      ]
    ),


    async receiveEvent(
      connection,
      payload
    ) {
      return {
        provider:
          "test_provider",

        eventType:
          "alert.test",

        title:
          payload.title ||
          "Test",

        severity:
          "warning",

        receivedAt:
          new Date()
            .toISOString(),

        secretWasAvailable:
          Boolean(
            connection
              ._decryptedSecret
          ),
      };
    },


    async queryMetrics(
      connection,
      query
    ) {
      return {
        query:
          query.query,

        value:
          42,

        password:
          "must-not-leak",

        credentialAvailable:
          Boolean(
            connection
              ._decryptedSecret
          ),

        executionAuthorized:
          true,
      };
    },


    async getHealth() {
      return {
        status:
          "healthy",

        token:
          "must-not-leak",
      };
    },


    async executeCapability(
      _connection,
      request,
      metadata
    ) {
      return {
        capability:
          request.capability,

        performed:
          true,

        authorizationDecisionId:
          metadata
            .authorizationProof
            .decisionId,

        executionAuthorized:
          true,
      };
    },
  };


  return adapter;
}


function buildAdapterRegistry(
  adapter
) {
  return {
    hasAdapter:
      jest.fn(
        (
          provider
        ) =>
          provider ===
          "test_provider"
      ),


    getAdapter:
      jest.fn(
        (
          provider
        ) => {
          if (
            provider !==
            "test_provider"
          ) {
            throw new Error(
              "missing adapter"
            );
          }


          return adapter;
        }
      ),


    getAdapterCapabilities:
      jest.fn(
        (
          provider
        ) =>
          provider ===
            "test_provider"
            ? adapter
                .getCapabilities()
            : []
      ),
  };
}


function buildConnectionStore() {
  const connection = {
    id:
      "33333333-3333-3333-3333-333333333333",

    publicId:
      "int_conn_test",

    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    provider:
      "test_provider",

    name:
      "Test Integration",

    capabilities: [
      "receive_events",
      "query_metrics",
      "get_health",
      "execute_capability",
    ],

    status:
      "connected",

    healthStatus:
      "healthy",

    executionAuthorized:
      false,
  };


  return {
    getConnection:
      jest.fn(
        async (
          scope
        ) => {
          if (
            scope.publicId ===
            "int_conn_test"
          ) {
            return connection;
          }


          if (
            scope.connectionId ===
            connection.id
          ) {
            return connection;
          }


          return null;
        }
      ),


    resolveCredential:
      jest.fn(
        async () =>
          "super-secret"
      ),
  };
}


function buildRuntime() {
  const adapter =
    buildAdapter();


  const providerRegistry =
    new ProviderRegistry({
      catalogue:
        buildCatalogue(),

      adapterRegistry:
        buildAdapterRegistry(
          adapter
        ),
    });


  const connectionStore =
    buildConnectionStore();


  const runtime =
    new IntegrationRuntime({
      providerRegistry,

      connectionStore,

      defaultTimeoutMs:
        1000,

      randomUUID:
        () =>
          "runtime-test",

      now:
        (() => {
          const dates = [
            new Date(
              "2026-08-30T00:00:00.000Z"
            ),

            new Date(
              "2026-08-30T00:00:00.025Z"
            ),
          ];


          return () =>
            dates.shift() ||
            new Date(
              "2026-08-30T00:00:00.025Z"
            );
        })(),
    });


  return {
    runtime,

    providerRegistry,

    connectionStore,

    adapter,
  };
}


const CONTEXT = {
  organizationId:
    "aira-dev-org",

  environmentId:
    "env_aira_development",

  integrationId:
    "int_conn_test",

  provider:
    "test_provider",
};


describe(
  "Phase 20.6 Provider Registry v2",
  () => {
    test(
      "registry separates catalogue availability, adapter existence and certification",
      () => {
        const adapter =
          buildAdapter();


        const registry =
          new ProviderRegistry({
            catalogue:
              buildCatalogue(),

            adapterRegistry:
              buildAdapterRegistry(
                adapter
              ),
          });


        const provider =
          registry
            .getProvider(
              "test_provider"
            );


        expect(
          provider.runtimeStatus
        ).toBe(
          PROVIDER_RUNTIME_STATUS
            .REGISTERED
        );


        expect(
          provider.availabilityStatus
        ).toBe(
          "available"
        );


        expect(
          provider.certificationStatus
        ).toBe(
          PROVIDER_CERTIFICATION_STATUS
            .UNCERTIFIED
        );


        expect(
          provider.implemented
        ).toBe(
          true
        );


        expect(
          provider.certified
        ).toBe(
          false
        );


        expect(
          provider.production
        ).toBe(
          false
        );


        expect(
          provider.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "coming-soon provider can exist in catalogue without runtime adapter",
      () => {
        const registry =
          new ProviderRegistry({
            catalogue:
              buildCatalogue(),

            adapterRegistry:
              buildAdapterRegistry(
                buildAdapter()
              ),
          });


        const provider =
          registry
            .getProvider(
              "future_provider"
            );


        expect(
          provider.runtimeStatus
        ).toBe(
          PROVIDER_RUNTIME_STATUS
            .NOT_REGISTERED
        );


        expect(
          provider.availabilityStatus
        ).toBe(
          "coming_soon"
        );


        expect(
          provider.implemented
        ).toBe(
          false
        );
      }
    );


    test(
      "runtime capability requires actual adapter support",
      () => {
        const registry =
          new ProviderRegistry({
            catalogue:
              buildCatalogue(),

            adapterRegistry:
              buildAdapterRegistry(
                buildAdapter()
              ),
          });


        expect(
          registry
            .supportsRuntimeCapability(
              "test_provider",
              "query_metrics"
            )
        ).toBe(
          true
        );


        expect(
          registry
            .supportsRuntimeCapability(
              "test_provider",
              "query_logs"
            )
        ).toBe(
          false
        );
      }
    );


    test(
      "registry validates available provider/runtime capability agreement",
      () => {
        const registry =
          new ProviderRegistry({
            catalogue:
              buildCatalogue(),

            adapterRegistry:
              buildAdapterRegistry(
                buildAdapter()
              ),
          });


        const results =
          registry
            .assertRegistryValid();


        expect(
          results
            .every(
              (
                result
              ) =>
                result.valid
            )
        ).toBe(
          true
        );
      }
    );
  }
);


describe(
  "Phase 20.7 Integration Runtime",
  () => {
    test(
      "queryMetrics loads connection, resolves credential and returns canonical result",
      async () => {
        const {
          runtime,
          connectionStore,
        } =
          buildRuntime();


        const result =
          await runtime
            .queryMetrics(
              CONTEXT,
              {
                query:
                  "cpu_usage",
              }
            );


        expect(
          connectionStore
            .resolveCredential
        ).toHaveBeenCalledWith({
          organizationId:
            "aira-dev-org",

          environmentId:
            "env_aira_development",

          connectionId:
            "33333333-3333-3333-3333-333333333333",
        });


        expect(
          result.provider
        ).toBe(
          "test_provider"
        );


        expect(
          result.operation
        ).toBe(
          INTEGRATION_OPERATION
            .QUERY_METRICS
        );


        expect(
          result.data.query
        ).toBe(
          "cpu_usage"
        );


        expect(
          result.data.value
        ).toBe(
          42
        );


        expect(
          result.data.credentialAvailable
        ).toBe(
          true
        );


        expect(
          result.data.password
        ).toBe(
          "[REDACTED]"
        );


        expect(
          result.data.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.provenance
            .invocationId
        ).toBe(
          "int_inv_runtime-test"
        );


        expect(
          result.provenance
            .durationMs
        ).toBe(
          25
        );
      }
    );


    test(
      "receiveSignals falls back to existing receiveEvent adapter implementation",
      async () => {
        const {
          runtime,
        } =
          buildRuntime();


        const result =
          await runtime
            .receiveSignals(
              CONTEXT,
              {
                title:
                  "CPU high",
              },
              {
                "x-test":
                  "1",
              }
            );


        expect(
          result.operation
        ).toBe(
          INTEGRATION_OPERATION
            .RECEIVE_SIGNALS
        );


        expect(
          result.data.title
        ).toBe(
          "CPU high"
        );


        expect(
          result.data
            .secretWasAvailable
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "healthCheck falls back to existing getHealth adapter implementation",
      async () => {
        const {
          runtime,
        } =
          buildRuntime();


        const result =
          await runtime
            .healthCheck(
              CONTEXT
            );


        expect(
          result.data.status
        ).toBe(
          "healthy"
        );


        expect(
          result.data.token
        ).toBe(
          "[REDACTED]"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "provider mismatch is rejected",
      async () => {
        const {
          runtime,
        } =
          buildRuntime();


        await expect(
          runtime
            .queryMetrics(
              {
                ...CONTEXT,

                provider:
                  "other_provider",
              },
              {
                query:
                  "cpu",
              }
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_PROVIDER_CONNECTION_MISMATCH",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "disabled connection cannot be invoked",
      async () => {
        const {
          runtime,
          connectionStore,
        } =
          buildRuntime();


        connectionStore
          .getConnection
          .mockResolvedValue({
            id:
              "connection",

            publicId:
              "int_conn_test",

            provider:
              "test_provider",

            capabilities: [
              "query_metrics",
            ],

            status:
              "disabled",

            executionAuthorized:
              false,
          });


        await expect(
          runtime
            .queryMetrics(
              CONTEXT,
              {
                query:
                  "cpu",
              }
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_CONNECTION_DISABLED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "connection capability must be enabled even when adapter implements it",
      async () => {
        const {
          runtime,
          connectionStore,
        } =
          buildRuntime();


        connectionStore
          .getConnection
          .mockResolvedValue({
            id:
              "connection",

            publicId:
              "int_conn_test",

            provider:
              "test_provider",

            capabilities:
              [],

            status:
              "connected",

            executionAuthorized:
              false,
          });


        await expect(
          runtime
            .queryMetrics(
              CONTEXT,
              {
                query:
                  "cpu",
              }
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_CONNECTION_CAPABILITY_DISABLED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "executeCapability refuses requests without deterministic authorization proof",
      async () => {
        const {
          runtime,
        } =
          buildRuntime();


        await expect(
          runtime
            .executeCapability(
              CONTEXT,
              {
                capability:
                  "restart_service",
              },
              null
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_AUTHORIZATION_REQUIRED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "executeCapability accepts prior authorization proof but runtime result still cannot authorize",
      async () => {
        const {
          runtime,
        } =
          buildRuntime();


        const result =
          await runtime
            .executeCapability(
              CONTEXT,
              {
                capability:
                  "restart_service",
              },
              {
                authorized:
                  true,

                decisionId:
                  "decision-123",

                policyDecisionId:
                  "policy-456",
              }
            );


        expect(
          result.data.performed
        ).toBe(
          true
        );


        expect(
          result.data
            .authorizationDecisionId
        ).toBe(
          "decision-123"
        );


        expect(
          result.data
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "sanitization removes secret-shaped provider output",
      () => {
        const result =
          sanitizeResult({
            apiKey:
              "abc",

            nested: {
              password:
                "secret",

              value:
                123,
            },

            _decryptedSecret:
              "never-return",
          });


        expect(
          result.apiKey
        ).toBe(
          "[REDACTED]"
        );


        expect(
          result.nested.password
        ).toBe(
          "[REDACTED]"
        );


        expect(
          result.nested.value
        ).toBe(
          123
        );


        expect(
          result
        ).not.toHaveProperty(
          "_decryptedSecret"
        );
      }
    );


    test(
      "authorization proof validator is separate from ordinary invocation context",
      () => {
        expect(
          () =>
            validateAuthorizationProof({
              authorized:
                true,

              decisionId:
                "decision-1",
            })
        ).not.toThrow();


        expect(
          () =>
            validateAuthorizationProof({
              authorized:
                false,

              decisionId:
                "decision-1",
            })
        ).toThrow();
      }
    );
  }
);