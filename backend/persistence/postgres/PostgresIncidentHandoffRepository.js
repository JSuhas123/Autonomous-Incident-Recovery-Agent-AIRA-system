"use strict";


const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


function createError(
  message,
  code,
  status =
    409
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,
    }
  );
}


function requireValue(
  value,
  field,
  code
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(
      value
    ).trim() ===
      ""
  ) {
    throw createError(
      `${field} is required`,
      code,
      422
    );
  }


  return value;
}


function requireScope(
  input =
    {}
) {
  requireValue(
    input.organizationId,
    "organizationId",
    "INCIDENT_HANDOFF_ORGANIZATION_REQUIRED"
  );


  requireValue(
    input.environmentId,
    "environmentId",
    "INCIDENT_HANDOFF_ENVIRONMENT_REQUIRED"
  );


  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function createPublicId() {
  return (
    "handoff_" +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
}


function parseJson(
  value,
  fallback
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }


  if (
    typeof value ===
      "string"
  ) {
    try {
      return JSON.parse(
        value
      );
    } catch (
      _error
    ) {
      return fallback;
    }
  }


  return value;
}


function mapRow(
  row,
  resolved
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
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    incidentId:
      row.incident_id,

    escalationId:
      row.escalation_id,

    taskId:
      row.task_id,

    revision:
      Number(
        row.revision ||
        0
      ),

    isCurrent:
      row.is_current ===
      true,

    status:
      row.status,

    generationReason:
      row.generation_reason,

    schemaVersion:
      row.schema_version,

    contentHash:
      row.content_hash,

    package:
      parseJson(
        row.package,
        {}
      ),

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      row.execution_authorized ===
      true,

    generatedAt:
      row.generated_at,

    supersededAt:
      row.superseded_at,

    createdAt:
      row.created_at,
  };
}


class PostgresIncidentHandoffRepository {
  constructor(
    options =
      {}
  ) {
    this.scope =
      options.scope ||

      new PostgresTenantScope(
        options
      );
  }


  async createRevision(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.incidentId,
      "incidentId",
      "INCIDENT_HANDOFF_INCIDENT_REQUIRED"
    );


    requireValue(
      input.escalationId,
      "escalationId",
      "INCIDENT_HANDOFF_ESCALATION_REQUIRED"
    );


    requireValue(
      input.contentHash,
      "contentHash",
      "INCIDENT_HANDOFF_CONTENT_HASH_REQUIRED"
    );


    if (
      !input.package ||
      typeof input.package !==
        "object" ||
      Array.isArray(
        input.package
      )
    ) {
      throw createError(
        "Incident handoff package must be an object",
        "INCIDENT_HANDOFF_PACKAGE_INVALID",
        422
      );
    }


    if (
      input.package
        .executionAuthorized ===
      true
    ) {
      throw createError(
        "Incident handoff package cannot authorize execution",
        "INCIDENT_HANDOFF_AUTHORITY_VIOLATION",
        403
      );
    }


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        /*
         * Serialize revision generation for this exact tenant + environment +
         * escalation.
         *
         * This prevents two concurrent builders from both observing the same
         * current revision and attempting to create revision N+1.
         */
        const lockKey =
          [
            resolved.organizationUuid,

            resolved.environmentUuid,

            String(
              input.escalationId
            ),
          ].join(
            ":"
          );


        await client.query(
          `
            SELECT
              pg_advisory_xact_lock(
                hashtext(
                  $1
                )
              )
          `,
          [
            lockKey,
          ]
        );


        const currentResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.incident_handoff_packages

              WHERE
                escalation_id = $1
                AND is_current = TRUE

              ORDER BY
                revision DESC

              LIMIT 1

              FOR UPDATE
            `,
            [
              String(
                input.escalationId
              ),
            ]
          );


        const current =
          currentResult.rows[0] ||
          null;


        /*
         * Semantic idempotency.
         *
         * If all operational information is unchanged, do not manufacture
         * another handoff revision merely because the caller retried.
         */
        if (
          current &&
          current.content_hash ===
            String(
              input.contentHash
            )
        ) {
          return {
            created:
              false,

            duplicate:
              true,

            superseded:
              false,

            handoff:
              mapRow(
                current,
                resolved
              ),

            executionAuthorized:
              false,
          };
        }


        const revision =
          current
            ? Number(
                current.revision
              ) +
              1

            : 1;


        if (
          current
        ) {
          await client.query(
            `
              UPDATE
                human_operations.incident_handoff_packages

              SET
                is_current =
                  FALSE,

                status =
                  'SUPERSEDED',

                superseded_at =
                  COALESCE(
                    superseded_at,
                    NOW()
                  )

              WHERE
                id = $1
            `,
            [
              current.id,
            ]
          );
        }


        const inserted =
          await client.query(
            `
              INSERT INTO
                human_operations.incident_handoff_packages (
                  public_id,

                  organization_id,
                  environment_id,

                  incident_id,
                  escalation_id,
                  task_id,

                  revision,
                  is_current,
                  status,

                  generation_reason,
                  schema_version,

                  content_hash,

                  package,
                  metadata,

                  execution_authorized,

                  generated_at
                )

              VALUES (
                $1,$2,$3,$4,$5,$6,
                $7,TRUE,'CURRENT',
                $8,$9,$10,
                $11::jsonb,$12::jsonb,
                FALSE,
                $13
              )

              RETURNING *
            `,
            [
              input.publicId ||
              createPublicId(),

              resolved.organizationUuid,

              resolved.environmentUuid,

              String(
                input.incidentId
              ),

              String(
                input.escalationId
              ),

              input.taskId
                ? String(
                    input.taskId
                  )
                : null,

              revision,

              input.generationReason ||
              "ESCALATION",

              input.schemaVersion ||
              "23.4.1",

              String(
                input.contentHash
              ),

              JSON.stringify(
                input.package
              ),

              JSON.stringify({
                ...(
                  input.metadata ||
                  {}
                ),

                executionAuthorized:
                  false,
              }),

              input.generatedAt ||
              new Date(),
            ]
          );


        return {
          created:
            true,

          duplicate:
            false,

          superseded:
            Boolean(
              current
            ),

          handoff:
            mapRow(
              inserted.rows[0],
              resolved
            ),

          previousRevision:
            current
              ? mapRow(
                  current,
                  resolved
                )
              : null,

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async getCurrent(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.escalationId,
      "escalationId",
      "INCIDENT_HANDOFF_ESCALATION_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.incident_handoff_packages

              WHERE
                escalation_id = $1
                AND is_current = TRUE

              ORDER BY
                revision DESC

              LIMIT 1
            `,
            [
              String(
                input.escalationId
              ),
            ]
          );


        return mapRow(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getByIdentifier(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.handoffId,
      "handoffId",
      "INCIDENT_HANDOFF_ID_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.incident_handoff_packages

              WHERE
                public_id = $1
                OR id::text = $1

              LIMIT 1
            `,
            [
              String(
                input.handoffId
              ),
            ]
          );


        return mapRow(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async listHistory(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.escalationId,
      "escalationId",
      "INCIDENT_HANDOFF_ESCALATION_REQUIRED"
    );


    const limit =
      Math.min(
        100,

        Math.max(
          1,

          Number(
            input.limit ||
            20
          )
        )
      );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.incident_handoff_packages

              WHERE
                escalation_id = $1

              ORDER BY
                revision DESC

              LIMIT $2
            `,
            [
              String(
                input.escalationId
              ),

              limit,
            ]
          );


        return result.rows.map(
          (
            row
          ) =>
            mapRow(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }
}


module.exports =
  PostgresIncidentHandoffRepository;