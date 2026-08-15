"use strict";

const {
  ConfidenceEngine,
  CONFIDENCE_BAND,
  DIAGNOSIS_DECISION,
} =
  require(
    "../confidenceEngine"
  );

describe(
  "ConfidenceEngine",
  () => {
    test(
      "produces high confidence for strongly verified diagnosis",
      () => {
        const engine =
          new ConfidenceEngine();

        const result =
          engine.evaluate({
            evidence: {
              completeness:
                0.95,

              missingEvidence:
                [],
            },

            symptomAnalysis: {
              symptomConfidence:
                0.9,
            },

            topologyAnalysis: {
              topologyConfidence:
                0.9,
            },

            changeAnalysis: {
              changeConfidence:
                0.8,
            },

            historicalAnalysis: {
              historyConfidence:
                0.85,
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.9,

              hypotheses: [
                {
                  id:
                    "hypothesis:db",

                  confidence:
                    0.9,

                  evidenceSupporting: [
                    "a",
                    "b",
                    "c",
                  ],

                  evidenceAgainst:
                    [],
                },
              ],
            },

            verification: {
              verificationStatus:
                "VERIFIED",

              verificationConfidence:
                0.9,

              acceptedHypothesisId:
                "hypothesis:db",

              hypothesisReviews:
                [],
            },
          });

        expect(
          result.confidence
        )
          .toBeGreaterThan(
            0.8
          );

        expect(
          result.band
        )
          .toBe(
            CONFIDENCE_BAND
              .VERY_HIGH
          );

        expect(
          result.decision
        )
          .toBe(
            DIAGNOSIS_DECISION
              .TRUSTED
          );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects critic-rejected diagnosis",
      () => {
        const engine =
          new ConfidenceEngine();

        const result =
          engine.evaluate({
            evidence: {
              completeness:
                1,
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.99,

              hypotheses: [
                {
                  id:
                    "bad",

                  confidence:
                    0.99,
                },
              ],
            },

            verification: {
              verificationStatus:
                "REJECTED",

              verificationConfidence:
                0.9,
            },
          });

        expect(
          result.decision
        )
          .toBe(
            DIAGNOSIS_DECISION
              .REJECTED
          );

        expect(
          result.confidence
        )
          .toBeLessThan(
            0.6
          );
      }
    );

    test(
      "penalizes missing evidence",
      () => {
        const engine =
          new ConfidenceEngine();

        const clean =
          engine.evaluate({
            evidence: {
              completeness:
                0.8,

              missingEvidence:
                [],
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.8,

              hypotheses: [
                {
                  id:
                    "h1",

                  confidence:
                    0.8,
                },
              ],
            },

            verification: {
              verificationStatus:
                "VERIFIED",

              verificationConfidence:
                0.8,

              acceptedHypothesisId:
                "h1",
            },
          });

        const missing =
          engine.evaluate({
            evidence: {
              completeness:
                0.8,

              missingEvidence: [
                "logs",
                "traces",
                "metrics",
                "topology",
              ],
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.8,

              hypotheses: [
                {
                  id:
                    "h1",

                  confidence:
                    0.8,
                },
              ],
            },

            verification: {
              verificationStatus:
                "VERIFIED",

              verificationConfidence:
                0.8,

              acceptedHypothesisId:
                "h1",
            },
          });

        expect(
          missing.confidence
        )
          .toBeLessThan(
            clean.confidence
          );
      }
    );

    test(
      "penalizes competing hypotheses",
      () => {
        const engine =
          new ConfidenceEngine();

        const result =
          engine.evaluate({
            evidence: {
              completeness:
                0.9,
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.8,

              hypotheses: [
                {
                  id:
                    "h1",

                  confidence:
                    0.78,
                },

                {
                  id:
                    "h2",

                  confidence:
                    0.72,
                },
              ],
            },

            verification: {
              verificationStatus:
                "DOWNGRADED",

              verificationConfidence:
                0.7,

              acceptedHypothesisId:
                "h1",
            },
          });

        expect(
          result
            .diagnostics
            .competingHypotheses
        )
          .toBe(
            true
          );

        expect(
          result.decision
        )
          .toBe(
            DIAGNOSIS_DECISION
              .PROVISIONAL
          );
      }
    );

    test(
      "requires more evidence when evidence is critically incomplete",
      () => {
        const engine =
          new ConfidenceEngine();

        const result =
          engine.evaluate({
            evidence: {
              completeness:
                0.1,

              missingEvidence: [
                "metrics",
                "logs",
                "traces",
              ],
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.7,

              hypotheses: [
                {
                  id:
                    "h1",

                  confidence:
                    0.7,
                },
              ],
            },

            verification: {
              verificationStatus:
                "INCONCLUSIVE",

              verificationConfidence:
                0.3,
            },
          });

        expect(
          result.decision
        )
          .toBe(
            DIAGNOSIS_DECISION
              .COLLECT_MORE_EVIDENCE
          );
      }
    );

    test(
      "false positive suspicion forces manual review",
      () => {
        const engine =
          new ConfidenceEngine();

        const result =
          engine.evaluate({
            evidence: {
              completeness:
                0.9,
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.8,

              hypotheses: [
                {
                  id:
                    "h1",

                  confidence:
                    0.8,
                },
              ],
            },

            verification: {
              verificationStatus:
                "VERIFIED",

              verificationConfidence:
                0.8,

              acceptedHypothesisId:
                "h1",
            },

            falsePositiveSuspected:
              true,
          });

        expect(
          result.decision
        )
          .toBe(
            DIAGNOSIS_DECISION
              .MANUAL_REVIEW
          );
      }
    );

    test(
      "risk does not influence diagnosis confidence",
      () => {
        const engine =
          new ConfidenceEngine();

        const lowRisk =
          engine.evaluate({
            evidence: {
              completeness:
                0.8,
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.8,

              hypotheses: [
                {
                  id:
                    "h1",

                  confidence:
                    0.8,
                },
              ],
            },

            verification: {
              verificationStatus:
                "VERIFIED",

              verificationConfidence:
                0.8,

              acceptedHypothesisId:
                "h1",
            },

            riskAnalysis: {
              riskScore:
                0.1,
            },
          });

        const highRisk =
          engine.evaluate({
            evidence: {
              completeness:
                0.8,
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.8,

              hypotheses: [
                {
                  id:
                    "h1",

                  confidence:
                    0.8,
                },
              ],
            },

            verification: {
              verificationStatus:
                "VERIFIED",

              verificationConfidence:
                0.8,

              acceptedHypothesisId:
                "h1",
            },

            riskAnalysis: {
              riskScore:
                1,
            },
          });

        expect(
          lowRisk.confidence
        )
          .toBe(
            highRisk.confidence
          );
      }
    );
  }
);
