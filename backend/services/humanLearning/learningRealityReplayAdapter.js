"use strict";


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


class LearningRealityReplayAdapter {
  constructor(
    options = {}
  ) {
    this.realityReplayService =
      options.realityReplayService;
  }


  async replayCandidate(
    input = {}
  ) {
    if (
      input.executionAuthorized ===
      true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
        "Learning replay cannot grant execution authority",
        403
      );
    }


    if (
      !this.realityReplayService
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_REALITY_SERVICE_REQUIRED",
        "Reality replay service is required",
        500
      );
    }


    /*
     * Phase 24 does not assume that a Reality replay
     * authorizes execution.
     *
     * The injected service must expose one of the
     * supported replay boundaries below.
     */
    let result;


    if (
      typeof this
        .realityReplayService
        .replayLearningCandidate ===
        "function"
    ) {
      result =
        await this
          .realityReplayService
          .replayLearningCandidate({
            candidate:
              input.candidate,

            realityCase:
              input.replayCase,

            executionAuthorized:
              false,
          });
    } else if (
      typeof this
        .realityReplayService
        .replay ===
        "function"
    ) {
      result =
        await this
          .realityReplayService
          .replay({
            candidate:
              input.candidate,

            realityCase:
              input.replayCase,

            executionAuthorized:
              false,
          });
    } else {
      throw humanLearningError(
        "HUMAN_LEARNING_REALITY_REPLAY_BOUNDARY_UNSUPPORTED",
        "Reality replay service does not expose a supported learning replay boundary",
        500
      );
    }


    if (
      result?.executionAuthorized ===
      true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_REALITY_AUTHORITY_LEAK",
        "Reality replay attempted to return execution authority",
        500
      );
    }


    return {
      ...result,

      passed:
        result?.passed ===
        true,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningRealityReplayAdapter,
};