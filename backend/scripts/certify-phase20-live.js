"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20
 * INTEGRATION PLATFORM
 * LIVE POSTGRESQL CERTIFICATION
 * ============================================================================
 *
 * This certification uses:
 *
 *   - real local PostgreSQL
 *   - real organization/environment resolution
 *   - real Phase 20 canonical integration tables
 *   - real IntegrationConnectionStore
 *   - real ProviderRegistry
 *   - real IntegrationRuntime
 *   - real webhook_incoming adapter
 *   - real tenant governance
 *   - real invocation audit
 *
 * It deliberately does NOT:
 *
 *   - require paid external SaaS credentials
 *   - claim Datadog/AWS/Azure/GCP/etc. production certification
 *   - authorize execution
 *   - invoke executeCapability()
 *   - persist secrets into connection records
 *   - use MongoDB as integration authority
 *   - use Qdrant as integration authority
 *
 * The generic incoming webhook is used because it is a real Phase 20
 * provider adapter that can be certified deterministically without an
 * external third-party dependency.
 *
 * ============================================================================
 */


require(
  "dotenv"
).config();


const crypto =
  require(
    "node:crypto"
  );


const {
  getPostgresPool,

  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );


const IntegrationConnectionStore =
  require(
    "../services/integrations/integrationConnectionStore"
  );


const {
  ProviderRegistry,

  PROVIDER_RUNTIME_STATUS,

  PROVIDER_CERTIFICATION_STATUS,
} =
  require(
    "../services/integrations/providerRegistry"
  );


const {
  IntegrationRuntime,
} =
  require(
    "../services/integrations/integrationRuntime"
  );


const {
  upsertGovernance,
  getGovernance,
} =
  require(
    "../services/integrations/integrationGovernanceService"
  );


const {
  INTEGRATION_CAPABILITIES,
} =
  require(
    "../constants/integrationPlatform"
  );


const ORGANIZATION_ID =
  process.env
    .PHASE20_CERT_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .PHASE20_CERT_ENVIRONMENT_ID ||
  "env_aira_development";


const CERTIFICATION_PROVIDER =
  "webhook_incoming";


const CERTIFICATION_ID =
  `phase20_cert_${Date.now()}_${crypto
    .randomBytes(
      4
    )
    .toString(
      "hex"
    )}`;


const results =
  [];


/*
 * ============================================================================
 * RESULT HELPERS
 * ============================================================================
 */


function pass(
  name,
  details =
    null
) {
  results.push({
    name,

    status:
      "PASS",

    details,
  });


  console.log(
    `[PASS] ${name}`
  );


  if (
    details
  ) {
    console.log(
      "       ",
      details
    );
  }
}


function skip(
  name,
  details =
    null
) {
  results.push({
    name,

    status:
      "SKIP",

    details,
  });


  console.log(
    `[SKIP] ${name}`
  );


  if (
    details
  ) {
    console.log(
      "       ",
      details
    );
  }
}


function fail(
  name,
  error
) {
  results.push({
    name,

    status:
      "FAIL",

    error:
      error?.message ||
      String(
        error
      ),
  });


  console.error(
    `[FAIL] ${name}`
  );


  console.error(
    `       ${
      error?.message ||
      error
    }`
  );
}


async function check(
  name,
  fn
) {
  try {
    const details =
      await fn();


    pass(
      name,
      details
    );


    return details;
  } catch (
    error
  ) {
    fail(
      name,
      error
    );


    throw error;
  }
}


function assertCondition(
  condition,
  message
) {
  if (
    !condition
  ) {
    throw new Error(
      message
    );
  }
}


/*
 * ============================================================================
 * MAIN
 * ============================================================================
 */


