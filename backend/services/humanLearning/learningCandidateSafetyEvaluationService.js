"use strict";


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  VALIDATION_STAGE,

  assertValidationCannotAuthorize,
} =
  require(
    "../../contracts/humanLearningValidation"
  );


const {
  SAFETY_RULE,
} =
  require(
    "../../contracts/humanLearningValidationDecision"
  );


function flatten(
  value,
  path =
    "$",
  output =
    []
) {
  if (
    value ===
      null ||

    value ===
      undefined
  ) {
    return output;
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
        flatten(
          item,

          `${path}[${index}]`,

          output
        )
    );


    return output;
  }


  if (
    typeof value ===
      "object"
  ) {
    for (
      const [
        key,
        child,
      ]
      of Object.entries(
        value
      )
    ) {
      output.push({
        path:
          `${path}.${key}`,

        key,

        value:
          child,
      });


      flatten(
        child,

        `${path}.${key}`,

        output
      );
    }


    return output;
  }


  output.push({
    path,

    key:
      null,

    value,
  });


  return output;
}


function normalizedText(
  value
) {
  if (
    typeof value !==
      "string"
  ) {
    return "";
  }


  return value
    .trim()
    .toLowerCase();
}


function containsAny(
  text,
  patterns
) {
  return patterns.some(
    (
      pattern
    ) =>
      pattern.test(
        text
      )
  );
}


class LearningCandidateSafetyEvaluationService {
  constructor(
    options = {}
  ) {
    this.validationRepository =
      options.validationRepository;
  }


