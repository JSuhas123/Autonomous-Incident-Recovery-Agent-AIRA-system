"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.7
 * INCIDENT COMMAND READ REPOSITORY
 * ============================================================================
 *
 * Purpose:
 *
 * Build one tenant-scoped PostgreSQL projection over the Human Operations
 * state required by the Incident Command API.
 *
 * PostgreSQL remains authoritative for:
 *
 * - human task
 * - assignment
 * - acknowledgement
 * - escalation
 * - notification request
 * - handoff package
 * - takeover session
 * - control lease
 * - return-control fence
 *
 * This repository is READ ONLY.
 *
 * READ MODEL != CONTROL
 * READ MODEL != EXECUTION AUTHORIZATION
 *
 * ============================================================================
 */


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


function createError(
  message,
  code,
  status =
    422
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
      code
    );
  }


  return value;
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
    } catch {
      return fallback;
    }
  }


  return value;
}


function baseScope(
  row,
  resolved
) {
  return {
    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,
  };
}


function mapTask(
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

    ...baseScope(
      row,
      resolved
    ),

    incidentId:
      row.incident_id,

    approvalId:
      row.approval_id,

    escalationId:
      row.escalation_id,

    executionRequestId:
      row.execution_request_id,

    recoveryDecisionId:
      row.recovery_decision_id,

    taskType:
      row.task_type,

    title:
      row.title,

    description:
      row.description,

    priority:
      row.priority,

    status:
      row.status,

    source:
      row.source,

    assignedUserId:
      row.assigned_user_id,

    assignedTeamId:
      row.assigned_team_id,

    acknowledgementRequired:
      row.acknowledgement_required ===
      true,

    autonomousRecoveryBlocked:
      row.autonomous_recovery_blocked ===
      true,

    recommendedActions:
      parseJson(
        row.recommended_actions,
        []
      ),

    evidence:
      parseJson(
        row.evidence,
        []
      ),

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    dueAt:
      row.due_at,

    expiresAt:
      row.expires_at,

    acknowledgedAt:
      row.acknowledged_at,

    resolvedAt:
      row.resolved_at,

    controlEpoch:
      Number(
        row.control_epoch ||
        0
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    executionAuthorized:
      false,
  };
}


function mapAssignment(
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

    ...baseScope(
      row,
      resolved
    ),

    taskId:
      row.task_id,

    assignedUserId:
      row.assigned_user_id,

    assignedTeamId:
      row.assigned_team_id,

    assignedByUserId:
      row.assigned_by_user_id,

    status:
      row.status,

    reason:
      row.reason,

    assignedAt:
      row.assigned_at,

    endedAt:
      row.ended_at,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      false,
  };
}


function mapAcknowledgement(
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

    ...baseScope(
      row,
      resolved
    ),

    taskId:
      row.task_id,

    assignmentId:
      row.assignment_id,

    acknowledgedByUserId:
      row.acknowledged_by_user_id,

    outcome:
      row.outcome,

    note:
      row.note,

    acknowledgedAt:
      row.acknowledged_at,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      false,
  };
}


function mapEscalation(
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

    ...baseScope(
      row,
      resolved
    ),

    incidentId:
      row.incident_id,

    taskId:
      row.task_id,

    policyId:
      row.policy_id,

    selectedTargetId:
      row.selected_target_id,

    decision:
      row.decision,

    reasonCode:
      row.reason_code,

    severity:
      row.severity,

    triggerSource:
      row.trigger_source,

    status:
      row.status,

    decisionSnapshot:
      parseJson(
        row.decision_snapshot,
        {}
      ),

    routingSnapshot:
      parseJson(
        row.routing_snapshot,
        {}
      ),

    acknowledgementDeadline:
      row.acknowledgement_deadline,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    executionAuthorized:
      false,
  };
}


function mapNotification(
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

    ...baseScope(
      row,
      resolved
    ),

    escalationId:
      row.escalation_id,

    taskId:
      row.task_id,

    eventType:
      row.event_type,

    status:
      row.status,

    targetType:
      row.target_type,

    targetIdentity:
      row.target_identity,

    attemptCount:
      Number(
        row.attempt_count ||
        0
      ),

    maxAttempts:
      row.max_attempts ===
        undefined
        ? null
        : Number(
            row.max_attempts
          ),

    lastError:
      row.last_error,

    queuedAt:
      row.queued_at,

    deliveredAt:
      row.delivered_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      false,
  };
}


