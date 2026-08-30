"use strict";

const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


function source(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}


function exists(
  relativePath
) {
  return fs.existsSync(
    path.join(
      ROOT,
      relativePath
    )
  );
}


/*
 * ============================================================================
 * AIRA PHASE 20
 * INTEGRATION PLATFORM
 * MASTER ARCHITECTURE CERTIFICATION
 * ============================================================================
 */


describe(
  "Phase 20 master architecture certification",
  () => {
    /*
     * ========================================================================
     * 20.0 - 20.2 SDK CONTRACT
     * ========================================================================
     */


    test(
      "Phase 20 architecture and SDK contracts exist",
      () => {
        expect(
          exists(
            "contracts/integrations/integrationPlatformContract.js"
          )
        ).toBe(
          true
        );


        expect(
          exists(
            "contracts/integrations/integrationSdkContract.js"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "canonical SDK exposes all ten frozen provider operations",
      () => {
        const text =
          source(
            "constants/integrationPlatform.js"
          );


        const operations = [
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
        ];


        for (
          const operation
          of operations
        ) {
          expect(
            text
          ).toContain(
            operation
          );
        }
      }
    );


    test(
      "canonical capability tokens include Phase 20 discovery and execution additions",
      () => {
        const text =
          source(
            "constants/integrationPlatform.js"
          );


        expect(
          text
        ).toContain(
          "discover_relationships"
        );


        expect(
          text
        ).toContain(
          "get_changes"
        );


        expect(
          text
        ).toContain(
          "execute_capability"
        );
      }
    );


    /*
     * ========================================================================
     * 20.3 - 20.5 POSTGRESQL + CREDENTIALS
     * ========================================================================
     */


    test(
      "canonical PostgreSQL integration foundation exists",
      () => {
        expect(
          exists(
            "persistence/postgres/migrations/0079_integration_platform_foundation.sql"
          )
        ).toBe(
          true
        );


        const migration =
          source(
            "persistence/postgres/migrations/0079_integration_platform_foundation.sql"
          );


        expect(
          migration
        ).toContain(
          "integrations.connections"
        );


        expect(
          migration
        ).toContain(
          "integrations.credential_references"
        );


        expect(
          migration
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );


    test(
      "Phase 20 uses PostgreSQL connection and credential repositories",
      () => {
        expect(
          exists(
            "persistence/postgres/PostgresIntegrationConnectionRepository.js"
          )
        ).toBe(
          true
        );


        expect(
          exists(
            "persistence/postgres/PostgresIntegrationCredentialRepository.js"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "Phase 20 connection store does not depend on legacy mongoose IntegrationConnection",
      () => {
        const text =
          source(
            "services/integrations/integrationConnectionStore.js"
          );


        expect(
          text
        ).toMatch(
          /PostgresIntegrationConnectionRepository/
        );


        expect(
          text
        ).toMatch(
          /PostgresIntegrationCredentialRepository/
        );


        expect(
          text
        ).not.toMatch(
          /models\/IntegrationConnection/
        );


        expect(
          text
        ).not.toMatch(
          /mongoose/i
        );
      }
    );


    test(
      "credential abstraction delegates encryption and never becomes execution authority",
      () => {
        const text =
          source(
            "services/integrations/credentialProvider.js"
          );


        expect(
          text
        ).toMatch(
          /encryptSecret/
        );


        expect(
          text
        ).toMatch(
          /decryptSecret/
        );


        expect(
          text
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    /*
     * ========================================================================
     * 20.6 - 20.7 REGISTRY + RUNTIME
     * ========================================================================
     */


    test(
      "ProviderRegistry separates implementation from certification",
      () => {
        const text =
          source(
            "services/integrations/providerRegistry.js"
          );


        expect(
          text
        ).toContain(
          "REGISTERED"
        );


        expect(
          text
        ).toContain(
          "NOT_REGISTERED"
        );


        expect(
          text
        ).toContain(
          "UNCERTIFIED"
        );


        expect(
          text
        ).toContain(
          "CERTIFIED"
        );


        expect(
          text
        ).toContain(
          "PRODUCTION"
        );
      }
    );


    test(
      "IntegrationRuntime exposes the complete frozen operation surface",
      () => {
        const text =
          source(
            "services/integrations/integrationRuntime.js"
          );


        const operations = [
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
        ];


        for (
          const operation
          of operations
        ) {
          expect(
            text
          ).toContain(
            operation
          );
        }
      }
    );


    test(
      "IntegrationRuntime cannot directly grant execution authorization",
      () => {
        const text =
          source(
            "services/integrations/integrationRuntime.js"
          );


        expect(
          text
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    /*
     * ========================================================================
     * 20.8 SIGNALS
     * ========================================================================
     */


    test(
      "integration signal gateway reuses existing canonical signal ingestion",
      () => {
        const text =
          source(
            "services/integrations/integrationSignalGateway.js"
          );


        expect(
          text
        ).toMatch(
          /signalIngestionService/
        );


        expect(
          text
        ).not.toMatch(
          /integration_signals/
        );


        expect(
          text
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    /*
     * ========================================================================
     * 20.9 EVIDENCE GATEWAY
     * ========================================================================
     */


    test(
      "metrics logs and traces remain provider-owned evidence",
      () => {
        const text =
          source(
            "services/integrations/integrationEvidenceGateway.js"
          );


        expect(
          text
        ).toContain(
          "queryMetrics"
        );


        expect(
          text
        ).toContain(
          "queryLogs"
        );


        expect(
          text
        ).toContain(
          "queryTraces"
        );


        expect(
          text
        ).toMatch(
          /persistedByGateway\s*:\s*false/
        );
      }
    );


    /*
     * ========================================================================
     * 20.10 - 20.11 PHASE 17 TOPOLOGY
     * ========================================================================
     */


    test(
      "resource discovery feeds Phase 17 rather than creating a second inventory",
      () => {
        const text =
          source(
            "services/integrations/integrationResourceDiscoveryGateway.js"
          );


        expect(
          text
        ).toMatch(
          /ResourceStateIngestionService/
        );


        expect(
          text
        ).not.toMatch(
          /integration_resources/
        );
      }
    );


    test(
      "relationship discovery feeds Phase 17 temporal topology",
      () => {
        const text =
          source(
            "services/integrations/integrationTopologyDiscoveryGateway.js"
          );


        expect(
          text
        ).toMatch(
          /PostgresTemporalRelationshipRepository/
        );


        expect(
          text
        ).toMatch(
          /TemporalTopologyQueryService/
        );


        expect(
          text
        ).not.toMatch(
          /integration_relationships/
        );
      }
    );


    /*
     * ========================================================================
     * 20.12 NOTIFICATIONS
     * ========================================================================
     */


    test(
      "notification gateway exists and cannot authorize execution",
      () => {
        const text =
          source(
            "services/integrations/integrationNotificationGateway.js"
          );


        expect(
          text
        ).toContain(
          "sendNotification"
        );


        expect(
          text
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    /*
     * ========================================================================
     * 20.13 EXECUTION BOUNDARY
     * ========================================================================
     */


    test(
      "provider execution verifies persisted deterministic authorization",
      () => {
        const text =
          source(
            "services/integrations/integrationExecutionAuthorizationBoundary.js"
          );


        expect(
          text
        ).toMatch(
          /PostgresExecutionAuthorizationRepository/
        );


        expect(
          text
        ).toContain(
          "authorizationId"
        );


        expect(
          text
        ).toContain(
          "executionRequestId"
        );


        expect(
          text
        ).toContain(
          "planId"
        );


        expect(
          text
        ).toContain(
          "planHash"
        );
      }
    );


    test(
      "execution integration boundary cannot manufacture authorization",
      () => {
        const text =
          source(
            "services/integrations/integrationExecutionAuthorizationBoundary.js"
          );


        expect(
          text
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    /*
     * ========================================================================
     * 20.14 RESILIENCE
     * ========================================================================
     */


    test(
      "integration resilience service implements bounded retry and circuit breaker",
      () => {
        const text =
          source(
            "services/integrations/integrationResilienceService.js"
          );


        expect(
          text
        ).toContain(
          "DEFAULT_MAX_ATTEMPTS"
        );


        expect(
          text
        ).toContain(
          "DEFAULT_CIRCUIT_FAILURE_THRESHOLD"
        );


        expect(
          text
        ).toContain(
          "INTEGRATION_CIRCUIT_OPEN"
        );
      }
    );


    test(
      "executeCapability is explicitly excluded from generic automatic retry",
      () => {
        const text =
          source(
            "services/integrations/integrationResilienceService.js"
          );


        expect(
          text
        ).toMatch(
          /NEVER_RETRY_OPERATIONS/
        );


        expect(
          text
        ).toMatch(
          /EXECUTE_CAPABILITY/
        );
      }
    );


    /*
     * ========================================================================
     * 20.15 GOVERNANCE + AUDIT + SECURITY
     * ========================================================================
     */


    test(
      "existing integration governance remains canonical governance authority",
      () => {
        const text =
          source(
            "services/integrations/integrationRuntimeGovernance.js"
          );


        expect(
          text
        ).toContain(
          "integrations.connection_governance"
        );


        expect(
          text
        ).toMatch(
          /PostgresTenantScope/
        );
      }
    );


    test(
      "Phase 20 invocation audit migration is append-only RLS evidence",
      () => {
        const text =
          source(
            "persistence/postgres/migrations/0080_integration_runtime_audit.sql"
          );


        expect(
          text
        ).toContain(
          "integrations.invocation_audit"
        );


        expect(
          text
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );


        expect(
          text
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          text
        ).toContain(
          "integration invocation audit is append-only"
        );


        expect(
          text
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );


    test(
      "central integration security sanitizer exists",
      () => {
        const text =
          source(
            "services/integrations/integrationSecurity.js"
          );


        expect(
          text
        ).toContain(
          "[REDACTED]"
        );


        expect(
          text
        ).toContain(
          "sanitizeIntegrationValue"
        );


        expect(
          text
        ).toContain(
          "decryptedsecret"
        );
      }
    );


    /*
     * ========================================================================
     * 20.16 API / DASHBOARD CONTROL PLANE
     * ========================================================================
     */


    test(
      "canonical Phase 20 dashboard control-plane service exists",
      () => {
        const text =
          source(
            "services/integrations/integrationControlPlaneService.js"
          );


        expect(
          text
        ).toMatch(
          /IntegrationConnectionStore/
        );


        expect(
          text
        ).toMatch(
          /ProviderRegistry/
        );


        expect(
          text
        ).toMatch(
          /IntegrationRuntime/
        );


        expect(
          text
        ).toMatch(
          /PostgresIntegrationInvocationAuditRepository/
        );
      }
    );


    test(
      "Phase 20 API exposes catalogue connection governance health credential and audit surfaces",
      () => {
        const text =
          source(
            "routes/integrationPlatformRoutes.js"
          );


        const endpoints = [
          '"/catalogue"',
          '"/connections"',
          '"/connections/:integrationId"',
          '"/connections/:integrationId/credential/rotate"',
          '"/connections/:integrationId/credential/revoke"',
          '"/connections/:integrationId/health"',
          '"/connections/:integrationId/governance"',
          '"/connections/:integrationId/audit"',
        ];


        for (
          const endpoint
          of endpoints
        ) {
          expect(
            text
          ).toContain(
            endpoint
          );
        }
      }
    );


    test(
      "dashboard connection serialization never exposes secret material",
      () => {
        const text =
          source(
            "services/integrations/integrationControlPlaneService.js"
          );


        expect(
          text
        ).not.toMatch(
          /referenceValue\s*:/
        );


        expect(
          text
        ).not.toMatch(
          /_decryptedSecret\s*:/
        );
      }
    );


    /*
     * ========================================================================
     * 20.17 CATALOGUE
     * ========================================================================
     */


    test(
      "catalogue capability authority comes from integrationPlatform constants",
      () => {
        const text =
          source(
            "config/integrationCatalogue.js"
          );


        expect(
          text
        ).toMatch(
          /constants\/integrationPlatform/
        );


        expect(
          text
        ).not.toMatch(
          /const\s+INTEGRATION_CAPABILITIES\s*=\s*Object\.freeze/
        );
      }
    );


    test(
      "frozen Phase 20 catalogue has 31 native providers plus two webhooks",
      () => {
        const {
          CATALOGUE,
        } =
          require(
            "../../config/integrationCatalogue"
          );


        expect(
          CATALOGUE
        ).toHaveLength(
          33
        );


        expect(
          CATALOGUE.filter(
            (
              item
            ) =>
              item.provider ===
                "webhook_incoming" ||
              item.provider ===
                "webhook_outgoing"
          )
        ).toHaveLength(
          2
        );


        expect(
          CATALOGUE.some(
            (
              item
            ) =>
              item.provider ===
              "tekton"
          )
        ).toBe(
          true
        );


        expect(
          CATALOGUE.some(
            (
              item
            ) =>
              item.provider ===
              "terraform"
          )
        ).toBe(
          true
        );


        expect(
          CATALOGUE.some(
            (
              item
            ) =>
              item.provider ===
              "discord"
          )
        ).toBe(
          false
        );
      }
    );


    /*
     * ========================================================================
     * SUBSYSTEM OWNERSHIP
     * ========================================================================
     */


  test(
  "Phase 20 does not create another resource graph",
  () => {
    const files = [
      "services/integrations/integrationResourceDiscoveryGateway.js",

      "services/integrations/integrationTopologyDiscoveryGateway.js",
    ];


    for (
      const file
      of files
    ) {
      const text =
        source(
          file
        );


      /*
       * Phase 20 may mention forbidden duplicate table names in comments
       * documenting architectural boundaries.
       *
       * Certification must therefore detect actual SQL/table usage rather
       * than rejecting documentation that says those tables must not exist.
       */

      expect(
        text
      ).not.toMatch(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:integrations\.)?integration_resources\b/i
      );


      expect(
        text
      ).not.toMatch(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:integrations\.)?integration_relationships\b/i
      );


      expect(
        text
      ).not.toMatch(
        /INSERT\s+INTO\s+(?:integrations\.)?integration_resources\b/i
      );


      expect(
        text
      ).not.toMatch(
        /INSERT\s+INTO\s+(?:integrations\.)?integration_relationships\b/i
      );


      expect(
        text
      ).not.toMatch(
        /UPDATE\s+(?:integrations\.)?integration_resources\b/i
      );


      expect(
        text
      ).not.toMatch(
        /UPDATE\s+(?:integrations\.)?integration_relationships\b/i
      );


      expect(
        text
      ).not.toMatch(
        /DELETE\s+FROM\s+(?:integrations\.)?integration_resources\b/i
      );


      expect(
        text
      ).not.toMatch(
        /DELETE\s+FROM\s+(?:integrations\.)?integration_relationships\b/i
      );
    }
  }
);

test(
  "audited integration provenance cannot be destroyed through mutable FK semantics",
  () => {
    const migration =
      source(
        "persistence/postgres/migrations/0081_integration_audit_connection_integrity.sql"
      );


    /*
     * Historical migration comments may legitimately mention the previous
     * ON DELETE SET NULL behavior.
     *
     * Certification must inspect the active FK declaration instead of
     * rejecting explanatory documentation.
     */

    expect(
      migration
    ).toMatch(
      /FOREIGN\s+KEY\s*\(\s*connection_id\s*\)[\s\S]*?REFERENCES\s+integrations\.connections\s*\(\s*id\s*\)[\s\S]*?ON\s+DELETE\s+RESTRICT\s*;/i
    );


    expect(
      migration
    ).not.toMatch(
      /FOREIGN\s+KEY\s*\(\s*connection_id\s*\)[\s\S]*?REFERENCES\s+integrations\.connections\s*\(\s*id\s*\)[\s\S]*?ON\s+DELETE\s+SET\s+NULL\s*;/i
    );
  }
);

test(
  "product-facing connection removal retires rather than destroys audited integrations",
  () => {
    const text =
      source(
        "services/integrations/integrationControlPlaneService.js"
      );


    expect(
      text
    ).toContain(
      "historicalAuditPreserved"
    );


    expect(
      text
    ).toContain(
      'status:\n          "disabled"'
    );


    expect(
      text
    ).not.toMatch(
      /\.deleteConnection\(\{\s*organizationId[\s\S]*connectionId:\s*connection\.id[\s\S]*\}\)/m
    );
  }
);

    test(
      "Phase 20 does not create Phase 18 recovery knowledge",
      () => {
        const files = [
          "services/integrations/integrationRuntime.js",

          "services/integrations/integrationSignalGateway.js",

          "services/integrations/integrationEvidenceGateway.js",

          "services/integrations/integrationResourceDiscoveryGateway.js",

          "services/integrations/integrationTopologyDiscoveryGateway.js",
        ];


        for (
          const file
          of files
        ) {
          const text =
            source(
              file
            );


          expect(
            text
          ).not.toMatch(
            /PostgresPlaybookRepository/
          );


          expect(
            text
          ).not.toMatch(
            /PostgresRunbookRepository/
          );


          expect(
            text
          ).not.toMatch(
            /knowledge\.playbook_definitions/
          );
        }
      }
    );


    test(
      "Phase 20 does not directly modify Phase 19 coverage classification",
      () => {
        const files = [
          "services/integrations/integrationRuntime.js",

          "services/integrations/integrationSignalGateway.js",

          "services/integrations/integrationEvidenceGateway.js",

          "services/integrations/integrationResourceDiscoveryGateway.js",

          "services/integrations/integrationTopologyDiscoveryGateway.js",
        ];


        for (
          const file
          of files
        ) {
          const text =
            source(
              file
            );


          expect(
            text
          ).not.toMatch(
            /RecoveryCoverageClassificationEngine/
          );


          expect(
            text
          ).not.toMatch(
            /PostgresCoverageEvaluationRepository/
          );
        }
      }
    );


    /*
     * ========================================================================
     * TELEMETRY ARCHITECTURE
     * ========================================================================
     */


    test(
      "Phase 20 queries telemetry rather than creating a telemetry warehouse",
      () => {
        const evidence =
          source(
            "services/integrations/integrationEvidenceGateway.js"
          );


        expect(
          evidence
        ).toMatch(
          /persistedByGateway\s*:\s*false/
        );


        expect(
          evidence
        ).not.toMatch(
          /INSERT\s+INTO/i
        );
      }
    );


    /*
     * ========================================================================
     * EXECUTION SAFETY
     * ========================================================================
     */


    test(
      "integration governance allow_execution is not itself execution authorization",
      () => {
        const files = [
          "services/integrations/integrationRuntimeGovernance.js",

          "services/integrations/integrationExecutionAuthorizationBoundary.js",

          "services/integrations/integrationRuntime.js",
        ];


        for (
          const file
          of files
        ) {
          expect(
            source(
              file
            )
          ).not.toMatch(
            /executionAuthorized\s*:\s*true/
          );
        }
      }
    );


    test(
      "Phase 20 contains no direct arbitrary child-process execution path",
      () => {
        const files = [
          "services/integrations/integrationRuntime.js",

          "services/integrations/integrationExecutionAuthorizationBoundary.js",

          "services/integrations/integrationControlPlaneService.js",
        ];


        for (
          const file
          of files
        ) {
          const text =
            source(
              file
            );


          expect(
            text
          ).not.toMatch(
            /child_process/
          );


          expect(
            text
          ).not.toMatch(
            /\bexecSync\s*\(/
          );


          expect(
            text
          ).not.toMatch(
            /\bspawnSync\s*\(/
          );
        }
      }
    );


    /*
     * ========================================================================
     * MONGO / QDRANT AUTHORITY
     * ========================================================================
     */


    test(
      "new Phase 20 canonical services do not use MongoDB as integration authority",
      () => {
        const files = [
          "services/integrations/integrationConnectionStore.js",

          "services/integrations/integrationRuntime.js",

          "services/integrations/integrationControlPlaneService.js",

          "services/integrations/integrationRuntimeGovernance.js",

          "persistence/postgres/PostgresIntegrationConnectionRepository.js",

          "persistence/postgres/PostgresIntegrationCredentialRepository.js",
        ];


        for (
          const file
          of files
        ) {
          const text =
            source(
              file
            );


          expect(
            text
          ).not.toMatch(
            /mongoose/i
          );


          expect(
            text
          ).not.toMatch(
            /models\/IntegrationConnection/
          );
        }
      }
    );


    test(
      "Qdrant is not Phase 20 integration configuration authority",
      () => {
        const files = [
          "services/integrations/integrationConnectionStore.js",

          "services/integrations/integrationRuntime.js",

          "services/integrations/integrationControlPlaneService.js",
        ];


        for (
          const file
          of files
        ) {
          expect(
            source(
              file
            )
          ).not.toMatch(
            /qdrant/i
          );
        }
      }
    );


    /*
     * ========================================================================
     * CUSTOMER MONGODB SUPPORT
     * ========================================================================
     */


    test(
      "MongoDB remains a supported external customer technology",
      () => {
        const {
          CATALOGUE,
        } =
          require(
            "../../config/integrationCatalogue"
          );


        expect(
          CATALOGUE.some(
            (
              item
            ) =>
              item.provider ===
              "mongodb_integration"
          )
        ).toBe(
          true
        );
      }
    );


    /*
     * ========================================================================
     * LIVE CERTIFICATION
     * ========================================================================
     */


    test(
      "Phase 20 live certification script exists",
      () => {
        expect(
          exists(
            "scripts/certify-phase20-live.js"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "live certification explicitly avoids false third-party production claims",
      () => {
        const text =
          source(
            "scripts/certify-phase20-live.js"
          );


        expect(
          text
        ).toContain(
          "third-party vendor live credential certification"
        );


        expect(
          text
        ).toContain(
          "SKIP"
        );


        expect(
          text
        ).toContain(
          "Third-party vendor production certification claimed: false"
        );
      }
    );


    /*
     * ========================================================================
     * GLOBAL NON-AUTHORIZATION
     * ========================================================================
     */


    test(
      "core Phase 20 services never return executionAuthorized true",
      () => {
        const files = [
          "contracts/integrations/integrationPlatformContract.js",

          "contracts/integrations/integrationSdkContract.js",

          "services/integrations/adapterInterface.js",

          "services/integrations/providerRegistry.js",

          "services/integrations/integrationRuntime.js",

          "services/integrations/integrationSignalGateway.js",

          "services/integrations/integrationEvidenceGateway.js",

          "services/integrations/integrationResourceDiscoveryGateway.js",

          "services/integrations/integrationTopologyDiscoveryGateway.js",

          "services/integrations/integrationNotificationGateway.js",

          "services/integrations/integrationExecutionAuthorizationBoundary.js",

          "services/integrations/integrationResilienceService.js",

          "services/integrations/integrationRuntimeGovernance.js",

          "services/integrations/integrationInvocationAuditService.js",

          "services/integrations/integrationControlPlaneService.js",
        ];


        for (
          const file
          of files
        ) {
          expect(
            source(
              file
            )
          ).not.toMatch(
            /executionAuthorized\s*:\s*true/
          );
        }
      }
    );
  }
);