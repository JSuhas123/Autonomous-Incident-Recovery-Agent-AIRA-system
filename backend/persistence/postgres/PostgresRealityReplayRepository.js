"use strict";


const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  REPLAY_RUN_STATUS,
} =
  require(
    "../../constants/realityReplay"
  );


const DETERMINISTIC_EPOCH_MS =
  Date.parse(
    "2000-01-01T00:00:00.000Z"
  );


function repositoryError(
  code,
  message,
  status =
    422,
  metadata =
    {}
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

      ...metadata,
    }
  );
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||

    !value.trim()
  ) {
    throw repositoryError(
      "REALITY_REPLAY_FIELD_REQUIRED",

      `${field} is required`
    );
  }


  return value.trim();
}


function requireNonnegativeInteger(
  value,
  field
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isSafeInteger(
      parsed
    ) ||

    parsed <
      0
  ) {
    throw repositoryError(
      "REALITY_REPLAY_INTEGER_INVALID",

      `${field} must be a non-negative integer`
    );
  }


  return parsed;
}


function requirePositiveNumber(
  value,
  field
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isFinite(
      parsed
    ) ||

    parsed <=
      0
  ) {
    throw repositoryError(
      "REALITY_REPLAY_NUMBER_INVALID",

      `${field} must be greater than zero`
    );
  }


  return parsed;
}


function canonicalJson(
  value
) {
  if (
    value ===
      null ||

    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +

      value
        .map(
          (
            item
          ) =>
            canonicalJson(
              item
            )
        )
        .join(
          ","
        ) +

      "]"
    );
  }


  const keys =
    Object.keys(
      value
    ).sort();


  return (
    "{" +

    keys
      .map(
        (
          key
        ) =>
          (
            `${JSON.stringify(key)}:` +
            canonicalJson(
              value[
                key
              ]
            )
          )
      )
      .join(
        ","
      ) +

    "}"
  );
}


function sha256(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      typeof value ===
        "string"
        ? value
        : canonicalJson(
            value
          )
    )
    .digest(
      "hex"
    );
}


function deterministicJitter(
  {
    seed,

    eventId,

    originalIndex,

    disorderWindowMs,
  }
) {
  if (
    disorderWindowMs <=
      0
  ) {
    return 0;
  }


  const digest =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        [
          seed,

          eventId,

          originalIndex,
        ].join(
          ":"
        )
      )
      .digest();


  const unsigned =
    digest.readUInt32BE(
      0
    );


  const span =
    (
      disorderWindowMs *
      2
    ) +
    1;


  return (
    unsigned %
    span
  ) -
    disorderWindowMs;
}


function assertNoSealedKeys(
  value,
  path =
    "timeline"
) {
  const forbidden =
    new Set(
      [
        "sealedEvaluation",

        "evaluationRubric",

        "groundTruth",

        "knownFault",

        "expectedDiagnosis",

        "acceptableDiagnoses",

        "expectedRecoveryFamily",

        "rootCause",

        "trustedGroundTruth",
      ]
    );


  if (
    value ===
      null ||

    value ===
      undefined
  ) {
    return;
  }


  if (
    Array.isArray(
      value
    )
  ) {
    value.forEach(
      (
        item,
        index
      ) =>
        assertNoSealedKeys(
          item,

          `${path}[${index}]`
        )
    );


    return;
  }


  if (
    typeof value !==
      "object"
  ) {
    return;
  }


  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      forbidden.has(
        key
      )
    ) {
      throw repositoryError(
        "REALITY_REPLAY_GROUND_TRUTH_LEAKAGE",

        (
          "Replay-visible timeline contains " +
          `sealed key ${path}.${key}`
        ),

        500
      );
    }


    assertNoSealedKeys(
      child,

      `${path}.${key}`
    );
  }
}


