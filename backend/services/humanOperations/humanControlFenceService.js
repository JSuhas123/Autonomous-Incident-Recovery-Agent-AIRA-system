"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.5
 * HUMAN CONTROL FENCE
 * ============================================================================
 *
 * One canonical question:
 *
 *   "May AIRA autonomously continue work on this incident right now?"
 *
 *
 * ACTIVE HUMAN CONTROL
 *          ↓
 * autonomous continuation = DENIED
 *
 *
 * NO ACTIVE HUMAN CONTROL
 *          ↓
 * this fence = PASS
 *
 *
 * IMPORTANT:
 *
 * Passing this fence does NOT authorize execution.
 *
 * Other canonical authorization gates still apply.
 *
 * ============================================================================
 */


const humanTakeControlService =
  require(
    "./humanTakeControlService"
  );


function authorityError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status:
        403,

      executionAuthorized:
        false,
    }
  );
}


class HumanControlFenceService {
  constructor(
    options =
      {}
  ) {
    this.controlService =
      options.controlService ||
      humanTakeControlService;
  }


  async evaluate(
    input =
      {}
  ) {
    if (
      input.executionAuthorized ===
        true ||
      input.authorizationGranted ===
        true
    ) {
      throw authorityError(
        "Human-control fence input cannot claim execution authorization",
        "HUMAN_CONTROL_FENCE_AUTHORITY_VIOLATION"
      );
    }


    const state =
      await this
        .controlService
        .getIncidentControlState(
          input
        );


    if (
      state.humanControlActive ===
        true
    ) {
      return {
        allowed:
          false,

        decision:
          "BLOCK",

        reason:
          "ACTIVE_HUMAN_CONTROL",

        incidentId:
          input.incidentId,

        leaseId:
          state.lease
            ?.publicId ||
          state.lease
            ?.id ||
          null,

        holderUserId:
          state.lease
            ?.holderUserId ||
          null,

        controlEpoch:
          Number(
            state.lease
              ?.controlEpoch ||
            0
          ),

        humanControlActive:
          true,

        autonomousContinuationAllowed:
          false,

        stalePlanResumeAllowed:
          false,

        /*
         * A control fence never creates execution authority.
         */
        executionAuthorized:
          false,
      };
    }


    return {
      allowed:
        true,

      decision:
        "PASS",

      reason:
        "NO_ACTIVE_HUMAN_CONTROL",

      incidentId:
        input.incidentId,

      leaseId:
        null,

      holderUserId:
        null,

      humanControlActive:
        false,

      autonomousContinuationAllowed:
        true,

      /*
       * NO ACTIVE LEASE does not mean an old plan may resume.
       *
       * Phase 23.6 establishes the fresh-evaluation fence after control return.
       */
      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  async assertAllowed(
    input =
      {}
  ) {
    const result =
      await this.evaluate(
        input
      );


    if (
      result.allowed !==
      true
    ) {
      throw Object.assign(
        new Error(
          "AIRA autonomous continuation blocked by active human control"
        ),
        {
          code:
            "HUMAN_CONTROL_AUTONOMY_BLOCKED",

          status:
            423,

          incidentId:
            result.incidentId,

          leaseId:
            result.leaseId,

          holderUserId:
            result.holderUserId,

          controlEpoch:
            result.controlEpoch,

          humanControlActive:
            true,

          autonomousContinuationAllowed:
            false,

          stalePlanResumeAllowed:
            false,

          executionAuthorized:
            false,
        }
      );
    }


    return result;
  }
}


const defaultService =
  new HumanControlFenceService();


module.exports =
  defaultService;


module.exports
  .HumanControlFenceService =
  HumanControlFenceService;