  inspectCandidate(
    candidate =
      {}
  ) {
    const violations =
      [];


    const addViolation =
      (
        rule,
        path,
        reason
      ) => {
        if (
          violations.some(
            (
              item
            ) =>
              item.rule ===
                rule
              &&
              item.path ===
                path
          )
        ) {
          return;
        }


        violations.push({
          rule,

          path,

          reason,
        });
      };


    const entries =
      flatten(
        candidate
      );


    for (
      const entry
      of entries
    ) {
      const key =
        normalizedText(
          entry.key
        );


      const text =
        normalizedText(
          entry.value
        );


      /*
       * Explicit authority fields.
       */
      if (
        (
          key ===
            "executionauthorized"
          ||
          key ===
            "execution_authorized"
          ||
          key ===
            "productionauthorized"
          ||
          key ===
            "production_authorized"
          ||
          key ===
            "autonomypromoted"
          ||
          key ===
            "autonomy_promoted"
        )
        &&
        entry.value ===
          true
      ) {
        addViolation(
          SAFETY_RULE
            .EXECUTION_AUTHORITY_ESCALATION,

          entry.path,

          (
            "Candidate attempted to manufacture " +
            "execution or production authority"
          )
        );
      }


      if (
        text
        &&
        containsAny(
          text,

          [
            /\bbypass approval\b/i,

            /\bskip approval\b/i,

            /\bwithout approval\b/i,

            /\bignore approval\b/i,

            /\bdisable approval\b/i,
          ]
        )
      ) {
        addViolation(
          SAFETY_RULE
            .APPROVAL_BYPASS,

          entry.path,

          "Candidate attempts to bypass approval controls"
        );
      }


      if (
        text
        &&
        containsAny(
          text,

          [
            /\benable production autonomy\b/i,

            /\bgrant production autonomy\b/i,

            /\bpromote autonomy\b/i,

            /\bunrestricted autonomy\b/i,

            /\bauto[- ]?authorize\b/i,
          ]
        )
      ) {
        addViolation(
          SAFETY_RULE
            .PRODUCTION_AUTONOMY_PROMOTION,

          entry.path,

          (
            "Learning candidate may not promote " +
            "production autonomy"
          )
        );
      }


      if (
        text
        &&
        containsAny(
          text,

          [
            /\bdisable tenant policy\b/i,

            /\bignore tenant policy\b/i,

            /\bbypass tenant policy\b/i,

            /\bweaken tenant policy\b/i,

            /\bdisable policy enforcement\b/i,
          ]
        )
      ) {
        addViolation(
          SAFETY_RULE
            .TENANT_POLICY_WEAKENING,

          entry.path,

          "Candidate attempts to weaken tenant policy"
        );
      }


      if (
        text
        &&
        containsAny(
          text,

          [
            /\bdisable rollback\b/i,

            /\bremove rollback\b/i,

            /\bskip rollback\b/i,

            /\brollback unnecessary\b/i,

            /\bno rollback required\b/i,
          ]
        )
      ) {
        addViolation(
          SAFETY_RULE
            .ROLLBACK_REMOVAL,

          entry.path,

          "Candidate suppresses rollback safety"
        );
      }


      if (
        text
        &&
        containsAny(
          text,

          [
            /\bskip verification\b/i,

            /\bdisable verification\b/i,

            /\bverification unnecessary\b/i,

            /\bno verification required\b/i,

            /\bassume recovery succeeded\b/i,
          ]
        )
      ) {
        addViolation(
          SAFETY_RULE
            .VERIFICATION_SUPPRESSION,

          entry.path,

          (
            "Candidate suppresses independent " +
            "recovery verification"
          )
        );
      }


      if (
        text
        &&
        containsAny(
          text,

          [
            /\balways use cached state\b/i,

            /\bignore current state\b/i,

            /\bdo not refresh context\b/i,

            /\bskip fresh observation\b/i,

            /\buse stale context\b/i,
          ]
        )
      ) {
        addViolation(
          SAFETY_RULE
            .STALE_CONTEXT_DEPENDENCY,

          entry.path,

          "Candidate explicitly depends on stale context"
        );
      }


      if (
        text
        &&
        containsAny(
          text,

          [
            /\bapply to all tenants\b/i,

            /\bapply everywhere\b/i,

            /\ball environments without restriction\b/i,

            /\bglobally execute\b/i,
          ]
        )
      ) {
        addViolation(
          SAFETY_RULE
            .UNBOUNDED_SCOPE,

          entry.path,

          "Candidate claims an unsafe unbounded scope"
        );
      }


      if (
        (
          key ===
            "groundtruth"
          ||
          key ===
            "ground_truth"
          ||
          key ===
            "evaluatortruth"
          ||
          key ===
            "evaluatorgroundtruth"
          ||
          key ===
            "evaluator_ground_truth"
          ||
          key ===
            "expectedrootcause"
          ||
          key ===
            "expected_root_cause"
        )
      ) {
        addViolation(
          SAFETY_RULE
            .EVALUATOR_GROUND_TRUTH_LEAKAGE,

          entry.path,

          (
            "Evaluator-only ground truth must not " +
            "enter candidate knowledge"
          )
        );
      }
    }


    /*
     * Candidate scope itself must still be tenant-bound
     * before Phase 24.5.
     */
    if (
      candidate.knowledgeScope ===
      "GLOBAL"
    ) {
      addViolation(
        SAFETY_RULE
          .UNBOUNDED_SCOPE,

        "$.knowledgeScope",

        (
          "Direct GLOBAL candidate promotion is " +
          "forbidden before explicit generalization"
        )
      );
    }


    return violations;
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
      !input.candidate ||

      typeof input.candidate !==
        "object"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SAFETY_CANDIDATE_REQUIRED",

        "Candidate is required"
      );
    }


    const violations =
      this.inspectCandidate(
        input.candidate
      );


    const passed =
      violations.length ===
      0;


    const metrics = {
      violationCount:
        violations.length,

      violations,

      executionAuthorityGranted:
        false,

      productionAuthorized:
        false,

      knowledgePublished:
        false,
    };


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
            .SAFETY,

        evidenceType:
          "LEARNING_SAFETY_EVALUATION",

        sourceSystem:
          "AIRA_HUMAN_LEARNING",

        sourceReference:
          input.candidateId ||
          null,

        evidencePayload:
          metrics,

        executionAuthorized:
          false,
      });


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
            .SAFETY,

        passed,

        metrics,

        reason:
          passed
            ? "Candidate passed Phase 24 learning safety evaluation"
            : "Candidate violated one or more learning safety rules",

        executionAuthorized:
          false,
      });


    return {
      stage:
        VALIDATION_STAGE
          .SAFETY,

      passed,

      violations,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCandidateSafetyEvaluationService,
};