function buildReplaySchedule(
  {
    timeline,

    artifacts,

    seed =
      0,

    disorderWindowMs =
      0,

    deterministicTimestamps =
      true,

    nondeterministicBaseTime =
      new Date(),
  }
) {
  if (
    !Array.isArray(
      timeline
    )
  ) {
    throw repositoryError(
      "REALITY_REPLAY_TIMELINE_INVALID",

      "RealityCase timeline must be an array"
    );
  }


  assertNoSealedKeys(
    timeline
  );


  const artifactByPublicId =
    new Map(
      (
        artifacts ||
        []
      ).map(
        (
          artifact
        ) => [
          artifact.publicId,

          artifact,
        ]
      )
    );


  const provisional =
    timeline.map(
      (
        event,
        originalIndex
      ) => {
        if (
          !event ||

          typeof event !==
            "object" ||

          Array.isArray(
            event
          )
        ) {
          throw repositoryError(
            "REALITY_REPLAY_EVENT_INVALID",

            (
              "Timeline event at index " +
              `${originalIndex} must be an object`
            )
          );
        }


        const eventId =
          requireString(
            event.eventId,

            (
              `timeline[${originalIndex}]` +
              ".eventId"
            )
          );


        const originalOffsetMs =
          requireNonnegativeInteger(
            event.offsetMs,

            (
              `timeline[${originalIndex}]` +
              ".offsetMs"
            )
          );


        const artifactPublicId =
          event.artifactId
            ? requireString(
                event.artifactId,

                (
                  `timeline[${originalIndex}]` +
                  ".artifactId"
                )
              )
            : null;


        const artifact =
          artifactPublicId
            ? artifactByPublicId.get(
                artifactPublicId
              )
            : null;


        if (
          artifactPublicId &&

          !artifact
        ) {
          throw repositoryError(
            "REALITY_REPLAY_ARTIFACT_NOT_VISIBLE",

            (
              "Timeline references an artifact " +
              "that is not available in the " +
              "EVIDENCE channel: " +
              `${artifactPublicId}`
            ),

            403
          );
        }


        const jitter =
          deterministicJitter({
            seed,

            eventId,

            originalIndex,

            disorderWindowMs,
          });


        const effectiveOffsetMs =
          Math.max(
            0,

            originalOffsetMs +
              jitter
          );


        return {
          originalIndex,

          eventId,

          originalOffsetMs,

          effectiveOffsetMs,

          artifactPublicId,

          artifact:
            artifact ||
            null,

          eventPayload: {
            ...event,
          },
        };
      }
    );


  provisional.sort(
    (
      left,
      right
    ) => {
      if (
        left.effectiveOffsetMs !==
        right.effectiveOffsetMs
      ) {
        return (
          left.effectiveOffsetMs -
          right.effectiveOffsetMs
        );
      }


      if (
        left.originalOffsetMs !==
        right.originalOffsetMs
      ) {
        return (
          left.originalOffsetMs -
          right.originalOffsetMs
        );
      }


      const idOrder =
        left.eventId.localeCompare(
          right.eventId
        );


      if (
        idOrder !==
          0
      ) {
        return idOrder;
      }


      return (
        left.originalIndex -
        right.originalIndex
      );
    }
  );


  const baseMs =
    deterministicTimestamps
      ? DETERMINISTIC_EPOCH_MS
      : new Date(
          nondeterministicBaseTime
        ).getTime();


  return provisional.map(
    (
      item,
      sequenceNo
    ) => {
      const logicalTimestamp =
        new Date(
          baseMs +
          item.effectiveOffsetMs
        ).toISOString();


      return {
        sequenceNo,

        eventId:
          item.eventId,

        originalOffsetMs:
          item.originalOffsetMs,

        effectiveOffsetMs:
          item.effectiveOffsetMs,

        logicalTimestamp,

        artifactPublicId:
          item.artifactPublicId,

        artifact:
          item.artifact,

        eventPayload:
          item.eventPayload,
      };
    }
  );
}


