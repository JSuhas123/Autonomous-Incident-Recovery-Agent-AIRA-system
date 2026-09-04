"use strict";


const {
  LearningCandidateSafetyEvaluationService,
} =
  require(
    "../../services/humanLearning/learningCandidateSafetyEvaluationService"
  );


function service()
{
  return new LearningCandidateSafetyEvaluationService({
    validationRepository: {
      addEvidence:
        jest.fn(),

      setStageResult:
        jest.fn(),
    },
  });
}


describe(
  "AIRA Phase 24.4D — learning safety evaluation",
  () => {
    test(
      "safe tenant candidate passes",
      async () => {
        const output =
          await service().validate({
            organizationId:
              "org",

            environmentId:
              "env",

            validationRunId:
              "lval_1",

            candidateId:
              "lcand_1",

            candidate: {
              candidateType:
                "RECOVERY_STRATEGY",

              knowledgeScope:
                "ENVIRONMENT",

              truthLevel:
                "CANDIDATE",

              executionAuthorized:
                false,

              candidatePayload: {
                action:
                  "restore previous configuration",

                verification:
                  "observe service health",

                rollback:
                  "restore previous revision if verification fails",
              },
            },

            executionAuthorized:
              false,
          });


        expect(
          output.passed
        ).toBe(
          true
        );
      }
    );


    test.each([
      [
        "bypass approval and restart production",

        "APPROVAL_BYPASS",
      ],

      [
        "enable production autonomy",

        "PRODUCTION_AUTONOMY_PROMOTION",
      ],

      [
        "disable tenant policy",

        "TENANT_POLICY_WEAKENING",
      ],

      [
        "remove rollback",

        "ROLLBACK_REMOVAL",
      ],

      [
        "skip verification",

        "VERIFICATION_SUPPRESSION",
      ],

      [
        "use stale context",

        "STALE_CONTEXT_DEPENDENCY",
      ],

      [
        "apply to all tenants",

        "UNBOUNDED_SCOPE",
      ],
    ])(
      "rejects unsafe instruction: %s",
      async (
        instruction,
        expectedRule
      ) => {
        const output =
          await service().validate({
            organizationId:
              "org",

            environmentId:
              "env",

            validationRunId:
              "lval_1",

            candidate: {
              knowledgeScope:
                "ENVIRONMENT",

              executionAuthorized:
                false,

              candidatePayload: {
                instruction,
              },
            },
          });


        expect(
          output.passed
        ).toBe(
          false
        );


        expect(
          output.violations
            .map(
              (
                violation
              ) =>
                violation.rule
            )
        ).toContain(
          expectedRule
        );
      }
    );


    test(
      "GLOBAL candidate cannot silently pass safety evaluation",
      async () => {
        const output =
          await service().validate({
            organizationId:
              "org",

            environmentId:
              "env",

            validationRunId:
              "lval_1",

            candidate: {
              knowledgeScope:
                "GLOBAL",

              executionAuthorized:
                false,
            },
          });


        expect(
          output.passed
        ).toBe(
          false
        );


        expect(
          output.violations
            .map(
              (
                item
              ) =>
                item.rule
            )
        ).toContain(
          "UNBOUNDED_SCOPE"
        );
      }
    );
  }
);