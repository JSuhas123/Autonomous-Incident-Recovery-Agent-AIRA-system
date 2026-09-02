"use strict";


const incidentDetailService =
  require(
    "../incidents/incidentDetailService"
  );


const PostgresIncidentDiagnosisRepository =
  require(
    "../../persistence/postgres/PostgresIncidentDiagnosisRepository"
  );


const PostgresRecoveryDecisionRepository =
  require(
    "../../persistence/postgres/PostgresRecoveryDecisionRepository"
  );


const PostgresRecoveryVerificationRepository =
  require(
    "../../persistence/postgres/PostgresRecoveryVerificationRepository"
  );


const PostgresHumanEscalationRepository =
  require(
    "../../persistence/postgres/PostgresHumanEscalationRepository"
  );


const PostgresHumanOperationsRepository =
  require(
    "../../persistence/postgres/PostgresHumanOperationsRepository"
  );


const PostgresIncidentHandoffRepository =
  require(
    "../../persistence/postgres/PostgresIncidentHandoffRepository"
  );


const {
  HANDOFF_SCHEMA_VERSION,

  buildIncidentHandoffPackage,

  contentHash,
} =
  require(
    "./incidentHandoffPackageBuilder"
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


class IncidentHandoffPackageService {
  constructor(
    options =
      {}
  ) {
    const postgres =
      options.postgres ||
      {};


    this.incidentDetailService =
      options.incidentDetailService ||
      incidentDetailService;


    this.diagnosisRepository =
      options.diagnosisRepository ||

      new PostgresIncidentDiagnosisRepository(
        postgres
      );


    this.recoveryDecisionRepository =
      options.recoveryDecisionRepository ||

      new PostgresRecoveryDecisionRepository(
        postgres
      );


    this.verificationRepository =
      options.verificationRepository ||

      new PostgresRecoveryVerificationRepository(
        postgres
      );


    this.escalationRepository =
      options.escalationRepository ||

      new PostgresHumanEscalationRepository(
        postgres
      );


    this.humanOperationsRepository =
      options.humanOperationsRepository ||

      new PostgresHumanOperationsRepository(
        postgres
      );


    this.handoffRepository =
      options.handoffRepository ||

      new PostgresIncidentHandoffRepository(
        postgres
      );
  }


  async generate(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "INCIDENT_HANDOFF_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "INCIDENT_HANDOFF_ENVIRONMENT_REQUIRED"
      );


    const incidentId =
      requireValue(
        input.incidentId,
        "incidentId",
        "INCIDENT_HANDOFF_INCIDENT_REQUIRED"
      );


    const escalationId =
      requireValue(
        input.escalationId,
        "escalationId",
        "INCIDENT_HANDOFF_ESCALATION_REQUIRED"
      );


    const scope = {
      organizationId,

      environmentId,

      incidentId,
    };


    /*
     * ========================================================================
     * LOAD CANONICAL AIRA STATE
     * ========================================================================
     *
     * We do not trust event payload snapshots here.
     *
     * The handoff is rebuilt from canonical repositories.
     */


    const [
      detail,

      diagnosis,

      recoveryDecision,

      verification,

      escalation,
    ] =
      await Promise.all([
        this
          .incidentDetailService
          .getDetail(
            {
              organizationId,

              environmentId,
            },

            incidentId
          ),

        this
          .diagnosisRepository
          .findCurrent(
            scope
          ),

        this
          .recoveryDecisionRepository
          .findCurrent(
            scope
          ),

        this
          .verificationRepository
          .findCurrent(
            scope
          ),

        this
          .escalationRepository
          .getEscalation({
            organizationId,

            environmentId,

            escalationId,
          }),
      ]);


    if (
      !detail
    ) {
      throw createError(
        `Incident not found: ${incidentId}`,
        "INCIDENT_HANDOFF_INCIDENT_NOT_FOUND",
        404
      );
    }


    if (
      !escalation
    ) {
      throw createError(
        `Escalation not found: ${escalationId}`,
        "INCIDENT_HANDOFF_ESCALATION_NOT_FOUND",
        404
      );
    }


    if (
      String(
        escalation.incidentId
      ) !==
      String(
        incidentId
      )
    ) {
      throw createError(
        "Escalation does not belong to requested incident",
        "INCIDENT_HANDOFF_INCIDENT_ESCALATION_MISMATCH",
        409
      );
    }


    /*
     * ========================================================================
     * HUMAN TASK
     * ========================================================================
     */


    let task =
      null;


    let taskHistory =
      [];


    const taskId =
      input.taskId ||
      escalation.taskId ||
      null;


    if (
      taskId
    ) {
      task =
        await this
          .humanOperationsRepository
          .getTask({
            organizationId,

            environmentId,

            taskId,
          });


      if (
        !task
      ) {
        throw createError(
          `Human task not found: ${taskId}`,
          "INCIDENT_HANDOFF_TASK_NOT_FOUND",
          404
        );
      }


      if (
        String(
          task.incidentId
        ) !==
        String(
          incidentId
        )
      ) {
        throw createError(
          "Human task does not belong to requested incident",
          "INCIDENT_HANDOFF_INCIDENT_TASK_MISMATCH",
          409
        );
      }


      taskHistory =
        await this
          .humanOperationsRepository
          .listTaskHistory({
            organizationId,

            environmentId,

            taskId:
              task.publicId ||
              task.id,
          });
    }


    /*
     * ========================================================================
     * BUILD INFORMATION-ONLY PACKAGE
     * ========================================================================
     */


    const handoffPackage =
      buildIncidentHandoffPackage({
        detail,

        diagnosis,

        recoveryDecision,

        verification,

        escalation,

        task,

        taskHistory,

        generatedAt:
          input.generatedAt ||
          new Date()
            .toISOString(),
      });


    if (
      handoffPackage
        .executionAuthorized ===
      true
    ) {
      throw createError(
        "Incident handoff package attempted to authorize execution",
        "INCIDENT_HANDOFF_AUTHORITY_VIOLATION",
        403
      );
    }


    const hash =
      contentHash(
        handoffPackage
      );


    /*
     * ========================================================================
     * DURABLE REVISION
     * ========================================================================
     */


    const persisted =
      await this
        .handoffRepository
        .createRevision({
          organizationId,

          environmentId,

          incidentId,

          escalationId:
            escalation.publicId ||
            escalation.id ||
            escalationId,

          taskId:
            task
              ? task.publicId ||
                task.id
              : null,

          schemaVersion:
            HANDOFF_SCHEMA_VERSION,

          generationReason:
            input.generationReason ||
            "ESCALATION",

          contentHash:
            hash,

          package:
            handoffPackage,

          generatedAt:
            handoffPackage
              .generatedAt,

          metadata: {
            source:
              "PHASE_23_4_INCIDENT_HANDOFF",

            diagnosisPresent:
              Boolean(
                diagnosis
              ),

            recoveryDecisionPresent:
              Boolean(
                recoveryDecision
              ),

            verificationPresent:
              Boolean(
                verification
              ),

            taskPresent:
              Boolean(
                task
              ),

            stalePlanResumeAllowed:
              false,

            freshEvaluationRequiredOnReturn:
              true,

            executionAuthorized:
              false,
          },
        });


    return {
      created:
        persisted.created ===
        true,

      duplicate:
        persisted.duplicate ===
        true,

      superseded:
        persisted.superseded ===
        true,

      handoff:
        persisted.handoff,

      package:
        persisted
          .handoff
          .package,

      revision:
        persisted
          .handoff
          .revision,

      contentHash:
        persisted
          .handoff
          .contentHash,

      humanControlGranted:
        false,

      acknowledgementGranted:
        false,

      executionAuthorized:
        false,
    };
  }


  async getCurrent(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "INCIDENT_HANDOFF_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "INCIDENT_HANDOFF_ENVIRONMENT_REQUIRED"
      );


    const escalationId =
      requireValue(
        input.escalationId,
        "escalationId",
        "INCIDENT_HANDOFF_ESCALATION_REQUIRED"
      );


    const handoff =
      await this
        .handoffRepository
        .getCurrent({
          organizationId,

          environmentId,

          escalationId,
        });


    if (
      !handoff
    ) {
      return null;
    }


    return {
      ...handoff,

      humanControlGranted:
        false,

      acknowledgementGranted:
        false,

      executionAuthorized:
        false,
    };
  }


  async listHistory(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "INCIDENT_HANDOFF_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "INCIDENT_HANDOFF_ENVIRONMENT_REQUIRED"
      );


    const escalationId =
      requireValue(
        input.escalationId,
        "escalationId",
        "INCIDENT_HANDOFF_ESCALATION_REQUIRED"
      );


    return this
      .handoffRepository
      .listHistory({
        organizationId,

        environmentId,

        escalationId,

        limit:
          input.limit ||
          20,
      });
  }
}


const defaultService =
  new IncidentHandoffPackageService();


module.exports =
  defaultService;


module.exports
  .IncidentHandoffPackageService =
  IncidentHandoffPackageService;