function mapRun(
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

    runId:
      row.public_id,

    caseVersionId:
      row.case_version_id,

    caseId:
      row.case_public_id,

    caseRevision:
      Number(
        row.case_revision
      ),

    caseContentHash:
      row.case_content_hash,

    status:
      row.status,

    seed:
      Number(
        row.seed
      ),

    speedMultiplier:
      Number(
        row.speed_multiplier
      ),

    deterministicTimestamps:
      row.deterministic_timestamps ===
      true,

    disorderWindowMs:
      Number(
        row.disorder_window_ms
      ),

    airaVersion:
      row.aira_version,

    timelineHash:
      row.timeline_hash,

    eventCount:
      Number(
        row.event_count
      ),

    cursorPosition:
      Number(
        row.cursor_position
      ),

    startedAt:
      row.started_at,

    pausedAt:
      row.paused_at,

    completedAt:
      row.completed_at,

    failedAt:
      row.failed_at,

    failureCode:
      row.failure_code,

    failureMessage:
      row.failure_message,

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

    runDatabaseId:
      row.replay_run_id,

    sequenceNo:
      Number(
        row.sequence_no
      ),

    eventId:
      row.event_public_id,

    originalOffsetMs:
      Number(
        row.original_offset_ms
      ),

    effectiveOffsetMs:
      Number(
        row.effective_offset_ms
      ),

    logicalTimestamp:
      row.logical_timestamp,

    artifactDatabaseId:
      row.artifact_id,

    artifactId:
      row.artifact_public_id,

    artifactKind:
      row.artifact_kind,

    artifactContentHash:
      row.artifact_content_hash,

    eventPayload:
      row.event_payload ||
      {},

    status:
      row.status,

    releasedAt:
      row.released_at,

    deliveryId:
      row.delivery_id,

    executionAuthorized:
      false,
  };
}


class PostgresRealityReplayRepository {
  constructor(
    options =
      {}
  ) {
    this.tenantScope =
      options.tenantScope ||

      new PostgresTenantScope(
        options
      );
  }


