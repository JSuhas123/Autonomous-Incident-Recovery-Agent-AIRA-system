"use strict";


const {
  INTEGRATION_SDK_VERSION,

  INTEGRATION_CAPABILITY,

  INTEGRATION_CAPABILITIES,

  INTEGRATION_OPERATION,

  INTEGRATION_OPERATION_CAPABILITY_MAP,

  CANONICAL_INTEGRATION_AUTHORITIES,
} =
  require(
    "../../constants/integrationPlatform"
  );


const {
  PHASE_20_ARCHITECTURE_CONTRACT,

  PHASE_20_INVARIANTS,

  validatePhase20ArchitectureContract,

  validateIntegrationInvocationContext,

  createIntegrationResult,

  validateIntegrationResult,

  capabilityForOperation,
} =
  require(
    "../../contracts/integrations"
  );


const {
  makeStubAdapter,

  validateAdapterContract,

  UnsupportedOperationError,
} =
  require(
    "../../services/integrations/adapterInterface"
  );


describe(
  "Phase 20.0-20.2 Integration Platform contracts",
  () => {
    test(
      "architecture contract preserves canonical subsystem ownership",
      () => {
        const result =
          validatePhase20ArchitectureContract();


        expect(
          result
        ).toEqual({
          valid:
            true,

          errors:
            [],
        });


        expect(
          PHASE_20_ARCHITECTURE_CONTRACT
            .phase
        ).toBe(
          20
        );


        expect(
          CANONICAL_INTEGRATION_AUTHORITIES
            .CONNECTIONS
        ).toBe(
          "POSTGRESQL"
        );


        expect(
          CANONICAL_INTEGRATION_AUTHORITIES
            .RESOURCE_TRUTH
        ).toBe(
          "PHASE_17_RESOURCE_GRAPH"
        );


        expect(
          PHASE_20_ARCHITECTURE_CONTRACT
            .telemetryWarehouse
        ).toBe(
          false
        );


        expect(
          PHASE_20_ARCHITECTURE_CONTRACT
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          PHASE_20_INVARIANTS
            .length
        ).toBeGreaterThanOrEqual(
          25
        );
      }
    );


    test(
      "SDK exposes the frozen Phase 20 provider operations",
      () => {
        expect(
          Object.values(
            INTEGRATION_OPERATION
          )
        ).toEqual(
          expect.arrayContaining([
            "receiveSignals",

            "queryMetrics",

            "queryLogs",

            "queryTraces",

            "discoverResources",

            "discoverRelationships",

            "getChanges",

            "executeCapability",

            "sendNotification",

            "healthCheck",
          ])
        );
      }
    );


    test(
      "new discovery change and execution capability tokens are canonical",
      () => {
        expect(
          INTEGRATION_CAPABILITIES
        ).toEqual(
          expect.arrayContaining([
            INTEGRATION_CAPABILITY
              .DISCOVER_RELATIONSHIPS,

            INTEGRATION_CAPABILITY
              .GET_CHANGES,

            INTEGRATION_CAPABILITY
              .EXECUTE_CAPABILITY,
          ])
        );


        expect(
          capabilityForOperation(
            "discoverRelationships"
          )
        ).toBe(
          "discover_relationships"
        );


        expect(
          capabilityForOperation(
            "getChanges"
          )
        ).toBe(
          "get_changes"
        );


        expect(
          capabilityForOperation(
            "executeCapability"
          )
        ).toBe(
          "execute_capability"
        );
      }
    );


    test(
      "invocation context cannot grant execution authority",
      () => {
        const valid =
          validateIntegrationInvocationContext({
            organizationId:
              "org",

            environmentId:
              "env",

            integrationId:
              "integration",

            provider:
              "kubernetes",

            executionAuthorized:
              false,
          });


        expect(
          valid.valid
        ).toBe(
          true
        );


        const invalid =
          validateIntegrationInvocationContext({
            organizationId:
              "org",

            environmentId:
              "env",

            integrationId:
              "integration",

            provider:
              "kubernetes",

            executionAuthorized:
              true,
          });


        expect(
          invalid.valid
        ).toBe(
          false
        );


        expect(
          invalid.errors
            .join(
              " "
            )
        ).toMatch(
          /cannot grant execution authorization/i
        );
      }
    );


    test(
      "canonical integration results always remain non-authorizing",
      () => {
        const result =
          createIntegrationResult({
            provider:
              "kubernetes",

            operation:
              INTEGRATION_OPERATION
                .DISCOVER_RESOURCES,

            data: {
              resources:
                [],
            },
          });


        expect(
          result.schemaVersion
        ).toBe(
          INTEGRATION_SDK_VERSION
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          validateIntegrationResult(
            result
          )
        ).toEqual({
          valid:
            true,

          errors:
            [],
        });
      }
    );


    test(
      "stub adapters expose full Phase 20 surface and fail unsupported operations explicitly",
      async () => {
        const adapter =
          makeStubAdapter(
            "future_provider",
            []
          );


        expect(
          validateAdapterContract(
            adapter
          )
        ).toEqual({
          valid:
            true,

          errors:
            [],
        });


        await expect(
          adapter
            .discoverRelationships()
        ).rejects
          .toBeInstanceOf(
            UnsupportedOperationError
          );


        await expect(
          adapter
            .getChanges()
        ).rejects
          .toMatchObject({
            code:
              "UNSUPPORTED_OPERATION",

            executionAuthorized:
              false,
          });


        await expect(
          adapter
            .executeCapability()
        ).rejects
          .toMatchObject({
            code:
              "UNSUPPORTED_OPERATION",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "operation capability map preserves existing stored capability compatibility",
      () => {
        expect(
          INTEGRATION_OPERATION_CAPABILITY_MAP
            .receiveSignals
        ).toBe(
          "receive_events"
        );


        expect(
          INTEGRATION_OPERATION_CAPABILITY_MAP
            .healthCheck
        ).toBe(
          "get_health"
        );


        expect(
          INTEGRATION_OPERATION_CAPABILITY_MAP
            .sendNotification
        ).toBe(
          "send_notifications"
        );
      }
    );
  }
);