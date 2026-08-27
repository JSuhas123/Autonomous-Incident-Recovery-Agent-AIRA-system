#!/usr/bin/env node
"use strict";

/**
 * ============================================================================
 * AIRA PHASE 16.10
 * PROCEDURAL MEMORY LIVE CERTIFICATION FIXTURES
 * ============================================================================
 *
 * Creates:
 *
 *   3 distinct CLOSED development incidents
 *   3 canonical OUTCOME memories
 *
 * Every outcome represents the same successful recovery action:
 *
 *   restart-service
 *
 * This intentionally starts at the canonical OUTCOME-memory boundary because
 * Phase 16.9 already owns/certifies conversion from recovery verification into
 * OUTCOME memory.
 *
 * Phase 16.10 consumes canonical OUTCOME memories.
 *
 * PostgreSQL remains authoritative.
 * Qdrant remains retrieval only.
 * ============================================================================
 */

require(
  "dotenv"
).config({
  path:
    ".env",
});


const crypto =
  require(
    "node:crypto"
  );


const {
  getPostgresPool,
} =
  require(
    "./persistence/postgres/postgresPool"
  );


const {
  closePostgresPool,
} =
  require(
    "./persistence/postgres"
  );


const {
  canonicalMemoryService,
} =
  require(
    "./services/memory/canonicalMemoryService"
  );


const {
  memoryIndexService,
} =
  require(
    "./services/memory/vector/memoryIndexService"
  );


const ORGANIZATION_PUBLIC_ID =
  "aira-dev-org";


const ENVIRONMENT_PUBLIC_ID =
  "env_aira_development";


const ACTION =
  "restart-service";


const SERVICE_ID =
  "phase16-certification-service";


const FIXTURE_PREFIX =
  "phase16_10_cert";


function section(
  title
) {
  console.log(
    "\n" +
    "=".repeat(
      72
    )
  );

  console.log(
    title
  );

  console.log(
    "=".repeat(
      72
    )
  );
}


