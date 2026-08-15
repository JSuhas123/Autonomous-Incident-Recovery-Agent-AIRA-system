"use strict";

const {
  VerificationCriticAgent,
  VERIFICATION_STATUS,
} =
  require(
    "../agents/verificationCriticAgent"
  );

const {
  AGENT_STATUS,
} =
  require(
    "../contracts/agentContracts"
  );

function reasoningProvider(
  output = {}
) {
  return {
    async reason() {
      return {
        output: {
          criticObservations:
            [],

          unsupportedClaims:
            [],

          contradictions:
            [],

          missingEvidence:
            [],

          alternativeExplanations:
            [],

          confidenceConcerns:
            [],

          unknowns:
            [],

          verificationConfidence:
            0.8,

          ...output,
        },

        modelMetadata: {
          model:
            "test-model",

          provider:
            "mock",
        },

        fallbackUsed:
          false,

        warnings:
          [],
      };
    },
  };
}

describe(
  "VerificationCriticAgent",
  () => {

    test(
      "verifies well-supported hypothesis",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-1",

            organizationId:
              "507f1f77bcf86cd799439011",

            environmentId:
              "507f1f77bcf86cd799439012",

            incident: {
              title:
                "Database outage",
            },

            evidence: {
              completeness:
                1,

              items: [
                {
                  id:
                    "trace:db",

                  type:
                    "TRACE",
                },

                {
                  id:
                    "log:db",

                  type:
                    "LOG",
                },

                {
                  id:
                    "metric:db",

                  type:
                    "METRIC",
                },
              ],
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.8,

              hypotheses: [
                {
                  id:
                    "hypothesis:db",

                  rootCause:
                    "Database unavailable",

                  confidence:
                    0.8,

                  evidenceSupporting: [
                    "trace:db",
                    "log:db",
                    "metric:db",
                  ],

                  evidenceAgainst:
                    [],
                },
              ],
            },
          });

        expect(
          record.status
        )
          .toBe(
            AGENT_STATUS
              .SUCCESS
          );

        expect(
          record
            .result
            .verificationStatus
        )
          .toBe(
            VERIFICATION_STATUS
              .VERIFIED
          );

        expect(
          record
            .result
            .acceptedHypothesisId
        )
          .toBe(
            "hypothesis:db"
          );
      }
    );

    test(
      "rejects hallucinated supporting evidence",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-2",

            incident: {
              title:
                "API outage",
            },

            evidence: {
              completeness:
                0.9,

              items: [
                {
                  id:
                    "real:1",

                  type:
                    "LOG",
                },
              ],
            },

            rootCauseAnalysis: {
              hypotheses: [
                {
                  id:
                    "hypothesis:bad",

                  rootCause:
                    "Database failure",

                  confidence:
                    0.95,

                  evidenceSupporting: [
                    "fake:database-proof",
                  ],

                  evidenceAgainst:
                    [],
                },
              ],
            },
          });

        expect(
          record
            .result
            .verificationStatus
        )
          .toBe(
            VERIFICATION_STATUS
              .REJECTED
          );

        expect(
          record
            .result
            .acceptedHypothesisId
        )
          .toBeNull();

        expect(
          record
            .result
            .hypothesisReviews[0]
            .invalidSupportingEvidence
        )
          .toContain(
            "fake:database-proof"
          );
      }
    );

    test(
      "rejects hypothesis with no supporting evidence",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-3",

            incident: {
              title:
                "Unknown outage",
            },

            evidence: {
              completeness:
                0.8,

              items:
                [],
            },

            rootCauseAnalysis: {
              hypotheses: [
                {
                  id:
                    "hypothesis:guess",

                  rootCause:
                    "Network failure",

                  confidence:
                    0.9,

                  evidenceSupporting:
                    [],

                  evidenceAgainst:
                    [],
                },
              ],
            },
          });

        expect(
          record
            .result
            .verificationStatus
        )
          .toBe(
            VERIFICATION_STATUS
              .REJECTED
          );
      }
    );

    test(
      "rejects when contradicting evidence dominates",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-4",

            incident: {
              title:
                "Checkout failure",
            },

            evidence: {
              completeness:
                1,

              items: [
                {
                  id:
                    "support:1",
                },

                {
                  id:
                    "against:1",
                },

                {
                  id:
                    "against:2",
                },
              ],
            },

            rootCauseAnalysis: {
              hypotheses: [
                {
                  id:
                    "hypothesis:checkout",

                  rootCause:
                    "Payment dependency unavailable",

                  confidence:
                    0.8,

                  evidenceSupporting: [
                    "support:1",
                  ],

                  evidenceAgainst: [
                    "against:1",
                    "against:2",
                  ],
                },
              ],
            },
          });

        expect(
          record
            .result
            .verificationStatus
        )
          .toBe(
            VERIFICATION_STATUS
              .REJECTED
          );
      }
    );

    test(
      "downgrades diagnosis when competing hypotheses are too close",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-5",

            incident: {
              title:
                "API latency",
            },

            evidence: {
              completeness:
                1,

              items: [
                {
                  id:
                    "a:1",
                },

                {
                  id:
                    "a:2",
                },

                {
                  id:
                    "b:1",
                },

                {
                  id:
                    "b:2",
                },
              ],
            },

            rootCauseAnalysis: {
              hypotheses: [
                {
                  id:
                    "hypothesis:a",

                  rootCause:
                    "Database latency",

                  confidence:
                    0.75,

                  evidenceSupporting: [
                    "a:1",
                    "a:2",
                  ],

                  evidenceAgainst:
                    [],
                },

                {
                  id:
                    "hypothesis:b",

                  rootCause:
                    "Cache latency",

                  confidence:
                    0.72,

                  evidenceSupporting: [
                    "b:1",
                    "b:2",
                  ],

                  evidenceAgainst:
                    [],
                },
              ],
            },
          });

        expect(
          record
            .result
            .verificationStatus
        )
          .toBe(
            VERIFICATION_STATUS
              .DOWNGRADED
          );
      }
    );

    test(
      "returns inconclusive when there are no hypotheses",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-6",

            incident: {
              title:
                "Unknown failure",
            },

            evidence: {
              completeness:
                0.1,

              items:
                [],
            },

            rootCauseAnalysis: {
              hypotheses:
                [],
            },
          });

        expect(
          record
            .result
            .verificationStatus
        )
          .toBe(
            VERIFICATION_STATUS
              .INCONCLUSIVE
          );

        expect(
          record
            .result
            .acceptedHypothesisId
        )
          .toBeNull();
      }
    );

    test(
      "detects inflated confidence",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-7",

            incident: {
              title:
                "Worker failure",
            },

            evidence: {
              completeness:
                0.3,

              items: [
                {
                  id:
                    "weak:1",
                },
              ],
            },

            rootCauseAnalysis: {
              diagnosisConfidence:
                0.99,

              hypotheses: [
                {
                  id:
                    "hypothesis:weak",

                  rootCause:
                    "Memory pressure",

                  confidence:
                    0.99,

                  evidenceSupporting: [
                    "weak:1",
                  ],

                  evidenceAgainst:
                    [],
                },
              ],
            },
          });

        const codes =
          record
            .result
            .hypothesisReviews[0]
            .issues
            .map(
              (
                issue
              ) =>
                issue.code
            );

        expect(
          codes
        )
          .toContain(
            "CONFIDENCE_INFLATED"
          );

        expect(
          record
            .result
            .verificationStatus
        )
          .not
          .toBe(
            VERIFICATION_STATUS
              .VERIFIED
          );
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const agent =
          new VerificationCriticAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-safe",

            incident: {
              title:
                "Safety test",
            },

            evidence: {
              completeness:
                0,

              items:
                [],
            },

            rootCauseAnalysis: {
              hypotheses:
                [],
            },
          });

        expect(
          record
            .result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);