function mapHandoff(
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

    ...baseScope(
      row,
      resolved
    ),

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

    generatedAt:
      row.generated_at,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,
  };
}


function mapTakeoverSession(
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

    ...baseScope(
      row,
      resolved
    ),

    incidentId:
      row.incident_id,

    taskId:
      row.task_id,

    requestedByUserId:
      row.requested_by_user_id,

    authorizedByUserId:
      row.authorized_by_user_id,

    status:
      row.status,

    reason:
      row.reason,

    requestedAt:
      row.requested_at,

    authorizedAt:
      row.authorized_at,

    activatedAt:
      row.activated_at,

    releaseRequestedAt:
      row.release_requested_at,

    releasedAt:
      row.released_at,

    expiresAt:
      row.expires_at,

    revokedAt:
      row.revoked_at,

    controlEpoch:
      Number(
        row.control_epoch ||
        0
      ),

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      false,
  };
}


function mapLease(
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

    ...baseScope(
      row,
      resolved
    ),

    incidentId:
      row.incident_id,

    takeoverSessionId:
      row.takeover_session_id,

    holderUserId:
      row.holder_user_id,

    status:
      row.status,

    leaseVersion:
      Number(
        row.lease_version ||
        0
      ),

    controlEpoch:
      Number(
        row.control_epoch ||
        0
      ),

    acquiredAt:
      row.acquired_at,

    heartbeatAt:
      row.heartbeat_at,

    expiresAt:
      row.expires_at,

    releasedAt:
      row.released_at,

    revokedAt:
      row.revoked_at,

    releaseReason:
      row.release_reason,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    executionAuthorized:
      false,
  };
}


function mapReturnFence(
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

    ...baseScope(
      row,
      resolved
    ),

    incidentId:
      row.incident_id,

    controlLeaseId:
      row.control_lease_id,

    takeoverSessionId:
      row.takeover_session_id,

    previousControlEpoch:
      Number(
        row.previous_control_epoch ||
        0
      ),

    requiredControlEpoch:
      Number(
        row.required_control_epoch ||
        0
      ),

    releaseOutcome:
      row.release_outcome,

    state:
      row.state,

    freshAfter:
      row.fresh_after,

    freshDiagnosisId:
      row.fresh_diagnosis_id,

    freshRecoveryDecisionId:
      row.fresh_recovery_decision_id,

    satisfiedAt:
      row.satisfied_at,

    supersededAt:
      row.superseded_at,

    stalePlanResumeAllowed:
      false,

    metadata:
      parseJson(
        row.metadata,
        {}
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    executionAuthorized:
      false,
  };
}


class PostgresIncidentCommandReadRepository {
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


  async getProjection(
    input =
      {},
    transaction =
      null
  ) {
    requireValue(
      input.organizationId,
      "organizationId",
      "INCIDENT_COMMAND_ORGANIZATION_REQUIRED"
    );


    requireValue(
      input.environmentId,
      "environmentId",
      "INCIDENT_COMMAND_ENVIRONMENT_REQUIRED"
    );


    requireValue(
      input.incidentId,
      "incidentId",
      "INCIDENT_COMMAND_INCIDENT_REQUIRED"
    );


    const scope = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,
    };


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const incidentId =
          String(
            input.incidentId
          );


        /*
         * ====================================================================
         * TASK
         * ====================================================================
         */

        const taskResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.tasks

              WHERE
                incident_id = $1

              ORDER BY
                created_at DESC

