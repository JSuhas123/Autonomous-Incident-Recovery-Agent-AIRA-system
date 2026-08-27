#!/usr/bin/env node
"use strict";

/**
 * ============================================================================
 * AIRA PHASE 16.9
 * LIVE OUTCOME VERIFICATION FIXTURE
 * ============================================================================
 *
 * Purpose:
 *
 * Create a SAFE development-only recovery verification that can be used to
 * certify Phase 16.9 Outcome Memory against the REAL PostgreSQL schema.
 *
 * IMPORTANT:
 *
 * - Does NOT guess verification status values.
 * - Reads PostgreSQL CHECK constraints first.
 * - Reuses an existing CLOSED incident.
 * - Uses the real PostgresRecoveryVerificationRepository.
 * - Does NOT fabricate a recovery decision unless one already exists.
 * - Marks the record explicitly as a Phase 16.9 certification fixture.
 *
 * PostgreSQL remains authoritative.
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


const PostgresRecoveryVerificationRepository =
  require(
    "./persistence/postgres/PostgresRecoveryVerificationRepository"
  );


const ORGANIZATION_PUBLIC_ID =
  "aira-dev-org";


const ENVIRONMENT_PUBLIC_ID =
  "env_aira_development";


const PREFERRED_INCIDENT_PUBLIC_ID =
  "inc_cert_1787762657172";


function printSection(
  title
) {
  console.log(
    "\n" +
    "=".repeat(
      70
    )
  );

  console.log(
    title
  );

  console.log(
    "=".repeat(
      70
    )
  );
}


function extractQuotedValues(
  definition
) {
  if (
    typeof definition !==
      "string"
  ) {
    return [];
  }


  const values =
    [];


  const regex =
    /'([^']+)'/g;


  let match;


  while (
    (
      match =
        regex.exec(
          definition
        )
    ) !==
    null
  ) {
    values.push(
      match[1]
    );
  }


  return [
    ...new Set(
      values
    ),
  ];
}


function findAllowedValues(
  constraints,
  columnName
) {
  const relevant =
    constraints
      .filter(
        (
          constraint
        ) =>
          String(
            constraint.definition ||
            ""
          )
            .toLowerCase()
            .includes(
              columnName
                .toLowerCase()
            )
      );


  const values =
    relevant
      .flatMap(
        (
          constraint
        ) =>
          extractQuotedValues(
            constraint.definition
          )
      );


  return [
    ...new Set(
      values
    ),
  ];
}


function chooseAllowedValue({
  allowed,
  preferred,
  fallback,
}) {
  if (
    Array.isArray(
      allowed
    ) &&
    allowed.length >
      0
  ) {
    for (
      const candidate
      of preferred
    ) {
      const exact =
        allowed.find(
          (
            value
          ) =>
            value ===
            candidate
        );


      if (
        exact
      ) {
        return exact;
      }


      const caseInsensitive =
        allowed.find(
          (
            value
          ) =>
            value
              .toLowerCase() ===
            candidate
              .toLowerCase()
        );


      if (
        caseInsensitive
      ) {
        return caseInsensitive;
      }
    }


    return allowed[0];
  }


  return fallback;
}


async function loadVerificationConstraints(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          conname,
          pg_get_constraintdef(
            oid
          ) AS definition

        FROM pg_constraint

        WHERE
          conrelid =
            'execution.recovery_verifications'::regclass

          AND contype =
            'c'

        ORDER BY
          conname
      `
    );


  return result.rows;
}


async function resolveOrganizationAndEnvironment(
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
    result.rows.length ===
      0
  ) {
    throw new Error(
      "AIRA development organization/environment not found"
    );
  }


  return result.rows[0];
}


async function findClosedIncident(
  pool,
  scope
) {
  /**
   * Prefer the already-certified Phase 16.8 incident.
   */
  const preferred =
    await pool.query(
      `
        SELECT
          id,
          public_id,
          status,
          created_at,
          closed_at

        FROM incidents.incidents

        WHERE
          organization_id =
            $1

          AND environment_id =
            $2

          AND public_id =
            $3

          AND status =
            'CLOSED'

        LIMIT 1
      `,
      [
        scope.organization_id,
        scope.environment_id,
        PREFERRED_INCIDENT_PUBLIC_ID,
      ]
    );


  if (
    preferred.rows[0]
  ) {
    return preferred.rows[0];
  }


  const fallback =
    await pool.query(
      `
        SELECT
          id,
          public_id,
          status,
          created_at,
          closed_at

        FROM incidents.incidents

        WHERE
          organization_id =
            $1

          AND environment_id =
            $2

          AND status =
            'CLOSED'

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        scope.organization_id,
        scope.environment_id,
      ]
    );


  if (
    !fallback.rows[0]
  ) {
    throw new Error(
      "No CLOSED incident exists for Phase 16.9 certification"
    );
  }


  return fallback.rows[0];
}


async function main() {
  const pool =
    getPostgresPool();


  try {
    printSection(
      "AIRA PHASE 16.9 — CREATE LIVE OUTCOME FIXTURE"
    );


    const scope =
      await resolveOrganizationAndEnvironment(
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


    const incident =
      await findClosedIncident(
        pool,
        scope
      );


    console.log(
      `\nUsing CLOSED incident: ${incident.public_id}`
    );

    console.log(
      `Incident UUID: ${incident.id}`
    );

    console.log(
      `Status: ${incident.status}`
    );

    console.log(
      `Closed at: ${incident.closed_at}`
    );


    printSection(
      "LIVE RECOVERY VERIFICATION CONSTRAINTS"
    );


    const constraints =
      await loadVerificationConstraints(
        pool
      );


    for (
      const constraint
      of constraints
    ) {
      console.log(
        `${constraint.conname}:`
      );

      console.log(
        `  ${constraint.definition}`
      );
    }


    const allowedStatuses =
      findAllowedValues(
        constraints,
        "status"
      );


    const allowedDecisions =
      findAllowedValues(
        constraints,
        "decision"
      );


    console.log(
      "\nDetected status values:",
      allowedStatuses
    );


    console.log(
      "Detected decision values:",
      allowedDecisions
    );


    const verificationStatus =
      chooseAllowedValue({
        allowed:
          allowedStatuses,

        preferred: [
          "COMPLETED",
          "COMPLETE",
          "VERIFIED",
          "SUCCEEDED",
          "SUCCESS",
          "FINAL",
        ],

        fallback:
          "COMPLETED",
      });


    const verificationDecision =
      chooseAllowedValue({
        allowed:
          allowedDecisions,

        preferred: [
          "RECOVERY_CONFIRMED",
          "CONFIRMED",
          "SUCCESS",
          "SUCCEEDED",
          "PASS",
          "PASSED",
          "CLOSE_INCIDENT",
        ],

        fallback:
          "RECOVERY_CONFIRMED",
      });


    console.log(
      `\nSelected verification status: ${verificationStatus}`
    );


    console.log(
      `Selected verification decision: ${verificationDecision}`
    );


    printSection(
      "CHECK EXISTING PHASE 16.9 FIXTURE"
    );


    const repository =
      new PostgresRecoveryVerificationRepository();


    const existing =
      await repository
        .findHistory(
          {
            organizationId:
              ORGANIZATION_PUBLIC_ID,

            environmentId:
              ENVIRONMENT_PUBLIC_ID,

            incidentId:
              incident.public_id,
          },
          {
            limit:
              100,
          }
        );


    const existingFixture =
      existing.find(
        (
          verification
        ) =>
          verification
            ?.metadata
            ?.phase16Certification ===
          "16.9"
      );


    if (
      existingFixture
    ) {
      console.log(
        "✓ Existing Phase 16.9 fixture found"
      );


      console.log(
        JSON.stringify(
          {
            incidentId:
              incident.public_id,

            verificationId:
              existingFixture
                .verificationId,

            status:
              existingFixture
                .status,

            decision:
              existingFixture
                .decision,

            recovered:
              existingFixture
                .recovered,

            recoveryConfirmed:
              existingFixture
                .recoveryConfirmed,

            incidentClosureEligible:
              existingFixture
                .incidentClosureEligible,

            confidence:
              existingFixture
                .confidence,
          },
          null,
          2
        )
      );


      return;
    }


    printSection(
      "CREATE PHASE 16.9 VERIFICATION"
    );


    const timestamp =
      Date.now();


    const verificationId =
      `verification_phase16_9_${timestamp}`;


    const verificationPlanHash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          verificationId
        )
        .digest(
          "hex"
        );


    const verification =
      await repository
        .createVerification({
          verificationId,

          organizationId:
            ORGANIZATION_PUBLIC_ID,

          environmentId:
            ENVIRONMENT_PUBLIC_ID,

          incidentId:
            incident.public_id,

          /**
           * Do not fabricate a recovery decision.
           *
           * Phase 16.9 supports verification-backed outcome memories even
           * where no authoritative decision record exists.
           */
          recoveryDecisionId:
            null,

          executionRequestId:
            `execution_phase16_9_${crypto.randomUUID()}`,

          authorizationId:
            null,

          executionPlanId:
            null,

          executionPlanHash:
            null,

          verificationPlanId:
            `verification_plan_phase16_9_${timestamp}`,

          verificationPlanHash,

          revision:
            1,

          isCurrent:
            true,

          status:
            verificationStatus,

          decision:
            verificationDecision,

          confidence:
            0.94,

          /**
           * Keep nextAction NULL for certification.
           *
           * This avoids inventing another operational state transition and
           * avoids unrelated next_action CHECK constraints.
           */
          nextAction:
            null,

          recovered:
            true,

          recoveryConfirmed:
            true,

          incidentClosureEligible:
            true,

          overallScore:
            0.94,

          verificationPlan: {
            type:
              "PHASE16_9_CERTIFICATION",
          },

          evidencePackage: {
            evidence: [
              {
                type:
                  "CERTIFICATION_EVIDENCE",

                result:
                  "healthy",

                description:
                  "Controlled development verification for Phase 16.9 Outcome Memory",
              },
            ],
          },

          decisionResult: {
            result:
              "SUCCESS",
          },

          criticResult: {
            approved:
              true,
          },

          routingResult: {
            route:
              "CERTIFICATION_ONLY",
          },

          verifiedAt:
            new Date(),

          metadata: {
            phase:
              "16.9",

            phase16Certification:
              "16.9",

            testFixture:
              true,

            authoritativeStore:
              "postgresql",

            executionAuthorized:
              false,
          },
        });


    console.log(
      "✓ Phase 16.9 verification fixture created"
    );


    console.log(
      JSON.stringify(
        {
          incidentId:
            incident.public_id,

          verificationId:
            verification
              .verificationId,

          status:
            verification
              .status,

          decision:
            verification
              .decision,

          recovered:
            verification
              .recovered,

          recoveryConfirmed:
            verification
              .recoveryConfirmed,

          incidentClosureEligible:
            verification
              .incidentClosureEligible,

          confidence:
            verification
              .confidence,

          recoveryDecisionId:
            verification
              .recoveryDecisionId,

          verifiedAt:
            verification
              .verifiedAt,
        },
        null,
        2
      )
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