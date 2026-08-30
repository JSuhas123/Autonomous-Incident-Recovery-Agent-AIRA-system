"use strict";

const {
  CATALOGUE,

  INTEGRATION_CAPABILITIES,

  validateCatalogue,
} =
  require(
    "../../config/integrationCatalogue"
  );

const {
  INTEGRATION_CAPABILITIES:
    SHARED_CAPABILITIES,
} =
  require(
    "../../constants/integrationPlatform"
  );

const {
  ProviderRegistry,

  PROVIDER_CERTIFICATION_STATUS,

  resolveProviderGroup,
} =
  require(
    "../../services/integrations/providerRegistry"
  );

const {
  IntegrationControlPlaneService,

  validateRequestedCapabilities,

  summarizeProviders,
} =
  require(
    "../../services/integrations/integrationControlPlaneService"
  );


describe(
  "Phase 20.17 Provider catalogue reconciliation",
  () => {
    test(
      "catalogue uses canonical shared Phase 20 capabilities",
      () => {
        expect(
          INTEGRATION_CAPABILITIES
        ).toBe(
          SHARED_CAPABILITIES
        );


        expect(
          INTEGRATION_CAPABILITIES
        ).toContain(
          "discover_relationships"
        );


        expect(
          INTEGRATION_CAPABILITIES
        ).toContain(
          "get_changes"
        );


        expect(
          INTEGRATION_CAPABILITIES
        ).toContain(
          "execute_capability"
        );
      }
    );


    test(
      "frozen product catalogue contains exactly 33 options",
      () => {
        expect(
          CATALOGUE
        ).toHaveLength(
          33
        );
      }
    );


    test(
      "catalogue contains Tekton and Terraform",
      () => {
        expect(
          CATALOGUE.some(
            (
              entry
            ) =>
              entry.provider ===
              "tekton"
          )
        ).toBe(
          true
        );


        expect(
          CATALOGUE.some(
            (
              entry
            ) =>
              entry.provider ===
              "terraform"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "Discord is not part of frozen enterprise catalogue",
      () => {
        expect(
          CATALOGUE.some(
            (
              entry
            ) =>
              entry.provider ===
              "discord"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "catalogue remains structurally valid",
      () => {
        const result =
          validateCatalogue();


        expect(
          result.valid
        ).toBe(
          true
        );


        expect(
          result.providerCount
        ).toBe(
          33
        );
      }
    );


    test(
      "provider group maps catalogue categories to frozen Phase 20 groups",
      () => {
        expect(
          resolveProviderGroup(
            "monitoring_alerting"
          )
        ).toBe(
          "OBSERVABILITY"
        );


        expect(
          resolveProviderGroup(
            "developer_tools"
          )
        ).toBe(
          "CI_CD"
        );


        expect(
          resolveProviderGroup(
            "databases_queues"
          )
        ).toBe(
          "DATA"
        );


        expect(
          resolveProviderGroup(
            "infrastructure"
          )
        ).toBe(
          "INFRA"
        );
      }
    );


    test(
      "adapter implementation remains distinct from provider certification",
      () => {
        const registry =
          new ProviderRegistry({
            catalogue: [
              {
                provider:
                  "test_provider",

                displayName:
                  "Test",

                category:
                  "custom",

                description:
                  "test",

                documentationUrl:
                  null,

                icon:
                  null,

                configSchemaVersion:
                  1,

                availabilityStatus:
                  "beta",

                capabilities: [
                  "get_health",
                ],
              },
            ],

            adapterRegistry: {
              hasAdapter:
                () =>
                  true,

              getAdapterCapabilities:
                () => [
                  "get_health",
                ],

              getAdapter:
                () => ({
                  provider:
                    "test_provider",
                }),
            },
          });


        const provider =
          registry.getProvider(
            "test_provider"
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
          provider.certificationStatus
        ).toBe(
          PROVIDER_CERTIFICATION_STATUS
            .UNCERTIFIED
        );
      }
    );
  }
);


describe(
  "Phase 20.16 Integration control plane",
  () => {
    function buildService() {
      const connection = {
        id:
          "connection-uuid",

        publicId:
          "int_123",

        provider:
          "datadog",

        name:
          "Datadog Production",

        externalAccountId:
          null,

        serviceIds:
          [],

        capabilities: [
          "query_metrics",
        ],

        nonSecretConfig: {
          site:
            "datadoghq.com",
        },

        status:
          "draft",

        healthStatus:
          "unknown",

        consecutiveFailures:
          0,

        metadata:
          {},

        executionAuthorized:
          false,
      };


      const connectionStore = {
        createConnection:
          jest.fn(
            async () =>
              connection
          ),

        getConnection:
          jest.fn(
            async () =>
              connection
          ),

        listConnections:
          jest.fn(
            async () => [
              connection,
            ]
          ),

        updateConnection:
          jest.fn(
            async (
              input
            ) => ({
              ...connection,

              ...input.patch,
            })
          ),

        getCredentialMetadata:
          jest.fn(
            async () => ({
              providerType:
                "local_encrypted",

              secretVersion:
                "v1",

              status:
                "active",

              rotatedAt:
                null,

              revokedAt:
                null,

              executionAuthorized:
                false,
            })
          ),

        rotateCredential:
          jest.fn(
            async () => ({
              status:
                "active",
            })
          ),

        revokeCredential:
          jest.fn(
            async () => ({
              status:
                "revoked",
            })
          ),

        deleteConnection:
          jest.fn(
            async () =>
              true
          ),
      };


      const providerRegistry = {
        requireProvider:
          jest.fn(
            () => ({
              provider:
                "datadog",

              configSchemaVersion:
                1,

              runtimeStatus:
                "REGISTERED",

              declaredCapabilities: [
                "query_metrics",
              ],

              runtimeCapabilities: [
                "query_metrics",
              ],

              executionAuthorized:
                false,
            })
          ),

        getProvider:
          jest.fn(
            () => ({
              provider:
                "datadog",

              runtimeStatus:
                "REGISTERED",

              certificationStatus:
                "UNCERTIFIED",

              implemented:
                true,

              certified:
                false,

              production:
                false,

              executionAuthorized:
                false,
            })
          ),

        listProviders:
          jest.fn(
            () => [
              {
                provider:
                  "datadog",

                availabilityStatus:
                  "beta",

                implemented:
                  true,

                certified:
                  false,

                production:
                  false,

                executionAuthorized:
                  false,
              },
            ]
          ),
      };


      const upsertGovernance =
        jest.fn(
          async () => ({
            enabled:
              true,

            allow_execution:
              false,
          })
        );


      const getGovernance =
        jest.fn(
          async () => ({
            enabled:
              true,

            allow_execution:
              false,
          })
        );


      const runtime = {
        healthCheck:
          jest.fn(
            async () => ({
              status:
                "SUCCESS",

              executionAuthorized:
                false,
            })
          ),
      };


      const auditRepository = {
        list:
          jest.fn(
            async () => [
              {
                invocationId:
                  "inv_1",

                outcome:
                  "SUCCESS",

                executionAuthorized:
                  false,
              },
            ]
          ),
      };


      return {
        service:
          new IntegrationControlPlaneService({
            connectionStore,

            providerRegistry,

            upsertGovernance,

            getGovernance,

            runtime,

            auditRepository,
          }),

        connectionStore,

        providerRegistry,

        upsertGovernance,

        runtime,

        auditRepository,
      };
    }


    test(
      "new connection defaults governance allow_execution to false",
      async () => {
        const {
          service,
          upsertGovernance,
        } =
          buildService();


        await service
          .createConnection({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            actorUserId:
              "user-uuid",

            provider:
              "datadog",

            name:
              "Datadog Production",

            capabilities: [
              "query_metrics",
            ],
          });


        expect(
          upsertGovernance
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            settings:
              expect.objectContaining({
                allowExecution:
                  false,
              }),
          })
        );
      }
    );


    test(
      "connection serialization exposes credential metadata but never secret material",
      async () => {
        const {
          service,
        } =
          buildService();


        const result =
          await service
            .getConnection({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              integrationId:
                "int_123",
            });


        expect(
          result.credential
            .configured
        ).toBe(
          true
        );


        expect(
          result.credential
            .secretVersion
        ).toBe(
          "v1"
        );


        expect(
          JSON.stringify(
            result
          )
        ).not.toContain(
          "referenceValue"
        );


        expect(
          JSON.stringify(
            result
          )
        ).not.toContain(
          "_decryptedSecret"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "unimplemented provider cannot create live connection",
      async () => {
        const {
          service,
          providerRegistry,
        } =
          buildService();


        providerRegistry
          .requireProvider
          .mockReturnValue({
            provider:
              "terraform",

            runtimeStatus:
              "NOT_REGISTERED",

            declaredCapabilities: [
              "discover_resources",
            ],

            runtimeCapabilities:
              [],

            configSchemaVersion:
              1,
          });


        await expect(
          service
            .createConnection({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              provider:
                "terraform",

              name:
                "Terraform",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_PROVIDER_NOT_IMPLEMENTED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "requested capabilities must exist in actual runtime adapter",
      () => {
        expect(
          () =>
            validateRequestedCapabilities(
              [
                "execute_capability",
              ],

              {
                provider:
                  "datadog",

                declaredCapabilities: [
                  "execute_capability",
                ],

                runtimeCapabilities:
                  [],
              }
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "INTEGRATION_CAPABILITY_NOT_IMPLEMENTED",
          })
        );
      }
    );


    test(
      "health check routes through IntegrationRuntime",
      async () => {
        const {
          service,
          runtime,
        } =
          buildService();


        const result =
          await service
            .healthCheck({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              integrationId:
                "int_123",
            });


        expect(
          runtime.healthCheck
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            integrationId:
              "int_123",

            provider:
              "datadog",

            executionAuthorized:
              false,
          })
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "invocation audit is exposed through tenant-scoped canonical repository",
      async () => {
        const {
          service,
          auditRepository,
        } =
          buildService();


        const result =
          await service
            .listInvocationAudit({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              integrationId:
                "int_123",
            });


        expect(
          auditRepository.list
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            integrationPublicId:
              "int_123",
          })
        );


        expect(
          result.audit
        ).toHaveLength(
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
      "provider catalogue summary separates implementation certification and production",
      () => {
        const summary =
          summarizeProviders([
            {
              availabilityStatus:
                "available",

              implemented:
                true,

              certified:
                true,

              production:
                true,
            },

            {
              availabilityStatus:
                "beta",

              implemented:
                true,

              certified:
                false,

              production:
                false,
            },

            {
              availabilityStatus:
                "coming_soon",

              implemented:
                false,

              certified:
                false,

              production:
                false,
            },
          ]);


        expect(
          summary.total
        ).toBe(
          3
        );


        expect(
          summary.implemented
        ).toBe(
          2
        );


        expect(
          summary.certified
        ).toBe(
          1
        );


        expect(
          summary.production
        ).toBe(
          1
        );


        expect(
          summary.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);