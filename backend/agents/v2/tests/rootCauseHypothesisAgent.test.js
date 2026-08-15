"use strict";

const {
  RootCauseHypothesisAgent,
} =
  require(
    "../agents/rootCauseHypothesisAgent"
  );

const {
  AGENT_STATUS,
  DIAGNOSIS_OUTCOME,
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
          hypotheses:
            [],

          unknowns:
            [],

          overallDiagnosisConfidence:
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
  "RootCauseHypothesisAgent",
  () => {
    test(
      "generates change regression hypothesis",
      async () => {
        const agent =
          new RootCauseHypothesisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-1",

            correlationId:
              "correlation-1",

            organizationId:
              "507f1f77bcf86cd799439011",

            environmentId:
              "507f1f77bcf86cd799439012",

            incident: {
              title:
                "Payment API failure",

              severity:
                "critical",
            },

            service: {
              id:
                "payment-api",
            },

            symptoms: [
              {
                type:
                  "http_error_rate",
              },
            ],

            changeAnalysis: {
              suspiciousChanges: [
                {
                  id:
                    "deploy-1",

                  type:
                    "deployment",
                },
              ],
            },

            topologyAnalysis: {
              suspiciousResources:
                [],
            },

            historicalAnalysis: {
              recurrenceDetected:
                false,
            },

            evidence: {
              completeness:
                0.8,

              items: [
                {
                  id:
                    "change:deploy-1",

                  type:
                    "DEPLOYMENT_CHANGE",
                },

                {
                  id:
                    "signal:http",

                  type:
                    "ALERT",
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

        const hypothesis =
          record
            .result
            .hypotheses
            .find(
              (
                value
              ) =>
                value.category ===
                "change"
            );

        expect(
          hypothesis
        )
          .toBeDefined();

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

    test(
      "supports recurring historical hypothesis",
      async () => {
        const agent =
          new RootCauseHypothesisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-2",

            correlationId:
              "correlation-2",

            incident: {
              title:
                "Recurring outage",
            },

            symptoms:
              [],

            historicalAnalysis: {
              recurrenceDetected:
                true,

              recurringFingerprint:
                true,
            },

            evidence: {
              completeness:
                0.9,

              items: [
                {
                  id:
                    "history:1",

                  type:
                    "HISTORICAL_INCIDENT",
                },
              ],
            },
          });

        const hypothesis =
          record
            .result
            .hypotheses
            .find(
              (
                value
              ) =>
                value.category ===
                "recurrence"
            );

        expect(
          hypothesis
        )
          .toBeDefined();
      }
    );

    test(
      "returns insufficient evidence instead of inventing cause",
      async () => {
        const agent =
          new RootCauseHypothesisAgent({
            reasoningProvider:
              reasoningProvider({
                hypotheses:
                  [],
              }),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-3",

            correlationId:
              "correlation-3",

            incident: {
              title:
                "Unknown incident",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                0.05,

              items:
                [],
            },
          });

        expect(
          record
            .result
            .outcome
        )
          .toBe(
            DIAGNOSIS_OUTCOME
              .INSUFFICIENT_EVIDENCE
          );

        expect(
          record
            .result
            .hypotheses
        )
          .toHaveLength(
            0
          );
      }
    );

    test(
      "ranks stronger hypothesis first",
      async () => {
        const agent =
          new RootCauseHypothesisAgent({
            reasoningProvider:
              reasoningProvider({
                hypotheses: [
                  {
                    rootCause:
                      "Database unavailable",

                    category:
                      "database",

                    confidence:
                      0.9,

                    evidenceSupporting: [
                      "trace:db",
                      "log:db",
                    ],
                  },

                  {
                    rootCause:
                      "Redis latency",

                    category:
                      "cache",

                    confidence:
                      0.35,

                    evidenceSupporting: [
                      "metric:redis",
                    ],
                  },
                ],
              }),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-4",

            correlationId:
              "correlation-4",

            incident: {
              title:
                "Checkout failure",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                0.9,

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
                    "metric:redis",

                  type:
                    "METRIC",
                },
              ],
            },
          });

        expect(
          record
            .result
            .hypotheses[0]
            .rootCause
        )
          .toBe(
            "Database unavailable"
          );

        expect(
          record
            .result
            .hypotheses[0]
            .rank
        )
          .toBe(
            1
          );
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const agent =
          new RootCauseHypothesisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-safe",

            correlationId:
              "safe",

            incident: {
              title:
                "Safety test",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                0,

              items:
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