              LIMIT 1
            `,
            [
              incidentId,
            ]
          );


        const taskRow =
          taskResult.rows[0] ||
          null;


        /*
         * ====================================================================
         * ESCALATION
         * ====================================================================
         */

        const escalationResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.escalations

              WHERE
                incident_id = $1

              ORDER BY
                created_at DESC

              LIMIT 1
            `,
            [
              incidentId,
            ]
          );


        const escalationRow =
          escalationResult.rows[0] ||
          null;


        /*
         * ====================================================================
         * ASSIGNMENT + ACK
         * ====================================================================
         */

        let assignmentRow =
          null;


        let acknowledgementRow =
          null;


        if (
          taskRow
        ) {
          const assignmentResult =
            await client.query(
              `
                SELECT *
                FROM
                  human_operations.assignments

                WHERE
                  task_id = $1

                  AND
                  status = 'ACTIVE'

                ORDER BY
                  assigned_at DESC

                LIMIT 1
              `,
              [
                taskRow.id,
              ]
            );


          assignmentRow =
            assignmentResult.rows[0] ||
            null;


          const acknowledgementResult =
            await client.query(
              `
                SELECT *
                FROM
                  human_operations.acknowledgements

                WHERE
                  task_id = $1

                ORDER BY
                  acknowledged_at DESC

                LIMIT 1
              `,
              [
                taskRow.id,
              ]
            );


          acknowledgementRow =
            acknowledgementResult.rows[0] ||
            null;
        }


        /*
         * ====================================================================
         * NOTIFICATION
         * ====================================================================
         */

        let notificationRow =
          null;


        if (
          escalationRow
        ) {
          const escalationPublicId =
            String(
              escalationRow.public_id
            );


          const escalationDatabaseId =
            String(
              escalationRow.id
            );


          const notificationResult =
            await client.query(
              `
                SELECT *
                FROM
                  notifications.requests

                WHERE
                  escalation_id = $1

                  OR
                  escalation_id = $2

                ORDER BY
                  created_at DESC

                LIMIT 1
              `,
              [
                escalationPublicId,
                escalationDatabaseId,
              ]
            );


          notificationRow =
            notificationResult.rows[0] ||
            null;
        }


        /*
         * ====================================================================
         * INCIDENT HANDOFF
         * ====================================================================
         */

        const handoffResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.incident_handoff_packages

              WHERE
                incident_id = $1

                AND
                is_current = TRUE

              ORDER BY
                revision DESC

              LIMIT 1
            `,
            [
              incidentId,
            ]
          );


        const handoffRow =
          handoffResult.rows[0] ||
          null;


        /*
         * ====================================================================
         * TAKEOVER SESSION
         * ====================================================================
         */

        const sessionResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.takeover_sessions

              WHERE
                incident_id = $1

              ORDER BY
                requested_at DESC

              LIMIT 1
            `,
            [
              incidentId,
            ]
          );


        const sessionRow =
          sessionResult.rows[0] ||
          null;


        /*
         * ====================================================================
         * ACTIVE CONTROL LEASE
         * ====================================================================
         */

        const leaseResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.control_leases

              WHERE
                incident_id = $1

                AND
                status = 'ACTIVE'

              ORDER BY
                acquired_at DESC NULLS LAST,
                created_at DESC

              LIMIT 1
            `,
            [
              incidentId,
            ]
          );


        const leaseRow =
          leaseResult.rows[0] ||
          null;


        /*
         * ====================================================================
         * RETURN CONTROL FENCE
         * ====================================================================
         */

        const returnFenceResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.control_return_fences

              WHERE
                incident_id = $1

              ORDER BY
                created_at DESC

              LIMIT 1
            `,
            [
              incidentId,
            ]
          );


        const returnFenceRow =
          returnFenceResult.rows[0] ||
          null;


        return {
          incidentId,

          task:
            mapTask(
              taskRow,
              resolved
            ),

          assignment:
            mapAssignment(
              assignmentRow,
              resolved
            ),

          acknowledgement:
            mapAcknowledgement(
              acknowledgementRow,
              resolved
            ),

          escalation:
            mapEscalation(
              escalationRow,
              resolved
            ),

          notification:
            mapNotification(
              notificationRow,
              resolved
            ),

          handoff:
            mapHandoff(
              handoffRow,
              resolved
            ),

          takeoverSession:
            mapTakeoverSession(
              sessionRow,
              resolved
            ),

          activeLease:
            mapLease(
              leaseRow,
              resolved
            ),

          returnFence:
            mapReturnFence(
              returnFenceRow,
              resolved
            ),

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }
}


module.exports =
  PostgresIncidentCommandReadRepository;


module.exports.mapTask =
  mapTask;


module.exports.mapAssignment =
  mapAssignment;


module.exports.mapAcknowledgement =
  mapAcknowledgement;


module.exports.mapEscalation =
  mapEscalation;


module.exports.mapNotification =
  mapNotification;


module.exports.mapHandoff =
  mapHandoff;


module.exports.mapTakeoverSession =
  mapTakeoverSession;


module.exports.mapLease =
  mapLease;


module.exports.mapReturnFence =
  mapReturnFence;