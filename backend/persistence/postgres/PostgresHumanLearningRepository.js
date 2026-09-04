"use strict";

/**
 * ============================================================================
 * AIRA PHASE 24.1
 * POSTGRES HUMAN LEARNING REPOSITORY
 * ============================================================================
 *
 * PostgreSQL is authoritative for:
 *
 *   InterventionSession
 *   InterventionEvent
 *   FrozenLearningSourceBundle
 *
 * All operations are executed through PostgresTenantScope.
 *
 * LEARNING != EXECUTION AUTHORITY
 *
 * ============================================================================
 */


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  INTERVENTION_SESSION_STATUS,

  INTERVENTION_EVENT_TYPE,

  TRUTH_LEVEL,

  assertNoExecutionAuthority,

  humanLearningError,

  requireEnum,
} =
  require(
    "../../contracts/humanLearning"
  );


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_FIELD_REQUIRED",
      `${field} is required`
    );
  }


  return value.trim();
}


function normalizeObject(
  value
) {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {
    return value;
  }


  return {};
}


function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}


function mapSession(
  row
) {
  if (
    !row
  ) {
    return null;
  }


  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    incidentId:
      row.incident_public_id ||
      row.incident_id,

    incidentDatabaseId:
      row.incident_id,

    humanTaskId:
      row.human_task_public_id ||
      null,

    humanTaskDatabaseId:
      row.human_task_id,

    takeoverSessionId:
      row.takeover_public_id ||
      null,

    takeoverSessionDatabaseId:
      row.takeover_session_id,

    operatorType:
      row.operator_type,

    operatorUserId:
      row.operator_user_id,

    status:
      row.status,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    abandonedAt:
      row.abandoned_at,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    executionAuthorized:
      false,
  };
}


function mapEvent(
  row
) {
  if (
    !row
  ) {
    return null;
  }


  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    interventionSessionDatabaseId:
      row.intervention_session_id,

    sequenceNumber:
      Number(
        row.sequence_number
      ),

    eventType:
      row.event_type,

    truthLevel:
      row.truth_level,

    actorType:
      row.actor_type,

    actorUserId:
      row.actor_user_id,

    summary:
      row.summary,

    payload:
      row.payload ||
      {},

    evidenceRefs:
      row.evidence_refs ||
      [],

    occurredAt:
      row.occurred_at,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,
  };
}


function mapBundle(
  row
) {
  if (
    !row
  ) {
    return null;
  }


  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    incidentDatabaseId:
      row.incident_id,

    interventionSessionDatabaseId:
      row.intervention_session_id,

    bundleVersion:
      Number(
        row.bundle_version
      ),

    observationPayload:
      row.observation_payload ||
      [],

    assertionPayload:
      row.assertion_payload ||
      [],

    diagnosisPayload:
      row.diagnosis_payload ||
      [],

    actionPayload:
      row.action_payload ||
      [],

    verificationPayload:
      row.verification_payload ||
      [],

    outcomePayload:
      row.outcome_payload ||
      [],

    provenance:
      row.provenance ||
      {},

    sourceDigest:
      row.source_digest,

    frozenAt:
      row.frozen_at,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,
  };
}


class PostgresHumanLearningRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }


  async createSession(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const incidentId =
      requireString(
        input.incidentId,
        "incidentId"
      );


    const operatorType =
      input.operatorType ||
      "HUMAN";


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client,
          resolved
        ) => {
          const result =
            await client.query(
              `
                INSERT INTO
                  learning.intervention_sessions (
                    organization_id,
                    environment_id,
                    incident_id,
                    human_task_id,
                    takeover_session_id,
                    operator_type,
                    operator_user_id,
                    status,
                    metadata,
                    execution_authorized
                  )
                SELECT
                  $1::uuid,
                  $2::uuid,
                  i.id,
                  ht.id,
                  ts.id,
                  $6,
                  $7::uuid,
                  'OPEN',
                  $8::jsonb,
                  FALSE
                FROM
                  incidents.incidents i

                LEFT JOIN
                  human_operations.tasks ht
                    ON $4::text
                         IS NOT NULL

                   AND ht.organization_id =
                         $1::uuid

                   AND ht.environment_id =
                         $2::uuid

                   AND (
                     ht.public_id =
                       $4

                     OR

                     ht.id::text =
                       $4
                   )

                LEFT JOIN
                  human_operations.takeover_sessions ts
                    ON $5::text
                         IS NOT NULL

                   AND ts.organization_id =
                         $1::uuid

                   AND ts.environment_id =
                         $2::uuid

                   AND (
                     ts.public_id =
                       $5

                     OR

                     ts.id::text =
                       $5
                   )

                WHERE
                  i.organization_id =
                    $1::uuid

                  AND

                  i.environment_id =
                    $2::uuid

                  AND

                  (
                    i.public_id =
                      $3

                    OR

                    i.id::text =
                      $3
                  )

                  AND

                  (
                    $4::text
                      IS NULL

                    OR

                    ht.id
                      IS NOT NULL
                  )

                  AND

                  (
                    $5::text
                      IS NULL

                    OR

                    ts.id
                      IS NOT NULL
                  )

                RETURNING *
              `,
              [
                resolved
                  .organizationUuid,

                resolved
                  .environmentUuid,

                incidentId,

                input.humanTaskId ||
                null,

                input.takeoverSessionId ||
                null,

                operatorType,

                input.operatorUserId ||
                null,

                JSON.stringify(
                  normalizeObject(
                    input.metadata
                  )
                ),
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_SESSION_SOURCE_NOT_FOUND",
              "Incident, human task, or takeover session was not found in the tenant scope",
              404
            );
          }


          return mapSession(
            result.rows[0]
          );
        }
      );
  }


  async getSession(
    input = {}
  ) {
    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const sessionId =
      requireString(
        input.sessionId,
        "sessionId"
      );


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                SELECT
                  s.*,

                  i.public_id
                    AS incident_public_id,

                  ht.public_id
                    AS human_task_public_id,

                  ts.public_id
                    AS takeover_public_id

                FROM
                  learning.intervention_sessions s

                JOIN
                  incidents.incidents i
                    ON i.id =
                       s.incident_id

                LEFT JOIN
                  human_operations.tasks ht
                    ON ht.id =
                       s.human_task_id

                LEFT JOIN
                  human_operations.takeover_sessions ts
                    ON ts.id =
                       s.takeover_session_id

                WHERE
                  (
                    s.public_id =
                      $1

                    OR

                    s.id::text =
                      $1
                  )

                LIMIT 1
              `,
              [
                sessionId,
              ]
            );


          return mapSession(
            result.rows[0]
          );
        }
      );
  }


  async appendEvent(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const sessionId =
      requireString(
        input.sessionId,
        "sessionId"
      );


    const eventType =
      requireEnum(
        input.eventType,

        INTERVENTION_EVENT_TYPE,

        "HUMAN_LEARNING_EVENT_TYPE_INVALID",

        "eventType"
      );


    const truthLevel =
      input.truthLevel ||
      TRUTH_LEVEL
        .OBSERVATION;


    if (
      ![
        TRUTH_LEVEL
          .OBSERVATION,

        TRUTH_LEVEL
          .ASSERTION,
      ].includes(
        truthLevel
      )
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_EVENT_TRUTH_LEVEL_INVALID",
        "Intervention events may only be OBSERVATION or ASSERTION"
      );
    }


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const sessionResult =
            await client.query(
              `
                SELECT *
                FROM
                  learning.intervention_sessions
                WHERE
                  (
                    public_id =
                      $1

                    OR

                    id::text =
                      $1
                  )
                FOR UPDATE
              `,
              [
                sessionId,
              ]
            );


          const session =
            sessionResult
              .rows[0];


          if (
            !session
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_SESSION_NOT_FOUND",
              "Intervention session not found",
              404
            );
          }


          if (
            session.status !==
            INTERVENTION_SESSION_STATUS
              .OPEN
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_SESSION_CLOSED",
              "Intervention session is not open"
            );
          }


          const sequenceResult =
            await client.query(
              `
                SELECT
                  COALESCE(
                    MAX(
                      sequence_number
                    ),
                    0
                  ) + 1
                    AS next_sequence

                FROM
                  learning.intervention_events

                WHERE
                  intervention_session_id =
                    $1::uuid
              `,
              [
                session.id,
              ]
            );


          const result =
            await client.query(
              `
                INSERT INTO
                  learning.intervention_events (
                    organization_id,
                    environment_id,
                    intervention_session_id,
                    sequence_number,
                    event_type,
                    truth_level,
                    actor_type,
                    actor_user_id,
                    summary,
                    payload,
                    evidence_refs,
                    occurred_at,
                    execution_authorized
                  )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4::bigint,
                  $5,
                  $6,
                  $7,
                  $8::uuid,
                  $9,
                  $10::jsonb,
                  $11::jsonb,
                  COALESCE(
                    $12::timestamptz,
                    NOW()
                  ),
                  FALSE
                )

                RETURNING *
              `,
              [
                session
                  .organization_id,

                session
                  .environment_id,

                session.id,

                sequenceResult
                  .rows[0]
                  .next_sequence,

                eventType,

                truthLevel,

                input.actorType ||
                "HUMAN",

                input.actorUserId ||
                null,

                input.summary ||
                null,

                JSON.stringify(
                  normalizeObject(
                    input.payload
                  )
                ),

                JSON.stringify(
                  normalizeArray(
                    input.evidenceRefs
                  )
                ),

                input.occurredAt ||
                null,
              ]
            );


          return mapEvent(
            result.rows[0]
          );
        }
      );
  }


  async listEvents(
    input = {}
  ) {
    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const sessionId =
      requireString(
        input.sessionId,
        "sessionId"
      );


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                SELECT
                  e.*

                FROM
                  learning.intervention_events e

                JOIN
                  learning.intervention_sessions s
                    ON s.id =
                       e.intervention_session_id

                WHERE
                  (
                    s.public_id =
                      $1

                    OR

                    s.id::text =
                      $1
                  )

                ORDER BY
                  e.sequence_number ASC
              `,
              [
                sessionId,
              ]
            );


          return result
            .rows
            .map(
              mapEvent
            );
        }
      );
  }


  async completeSession(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const sessionId =
      requireString(
        input.sessionId,
        "sessionId"
      );


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                UPDATE
                  learning.intervention_sessions

                SET
                  status =
                    'COMPLETED',

                  completed_at =
                    NOW(),

                  updated_at =
                    NOW()

                WHERE
                  (
                    public_id =
                      $1

                    OR

                    id::text =
                      $1
                  )

                  AND

                  status =
                    'OPEN'

                RETURNING *
              `,
              [
                sessionId,
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_SESSION_NOT_OPEN",
              "Open intervention session not found",
              409
            );
          }


          return mapSession(
            result.rows[0]
          );
        }
      );
  }


  async createSourceBundle(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const sessionId =
      requireString(
        input.sessionId,
        "sessionId"
      );


    const sourceDigest =
      requireString(
        input.sourceDigest,
        "sourceDigest"
      );


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                INSERT INTO
                  learning.source_bundles (
                    organization_id,
                    environment_id,
                    incident_id,
                    intervention_session_id,
                    bundle_version,
                    observation_payload,
                    assertion_payload,
                    diagnosis_payload,
                    action_payload,
                    verification_payload,
                    outcome_payload,
                    provenance,
                    source_digest,
                    execution_authorized
                  )

                SELECT
                  s.organization_id,
                  s.environment_id,
                  s.incident_id,
                  s.id,
                  $2::int,
                  $3::jsonb,
                  $4::jsonb,
                  $5::jsonb,
                  $6::jsonb,
                  $7::jsonb,
                  $8::jsonb,
                  $9::jsonb,
                  $10,
                  FALSE

                FROM
                  learning.intervention_sessions s

                WHERE
                  (
                    s.public_id =
                      $1

                    OR

                    s.id::text =
                      $1
                  )

                  AND

                  s.status =
                    'COMPLETED'

                ON CONFLICT (
                  organization_id,
                  environment_id,
                  source_digest
                )
                DO UPDATE SET
                  source_digest =
                    EXCLUDED.source_digest

                RETURNING *
              `,
              [
                sessionId,

                input.bundleVersion ||
                1,

                JSON.stringify(
                  normalizeArray(
                    input.observationPayload
                  )
                ),

                JSON.stringify(
                  normalizeArray(
                    input.assertionPayload
                  )
                ),

                JSON.stringify(
                  normalizeArray(
                    input.diagnosisPayload
                  )
                ),

                JSON.stringify(
                  normalizeArray(
                    input.actionPayload
                  )
                ),

                JSON.stringify(
                  normalizeArray(
                    input.verificationPayload
                  )
                ),

                JSON.stringify(
                  normalizeArray(
                    input.outcomePayload
                  )
                ),

                JSON.stringify(
                  normalizeObject(
                    input.provenance
                  )
                ),

                sourceDigest,
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_SOURCE_SESSION_NOT_COMPLETED",
              "A source bundle may only be frozen from a completed intervention session",
              409
            );
          }


          return mapBundle(
            result.rows[0]
          );
        }
      );
  }
}


module.exports = {
  PostgresHumanLearningRepository,

  mapSession,

  mapEvent,

  mapBundle,
};