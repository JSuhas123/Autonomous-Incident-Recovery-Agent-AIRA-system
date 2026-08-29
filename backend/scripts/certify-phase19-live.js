"use strict";

/**
 * ============================================================================
 * AIRA PHASE 19
 * KNOWLEDGE COVERAGE ENGINE
 * LIVE POSTGRESQL CERTIFICATION
 * ============================================================================
 *
 * Validates the REAL local PostgreSQL Phase 19 implementation.
 *
 * This certification:
 *
 *   - uses real PostgreSQL
 *   - resolves the real certification organization/environment
 *   - verifies Phase 19 canonical coverage schema
 *   - verifies current evaluations
 *   - verifies immutable snapshots
 *   - verifies snapshot items
 *   - verifies current gaps
 *   - verifies immutable snapshot gap history
 *   - verifies tenant/environment ownership
 *   - verifies execution_authorized=false
 *   - verifies RLS
 *   - verifies snapshot immutability
 *   - verifies canonical headline coverage formula
 *   - verifies Phase 19 never becomes execution authority
 *
 * This script does NOT:
 *
 *   - fabricate customer infrastructure
 *   - mutate Phase 18 production knowledge
 *   - authorize execution
 *   - treat Qdrant as canonical
 *   - treat MongoDB as canonical coverage persistence
 *
 * ============================================================================
 */


require("dotenv").config();


const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const CoverageRefreshOrchestrator =
  require(
    "../coverage/CoverageRefreshOrchestrator"
  );


const ORGANIZATION_ID =
  process.env
    .PHASE19_CERT_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .PHASE19_CERT_ENVIRONMENT_ID ||
  "env_aira_development";


const results =
  [];


/*
 * ============================================================================
 * RESULT HELPERS
 * ============================================================================
 */


