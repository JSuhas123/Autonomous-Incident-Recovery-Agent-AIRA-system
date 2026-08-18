"use strict";

const {
  DIAGNOSIS_RESULT_SCHEMA_VERSION,
  RISK_ASSESSMENT_SCHEMA_VERSION,
  DIAGNOSIS_OUTCOME,
  RISK_LEVEL,
  createDiagnosisResult,
  createRiskAssessment,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

describe(
  "Phase 12.6 + 12.7 canonical diagnosis and risk contracts",
  () => {
    test(
      "canonical diagnosis preserves ambiguity",
      () => {
        const diagnosis =
          createDiagnosisResult({
            hypotheses: [
              {
                id:
                  "hyp-a",
              },

              {
                id:
                  "hyp-b",
              },
            ],

            primaryHypothesis:
              "hyp-a",

            plausibleHypothesisIds: [
              "hyp-a",
              "hyp-b",
            ],

            ambiguity: {
              ambiguous:
                true,

              confidenceGap:
                0.04,

              plausibleHypothesisIds: [
                "hyp-a",
                "hyp-b",
              ],

              topHypothesisId:
                "hyp-a",

              secondHypothesisId:
                "hyp-b",
            },

            outcome:
              DIAGNOSIS_OUTCOME
                .MULTIPLE_PLAUSIBLE_CAUSES,
          });

        expect(
          diagnosis.schemaVersion
        ).toBe(
          DIAGNOSIS_RESULT_SCHEMA_VERSION
        );

        expect(
          diagnosis.primaryHypothesisId
        ).toBe(
          "hyp-a"
        );

        expect(
          diagnosis.alternateHypothesisIds
        ).toEqual([
          "hyp-b",
        ]);

        expect(
          diagnosis.ambiguity.ambiguous
        ).toBe(
          true
        );

        expect(
          diagnosis.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "primary hypothesis is not automatically accepted",
      () => {
        const diagnosis =
          createDiagnosisResult({
            hypotheses: [
              {
                id:
                  "hyp-a",
              },
            ],

            primaryHypothesis:
              "hyp-a",

            diagnosisConfidence:
              0.95,

            outcome:
              DIAGNOSIS_OUTCOME
                .PROBABLE_CAUSE_IDENTIFIED,
          });

        expect(
          diagnosis.primaryHypothesisId
        ).toBe(
          "hyp-a"
        );

        expect(
          diagnosis.acceptedHypothesisId
        ).toBeNull();

        expect(
          diagnosis.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "canonical diagnosis preserves evidence provenance",
      () => {
        const diagnosis =
          createDiagnosisResult({
            primaryHypothesis:
              "hyp-a",

            supportingEvidenceIds: [
              "ev-1",
              "ev-1",
              "ev-2",
            ],

            contradictingEvidenceIds: [
              "ev-3",
            ],

            assumptions: [
              "assumption-a",
            ],
          });

        expect(
          diagnosis.supportingEvidenceIds
        ).toEqual([
          "ev-1",
          "ev-2",
        ]);

        expect(
          diagnosis.contradictingEvidenceIds
        ).toEqual([
          "ev-3",
        ]);

        expect(
          diagnosis.assumptions
        ).toEqual([
          "assumption-a",
        ]);
      }
    );

    test(
      "canonical risk assessment is versioned",
      () => {
        const risk =
          createRiskAssessment({
            level:
              RISK_LEVEL.MEDIUM,

            score:
              0.45,

            confidence:
              0.8,
          });

        expect(
          risk.schemaVersion
        ).toBe(
          RISK_ASSESSMENT_SCHEMA_VERSION
        );

        expect(
          risk.score
        ).toBe(
          0.45
        );

        expect(
          risk.confidence
        ).toBe(
          0.8
        );

        expect(
          risk.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "high risk forces approval",
      () => {
        const risk =
          createRiskAssessment({
            level:
              RISK_LEVEL.HIGH,

            score:
              0.8,

            approvalRequired:
              false,

            autonomousRecoveryEligible:
              true,
          });

        expect(
          risk.approvalRequired
        ).toBe(
          true
        );

        expect(
          risk.autonomousRecoveryEligible
        ).toBe(
          false
        );
      }
    );

    test(
      "critical risk can never be autonomously eligible",
      () => {
        const risk =
          createRiskAssessment({
            level:
              RISK_LEVEL.CRITICAL,

            score:
              0.95,

            autonomousRecoveryEligible:
              true,
          });

        expect(
          risk.approvalRequired
        ).toBe(
          true
        );

        expect(
          risk.autonomousRecoveryEligible
        ).toBe(
          false
        );

        expect(
          risk.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "low risk eligibility still does not authorize execution",
      () => {
        const risk =
          createRiskAssessment({
            level:
              RISK_LEVEL.LOW,

            score:
              0.2,

            autonomousRecoveryEligible:
              true,

            approvalRequired:
              false,
          });

        expect(
          risk.autonomousRecoveryEligible
        ).toBe(
          true
        );

        expect(
          risk.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);