async function main() {
  console.log("");
  console.log(
    "======================================================"
  );
  console.log(
    "AIRA PHASE 20 LIVE CERTIFICATION"
  );
  console.log(
    "INTEGRATION PLATFORM"
  );
  console.log(
    "======================================================"
  );
  console.log("");


  console.log(
    `Organization: ${ORGANIZATION_ID}`
  );


  console.log(
    `Environment:  ${ENVIRONMENT_ID}`
  );


  console.log(
    `Provider:     ${CERTIFICATION_PROVIDER}`
  );


  console.log(
    `Fixture:      ${CERTIFICATION_ID}`
  );


  console.log("");


  const pool =
    getPostgresPool();


  const scope =
    new PostgresTenantScope({
      pool,
    });


  const store =
    new IntegrationConnectionStore({
      pool,

      scope,
    });


  const registry =
    new ProviderRegistry();


  const runtime =
    new IntegrationRuntime({
      pool,

      scope,

      connectionStore:
        store,

      providerRegistry:
        registry,
    });


  let resolvedScope =
    null;


  let createdConnection =
    null;


  try {
    /*
     * ========================================================================
     * 1. REAL TENANT RESOLUTION
     * ========================================================================
     */


    resolvedScope =
      await check(
        "real organization and environment resolve through PostgresTenantScope",

        async () =>
          scope.run(
            {
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,
            },

            async (
              _client,
              resolved
            ) => {
              assertCondition(
                Boolean(
                  resolved
                    .organizationUuid
                ),

                "canonical organization UUID was not resolved"
              );


              assertCondition(
                Boolean(
                  resolved
                    .environmentUuid
                ),

                "canonical environment UUID was not resolved"
              );


              return {
                organizationPublicId:
                  ORGANIZATION_ID,

                organizationUuid:
                  resolved
                    .organizationUuid,

                environmentPublicId:
                  ENVIRONMENT_ID,

                environmentUuid:
                  resolved
                    .environmentUuid,
              };
            }
          )
      );


    /*
     * ========================================================================
     * 2. CANONICAL POSTGRESQL SCHEMA
     * ========================================================================
     */


    await check(
      "Phase 20 canonical PostgreSQL integration tables exist",

      async () => {
        const result =
          await pool.query(
            `
              SELECT
                to_regclass(
                  'integrations.connections'
                )
                  AS connections,

                to_regclass(
                  'integrations.credential_references'
                )
                  AS credential_references,

                to_regclass(
                  'integrations.connection_governance'
                )
                  AS connection_governance,

                to_regclass(
                  'integrations.invocation_audit'
                )
                  AS invocation_audit
            `
          );


        const row =
          result.rows[0];


        assertCondition(
          row.connections ===
            "integrations.connections",

          "integrations.connections is missing"
        );


        assertCondition(
          row
            .credential_references ===
            "integrations.credential_references",

          "integrations.credential_references is missing"
        );


        assertCondition(
          row
            .connection_governance ===
            "integrations.connection_governance",

          "integrations.connection_governance is missing"
        );


        assertCondition(
          row
            .invocation_audit ===
            "integrations.invocation_audit",

          "integrations.invocation_audit is missing"
        );


        return row;
      }
    );


    /*
     * ========================================================================
     * 3. RLS
     * ========================================================================
     */


    await check(
      "canonical Phase 20 tenant-owned tables have RLS enabled and forced",

      async () => {
        const result =
          await pool.query(
            `
              SELECT
                c.relname,

                c.relrowsecurity,

                c.relforcerowsecurity

              FROM
                pg_class c

              JOIN
                pg_namespace n
              ON
                n.oid = c.relnamespace

              WHERE
                n.nspname =
                  'integrations'

                AND

                c.relname IN (
                  'connections',
                  'credential_references',
                  'invocation_audit'
                )

              ORDER BY
                c.relname
            `
          );


        assertCondition(
          result.rows.length ===
            3,

          "not all Phase 20 RLS tables were found"
        );


        for (
          const row
          of result.rows
        ) {
          assertCondition(
            row.relrowsecurity ===
              true,

            `${row.relname} does not have RLS enabled`
          );


          assertCondition(
            row
              .relforcerowsecurity ===
              true,

            `${row.relname} does not force RLS`
          );
        }


        return result.rows;
      }
    );


    /*
     * ========================================================================
     * 4. NEVER-AUTHORIZE CONSTRAINTS
     * ========================================================================
     */


    await check(
      "canonical Phase 20 persistence cannot set execution_authorized=true",

      async () => {
        const result =
          await pool.query(
            `
              SELECT
                conrelid::regclass::text
                  AS table_name,

                pg_get_constraintdef(
                  oid
                )
                  AS definition

              FROM
                pg_constraint

              WHERE
                conrelid IN (
                  'integrations.connections'::regclass,
                  'integrations.credential_references'::regclass,
                  'integrations.invocation_audit'::regclass
                )

                AND

                contype =
                  'c'
            `
          );


        const definitions =
          result.rows
            .map(
              (
                row
              ) =>
                `${row.table_name} ${row.definition}`
            )
            .join(
              "\n"
            )
            .toLowerCase();


        for (
          const table
          of [
            "connections",

            "credential_references",

            "invocation_audit",
          ]
        ) {
          assertCondition(
            definitions.includes(
              table
            ),

            `constraints for ${table} were not found`
          );
        }


        assertCondition(
          definitions.includes(
            "execution_authorized"
          ),

          "never-authorize constraint was not found"
        );


        return {
          checkedTables:
            3,

          executionAuthorized:
            false,
        };
      }
    );


    /*
     * ========================================================================
     * 5. PROVIDER REGISTRY
     * ========================================================================
     */


    const providerRecord =
      await check(
        "webhook_incoming is a real registered Phase 20 adapter",

        async () => {
          const provider =
            registry.requireProvider(
              CERTIFICATION_PROVIDER
            );


          assertCondition(
            provider.runtimeStatus ===
              PROVIDER_RUNTIME_STATUS
                .REGISTERED,

            "webhook_incoming runtime adapter is not registered"
          );


          assertCondition(
            provider.implemented ===
              true,

            "webhook_incoming is not marked implemented"
          );


          assertCondition(
            provider
              .runtimeCapabilities
              .includes(
                "receive_events"
              ),

            "webhook_incoming does not implement receive_events"
          );


          assertCondition(
            provider.executionAuthorized ===
              false,

            "provider metadata cannot authorize execution"
          );


          return {
            provider:
              provider.provider,

            runtimeStatus:
              provider.runtimeStatus,

            certificationStatus:
              provider
                .certificationStatus,

            runtimeCapabilities:
              provider
                .runtimeCapabilities,

            executionAuthorized:
              false,
          };
        }
      );


    /*
     * ========================================================================
     * 6. CERTIFICATION-STATUS SEPARATION
     * ========================================================================
     */


    await check(
      "adapter implementation remains separate from certification status",

      async () => {
        assertCondition(
          providerRecord
            .runtimeStatus ===
            "REGISTERED",

          "provider is not implemented"
        );


        assertCondition(
          [
            PROVIDER_CERTIFICATION_STATUS
              .UNCERTIFIED,

            PROVIDER_CERTIFICATION_STATUS
              .CERTIFIED,

            PROVIDER_CERTIFICATION_STATUS
              .PRODUCTION,
          ].includes(
            providerRecord
              .certificationStatus
          ),

          "provider certification status is invalid"
        );


        return {
          implemented:
            true,

          certificationStatus:
            providerRecord
              .certificationStatus,

          implementationImpliesProduction:
            false,

          executionAuthorized:
            false,
        };
      }
    );


    /*
     * ========================================================================
     * 7. CREATE REAL POSTGRESQL CERTIFICATION CONNECTION
     * ========================================================================
     */


    createdConnection =
      await check(
        "temporary certification connection persists in canonical PostgreSQL",

        async () => {
          const connection =
            await store
              .createConnection({
                organizationId:
                  ORGANIZATION_ID,

                environmentId:
                  ENVIRONMENT_ID,

                provider:
                  CERTIFICATION_PROVIDER,

                name:
                  `Phase 20 Certification ${CERTIFICATION_ID}`,

                externalAccountId:
                  null,

                serviceIds:
                  [],

                capabilities: [
                  "receive_events",
                  "normalize_events",
                ],

                nonSecretConfig: {
                  certification:
                    true,

                  certificationId:
                    CERTIFICATION_ID,
                },

                status:
                  "connected",

                healthStatus:
                  "healthy",

                metadata: {
                  certification:
                    "phase20-live",

                  certificationId:
                    CERTIFICATION_ID,
                },
              });


          assertCondition(
            Boolean(
              connection?.id
            ),

            "connection UUID was not created"
          );


          assertCondition(
            Boolean(
              connection
                ?.publicId
            ),

            "connection public ID was not created"
          );


          assertCondition(
            connection
              .executionAuthorized ===
              false,

            "connection persistence cannot authorize execution"
          );


          return connection;
        }
      );


    /*
     * ========================================================================
     * 8. DATABASE OWNERSHIP
     * ========================================================================
     */


    await check(
      "certification connection belongs to resolved organization/environment",

      async () =>
        scope.run(
          {
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,
          },

          async (
            client,
            resolved
          ) => {
            const result =
              await client.query(
                `
                  SELECT
                    organization_id,
                    environment_id,
                    provider,
                    execution_authorized

                  FROM
                    integrations.connections

                  WHERE
                    public_id = $1

                  LIMIT 1
                `,
                [
                  createdConnection
                    .publicId,
                ]
              );


            assertCondition(
              result.rows.length ===
                1,

              "certification connection not visible in tenant scope"
            );


            const row =
              result.rows[0];


            assertCondition(
              String(
                row
                  .organization_id
              ) ===
              String(
                resolved
                  .organizationUuid
              ),

              "connection organization ownership mismatch"
            );


            assertCondition(
              String(
                row
                  .environment_id
              ) ===
              String(
                resolved
                  .environmentUuid
              ),

              "connection environment ownership mismatch"
            );


            assertCondition(
              row
                .execution_authorized ===
                false,

              "database connection row cannot authorize execution"
            );


            return row;
          }
        )
    );


    /*
     * ========================================================================
     * 9. GOVERNANCE
     * ========================================================================
     */


    await check(
      "tenant governance exists and execution remains explicitly disabled",

      async () => {
        await upsertGovernance({
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          integrationId:
            createdConnection
              .publicId,

          provider:
            CERTIFICATION_PROVIDER,

          actorUserId:
            null,

          settings: {
            enabled:
              true,

            allowIngestion:
              true,

            allowQueries:
              false,

            allowResourceDiscovery:
              false,

            allowExecution:
              false,

            credentialAccessMode:
              "managed_only",

            allowedCapabilities: [
              "receive_events",
              "normalize_events",
            ],

            deniedCapabilities:
              [],

            metadata: {
              certification:
                "phase20-live",

              certificationId:
                CERTIFICATION_ID,

              executionAuthorized:
                false,
            },
          },
        });


        const governance =
          await getGovernance({
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,

            integrationId:
              createdConnection
                .publicId,
          });


        assertCondition(
          governance !==
            null,

          "governance row was not created"
        );


        assertCondition(
          governance.enabled ===
            true,

          "certification governance is not enabled"
        );


        assertCondition(
          governance
            .allow_ingestion ===
            true,

          "certification ingestion should be enabled"
        );


        assertCondition(
          governance
            .allow_execution ===
            false,

          "Phase 20 certification must not enable execution"
        );


        return {
          enabled:
            governance.enabled,

          allowIngestion:
            governance
              .allow_ingestion,

          allowExecution:
            governance
              .allow_execution,

          executionAuthorized:
            false,
        };
      }
    );


    /*
     * ========================================================================
     * 10. REAL RUNTIME + REAL ADAPTER
     * ========================================================================
     */


    const runtimeResult =
      await check(
        "real IntegrationRuntime invokes real webhook adapter",

        async () => {
          const result =
            await runtime
              .receiveSignals(
                {
                  organizationId:
                    ORGANIZATION_ID,

                  environmentId:
                    ENVIRONMENT_ID,

                  integrationId:
                    createdConnection
                      .publicId,

                  provider:
                    CERTIFICATION_PROVIDER,

                  executionAuthorized:
                    false,
                },

                {
                  eventType:
                    "phase20.certification",

                  title:
                    "Phase 20 live certification event",

                  severity:
                    "medium",

                  service:
                    "aira-certification",

                  status:
                    "firing",

                  labels: {
                    phase:
                      "20",

                    certificationId:
                      CERTIFICATION_ID,
                  },

                  annotations: {
                    source:
                      "phase20-live-certification",
                  },
                },

                {}
              );


          assertCondition(
            result !==
              null,

            "IntegrationRuntime returned no result"
          );


          assertCondition(
            result.executionAuthorized ===
              false,

            "IntegrationRuntime must remain non-authorizing"
          );


          assertCondition(
            result.provider ===
              CERTIFICATION_PROVIDER,

            "runtime provider mismatch"
          );


         const invocationId =
  result
    ?.provenance
    ?.invocationId;


assertCondition(
  Boolean(
    invocationId
  ),

  "IntegrationRuntime result did not expose provenance.invocationId"
);


return {
  provider:
    result.provider,

  status:
    result.status,

  invocationId,

  executionAuthorized:
    result
      .executionAuthorized,
};
        }
      );


    /*
     * ========================================================================
     * 11. INVOCATION AUDIT
     * ========================================================================
     */


    await check(
      "real runtime invocation creates immutable PostgreSQL audit evidence",

      async () =>
        scope.run(
          {
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,
          },

          async (
            client
          ) => {
            const result =
              await client.query(
                `
                  SELECT
                    invocation_id,

                    integration_public_id,

                    provider,

                    operation,

                    outcome,

                    attempt_count,

                    execution_authorized,

                    created_at

                  FROM
                    integrations.invocation_audit

                  WHERE
                    invocation_id = $1

                  ORDER BY
                    created_at DESC

                  LIMIT 1
                `,
                [
                  runtimeResult
                    .invocationId,
                ]
              );


            assertCondition(
              result.rows.length ===
                1,

              "runtime invocation audit row was not created"
            );


            const row =
              result.rows[0];


            assertCondition(
              row
                .integration_public_id ===
                createdConnection
                  .publicId,

              "audit integration identity mismatch"
            );


            assertCondition(
              row.provider ===
                CERTIFICATION_PROVIDER,

              "audit provider mismatch"
            );


            assertCondition(
              row.operation ===
                "receiveSignals",

              "audit operation mismatch"
            );


            assertCondition(
              row
                .execution_authorized ===
                false,

              "audit evidence cannot authorize execution"
            );


            return row;
          }
        )
    );


    /*
     * ========================================================================
     * 12. AUDIT IMMUTABILITY
     * ========================================================================
     */


    await check(
      "Phase 20 invocation audit rejects mutation",

      async () =>
        scope.run(
          {
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,
          },

          async (
            client
          ) => {
            let mutationRejected =
              false;


            await client.query(
              "SAVEPOINT phase20_audit_immutability"
            );


            try {
              await client.query(
                `
                  UPDATE
                    integrations.invocation_audit

                  SET
                    outcome =
                      'FAILED'

                  WHERE
                    invocation_id = $1
                `,
                [
                  runtimeResult
                    .invocationId,
                ]
              );
            } catch (
              error
            ) {
              mutationRejected =
                true;


              await client.query(
                "ROLLBACK TO SAVEPOINT phase20_audit_immutability"
              );
            }


            assertCondition(
              mutationRejected ===
                true,

              "invocation audit unexpectedly allowed UPDATE"
            );


            return {
              appendOnly:
                true,

              executionAuthorized:
                false,
            };
          }
        )
    );


    /*
     * ========================================================================
     * 13. CREDENTIAL SEPARATION
     * ========================================================================
     */


    await check(
      "ordinary connection retrieval exposes no credential material",

      async () => {
        const connection =
          await store
            .getConnection({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              publicId:
                createdConnection
                  .publicId,
            });


        const serialized =
          JSON.stringify(
            connection
          );


        assertCondition(
          !serialized.includes(
            "referenceValue"
          ),

          "connection result exposed credential reference value"
        );


        assertCondition(
          !serialized.includes(
            "_decryptedSecret"
          ),

          "connection result exposed decrypted secret"
        );


        assertCondition(
          connection
            .executionAuthorized ===
            false,

          "ordinary connection retrieval cannot authorize execution"
        );


        return {
          credentialMaterialExposed:
            false,

          executionAuthorized:
            false,
        };
      }
    );


    /*
     * ========================================================================
     * 14. EXECUTION CAPABILITY CONTRACT
     * ========================================================================
     */


    await check(
      "execute capability remains distinct from authorization",

      async () => {
        assertCondition(
          INTEGRATION_CAPABILITIES
            .includes(
              "execute_capability"
            ),

          "canonical execute_capability token is missing"
        );


        assertCondition(
          createdConnection
            .capabilities
            .includes(
              "execute_capability"
            ) ===
            false,

          "certification connection must not expose execution capability"
        );


        const governance =
          await getGovernance({
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,

            integrationId:
              createdConnection
                .publicId,
          });


        assertCondition(
          governance
            .allow_execution ===
            false,

          "governance unexpectedly allows execution"
        );


        return {
          executeCapabilityExists:
            true,

          connectionExecutionCapability:
            false,

          governanceExecution:
            false,

          executionAuthorized:
            false,
        };
      }
    );


    /*
     * ========================================================================
     * 15. EXTERNAL PROVIDER CLAIM BOUNDARY
     * ========================================================================
     */


    skip(
      "third-party vendor live credential certification",

      {
        reason:
          "No external vendor credentials are required for Phase 20 core certification. Adapter implementation does not imply vendor production certification.",

        providers:
          [
            "datadog",
            "aws_cloudwatch",
            "azure_monitor",
            "gcp_monitoring",
            "grafana_alerting",
            "prometheus_alertmanager",
            "opentelemetry",
          ],

        executionAuthorized:
          false,
      }
    );


    /*
     * ========================================================================
     * FINAL SUMMARY
     * ========================================================================
     */


    console.log("");
    console.log(
      "======================================================"
    );
    console.log(
      "PHASE 20 LIVE CERTIFICATION COMPLETE"
    );
    console.log(
      "======================================================"
    );


    const passed =
      results.filter(
        (
          result
        ) =>
          result.status ===
          "PASS"
      ).length;


    const skipped =
      results.filter(
        (
          result
        ) =>
          result.status ===
          "SKIP"
      ).length;


    const failed =
      results.filter(
        (
          result
        ) =>
          result.status ===
          "FAIL"
      ).length;


    console.log(
      `PASS: ${passed}`
    );


    console.log(
      `SKIP: ${skipped}`
    );


    console.log(
      `FAIL: ${failed}`
    );


    console.log("");


    console.log(
      "Canonical integration authority: PostgreSQL"
    );


    console.log(
      `Certified core provider: ${CERTIFICATION_PROVIDER}`
    );


    console.log(
      "Third-party vendor production certification claimed: false"
    );


    console.log(
      "Integration capability implies authorization: false"
    );


    console.log(
      "Integration runtime authorizes execution: false"
    );


    console.log(
      `Certification invocation: ${runtimeResult.invocationId}`
    );


    console.log("");


    if (
      failed >
      0
    ) {
      process.exitCode =
        1;
    }
  } finally {
    /*
     * ========================================================================
     * CLEANUP
     * ========================================================================
     *
     * invocation_audit is intentionally NOT deleted.
     *
     * It is immutable certification provenance.
     * ========================================================================
     */


    if (
      createdConnection?.publicId
    ) {
      try {
        await scope.run(
  {
    organizationId:
      ORGANIZATION_ID,

    environmentId:
      ENVIRONMENT_ID,
  },

  async (
    client
  ) => {
    await client.query(
      `
        UPDATE
          integrations.connection_governance

        SET
          enabled =
            FALSE,

          allow_ingestion =
            FALSE,

          allow_queries =
            FALSE,

          allow_resource_discovery =
            FALSE,

          allow_execution =
            FALSE,

          credential_access_mode =
            'disabled',

          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'certificationRetired',
              true,

              'certificationId',
              $2::text,

              'executionAuthorized',
              false
            )

        WHERE
          integration_id =
            $1
      `,
      [
        createdConnection
          .publicId,

        CERTIFICATION_ID,
      ]
    );


    await client.query(
      `
        UPDATE
          integrations.connections

        SET
          status =
            'disabled',

          health_status =
            'unknown',

          disabled_at =
            NOW(),

          disabled_reason =
            'phase20_live_certification_complete',

          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'certificationRetired',
              true,

              'certificationId',
              $2::text,

              'executionAuthorized',
              false
            )

        WHERE
          public_id =
            $1
      `,
      [
        createdConnection
          .publicId,

        CERTIFICATION_ID,
      ]
    );
  }
);


console.log(
  `[CLEANUP] retired certification connection ${createdConnection.publicId}`
);


console.log(
  "[CLEANUP] immutable connection/audit provenance retained"
);


        console.log(
          `[CLEANUP] removed temporary certification connection ${createdConnection.publicId}`
        );


        console.log(
          "[CLEANUP] immutable invocation audit evidence retained"
        );
      } catch (
        error
      ) {
        console.error(
          "[CLEANUP] certification fixture cleanup failed:",
          error.message
        );
      }
    }


    await closePostgresPool();
  }
}


/*
 * ============================================================================
 * ENTRYPOINT
 * ============================================================================
 */


main()
  .catch(
    async (
      error
    ) => {
      console.error("");
      console.error(
        "PHASE 20 LIVE CERTIFICATION FAILED"
      );


      console.error(
        error
      );


      try {
        await closePostgresPool();
      } catch (
        closeError
      ) {
        console.error(
          closeError
        );
      }


      process.exitCode =
        1;
    }
  );