  async createRun(
    input =
      {}
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


    const caseId =
      requireString(
        input.caseId,

        "caseId"
      );


    const airaVersion =
      requireString(
        input.airaVersion,

        "airaVersion"
      );


    const seed =
      requireNonnegativeInteger(
        input.seed ??
          0,

        "seed"
      );


    const speedMultiplier =
      requirePositiveNumber(
        input.speedMultiplier ??
          1,

        "speedMultiplier"
      );


    const disorderWindowMs =
      requireNonnegativeInteger(
        input.disorderWindowMs ??
          0,

        "disorderWindowMs"
      );


    const deterministicTimestamps =
      input.deterministicTimestamps !==
      false;


    return this.tenantScope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const caseResult =
          await client.query(
            `
              SELECT
                cv.id,
                cv.revision,
                cv.content_hash,
                cv.visible_case
              FROM
                reality.case_versions cv
              WHERE
                cv.visible_case
                  #>>
                  '{identity,caseId}'
                =
                $1
              ORDER BY
                cv.revision DESC
              LIMIT 1
              FOR SHARE
            `,

            [
              caseId,
            ]
          );


        if (
          caseResult.rowCount !==
          1
        ) {
          throw repositoryError(
            "REALITY_REPLAY_CASE_NOT_FOUND",

            "Replay RealityCase was not found",

            404
          );
        }


        const caseVersion =
          caseResult.rows[
            0
          ];


        const visibleCase =
          caseVersion
            .visible_case;


        if (
          !visibleCase ||

          typeof visibleCase !==
            "object"
        ) {
          throw repositoryError(
            "REALITY_REPLAY_VISIBLE_CASE_INVALID",

            "Replay-visible RealityCase is invalid",

            500
          );
        }


        if (
          Object.prototype
            .hasOwnProperty
            .call(
              visibleCase,

              "sealedEvaluation"
            ) ||

          Object.prototype
            .hasOwnProperty
            .call(
              visibleCase,

              "evaluationRubric"
            )
        ) {
          throw repositoryError(
            "REALITY_REPLAY_GROUND_TRUTH_LEAKAGE",

            "Stored replay-visible RealityCase contains sealed evaluation data",

            500
          );
        }


        const artifactResult =
          await client.query(
            `
              SELECT
                id,
                public_id,
                artifact_kind,
                channel,
                content_hash,
                byte_size,
                media_type,
                storage_bucket,
                storage_key,
                provenance,
                trusted_ground_truth,
                execution_authorized
              FROM
                reality.case_artifacts
              WHERE
                case_version_id =
                $1
                AND
                channel =
                'EVIDENCE'
                AND
                trusted_ground_truth =
                FALSE
                AND
                execution_authorized =
                FALSE
              ORDER BY
                public_id ASC
            `,

            [
              caseVersion.id,
            ]
          );


        const artifacts =
          artifactResult.rows.map(
            (
              row
            ) => ({
              id:
                row.id,

              publicId:
                row.public_id,

              artifactKind:
                row.artifact_kind,

              contentHash:
                row.content_hash,

              byteSize:
                Number(
                  row.byte_size
                ),

              mediaType:
                row.media_type,

              storageBucket:
                row.storage_bucket,

              storageKey:
                row.storage_key,

              provenance:
                row.provenance ||
                {},

              channel:
                "EVIDENCE",

              trustedGroundTruth:
                false,

              executionAuthorized:
                false,
            })
          );


        const timeline =
          Array.isArray(
            visibleCase.timeline
          )
            ? visibleCase.timeline
            : [];


        const schedule =
          buildReplaySchedule({
            timeline,

            artifacts,

            seed,

            disorderWindowMs,

            deterministicTimestamps,

            nondeterministicBaseTime:
              new Date(),
          });


        const timelineHash =
          sha256(
            schedule.map(
              (
                event
              ) => ({
                sequenceNo:
                  event.sequenceNo,

                eventId:
                  event.eventId,

                originalOffsetMs:
                  event.originalOffsetMs,

                effectiveOffsetMs:
                  event.effectiveOffsetMs,

                logicalTimestamp:
                  event.logicalTimestamp,

                artifactId:
                  event.artifactPublicId,

                artifactContentHash:
                  event.artifact
                    ?.contentHash ||
                  null,

                eventPayload:
                  event.eventPayload,
              })
            )
          );


        const runResult =
          await client.query(
            `
              INSERT INTO
                reality.replay_runs (
                  organization_id,
                  environment_id,
                  case_version_id,
                  case_public_id,
                  case_revision,
                  case_content_hash,
                  status,
                  seed,
                  speed_multiplier,
                  deterministic_timestamps,
                  disorder_window_ms,
                  aira_version,
                  timeline_hash,
                  event_count,
                  cursor_position,
                  metadata,
                  execution_authorized
                )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'READY',
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                0,
                $14::jsonb,
                FALSE
              )
              RETURNING *
            `,

            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              caseVersion.id,

              caseId,

              Number(
                caseVersion.revision
              ),

              String(
                caseVersion.content_hash
              ).toLowerCase(),

              seed,

              speedMultiplier,

              deterministicTimestamps,

              disorderWindowMs,

              airaVersion,

              timelineHash,

              schedule.length,

              JSON.stringify(
                input.metadata ||
                {}
              ),
            ]
          );


        const runRow =
          runResult.rows[
            0
          ];