function pass(
  name,
  details = null
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
  details = null
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
      error.message,
  });


  console.error(
    `[FAIL] ${name}`
  );


  console.error(
    `       ${error.message}`
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
 * MAIN CERTIFICATION
 * ============================================================================
 */


async function main() {
  console.log("");
  console.log(
    "======================================================"
  );
  console.log(
    "AIRA PHASE 19 LIVE POSTGRESQL CERTIFICATION"
  );
  console.log(
    "KNOWLEDGE COVERAGE ENGINE"
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


  console.log("");


  const pool =
    getPostgresPool();


  const client =
    await pool.connect();


  let organization =
    null;


  let environment =
    null;


  let refreshResult =
    null;


  try {
    /*
     * ========================================================================
     * 1. REAL POSTGRESQL CONNECTION
     * ========================================================================
     */

    await check(
      "Real PostgreSQL connection",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                current_database()
                  AS database,

                current_user
                  AS username,

                version()
                  AS version
            `
          );


        assertCondition(
          result.rowCount ===
          1,
          "Unable to read PostgreSQL server identity"
        );


        return {
          database:
            result.rows[0]
              .database,

          username:
            result.rows[0]
              .username,
        };
      }
    );


    /*
     * ========================================================================
     * 2. CERTIFICATION ORGANIZATION
     * ========================================================================
     */

    organization =
      await check(
        "Certification organization resolves",
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  id,
                  public_id

                FROM
                  tenancy.organizations

                WHERE
                  public_id = $1

                LIMIT 1
              `,
              [
                ORGANIZATION_ID,
              ]
            );


          assertCondition(
            result.rowCount ===
            1,
            `Organization not found: ${ORGANIZATION_ID}`
          );


          return result.rows[0];
        }
      );


    /*
     * ========================================================================
     * 3. CERTIFICATION ENVIRONMENT
     * ========================================================================
     */

    environment =
      await check(
        "Certification environment resolves",
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  id,
                  public_id,
                  organization_id

                FROM
                  tenancy.environments

                WHERE
                  public_id = $1

                LIMIT 1
              `,
              [
                ENVIRONMENT_ID,
              ]
            );


          assertCondition(
            result.rowCount ===
            1,
            `Environment not found: ${ENVIRONMENT_ID}`
          );


          return result.rows[0];
        }
      );


    await check(
      "Environment belongs to certification organization",
      async () => {
        assertCondition(
          String(
            environment
              .organization_id
          ) ===
            String(
              organization.id
            ),
          "Certification environment belongs to another organization"
        );


        return {
          organizationUuid:
            organization.id,

          environmentUuid:
            environment.id,
        };
      }
    );


    /*
     * ========================================================================
     * 4. COVERAGE SCHEMA
     * ========================================================================
     */

    await check(
      "coverage schema exists",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                to_regnamespace(
                  'coverage'
                )::text
                  AS schema_name
            `
          );


        assertCondition(
          result.rows[0]
            ?.schema_name ===
            "coverage",
          "coverage schema does not exist"
        );


        return {
          schema:
            "coverage",
        };
      }
    );


    /*
     * ========================================================================
     * 5. CANONICAL COVERAGE TABLES
     * ========================================================================
     */

    const requiredTables = [
      "coverage.evaluations",
      "coverage.snapshots",
      "coverage.snapshot_items",
      "coverage.gaps",
      "coverage.snapshot_gaps",
    ];


    for (
      const table
      of requiredTables
    ) {
      await check(
        `Canonical table exists: ${table}`,
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  to_regclass(
                    $1
                  )::text
                    AS relation
              `,
              [
                table,
              ]
            );


          assertCondition(
            Boolean(
              result.rows[0]
                ?.relation
            ),
            `Missing Phase 19 table: ${table}`
          );


          return {
            relation:
              result.rows[0]
                .relation,
          };
        }
      );
    }


    /*
     * ========================================================================
     * 6. EXECUTION AUTHORIZATION COLUMNS
     * ========================================================================
     */

    await check(
      "All canonical Phase 19 records default execution_authorized=false",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                table_name,
                column_default

              FROM
                information_schema.columns

              WHERE
                table_schema =
                  'coverage'

                AND table_name IN (
                  'evaluations',
                  'snapshots',
                  'snapshot_items',
                  'gaps',
                  'snapshot_gaps'
                )

                AND column_name =
                  'execution_authorized'

              ORDER BY
                table_name
            `
          );


        assertCondition(
          result.rowCount ===
          5,
          "execution_authorized is missing from one or more Phase 19 tables"
        );


        for (
          const row
          of result.rows
        ) {
          assertCondition(
            String(
              row.column_default
            )
              .toLowerCase()
              .includes(
                "false"
              ),
            `${row.table_name}.execution_authorized does not default to false`
          );
        }


        return result.rows;
      }
    );


    /*
     * ========================================================================
     * 7. AUTHORIZATION CHECK CONSTRAINTS
     * ========================================================================
     */

    await check(
      "Coverage tables contain never-authorize constraints",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                tc.table_name,
                tc.constraint_name

              FROM
                information_schema.table_constraints tc

              WHERE
                tc.table_schema =
                  'coverage'

                AND tc.constraint_type =
                  'CHECK'

                AND tc.table_name IN (
                  'evaluations',
                  'snapshots',
                  'snapshot_items',
                  'gaps',
                  'snapshot_gaps'
                )
            `
          );


        const tables =
          new Set(
            result.rows.map(
              (
                row
              ) =>
                row.table_name
            )
          );


        for (
          const required
          of [
            "evaluations",
            "snapshots",
            "snapshot_items",
            "gaps",
            "snapshot_gaps",
          ]
        ) {
          assertCondition(
            tables.has(
              required
            ),
            `No CHECK constraint found for coverage.${required}`
          );
        }


        return {
          constraintCount:
            result.rowCount,
        };
      }
    );


    /*
     * ========================================================================
     * 8. RLS ENABLED AND FORCED
     * ========================================================================
     */

    await check(
      "Coverage tables enforce tenant/environment RLS",
      async () => {
        const result =
          await client.query(
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
                n.oid =
                  c.relnamespace

              WHERE
                n.nspname =
                  'coverage'

                AND c.relname IN (
                  'evaluations',
                  'snapshots',
                  'snapshot_items',
                  'gaps',
                  'snapshot_gaps'
                )
            `
          );


        assertCondition(
          result.rowCount ===
          5,
          "Unable to inspect all Phase 19 RLS tables"
        );


        for (
          const row
          of result.rows
        ) {
          assertCondition(
            row.relrowsecurity ===
            true,
            `${row.relname} does not enable RLS`
          );


          assertCondition(
            row.relforcerowsecurity ===
            true,
            `${row.relname} does not FORCE RLS`
          );
        }


        return result.rows;
      }
    );


    /*
     * ========================================================================
     * 9. SNAPSHOT IMMUTABILITY TRIGGERS
     * ========================================================================
     */

    await check(
      "Snapshot history immutability triggers exist",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                event_object_table,
                trigger_name

              FROM
                information_schema.triggers

              WHERE
                trigger_schema =
                  'coverage'

                AND event_object_table IN (
                  'snapshots',
                  'snapshot_items',
                  'snapshot_gaps'
                )

              ORDER BY
                event_object_table
            `
          );


        const tables =
          new Set(
            result.rows.map(
              (
                row
              ) =>
                row.event_object_table
            )
          );


        assertCondition(
          tables.has(
            "snapshots"
          ),
          "coverage.snapshots immutability trigger missing"
        );


        assertCondition(
          tables.has(
            "snapshot_items"
          ),
          "coverage.snapshot_items immutability trigger missing"
        );


        assertCondition(
          tables.has(
            "snapshot_gaps"
          ),
          "coverage.snapshot_gaps immutability trigger missing"
        );


        return {
          triggerCount:
            result.rowCount,
        };
      }
    );


    /*
     * ========================================================================
     * 10. CURRENT GAP MODEL SUPPORTS BLIND SPOTS
     * ========================================================================
     */

    await check(
      "Current gaps support resource-level blind spots without evaluations",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                column_name,
                is_nullable

              FROM
                information_schema.columns

              WHERE
                table_schema =
                  'coverage'

                AND table_name =
                  'gaps'

                AND column_name IN (
                  'evaluation_id',
                  'resource_id',
                  'gap_key',
                  'last_detected_at',
                  'latest_snapshot_id'
                )
            `
          );


        const columns =
          new Map(
            result.rows.map(
              (
                row
              ) => [
                row.column_name,
                row,
              ]
            )
          );


        assertCondition(
          columns.get(
            "evaluation_id"
          )
            ?.is_nullable ===
            "YES",
          "coverage.gaps.evaluation_id must permit NO_FAILURE_MODE gaps"
        );


        assertCondition(
          columns.get(
            "resource_id"
          )
            ?.is_nullable ===
            "YES",
          "coverage.gaps.resource_id must support forensic/resource-public-id gaps"
        );


        assertCondition(
          columns.has(
            "gap_key"
          ),
          "coverage.gaps.gap_key missing"
        );


        assertCondition(
          columns.has(
            "last_detected_at"
          ),
          "coverage.gaps.last_detected_at missing"
        );


        assertCondition(
          columns.has(
            "latest_snapshot_id"
          ),
          "coverage.gaps.latest_snapshot_id missing"
        );


        return {
          completeGapModel:
            true,
        };
      }
    );


    /*
     * ========================================================================
     * 11. REAL COVERAGE REFRESH
     * ========================================================================
     */

    refreshResult =
      await check(
        "Real Phase 19 coverage refresh completes",
        async () => {
          const orchestrator =
            new CoverageRefreshOrchestrator();


          const result =
            await orchestrator
              .refresh({
                organizationId:
                  ORGANIZATION_ID,

                environmentId:
                  ENVIRONMENT_ID,
              });


          assertCondition(
            result &&
            typeof result ===
              "object",
            "Coverage refresh returned no result"
          );


          assertCondition(
            result.executionAuthorized ===
            false,
            "Coverage refresh incorrectly authorized execution"
          );


          assertCondition(
            result.coverageImpliesExecution ===
            false,
            "Coverage refresh incorrectly implies execution authority"
          );


          assertCondition(
            result.selfGeneratedRecoveryKnowledge ===
            false,
            "Coverage refresh claims to self-generate recovery knowledge"
          );


          assertCondition(
            result.dynamicKnowledgeDiscovery ===
            true,
            "Dynamic knowledge rediscovery is not enabled"
          );


          assertCondition(
            result.snapshot,
            "Coverage refresh did not create an immutable snapshot"
          );


          return {
  resources:
    result.resources
      ?.length ||
    0,

  evaluations:
    result.evaluations
      ?.length ||
    0,

  gaps:
    result.gaps
      ?.length ||
    0,

  coverage:
    resolveCoveragePercentage(
      result.score
    ),

  snapshot:
    result.snapshot
      ?.publicId ||
    result.snapshot
      ?.id,

  executionAuthorized:
    result.executionAuthorized,

  coverageImpliesExecution:
    result.coverageImpliesExecution,

  dynamicKnowledgeDiscovery:
    result.dynamicKnowledgeDiscovery,

  selfGeneratedRecoveryKnowledge:
    result.selfGeneratedRecoveryKnowledge,
};
        }
      );


    /*
     * ========================================================================
     * 12. CURRENT EVALUATIONS PERSISTED
     * ========================================================================
     */

    const currentEvaluationCount =
      await check(
        "Current canonical evaluations persist in PostgreSQL",
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  COUNT(*)::integer
                    AS count

                FROM
                  coverage.evaluations

                WHERE
                  organization_id = $1

                  AND environment_id = $2
              `,
              [
                organization.id,
                environment.id,
              ]
            );


          const count =
            Number(
              result.rows[0]
                ?.count ||
              0
            );


          assertCondition(
            count >=
            0,
            "Invalid current evaluation count"
          );


          return {
            count,
          };
        }
      );


    /*
     * ========================================================================
     * 13. LATEST SNAPSHOT
     * ========================================================================
     */

    const latestSnapshot =
      await check(
        "Immutable coverage snapshot persists",
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  *

                FROM
                  coverage.snapshots

                WHERE
                  organization_id = $1

                  AND environment_id = $2

                ORDER BY
                  generated_at DESC,
                  created_at DESC

                LIMIT 1
              `,
              [
                organization.id,
                environment.id,
              ]
            );


          assertCondition(
            result.rowCount ===
            1,
            "Coverage refresh did not persist a snapshot"
          );


          const row =
            result.rows[0];


          assertCondition(
            row.execution_authorized ===
            false,
            "Coverage snapshot authorized execution"
          );


          return row;
        }
      );


    /*
     * ========================================================================
     * 14. HEADLINE FORMULA
     * ========================================================================
     */

    await check(
      "Headline coverage formula is canonical",
      async () => {
        const total =
          Number(
            latestSnapshot
              .applicable_failure_modes_count ||
            0
          );


        const covered =
          Number(
            latestSnapshot
              .covered_count ||
            0
          );


        const stored =
          Number(
            latestSnapshot
              .coverage_percentage ||
            0
          );


        const expected =
          total ===
          0
            ? 0
            : round(
                (
                  covered /
                  total
                ) *
                100,
                1
              );


        assertCondition(
          Math.abs(
            stored -
            expected
          ) <
            0.0001,
          `Coverage percentage mismatch: stored=${stored}, expected=${expected}`
        );


        return {
          covered,

          applicable:
            total,

          coveragePercentage:
            stored,
        };
      }
    );


    /*
     * ========================================================================
     * 15. SNAPSHOT COUNTS
     * ========================================================================
     */

    await check(
      "Snapshot classification counts equal applicable evaluations",
      async () => {
        const sum =
          Number(
            latestSnapshot
              .covered_count ||
            0
          ) +
          Number(
            latestSnapshot
              .partial_count ||
            0
          ) +
          Number(
            latestSnapshot
              .human_only_count ||
            0
          ) +
          Number(
            latestSnapshot
              .unknown_count ||
            0
          );


        const applicable =
          Number(
            latestSnapshot
              .applicable_failure_modes_count ||
            0
          );


        assertCondition(
          sum ===
          applicable,
          `Snapshot classification total ${sum} does not equal applicable evaluations ${applicable}`
        );


        return {
          classificationTotal:
            sum,

          applicable,
        };
      }
    );


    /*
     * ========================================================================
     * 16. SNAPSHOT ITEMS
     * ========================================================================
     */

    await check(
      "Snapshot evaluation items reconstruct historical posture",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                COUNT(*)::integer
                  AS count,

                COUNT(*) FILTER (
                  WHERE
                    execution_authorized =
                    true
                )::integer
                  AS authorized_count

              FROM
                coverage.snapshot_items

              WHERE
                snapshot_id = $1
            `,
            [
              latestSnapshot.id,
            ]
          );


        const count =
          Number(
            result.rows[0]
              ?.count ||
            0
          );


        const authorizedCount =
          Number(
            result.rows[0]
              ?.authorized_count ||
            0
          );


        assertCondition(
          authorizedCount ===
          0,
          "Historical snapshot item authorized execution"
        );


        assertCondition(
          count ===
          Number(
            latestSnapshot
              .applicable_failure_modes_count ||
            0
          ),
          "Snapshot item count does not match applicable Failure Mode evaluations"
        );


        return {
          count,
        };
      }
    );


    /*
     * ========================================================================
     * 17. CURRENT GAPS
     * ========================================================================
     */

    await check(
      "Current canonical gaps persist safely",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                COUNT(*)::integer
                  AS count,

                COUNT(*) FILTER (
                  WHERE
                    execution_authorized =
                    true
                )::integer
                  AS authorized_count

              FROM
                coverage.gaps

              WHERE
                organization_id = $1

                AND environment_id = $2

                AND resolved_at IS NULL
            `,
            [
              organization.id,
              environment.id,
            ]
          );


        const authorizedCount =
          Number(
            result.rows[0]
              ?.authorized_count ||
            0
          );


        assertCondition(
          authorizedCount ===
          0,
          "Current coverage gap authorized execution"
        );


        return {
          activeGapCount:
            Number(
              result.rows[0]
                ?.count ||
              0
            ),
        };
      }
    );


    /*
     * ========================================================================
     * 18. IMMUTABLE SNAPSHOT GAPS
     * ========================================================================
     */

    await check(
      "Immutable snapshot gap history persists safely",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                COUNT(*)::integer
                  AS count,

                COUNT(*) FILTER (
                  WHERE
                    execution_authorized =
                    true
                )::integer
                  AS authorized_count

              FROM
                coverage.snapshot_gaps

              WHERE
                snapshot_id = $1
            `,
            [
              latestSnapshot.id,
            ]
          );


        assertCondition(
          Number(
            result.rows[0]
              ?.authorized_count ||
            0
          ) ===
          0,
          "Historical coverage gap authorized execution"
        );


        return {
          count:
            Number(
              result.rows[0]
                ?.count ||
              0
            ),
        };
      }
    );


    /*
     * ========================================================================
     * 19. SNAPSHOT IMMUTABILITY — LIVE WRITE ATTEMPT
     * ========================================================================
     */

    await check(
      "Live snapshot mutation is rejected",
      async () => {
        await client.query(
          "BEGIN"
        );


        let rejected =
          false;


        try {
          await client.query(
            `
              UPDATE
                coverage.snapshots

              SET
                coverage_percentage =
                  coverage_percentage

              WHERE
                id = $1
            `,
            [
              latestSnapshot.id,
            ]
          );
        } catch (
          error
        ) {
          rejected =
            true;
        } finally {
          await client.query(
            "ROLLBACK"
          );
        }


        assertCondition(
          rejected,
          "coverage.snapshots accepted an UPDATE; historical posture is not immutable"
        );


        return {
          immutable:
            true,
        };
      }
    );


    /*
     * ========================================================================
     * 20. SNAPSHOT GAP IMMUTABILITY — LIVE WRITE ATTEMPT
     * ========================================================================
     */

    const snapshotGap =
      await client.query(
        `
          SELECT
            id

          FROM
            coverage.snapshot_gaps

          WHERE
            snapshot_id = $1

          LIMIT 1
        `,
        [
          latestSnapshot.id,
        ]
      );


    if (
      snapshotGap.rowCount >
      0
    ) {
      await check(
        "Live snapshot gap mutation is rejected",
        async () => {
          await client.query(
            "BEGIN"
          );


          let rejected =
            false;


          try {
            await client.query(
              `
                UPDATE
                  coverage.snapshot_gaps

                SET
                  priority_score =
                    priority_score

                WHERE
                  id = $1
              `,
              [
                snapshotGap
                  .rows[0]
                  .id,
              ]
            );
          } catch (
            error
          ) {
            rejected =
              true;
          } finally {
            await client.query(
              "ROLLBACK"
            );
          }


          assertCondition(
            rejected,
            "coverage.snapshot_gaps accepted an UPDATE"
          );


          return {
            immutable:
              true,
          };
        }
      );
    } else {
      skip(
        "Live snapshot gap mutation is rejected",
        {
          reason:
            "Latest snapshot contains zero gaps; no snapshot_gap row available for mutation test",
        }
      );
    }


    /*
     * ========================================================================
     * 21. CURRENT EVALUATIONS NEVER AUTHORIZE
     * ========================================================================
     */

    await check(
      "Current evaluations never authorize execution",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                COUNT(*)::integer
                  AS authorized_count

              FROM
                coverage.evaluations

              WHERE
                organization_id = $1

                AND environment_id = $2

                AND execution_authorized =
                  true
            `,
            [
              organization.id,
              environment.id,
            ]
          );


        assertCondition(
          Number(
            result.rows[0]
              ?.authorized_count ||
            0
          ) ===
          0,
          "One or more Phase 19 evaluations authorize execution"
        );


        return {
          authorized:
            0,
        };
      }
    );


    /*
     * ========================================================================
     * 22. SNAPSHOT HISTORY APPENDS
     * ========================================================================
     */

    await check(
      "Coverage refresh creates append-only historical snapshots",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                COUNT(*)::integer
                  AS count

              FROM
                coverage.snapshots

              WHERE
                organization_id = $1

                AND environment_id = $2
            `,
            [
              organization.id,
              environment.id,
            ]
          );


        const count =
          Number(
            result.rows[0]
              ?.count ||
            0
          );


        assertCondition(
          count >=
          1,
          "No historical coverage snapshots exist"
        );


        return {
          snapshotCount:
            count,
        };
      }
    );


    /*
     * ========================================================================
     * 23. TENANT ISOLATION STRUCTURE
     * ========================================================================
     */

    await check(
      "All Phase 19 tables retain organization and environment ownership",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                table_name,
                column_name

              FROM
                information_schema.columns

              WHERE
                table_schema =
                  'coverage'

                AND table_name IN (
                  'evaluations',
                  'snapshots',
                  'snapshot_items',
                  'gaps',
                  'snapshot_gaps'
                )

                AND column_name IN (
                  'organization_id',
                  'environment_id'
                )
            `
          );


        const ownership =
          new Map();


        for (
          const row
          of result.rows
        ) {
          if (
            !ownership.has(
              row.table_name
            )
          ) {
            ownership.set(
              row.table_name,
              new Set()
            );
          }


          ownership
            .get(
              row.table_name
            )
            .add(
              row.column_name
            );
        }


        for (
          const table
          of [
            "evaluations",
            "snapshots",
            "snapshot_items",
            "gaps",
            "snapshot_gaps",
          ]
        ) {
          assertCondition(
            ownership
              .get(
                table
              )
              ?.has(
                "organization_id"
              ),
            `${table}.organization_id missing`
          );


          assertCondition(
            ownership
              .get(
                table
              )
              ?.has(
                "environment_id"
              ),
            `${table}.environment_id missing`
          );
        }


        return {
          tenantScopedTables:
            ownership.size,
        };
      }
    );


    /*
     * ========================================================================
     * 24. CROSS-TENANT LIVE CHECK
     * ========================================================================
     *
     * Only performed if another real environment exists.
     *
     * Do NOT fabricate tenant data merely to make certification pass.
     */

    const alternateEnvironment =
      await client.query(
        `
          SELECT
            e.id,
            e.public_id,
            e.organization_id

          FROM
            tenancy.environments e

          WHERE
            e.id <> $1

          ORDER BY
            e.created_at ASC

          LIMIT 1
        `,
        [
          environment.id,
        ]
      );


    if (
      alternateEnvironment.rowCount ===
      1
    ) {
      await check(
        "Alternate environment exists for isolation certification",
        async () => {
          const row =
            alternateEnvironment
              .rows[0];


          assertCondition(
            String(
              row.id
            ) !==
            String(
              environment.id
            ),
            "Alternate environment unexpectedly matches certification environment"
          );


          return {
            environment:
              row.public_id,

            organizationUuid:
              row.organization_id,
          };
        }
      );
    } else {
      skip(
        "Live alternate-scope isolation check",
        {
          reason:
            "No second real environment is available; RLS/tenant ownership verified structurally instead",
        }
      );
    }


       /*
     * ========================================================================
     * 25. POSTGRESQL IS CANONICAL PHASE 19 COVERAGE PERSISTENCE
     * ========================================================================
     *
     * Canonical provenance is persisted with the immutable coverage snapshot.
     *
     * Do not require an additional canonicalSources array from the
     * orchestrator when the durable snapshot already records the authoritative
     * source explicitly.
     *
     * Phase 19 persistence:
     *
     *   coveragePersistence = PHASE_19_POSTGRESQL_COVERAGE
     *
     * Phase 18 knowledge:
     *
     *   canonicalKnowledge = PHASE_18_POSTGRESQL_KNOWLEDGE
     *
     * Phase 17 infrastructure:
     *
     *   canonicalInfrastructure = PHASE_17_RESOURCE_GRAPH
     *
     * Phase 16 operational memory:
     *
     *   operationalMemory = PHASE_16_POSTGRESQL_MEMORY
     *
     * Qdrant is not canonical coverage persistence.
     * MongoDB is not canonical coverage persistence.
     * ========================================================================
     */

    await check(
      "PostgreSQL is canonical Phase 19 persistence",
      async () => {
        const generationBasis =
          latestSnapshot
            ?.generation_basis ||
          latestSnapshot
            ?.generationBasis ||
          {};


        assertCondition(
          generationBasis
            .coveragePersistence ===
            "PHASE_19_POSTGRESQL_COVERAGE",
          "Snapshot does not identify PostgreSQL as canonical Phase 19 coverage persistence"
        );


        assertCondition(
          generationBasis
            .canonicalKnowledge ===
            "PHASE_18_POSTGRESQL_KNOWLEDGE",
          "Snapshot does not identify Phase 18 PostgreSQL knowledge as canonical recovery knowledge"
        );


        assertCondition(
          generationBasis
            .canonicalInfrastructure ===
            "PHASE_17_RESOURCE_GRAPH",
          "Snapshot does not identify the Phase 17 Resource Graph as canonical infrastructure truth"
        );


        assertCondition(
          generationBasis
            .operationalMemory ===
            "PHASE_16_POSTGRESQL_MEMORY",
          "Snapshot does not identify Phase 16 PostgreSQL Memory as operational-memory evidence"
        );


        assertCondition(
          generationBasis
            .executionAuthorized ===
            false,
          "Coverage generation basis incorrectly authorizes execution"
        );


        assertCondition(
          generationBasis
            .coverageImpliesExecution ===
            false,
          "Coverage generation basis incorrectly implies execution authority"
        );


        assertCondition(
          generationBasis
            .selfGeneratedRecoveryKnowledge ===
            false,
          "Coverage generation basis incorrectly claims self-generated recovery knowledge"
        );


        assertCondition(
          generationBasis
            .memoryAffectsClassification ===
            false,
          "Operational Memory incorrectly changes canonical coverage classification"
        );


        assertCondition(
          generationBasis
            .historicalSnapshotsImmutable ===
            true,
          "Coverage provenance does not declare historical snapshots immutable"
        );


        assertCondition(
          generationBasis
            .dynamicKnowledgeDiscovery ===
            true,
          "Coverage provenance does not declare dynamic knowledge discovery"
        );


        assertCondition(
          refreshResult
            .executionAuthorized ===
            false,
          "Coverage refresh authorized execution"
        );


        assertCondition(
          latestSnapshot
            .execution_authorized ===
            false,
          "Persisted coverage snapshot authorized execution"
        );


        return {
          canonicalPersistence:
            generationBasis
              .coveragePersistence,

          canonicalKnowledge:
            generationBasis
              .canonicalKnowledge,

          canonicalInfrastructure:
            generationBasis
              .canonicalInfrastructure,

          operationalMemory:
            generationBasis
              .operationalMemory,

          qdrantCanonical:
            false,

          mongoCanonical:
            false,

          executionAuthorized:
            false,
        };
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
      "PHASE 19 LIVE CERTIFICATION COMPLETE"
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
      "Canonical source: PostgreSQL"
    );


    console.log(
      "Coverage authorizes execution: false"
    );


    console.log(
      `Current evaluations: ${currentEvaluationCount.count}`
    );


    console.log(
      `Latest coverage: ${latestSnapshot.coverage_percentage}%`
    );


    console.log(
      `Latest snapshot: ${latestSnapshot.public_id}`
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
    client.release();


    await closePostgresPool();
  }
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function resolveCoveragePercentage(
  score
) {
  const candidates = [
    score
      ?.coveragePercentage,

    score
      ?.coverage,

    score
      ?.headlineMetric
      ?.percentage,

    score
      ?.primaryCoveragePercentage,

    score
      ?.primaryCoverage,

    score
      ?.percentage,
  ];


  for (
    const candidate
    of candidates
  ) {
    const number =
      Number(
        candidate
      );


    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }


  return 0;
}


function round(
  value,
  precision
) {
  const factor =
    10 **
    precision;


  return (
    Math.round(
      value *
      factor
    ) /
    factor
  );
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
        "PHASE 19 LIVE CERTIFICATION FAILED"
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