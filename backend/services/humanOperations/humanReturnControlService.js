"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.6
 * RETURN CONTROL SERVICE
 * ============================================================================
 *
 * RETURN CONTROL != RESUME
 *
 *
 * ACTIVE human lease
 *        ↓
 * release / expiry / revoke
 *        ↓
 * NO HUMAN CONTROL
 *        ↓
 * FRESH EVALUATION REQUIRED
 *        ↓
 * stale autonomous plan remains prohibited
 *        ↓
 * fresh diagnosis
 *        ↓
 * fresh recovery decision
 *        ↓
 * fence SATISFIED
 *
 *
 * IMPORTANT:
 *
 * Satisfying this fence does NOT authorize infrastructure execution.
 * Canonical authorization gates still apply afterwards.
 *
 * ============================================================================
 */


const {
  HumanTakeoverLifecycleService,
} =
  require(
    "./humanTakeoverLifecycleService"
  );


const {
  PostgresHumanTakeoverRepository,
} =
  require(
    "../../persistence/postgres/humanOperations"
  );


const PostgresControlReturnFenceRepository =
  require(
    "../../persistence/postgres/PostgresControlReturnFenceRepository"
  );


const RETURN_CONTROL_INVARIANTS =
  Object.freeze({
    RETURN_CONTROL_IS_NOT_RESUME:
      true,

    RELEASE_REQUIRES_FRESH_EVALUATION:
      true,

    EXPIRY_REQUIRES_FRESH_EVALUATION:
      true,

    REVOCATION_REQUIRES_FRESH_EVALUATION:
      true,

    OLD_DIAGNOSIS_CANNOT_RESUME_PLAN:
      true,

    OLD_RECOVERY_DECISION_CANNOT_RESUME_PLAN:
      true,

    FRESH_EVALUATION_DOES_NOT_AUTHORIZE_EXECUTION:
      true,

    POSTGRES_IS_RETURN_FENCE_AUTHORITY:
      true,

    STALE_PLAN_RESUME_PROHIBITED:
      true,
  });