        for (
          const event
          of schedule
        ) {
          const artifact =
            event.artifact;


          const deliveryId =
            `${runRow.public_id}:${event.sequenceNo}`;


          await client.query(
            `
              INSERT INTO
                reality.replay_events (
                  organization_id,
                  environment_id,
                  replay_run_id,
                  sequence_no,
                  event_public_id,
                  original_offset_ms,
                  effective_offset_ms,
                  logical_timestamp,
                  artifact_id,
                  artifact_public_id,
                  artifact_kind,
                  artifact_content_hash,
                  event_payload,
                  status,
                  delivery_id,
                  execution_authorized
                )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13::jsonb,
                'PENDING',
                $14,
                FALSE
              )
            `,

            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              runRow.id,

              event.sequenceNo,

              event.eventId,

              event.originalOffsetMs,

              event.effectiveOffsetMs,

              event.logicalTimestamp,

              artifact
                ?.id ||
              null,

              artifact
                ?.publicId ||
              null,

              artifact
                ?.artifactKind ||
              null,

              artifact
                ?.contentHash ||
              null,

              JSON.stringify(
                event.eventPayload
              ),

              deliveryId,
            ]
          );
        }


        return mapRun(
          runRow
        );
      }
    );
  }


  async getRun(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    return this.tenantScope.run(
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
              SELECT *
              FROM
                reality.replay_runs
              WHERE
                public_id =
                $1
              LIMIT 1
            `,

            [
              runId,
            ]
          );


        return mapRun(
          result.rows[
            0
          ]
        );
      }
    );
  }


  async getNextEvent(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    return this.tenantScope.run(
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
                re.*
              FROM
                reality.replay_events re
              JOIN
                reality.replay_runs rr
              ON
                rr.id =
                re.replay_run_id
              WHERE
                rr.public_id =
                $1
                AND
                re.sequence_no =
                rr.cursor_position
                AND
                re.status =
                'PENDING'
              LIMIT 1
            `,

            [
              runId,
            ]
          );


        return mapEvent(
          result.rows[
            0
          ]
        );
      }
    );
  }


  async transitionRun(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    const allowedFrom =
      Array.isArray(
        input.allowedFrom
      )
        ? input.allowedFrom
        : [];


    const nextStatus =
      requireString(
        input.nextStatus,

        "nextStatus"
      );


    return this.tenantScope.run(
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
                reality.replay_runs
              SET
                status =
                  $2,

                started_at =
                  CASE
                    WHEN
                      $2 =
                      'RUNNING'
                    THEN
                      COALESCE(
                        started_at,
                        NOW()
                      )
                    ELSE
                      started_at
                  END,

                paused_at =
                  CASE
                    WHEN
                      $2 =
                      'PAUSED'
                    THEN
                      NOW()
                    ELSE
                      paused_at
                  END,

                completed_at =
                  CASE
                    WHEN
                      $2 =
                      'COMPLETED'
                    THEN
                      NOW()
                    ELSE
                      completed_at
                  END,

                updated_at =
                  NOW()

              WHERE
                public_id =
                  $1
                AND
                status =
                  ANY(
                    $3::text[]
                  )

              RETURNING *
            `,

            [
              runId,

              nextStatus,

              allowedFrom,
            ]
          );


        if (
          result.rowCount !==
          1
        ) {
          const current =
            await client.query(
              `
                SELECT
                  status
                FROM
                  reality.replay_runs
                WHERE
                  public_id =
                  $1
                LIMIT 1
              `,

              [
                runId,
              ]
            );


          if (
            current.rowCount !==
            1
          ) {
            throw repositoryError(
              "REALITY_REPLAY_RUN_NOT_FOUND",

              "Replay run was not found",

              404
            );
          }


          throw repositoryError(
            "REALITY_REPLAY_STATE_TRANSITION_INVALID",

            (
              "Replay run cannot transition " +
              `from ${current.rows[0].status} ` +
              `to ${nextStatus}`
            ),

            409
          );
        }


        return mapRun(
          result.rows[
            0
          ]
        );
      }
    );
  }


  async commitEventRelease(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    const sequenceNo =
      requireNonnegativeInteger(
        input.sequenceNo,

        "sequenceNo"
      );


    return this.tenantScope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client
      ) => {
        const runResult =
          await client.query(
            `
              SELECT *
              FROM
                reality.replay_runs
              WHERE
                public_id =
                $1
              FOR UPDATE
            `,

            [
              runId,
            ]
          );


        if (
          runResult.rowCount !==
          1
        ) {
          throw repositoryError(
            "REALITY_REPLAY_RUN_NOT_FOUND",

            "Replay run was not found",

            404
          );
        }


        const run =
          runResult.rows[
            0
          ];


        if (
          Number(
            run.cursor_position
          ) !==
          sequenceNo
        ) {
          throw repositoryError(
            "REALITY_REPLAY_CURSOR_CONFLICT",

            "Replay cursor changed before event release could commit",

            409
          );
        }


        const eventResult =
          await client.query(
            `
              UPDATE
                reality.replay_events
              SET
                status =
                  'RELEASED',

                released_at =
                  COALESCE(
                    released_at,
                    NOW()
                  )

              WHERE
                replay_run_id =
                  $1
                AND
                sequence_no =
                  $2
                AND
                status =
                  'PENDING'

              RETURNING *
            `,

            [
              run.id,

              sequenceNo,
            ]
          );


        if (
          eventResult.rowCount !==
          1
        ) {
          throw repositoryError(
            "REALITY_REPLAY_EVENT_RELEASE_CONFLICT",

            "Replay event was not pending",

            409
          );
        }


        const nextCursor =
          sequenceNo +
          1;


        const completed =
          nextCursor >=
          Number(
            run.event_count
          );


        const updatedRun =
          await client.query(
            `
              UPDATE
                reality.replay_runs
              SET
                cursor_position =
                  $2,

                status =
                  CASE
                    WHEN
                      $3
                    THEN
                      'COMPLETED'
                    ELSE
                      status
                  END,

                completed_at =
                  CASE
                    WHEN
                      $3
                    THEN
                      COALESCE(
                        completed_at,
                        NOW()
                      )
                    ELSE
                      completed_at
                  END,

                updated_at =
                  NOW()

              WHERE
                id =
                  $1

              RETURNING *
            `,

            [
              run.id,

              nextCursor,

              completed,
            ]
          );


        return {
          event:
            mapEvent(
              eventResult.rows[
                0
              ]
            ),

          run:
            mapRun(
              updatedRun.rows[
                0
              ]
            ),

          completed,

          executionAuthorized:
            false,
        };
      }
    );
  }


  async createCheckpoint(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    return this.tenantScope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const runResult =
          await client.query(
            `
              SELECT *
              FROM
                reality.replay_runs
              WHERE
                public_id =
                $1
              LIMIT 1
            `,

            [
              runId,
            ]
          );


        if (
          runResult.rowCount !==
          1
        ) {
          throw repositoryError(
            "REALITY_REPLAY_RUN_NOT_FOUND",

            "Replay run was not found",

            404
          );
        }


        const run =
          runResult.rows[
            0
          ];


        const result =
          await client.query(
            `
              INSERT INTO
                reality.replay_checkpoints (
                  organization_id,
                  environment_id,
                  replay_run_id,
                  cursor_position,
                  run_status,
                  timeline_hash,
                  metadata,
                  execution_authorized
                )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7::jsonb,
                FALSE
              )
              RETURNING *
            `,

            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              run.id,

              Number(
                run.cursor_position
              ),

              run.status,

              run.timeline_hash,

              JSON.stringify(
                input.metadata ||
                {}
              ),
            ]
          );


        const checkpoint =
          result.rows[
            0
          ];


        return {
          checkpointId:
            checkpoint.public_id,

          runId,

          cursorPosition:
            Number(
              checkpoint
                .cursor_position
            ),

          runStatus:
            checkpoint.run_status,

          timelineHash:
            checkpoint.timeline_hash,

          metadata:
            checkpoint.metadata ||
            {},

          createdAt:
            checkpoint.created_at,

          executionAuthorized:
            false,
        };
      }
    );
  }


  async restoreCheckpoint(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    const checkpointId =
      requireString(
        input.checkpointId,

        "checkpointId"
      );


    return this.tenantScope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client
      ) => {
        const runResult =
          await client.query(
            `
              SELECT *
              FROM
                reality.replay_runs
              WHERE
                public_id =
                $1
              FOR UPDATE
            `,

            [
              runId,
            ]
          );


        if (
          runResult.rowCount !==
          1
        ) {
          throw repositoryError(
            "REALITY_REPLAY_RUN_NOT_FOUND",

            "Replay run was not found",

            404
          );
        }


        const run =
          runResult.rows[
            0
          ];


        const checkpointResult =
          await client.query(
            `
              SELECT *
              FROM
                reality.replay_checkpoints
              WHERE
                public_id =
                  $1
                AND
                replay_run_id =
                  $2
              LIMIT 1
            `,

            [
              checkpointId,

              run.id,
            ]
          );


        if (
          checkpointResult.rowCount !==
          1
        ) {
          throw repositoryError(
            "REALITY_REPLAY_CHECKPOINT_NOT_FOUND",

            "Replay checkpoint was not found",

            404
          );
        }


        const checkpoint =
          checkpointResult.rows[
            0
          ];


        if (
          checkpoint.timeline_hash !==
          run.timeline_hash
        ) {
          throw repositoryError(
            "REALITY_REPLAY_CHECKPOINT_DRIFT",

            "Replay checkpoint timeline does not match the immutable run timeline",

            409
          );
        }


        const cursor =
          Number(
            checkpoint
              .cursor_position
          );


        await client.query(
          `
            UPDATE
              reality.replay_events
            SET
              status =
                CASE
                  WHEN
                    sequence_no <
                    $2
                  THEN
                    'RELEASED'
                  ELSE
                    'PENDING'
                END,

              released_at =
                CASE
                  WHEN
                    sequence_no <
                    $2
                  THEN
                    released_at
                  ELSE
                    NULL
                END

            WHERE
              replay_run_id =
                $1
          `,

          [
            run.id,

            cursor,
          ]
        );


        const updated =
          await client.query(
            `
              UPDATE
                reality.replay_runs
              SET
                cursor_position =
                  $2,

                status =
                  CASE
                    WHEN
                      $2 >=
                      event_count
                    THEN
                      'COMPLETED'
                    ELSE
                      'PAUSED'
                  END,

                paused_at =
                  CASE
                    WHEN
                      $2 <
                      event_count
                    THEN
                      NOW()
                    ELSE
                      paused_at
                  END,

                completed_at =
                  CASE
                    WHEN
                      $2 >=
                      event_count
                    THEN
                      COALESCE(
                        completed_at,
                        NOW()
                      )
                    ELSE
                      NULL
                  END,

                failed_at =
                  NULL,

                failure_code =
                  NULL,

                failure_message =
                  NULL,

                updated_at =
                  NOW()

              WHERE
                id =
                  $1

              RETURNING *
            `,

            [
              run.id,

              cursor,
            ]
          );


        return mapRun(
          updated.rows[
            0
          ]
        );
      }
    );
  }


  async restartRun(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    return this.tenantScope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client
      ) => {
        const runResult =
          await client.query(
            `
              SELECT *
              FROM
                reality.replay_runs
              WHERE
                public_id =
                $1
              FOR UPDATE
            `,

            [
              runId,
            ]
          );


        if (
          runResult.rowCount !==
          1
        ) {
          throw repositoryError(
            "REALITY_REPLAY_RUN_NOT_FOUND",

            "Replay run was not found",

            404
          );
        }


        const run =
          runResult.rows[
            0
          ];


        await client.query(
          `
            UPDATE
              reality.replay_events
            SET
              status =
                'PENDING',

              released_at =
                NULL
            WHERE
              replay_run_id =
                $1
          `,

          [
            run.id,
          ]
        );


        const updated =
          await client.query(
            `
              UPDATE
                reality.replay_runs
              SET
                status =
                  'READY',

                cursor_position =
                  0,

                started_at =
                  NULL,

                paused_at =
                  NULL,

                completed_at =
                  NULL,

                failed_at =
                  NULL,

                failure_code =
                  NULL,

                failure_message =
                  NULL,

                updated_at =
                  NOW()

              WHERE
                id =
                  $1

              RETURNING *
            `,

            [
              run.id,
            ]
          );


        return mapRun(
          updated.rows[
            0
          ]
        );
      }
    );
  }


  async markFailed(
    input =
      {}
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


    const runId =
      requireString(
        input.runId,

        "runId"
      );


    const failureCode =
      requireString(
        input.failureCode,

        "failureCode"
      );


    const failureMessage =
      String(
        input.failureMessage ||
        "Reality replay failed"
      ).slice(
        0,
        4000
      );


    return this.tenantScope.run(
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
                reality.replay_runs
              SET
                status =
                  'FAILED',

                failed_at =
                  NOW(),

                failure_code =
                  $2,

                failure_message =
                  $3,

                updated_at =
                  NOW()

              WHERE
                public_id =
                  $1
                AND
                status <>
                  'COMPLETED'

              RETURNING *
            `,

            [
              runId,

              failureCode,

              failureMessage,
            ]
          );


        return mapRun(
          result.rows[
            0
          ]
        );
      }
    );
  }
}


module.exports = {
  PostgresRealityReplayRepository,

  buildReplaySchedule,

  deterministicJitter,

  assertNoSealedKeys,

  canonicalJson,

  sha256,

  REPLAY_RUN_STATUS,
};