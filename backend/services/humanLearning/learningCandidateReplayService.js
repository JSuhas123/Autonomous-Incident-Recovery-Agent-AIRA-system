"use strict";


const {
  assertValidationCannotAuthorize,

  VALIDATION_STAGE,
} =
  require(
    "../../contracts/humanLearningValidation"
  );


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


class LearningCandidateReplayService {
  constructor(
    options = {}
  ) {
    this.validationRepository =
      options.validationRepository;


    this.replayAdapter =
      options.replayAdapter;
  }


  async validate(
    input = {}
  ) {
    assertValidationCannotAuthorize(
      input
    );


    if (
      !this.validationRepository
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_VALIDATION_REPOSITORY_REQUIRED",
        "Validation repository is required",
        500
      );
    }


    if (
      !this.replayAdapter ||

      typeof this
        .replayAdapter
        .replayCandidate !==
        "function"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_REPLAY_ADAPTER_REQUIRED",
        "Reality replay adapter is required",
        500
      );
    }


    const cases =
      Array.isArray(
        input.cases
      )
        ? input.cases
        : [];


    if (
      cases.length ===
      0
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_REPLAY_CASES_REQUIRED",
        "At least one Reality replay case is required"
      );
    }


    const results =
      [];


    for (
      const replayCase
      of cases
    ) {
      const replay =
        await this.replayAdapter
          .replayCandidate({
            candidate:
              input.candidate,

            replayCase,

            executionAuthorized:
              false,
          });


      const passed =
        replay?.passed ===
        true;


      await this
        .validationRepository
        .bindReplayCase({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          validationRunId:
            input.validationRunId,

          candidateId:
            input.candidateId,

          realityCaseId:
            replayCase.realityCaseId,

          replayRunId:
            replay.replayRunId ||
            null,

          bindingRole:
            replayCase.bindingRole ||
            "SOURCE_INCIDENT",

          resultStatus:
            passed
              ? "PASSED"
              : (
                  replay?.inconclusive
                    ? "INCONCLUSIVE"
                    : "FAILED"
                ),

          resultPayload:
            replay,

          executionAuthorized:
            false,
        });


      await this
        .validationRepository
        .addEvidence({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          validationRunId:
            input.validationRunId,

          stageType:
            VALIDATION_STAGE
              .REPLAY,

          evidenceType:
            "REALITY_REPLAY_RESULT",

          sourceSystem:
            "AIRA_REALITY",

          sourceReference:
            replay.replayRunId ||
            replayCase.realityCaseId,

          evidencePayload:
            replay,

          executionAuthorized:
            false,
        });


      results.push({
        replayCase,

        replay,

        passed,
      });
    }


    /*
     * Batch 3 requires every supplied replay case
     * to pass.
     *
     * Batch 4 will add richer regression scoring.
     */
    const passed =
      results.length >
        0
      &&
      results.every(
        (
          result
        ) =>
          result.passed ===
          true
      );


    await this
      .validationRepository
      .setStageResult({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          input.validationRunId,

        stageType:
          VALIDATION_STAGE
            .REPLAY,

        passed,

        metrics: {
          caseCount:
            results.length,

          passedCount:
            results.filter(
              (
                result
              ) =>
                result.passed
            ).length,

          failedCount:
            results.filter(
              (
                result
              ) =>
                !result.passed
            ).length,
        },

        reason:
          passed
            ? "All supplied Reality replay cases passed"
            : "One or more supplied Reality replay cases failed",

        executionAuthorized:
          false,
      });


    return {
      stage:
        VALIDATION_STAGE
          .REPLAY,

      passed,

      results,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCandidateReplayService,
};