function createError(
  message,
  code,
  status =
    409,
  details =
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

      ...details,
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


function sameId(
  left,
  right
) {
  return (
    String(
      left
    ) ===
    String(
      right
    )
  );
}


class HumanReturnControlService {
  constructor(
    options =
      {}
  ) {
    this.takeoverRepository =
      options.takeoverRepository ||

      new PostgresHumanTakeoverRepository(
        options
      );


    this.lifecycleService =
      options.lifecycleService ||

      new HumanTakeoverLifecycleService({
        ...options,

        takeoverRepository:
          this.takeoverRepository,
      });


    this.returnFenceRepository =
      options.returnFenceRepository ||

      new PostgresControlReturnFenceRepository(
        options
      );
  }


  async returnControl(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "CONTROL_RETURN_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "CONTROL_RETURN_ENVIRONMENT_REQUIRED"
      );


    const incidentId =
      requireValue(
        input.incidentId,
        "incidentId",
        "CONTROL_RETURN_INCIDENT_REQUIRED"
      );


    const leaseId =
      requireValue(
        input.leaseId,
        "leaseId",
        "CONTROL_RETURN_LEASE_REQUIRED"
      );


    const actorUserId =
      requireValue(
        input.actorUserId,
        "actorUserId",
        "CONTROL_RETURN_ACTOR_REQUIRED"
      );


    /*
     * ========================================================================
     * VERIFY CURRENT AUTHORITATIVE LEASE
     * ========================================================================
     */


    const activeLease =
      await this
        .takeoverRepository
        .getActiveLeaseForIncident({
          organizationId,

          environmentId,

          incidentId,
        });


    if (
      !activeLease
    ) {
      throw createError(
        "Incident does not currently have an ACTIVE human control lease",
        "CONTROL_RETURN_ACTIVE_LEASE_NOT_FOUND",
        404
      );
    }


    const authoritativeLeaseId =
      activeLease.publicId ||
      activeLease.id;


    if (
      !sameId(
        authoritativeLeaseId,
        leaseId
      ) &&
      !sameId(
        activeLease.id,
        leaseId
      )
    ) {
      throw createError(
        "Requested lease is not the authoritative ACTIVE incident lease",
        "CONTROL_RETURN_LEASE_MISMATCH",
        409,
        {
          activeLeaseId:
            authoritativeLeaseId,
        }
      );
    }


    /*
     * ========================================================================
     * RELEASE CONTROL
     * ========================================================================
     *
     * PostgreSQL performs:
     *
     * ACTIVE lease -> RELEASED
     * takeover session -> RELEASED
     * return-control trigger -> REQUIRES_FRESH_EVALUATION fence
     *
     * in one database transaction.
     */


    const released =
      await this
        .lifecycleService
        .releaseControl({
          organizationId,

          environmentId,

          leaseId:
            authoritativeLeaseId,

          actorUserId,

          reason:
            input.reason ||
            "Human operator returned incident control",

          force:
            Boolean(
              input.force
            ),

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            phase:
              "23.6",

            requiresFreshEvaluation:
              true,

            stalePlanResumeAllowed:
              false,

            executionAuthorized:
              false,
          },
        });


    /*
     * The database trigger must have created the durable fence before the
     * release transaction committed.
     */


    const fence =
      await this
        .returnFenceRepository
        .getPending({
          organizationId,

          environmentId,

          incidentId,
        });


    if (
      !fence
    ) {
      throw createError(
        "Control was released but no durable fresh-evaluation fence exists",
        "CONTROL_RETURN_FENCE_MISSING",
        500,
        {
          stalePlanResumeAllowed:
            false,
        }
      );
    }


    return {
      incidentId,

      lease:
        released.lease,

      returnFence:
        fence,

      humanControlActive:
        false,

      requiresFreshEvaluation:
        true,

      freshEvaluationSatisfied:
        false,

      autonomousContinuationAllowed:
        false,

      requiredControlEpoch:
        fence.requiredControlEpoch,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  async getReturnState(
    input =
      {}
  ) {
    requireValue(
      input.organizationId,
      "organizationId",
      "CONTROL_RETURN_ORGANIZATION_REQUIRED"
    );


    requireValue(
      input.environmentId,
      "environmentId",
      "CONTROL_RETURN_ENVIRONMENT_REQUIRED"
    );


    requireValue(
      input.incidentId,
      "incidentId",
      "CONTROL_RETURN_INCIDENT_REQUIRED"
    );


    const pending =
      await this
        .returnFenceRepository
        .getPending(
          input
        );


    if (
      pending
    ) {
      return {
        incidentId:
          input.incidentId,

        requiresFreshEvaluation:
          true,

        freshEvaluationSatisfied:
          false,

        autonomousContinuationAllowed:
          false,

        returnFence:
          pending,

        requiredControlEpoch:
          pending.requiredControlEpoch,

        stalePlanResumeAllowed:
          false,

        executionAuthorized:
          false,
      };
    }


    const latest =
      await this
        .returnFenceRepository
        .getLatest(
          input
        );


    return {
      incidentId:
        input.incidentId,

      requiresFreshEvaluation:
        false,

      freshEvaluationSatisfied:
        latest?.state ===
          "SATISFIED",

      autonomousContinuationAllowed:
        true,

      returnFence:
        latest ||
        null,

      requiredControlEpoch:
        latest
          ?.requiredControlEpoch ||
        null,

      /*
       * Even after a fresh evaluation, the old plan itself is never resumed.
       *
       * AIRA proceeds only through the new diagnosis + new recovery decision.
       */
      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  async certifyFreshEvaluation(
    input =
      {}
  ) {
    requireValue(
      input.organizationId,
      "organizationId",
      "CONTROL_RETURN_ORGANIZATION_REQUIRED"
    );


    requireValue(
      input.environmentId,
      "environmentId",
      "CONTROL_RETURN_ENVIRONMENT_REQUIRED"
    );


    requireValue(
      input.incidentId,
      "incidentId",
      "CONTROL_RETURN_INCIDENT_REQUIRED"
    );


    requireValue(
      input.diagnosisId,
      "diagnosisId",
      "CONTROL_RETURN_FRESH_DIAGNOSIS_REQUIRED"
    );


    requireValue(
      input.recoveryDecisionId,
      "recoveryDecisionId",
      "CONTROL_RETURN_FRESH_RECOVERY_DECISION_REQUIRED"
    );


    const result =
      await this
        .returnFenceRepository
        .certifyFreshEvaluation({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          diagnosisId:
            input.diagnosisId,

          recoveryDecisionId:
            input.recoveryDecisionId,
        });


    return {
      incidentId:
        input.incidentId,

      returnFence:
        result.fence,

      freshDiagnosisId:
        result.diagnosisId,

      freshRecoveryDecisionId:
        result.recoveryDecisionId,

      requiresFreshEvaluation:
        false,

      freshEvaluationSatisfied:
        true,

      autonomousContinuationAllowed:
        true,

      /*
       * This means only the RETURN-CONTROL fence passed.
       *
       * It is NOT an execution authorization result.
       */
      executionAuthorizationRequired:
        true,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  async assertAutonomousContinuationAllowed(
    input =
      {}
  ) {
    if (
      input.executionAuthorized ===
        true ||
      input.authorizationGranted ===
        true
    ) {
      throw createError(
        "Return-control fence input cannot manufacture execution authority",
        "CONTROL_RETURN_AUTHORITY_VIOLATION",
        403
      );
    }


    const state =
      await this
        .getReturnState(
          input
        );


    if (
      state.requiresFreshEvaluation ===
        true
    ) {
      throw createError(
        "AIRA cannot autonomously continue until a fresh post-control evaluation is certified",
        "CONTROL_RETURN_FRESH_EVALUATION_REQUIRED",
        423,
        {
          incidentId:
            input.incidentId,

          requiredControlEpoch:
            state.requiredControlEpoch,

          freshAfter:
            state.returnFence
              ?.freshAfter ||
            null,

          stalePlanResumeAllowed:
            false,

          autonomousContinuationAllowed:
            false,
        }
      );
    }


    return {
      allowed:
        true,

      incidentId:
        input.incidentId,

      freshEvaluationSatisfied:
        state
          .freshEvaluationSatisfied,

      stalePlanResumeAllowed:
        false,

      /*
       * Still not execution authority.
       */
      executionAuthorized:
        false,
    };
  }
}


const defaultService =
  new HumanReturnControlService();


module.exports =
  defaultService;


module.exports
  .HumanReturnControlService =
  HumanReturnControlService;


module.exports
  .RETURN_CONTROL_INVARIANTS =
  RETURN_CONTROL_INVARIANTS;