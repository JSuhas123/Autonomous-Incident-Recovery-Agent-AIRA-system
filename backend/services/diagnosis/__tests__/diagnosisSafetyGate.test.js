"use strict";

const {
  DiagnosisSafetyGate,
  GATE_DECISION,
} =
  require(
    "../diagnosisSafetyGate"
  );

describe(
  "DiagnosisSafetyGate",
  () => {
    test(
      "allows trusted verified diagnosis",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              outcome:
                "ROOT_CAUSE_IDENTIFIED",

              primaryHypothesis: {
                id:
                  "h1",

                rootCause:
                  "Database unavailable",
              },

              hypotheses: [
                {
                  id:
                    "h1",
                },
              ],

              contradictions:
                [],

              falsePositiveSuspected:
                false,
            },

            confidence: {
              confidence:
                0.9,

              decision:
                "TRUSTED",

              diagnostics: {
                competingHypotheses:
                  false,
              },
            },

            verification: {
              verificationStatus:
                "VERIFIED",
            },

            agentTrace:
              [],

            incident: {
              status:
                "open",
            },
          });

        expect(
          result.decision
        )
          .toBe(
            GATE_DECISION
              .ALLOW_EVALUATION
          );

        expect(
          result.canEvaluatePlaybook
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "blocks insufficient evidence",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              outcome:
                "INSUFFICIENT_EVIDENCE",

              hypotheses:
                [],
            },

            confidence: {
              confidence:
                0.2,

              decision:
                "COLLECT_MORE_EVIDENCE",
            },

            verification: {
              verificationStatus:
                "INCONCLUSIVE",
            },
          });

        expect(
          result.decision
        )
          .toBe(
            GATE_DECISION
              .HOLD_FOR_MORE_EVIDENCE
          );

        expect(
          result.canEvaluatePlaybook
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects critic rejected diagnosis",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              hypotheses: [
                {
                  id:
                    "h1",
                },
              ],
            },

            confidence: {
              confidence:
                0.9,
            },

            verification: {
              verificationStatus:
                "REJECTED",
            },
          });

        expect(
          result.decision
        )
          .toBe(
            GATE_DECISION
              .REJECT_DIAGNOSIS
          );
      }
    );

    test(
      "sends false positive to manual review",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              falsePositiveSuspected:
                true,

              hypotheses: [
                {
                  id:
                    "h1",
                },
              ],
            },

            confidence: {
              confidence:
                0.8,
            },

            verification: {
              verificationStatus:
                "VERIFIED",
            },
          });

        expect(
          result.decision
        )
          .toBe(
            GATE_DECISION
              .MANUAL_REVIEW
          );
      }
    );

    test(
      "blocks competing hypotheses",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              primaryHypothesis: {
                id:
                  "h1",
              },

              hypotheses: [
                {
                  id:
                    "h1",
                },

                {
                  id:
                    "h2",
                },
              ],
            },

            confidence: {
              confidence:
                0.75,

              decision:
                "PROVISIONAL",

              diagnostics: {
                competingHypotheses:
                  true,
              },
            },

            verification: {
              verificationStatus:
                "DOWNGRADED",
            },
          });

        expect(
          result.decision
        )
          .toBe(
            GATE_DECISION
              .MANUAL_REVIEW
          );
      }
    );

    test(
      "blocks when diagnosis agents failed",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              primaryHypothesis: {
                id:
                  "h1",
              },

              hypotheses: [
                {
                  id:
                    "h1",
                },
              ],
            },

            confidence: {
              confidence:
                0.8,

              decision:
                "TRUSTED",
            },

            verification: {
              verificationStatus:
                "VERIFIED",
            },

            agentTrace: [
              {
                agent:
                  "TopologyAnalysisAgent",

                status:
                  "FAILED",
              },
            ],
          });

        expect(
          result.decision
        )
          .toBe(
            GATE_DECISION
              .MANUAL_REVIEW
          );
      }
    );

    test(
      "monitor only when incident is already resolved",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              primaryHypothesis: {
                id:
                  "h1",
              },

              hypotheses: [
                {
                  id:
                    "h1",
                },
              ],
            },

            confidence: {
              confidence:
                0.9,

              decision:
                "TRUSTED",
            },

            verification: {
              verificationStatus:
                "VERIFIED",
            },

            incident: {
              status:
                "resolved",
            },
          });

        expect(
          result.decision
        )
          .toBe(
            GATE_DECISION
              .MONITOR_ONLY
          );

        expect(
          result.canEvaluatePlaybook
        )
          .toBe(
            false
          );
      }
    );

    test(
      "never authorizes execution",
      () => {
        const gate =
          new DiagnosisSafetyGate();

        const result =
          gate.evaluate({
            diagnosis: {
              hypotheses:
                [],
            },

            confidence: {
              confidence:
                0,
            },
          });

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);