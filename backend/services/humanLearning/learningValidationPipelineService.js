"use strict";


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  assertValidationDecisionSafe,
} =
  require(
    "../../contracts/humanLearningValidationDecision"
  );


class LearningValidationPipelineService {
  constructor(
    options = {}
  ) {
    this.validationRepository =
      options.validationRepository;

    this.validationDecisionRepository =
      options.validationDecisionRepository;

    this.candidateRepository =
      options.candidateRepository;

    this.stateMachine =
      options.stateMachine;

    this.replayService =
      options.replayService;

    this.reliabilityLabService =
      options.reliabilityLabService;

    this.regressionService =
      options.regressionService;

    this.safetyService =
      options.safetyService;
  }


  assertDependencies()
  {
    const required = [
      [
        "validationRepository",

        this.validationRepository,
      ],

      [
        "validationDecisionRepository",

        this.validationDecisionRepository,
      ],

      [
        "candidateRepository",

        this.candidateRepository,
      ],

      [
        "stateMachine",

        this.stateMachine,
      ],

      [
        "replayService",

        this.replayService,
      ],

      [
        "reliabilityLabService",

        this.reliabilityLabService,
      ],

      [
        "regressionService",

        this.regressionService,
      ],

      [
        "safetyService",

        this.safetyService,
      ],
    ];


    for (
      const [
        name,
        dependency,
      ]
      of required
    ) {
      if (
        !dependency
      ) {
        throw humanLearningError(
          "HUMAN_LEARNING_VALIDATION_DEPENDENCY_REQUIRED",

          `${name} is required`,

          500
        );
      }
    }
  }


  async run(
    input = {}
  ) {
    assertValidationDecisionSafe(
      input
    );


    this.assertDependencies();


    const candidate =
      input.candidate ||

      await this
        .candidateRepository
        .getCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,
        });


    if (
      !candidate
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANDIDATE_NOT_FOUND",

        "Learning candidate was not found",

        404
      );
    }


    if (
      candidate.executionAuthorized ===
      true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANDIDATE_AUTHORITY_VIOLATION",

        "Learning candidate must not contain execution authority",

        500
      );
    }


    /*
     * IMPORTANT:
     *
     * Batch 3 createValidationRun requires the candidate
     * to still be QUARANTINED.
     *
     * Therefore create the validation record BEFORE
     * changing candidate state.
     */
    const validationRun =
      await this
        .validationRepository
        .createValidationRun({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          validationProfile:
            input.validationProfile ||
            "STANDARD",

          executionAuthorized:
            false,
        });


    await this
      .stateMachine
      .beginValidation({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        candidateId:
          input.candidateId,

        executionAuthorized:
          false,
      });


    await this
      .validationDecisionRepository
      .markRunning({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          validationRun.publicId,

        summary: {
          candidateId:
            input.candidateId,

          validationProfile:
            input.validationProfile ||
            "STANDARD",

          phase:
            "24.4",
        },

        executionAuthorized:
          false,
      });


    const context = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      validationRunId:
        validationRun.publicId,

      candidateId:
        input.candidateId,

      candidate,

      executionAuthorized:
        false,
    };


    /*
     * ================================================================
     * GATE 1 — REALITY REPLAY
     * ================================================================
     */
    const replay =
      await this
        .replayService
        .validate({
          ...context,

          cases:
            input.replayCases ||
            [],
        });


    if (
      replay.passed !==
      true
    ) {
      return this.#fail({
        ...context,

        failedGate:
          "REPLAY",

        gateResult:
          replay,
      });
    }


    /*
     * ================================================================
     * GATE 2 — RELIABILITY LAB
     * ================================================================
     */
    const reliabilityLab =
      await this
        .reliabilityLabService
        .validate({
          ...context,
        });


    if (
      reliabilityLab.passed !==
      true
    ) {
      return this.#fail({
        ...context,

        failedGate:
          "RELIABILITY_LAB",

        gateResult:
          reliabilityLab,
      });
    }


    /*
     * ================================================================
     * GATE 3 — REGRESSION / COUNTEREXAMPLES
     * ================================================================
     */
    const regression =
      await this
        .regressionService
        .validate({
          ...context,

          validationProfile:
            input.validationProfile ||
            "STANDARD",

          replayResults:
            replay.results,
        });


    if (
      regression.passed !==
      true
    ) {
      return this.#fail({
        ...context,

        failedGate:
          "REGRESSION",

        gateResult:
          regression,
      });
    }


    /*
     * ================================================================
     * GATE 4 — LEARNING SAFETY
     * ================================================================
     */
    const safety =
      await this
        .safetyService
        .validate({
          ...context,
        });


    if (
      safety.passed !==
      true
    ) {
      return this.#fail({
        ...context,

        failedGate:
          "SAFETY",

        gateResult:
          safety,
      });
    }


    /*
     * ================================================================
     * AUTOMATED VALIDATION COMPLETE
     *
     * STILL:
     *
     * CANDIDATE != VALIDATED KNOWLEDGE
     * HUMAN REVIEW REQUIRED
     * NO PUBLICATION
     * NO GLOBAL PROMOTION
     * NO EXECUTION AUTHORITY
     * ================================================================
     */
    await this
      .validationDecisionRepository
      .completePassed({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          validationRun.publicId,

        summary: {
          replayPass:
            true,

          reliabilityLabPass:
            true,

          regressionPass:
            true,

          safetyPass:
            true,

          automatedValidationPass:
            true,

          nextState:
            "HUMAN_REVIEW_PENDING",

          knowledgePublished:
            false,

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      });


    await this
      .stateMachine
      .requestHumanReview({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        candidateId:
          input.candidateId,

        reason:
          (
            "Replay, Reliability Lab, regression, " +
            "and safety validation passed"
          ),

        executionAuthorized:
          false,
      });


    return {
      validationRunId:
        validationRun.publicId,

      passed:
        true,

      failedGate:
        null,

      candidateState:
        "HUMAN_REVIEW_PENDING",

      replay,

      reliabilityLab,

      regression,

      safety,

      knowledgePublished:
        false,

      executionAuthorized:
        false,
    };
  }


  async #fail(
    input
  ) {
    await this
      .validationDecisionRepository
      .skipPendingStages({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          input.validationRunId,

        reason:
          (
            `Skipped after ${input.failedGate} ` +
            "validation failure"
          ),

        executionAuthorized:
          false,
      });


    await this
      .validationDecisionRepository
      .completeFailed({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          input.validationRunId,

        summary: {
          automatedValidationPass:
            false,

          failedGate:
            input.failedGate,

          gateResult:
            input.gateResult,

          knowledgePublished:
            false,

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      });


    await this
      .stateMachine
      .failValidation({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        candidateId:
          input.candidateId,

        reason:
          (
            `${input.failedGate} ` +
            "validation gate failed"
          ),

        executionAuthorized:
          false,
      });


    return {
      validationRunId:
        input.validationRunId,

      passed:
        false,

      failedGate:
        input.failedGate,

      candidateState:
        "VALIDATION_FAILED",

      knowledgePublished:
        false,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningValidationPipelineService,
};