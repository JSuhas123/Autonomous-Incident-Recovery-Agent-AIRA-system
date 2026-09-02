"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.7
 * INCIDENT COMMAND SERVICE
 * ============================================================================
 *
 * Thin orchestration boundary over canonical Phase-23 domain services.
 *
 * It does NOT implement takeover state itself.
 *
 * It delegates to:
 *
 * - HumanTaskService
 * - HumanTakeControlService
 * - HumanReturnControlService
 *
 * ============================================================================
 */


const humanTaskService =
  require(
    "./humanTaskService"
  );


const humanTakeControlService =
  require(
    "./humanTakeControlService"
  );


const humanReturnControlService =
  require(
    "./humanReturnControlService"
  );


const incidentCommandReadModelService =
  require(
    "./incidentCommandReadModelService"
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


function requireCommandScope(
  input =
    {}
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


  requireValue(
    input.actorUserId,
    "actorUserId",
    "INCIDENT_COMMAND_ACTOR_REQUIRED"
  );
}


class IncidentCommandService {
  constructor(
    options =
      {}
  ) {
    this.taskService =
      options.taskService ||
      humanTaskService;


    this.takeControlService =
      options.takeControlService ||
      humanTakeControlService;


    this.returnControlService =
      options.returnControlService ||
      humanReturnControlService;


    this.readModelService =
      options.readModelService ||
      incidentCommandReadModelService;
  }


  async get(
    input =
      {}
  ) {
    requireCommandScope(
      input
    );


    return this
      .readModelService
      .getReadModel(
        input
      );
  }


  async acknowledge(
    input =
      {}
  ) {
    requireCommandScope(
      input
    );


    const taskId =
      requireValue(
        input.taskId,
        "taskId",
        "INCIDENT_COMMAND_TASK_REQUIRED"
      );


    const task =
      await this
        .taskService
        .acknowledgeTask({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          taskId,

          actorUserId:
            input.actorUserId,
        });


    return {
      command:
        "ACKNOWLEDGE",

      task,

      humanControlActive:
        false,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  async requestControl(
    input =
      {}
  ) {
    requireCommandScope(
      input
    );


    const taskId =
      requireValue(
        input.taskId,
        "taskId",
        "INCIDENT_COMMAND_TASK_REQUIRED"
      );


    const result =
      await this
        .takeControlService
        .requestControl({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          taskId,

          actorUserId:
            input.actorUserId,

          reason:
            input.reason ||
            null,

          sessionExpiresAt:
            input.sessionExpiresAt ||
            null,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            commandSource:
              "INCIDENT_COMMAND_API",

            executionAuthorized:
              false,
          },
        });


    return {
      command:
        "REQUEST_CONTROL",

      ...result,

      executionAuthorized:
        false,
    };
  }


  async authorizeControl(
    input =
      {}
  ) {
    requireCommandScope(
      input
    );


    const sessionId =
      requireValue(
        input.sessionId,
        "sessionId",
        "INCIDENT_COMMAND_SESSION_REQUIRED"
      );


    const result =
      await this
        .takeControlService
        .authorizeControl({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId,

          actorUserId:
            input.actorUserId,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            commandSource:
              "INCIDENT_COMMAND_API",

            executionAuthorized:
              false,
          },
        });


    return {
      command:
        "AUTHORIZE_CONTROL",

      ...result,

      executionAuthorized:
        false,
    };
  }


  async acquireControl(
    input =
      {}
  ) {
    requireCommandScope(
      input
    );


    const sessionId =
      requireValue(
        input.sessionId,
        "sessionId",
        "INCIDENT_COMMAND_SESSION_REQUIRED"
      );


    const result =
      await this
        .takeControlService
        .acquireControl({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId,

          actorUserId:
            input.actorUserId,

          leaseDurationMs:
            input.leaseDurationMs,

          expiresAt:
            input.expiresAt,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            commandSource:
              "INCIDENT_COMMAND_API",

            executionAuthorized:
              false,
          },
        });


    return {
      command:
        "ACQUIRE_CONTROL",

      ...result,

      executionAuthorized:
        false,
    };
  }


  async heartbeatControl(
    input =
      {}
  ) {
    requireCommandScope(
      input
    );


    const leaseId =
      requireValue(
        input.leaseId,
        "leaseId",
        "INCIDENT_COMMAND_LEASE_REQUIRED"
      );


    const result =
      await this
        .takeControlService
        .heartbeatControl({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          leaseId,

          actorUserId:
            input.actorUserId,

          extensionMs:
            input.extensionMs,
        });


    return {
      command:
        "HEARTBEAT_CONTROL",

      ...result,

      executionAuthorized:
        false,
    };
  }


  async returnControl(
    input =
      {}
  ) {
    requireCommandScope(
      input
    );


    const leaseId =
      requireValue(
        input.leaseId,
        "leaseId",
        "INCIDENT_COMMAND_LEASE_REQUIRED"
      );


    const result =
      await this
        .returnControlService
        .returnControl({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          leaseId,

          actorUserId:
            input.actorUserId,

          reason:
            input.reason ||
            null,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            commandSource:
              "INCIDENT_COMMAND_API",

            executionAuthorized:
              false,
          },
        });


    return {
      command:
        "RETURN_CONTROL",

      ...result,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }
}


const defaultService =
  new IncidentCommandService();


module.exports =
  defaultService;


module.exports
  .IncidentCommandService =
  IncidentCommandService;