async function resolveScope(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          o.id AS organization_id,
          o.public_id AS organization_public_id,

          e.id AS environment_id,
          e.public_id AS environment_public_id

        FROM tenancy.organizations o

        JOIN tenancy.environments e
          ON e.organization_id =
            o.id

        WHERE
          o.public_id =
            $1

          AND e.public_id =
            $2

        LIMIT 1
      `,
      [
        ORGANIZATION_PUBLIC_ID,
        ENVIRONMENT_PUBLIC_ID,
      ]
    );


  if (
    !result.rows[0]
  ) {
    throw new Error(
      "aira-dev-org / env_aira_development not found"
    );
  }


  return result.rows[0];
}


async function findExistingFixtures(
  pool,
  scope
) {
  const result =
    await pool.query(
      `
        SELECT
          i.id,
          i.public_id,
          i.status,
          i.closed_at

        FROM incidents.incidents i

        WHERE
          i.organization_id =
            $1

          AND i.environment_id =
            $2

          AND i.public_id LIKE
            $3

        ORDER BY
          i.public_id
      `,
      [
        scope.organization_id,
        scope.environment_id,
        `${FIXTURE_PREFIX}_inc_%`,
      ]
    );


  return result.rows;
}


async function createIncident(
  pool,
  scope,
  index
) {
  const publicId =
    `${FIXTURE_PREFIX}_inc_${index}`;


  const existing =
    await pool.query(
      `
        SELECT
          id,
          public_id,
          status,
          closed_at

        FROM incidents.incidents

        WHERE public_id =
          $1

        LIMIT 1
      `,
      [
        publicId,
      ]
    );


  if (
    existing.rows[0]
  ) {
    return existing.rows[0];
  }


  const id =
    crypto
      .randomUUID();


  const now =
    new Date();


  const result =
    await pool.query(
      `
        INSERT INTO incidents.incidents (
          id,
          public_id,
          organization_id,
          environment_id,
          status,
          severity,
          title,
          description,
          created_at,
          updated_at,
          closed_at
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          'CLOSED',
          'high',
          $5,
          $6,
          $7,
          $7,
          $7
        )

        RETURNING
          id,
          public_id,
          status,
          closed_at
      `,
      [
        id,

        publicId,

        scope.organization_id,

        scope.environment_id,

        `Phase 16.10 certification incident ${index}`,

        (
          "Controlled development incident used only to certify " +
          "Procedural Memory synthesis."
        ),

        now,
      ]
    );


  return result.rows[0];
}


async function createOutcomeMemory({
  incident,
  index,
}) {
  const publicId =
    `${FIXTURE_PREFIX}_outcome_${index}`;


  const result =
    await canonicalMemoryService
      .upsertByPublicId(
        {
          publicId,

          organizationId:
            ORGANIZATION_PUBLIC_ID,

          environmentId:
            ENVIRONMENT_PUBLIC_ID,

          serviceId:
            SERVICE_ID,

          incidentId:
            incident.public_id,

          memoryType:
            "OUTCOME",

          scopeType:
            "INCIDENT",

          title:
            `Phase 16.10 successful outcome ${index}`,

          summary:
            (
              `${ACTION} successfully recovered ` +
              `certification incident ${incident.public_id}.`
            ),

          content: {
            incident: {
              id:
                incident.public_id,

              status:
                "CLOSED",

              severity:
                "high",

              serviceId:
                SERVICE_ID,
            },

            recoveryDecision: {
              action:
                ACTION,

              decision:
                ACTION,

              executionAuthorized:
                false,
            },

            verification: {
              recoveryConfirmed:
                true,

              incidentClosureEligible:
                true,

              confidence:
                0.95,

              overallScore:
                0.95,

              verifiedAt:
                new Date()
                  .toISOString(),
            },

            outcome: {
              classification:
                "SUCCESS",

              successful:
                true,

              failed:
                false,

              inconclusive:
                false,

              closureEligible:
                true,

              recoveryConfirmed:
                true,
            },
          },

          confidence:
            0.95,

          trustScore:
            0.92,

          importance:
            0.9,

          status:
            "ACTIVE",

          sourceType:
            "PHASE16_10_CERTIFICATION",

          sourceCount:
            0,

          evidenceCount:
            1,

          observationCount:
            1,

          observedAt:
            new Date(),

          validFrom:
            incident.closed_at ||
            new Date(),

          validUntil:
            null,

          supersedesMemoryId:
            null,

          legacySourceType:
            null,

          legacySourceId:
            null,

          metadata: {
            phase:
              "16.10",

            certificationFixture:
              true,

            fixtureIndex:
              index,

            authoritativeStore:
              "postgresql",

            retrievalStore:
              "qdrant",

            executionAuthorized:
              false,
          },

          schemaVersion:
            1,
        },
        {
          changeReason:
            "Phase 16.10 controlled outcome fixture synchronization",

          changedByType:
            "CERTIFICATION",
        }
      );


  await canonicalMemoryService
    .addSource({
      organizationId:
        ORGANIZATION_PUBLIC_ID,

      memoryPublicId:
        publicId,

      sourceType:
        "INCIDENT",

      sourceId:
        incident.public_id,

      evidenceRole:
        "PRIMARY",

      observedAt:
        incident.closed_at ||
        new Date(),

      metadata: {
        phase:
          "16.10",

        certificationFixture:
          true,
      },
    });


  let indexing;


  try {
    indexing =
      await memoryIndexService
        .indexMemory({
          organizationId:
            ORGANIZATION_PUBLIC_ID,

          publicId,
        });

  } catch (
    error
  ) {
    indexing = {
      indexed:
        false,

      error: {
        code:
          error.code ||
          "INDEX_FAILED",

        message:
          error.message,
      },
    };
  }


  return {
    publicId,

    created:
      result.created,

    updated:
      result.updated,

    memory:
      result.memory,

    indexing,
  };
}


async function main() {
  const pool =
    getPostgresPool();


  try {
    section(
      "AIRA PHASE 16.10 — CERTIFICATION FIXTURES"
    );


    const scope =
      await resolveScope(
        pool
      );


    console.log(
      `Organization: ${scope.organization_public_id}`
    );

    console.log(
      `Organization UUID: ${scope.organization_id}`
    );

    console.log(
      `Environment: ${scope.environment_public_id}`
    );

    console.log(
      `Environment UUID: ${scope.environment_id}`
    );


    const existing =
      await findExistingFixtures(
        pool,
        scope
      );


    console.log(
      `Existing certification incidents: ${existing.length}`
    );


    const results =
      [];


    for (
      let index = 1;
      index <= 3;
      index += 1
    ) {
      section(
        `FIXTURE ${index}`
      );


      const incident =
        await createIncident(
          pool,
          scope,
          index
        );


      console.log(
        "Incident:"
      );

      console.log(
        JSON.stringify(
          incident,
          null,
          2
        )
      );


      const outcome =
        await createOutcomeMemory({
          incident,
          index,
        });


      console.log(
        "\nOutcome:"
      );

      console.log(
        JSON.stringify(
          {
            publicId:
              outcome.publicId,

            created:
              outcome.created,

            updated:
              outcome.updated,

            memoryType:
              outcome
                .memory
                ?.memoryType,

            scopeType:
              outcome
                .memory
                ?.scopeType,

            incidentId:
              outcome
                .memory
                ?.incidentId,

            serviceId:
              outcome
                .memory
                ?.serviceId,

            action:
              outcome
                .memory
                ?.content
                ?.recoveryDecision
                ?.action,

            classification:
              outcome
                .memory
                ?.content
                ?.outcome
                ?.classification,

            indexed:
              outcome
                .indexing
                ?.indexed,
          },
          null,
          2
        )
      );


      results.push({
        incident,
        outcome,
      });
    }


    section(
      "FIXTURE SUMMARY"
    );


    console.log(
      JSON.stringify(
        results.map(
          (
            item
          ) => ({
            incident:
              item
                .incident
                .public_id,

            outcome:
              item
                .outcome
                .publicId,

            action:
              ACTION,

            classification:
              "SUCCESS",
          })
        ),
        null,
        2
      )
    );


    console.log(
      "\n✓ Phase 16.10 controlled evidence set ready"
    );


  } catch (
    error
  ) {
    console.error(
      "\nFAILED:",
      {
        code:
          error.code,

        message:
          error.message,

        detail:
          error.detail,

        constraint:
          error.constraint,
      }
    );


    process.exitCode =
      1;

  } finally {
    await closePostgresPool();
  }
}


main();