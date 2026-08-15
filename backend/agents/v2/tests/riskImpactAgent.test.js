"use strict";

const {
  RiskImpactAgent,
  RISK_LEVEL,
} =
  require(
    "../agents/riskImpactAgent"
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
          riskObservations:
            [],

          affectedUsers:
            null,

          businessImpact:
            null,

          cascadingRisks:
            [],

          dataRisks:
            [],

          securityRisks:
            [],

          unknowns:
            [],

          riskConfidence:
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
  "RiskImpactAgent",
  () => {

    test(
      "returns successful risk assessment",
      async () => {
        const agent =
          new RiskImpactAgent({
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
                "Payment API unavailable",

              description:
                "Customers cannot complete payment transactions.",

              severity:
                "critical",

              impact:
                "Checkout payments are failing.",
            },

            service: {
              id:
                "payment-api",

              name:
                "payment-api",

              criticality:
                "critical",
            },

            symptoms: [
              {
                type:
                  "service_unavailable",

                title:
                  "HTTP 503 responses",
              },
            ],

            evidence: {
              completeness:
                0.9,

              items: [
                {
                  id:
                    "alert:503",

                  type:
                    "ALERT",

                  summary:
                    "Payment API returning HTTP 503.",
                },
              ],
            },

            topologyAnalysis: {
              affectedServices: [
                "payment-api",
              ],

              dependentServices: [
                "checkout-api",
                "order-api",
              ],
            },

            historicalAnalysis: {
              recurrenceDetected:
                false,
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
            .riskScore
        )
          .toBeGreaterThan(
            0
          );

        expect(
          Object.values(
            RISK_LEVEL
          )
        )
          .toContain(
            record
              .result
              .riskLevel
          );

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
      "detects broad blast radius",
      async () => {
        const agent =
          new RiskImpactAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-2",

            incident: {
              title:
                "Shared database outage",

              severity:
                "critical",
            },

            service: {
              id:
                "database",

              criticality:
                "critical",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                0.8,

              items:
                [],
            },

            topologyAnalysis: {
              affectedServices: [
                "database",
              ],

              dependentServices: [
                "payment",
                "orders",
                "users",
                "inventory",
                "checkout",
                "reporting",
              ],

              affectedResources: [
                "postgres-primary",
              ],
            },
          });

        expect(
          record
            .result
            .blastRadius
            .totalAffected
        )
          .toBeGreaterThanOrEqual(
            8
          );

        expect(
          record
            .result
            .blastRadius
            .score
        )
          .toBeGreaterThanOrEqual(
            0.75
          );
      }
    );

    test(
      "data corruption creates high risk floor",
      async () => {
        const agent =
          new RiskImpactAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-data",

            incident: {
              title:
                "Database corruption detected",

              description:
                "Potential data corruption detected in primary database.",

              severity:
                "warning",
            },

            service: {
              id:
                "database",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                0.7,

              items: [
                {
                  id:
                    "log:corruption",

                  type:
                    "LOG",

                  summary:
                    "Database corruption detected.",
                },
              ],
            },
          });

        expect(
          record
            .result
            .dataRisk
            .score
        )
          .toBeGreaterThanOrEqual(
            0.8
          );

        expect(
          record
            .result
            .riskScore
        )
          .toBeGreaterThanOrEqual(
            0.75
          );
      }
    );

    test(
      "security indicators create risk without claiming compromise",
      async () => {
        const agent =
          new RiskImpactAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-security",

            incident: {
              title:
                "Suspicious unauthorized activity",

              description:
                "Unauthorized access attempts and possible credential exposure.",

              severity:
                "critical",
            },

            service: {
              id:
                "auth",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                0.8,

              items: [
                {
                  id:
                    "security:1",

                  type:
                    "LOG",

                  summary:
                    "Unauthorized credential activity detected.",
                },
              ],
            },
          });

        expect(
          record
            .result
            .securityRisk
            .score
        )
          .toBeGreaterThanOrEqual(
            0.8
          );

        expect(
          record
            .result
            .riskScore
        )
          .toBeGreaterThanOrEqual(
            0.8
          );
      }
    );

    test(
      "recurrence contributes to operational risk",
      async () => {
        const agent =
          new RiskImpactAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-recurring",

            incident: {
              title:
                "Recurring worker failure",

              severity:
                "warning",
            },

            service: {
              id:
                "worker",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                0.5,

              items:
                [],
            },

            historicalAnalysis: {
              recurrenceDetected:
                true,

              recurringFingerprint:
                true,
            },
          });

        expect(
          record
            .result
            .recurrenceRisk
            .recurring
        )
          .toBe(
            true
          );

        expect(
          record
            .result
            .recurrenceRisk
            .score
        )
          .toBe(
            0.8
          );
      }
    );

    test(
      "risk confidence is separate from risk score",
      async () => {
        const agent =
          new RiskImpactAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-confidence",

            organizationId:
              "507f1f77bcf86cd799439011",

            environmentId:
              "507f1f77bcf86cd799439012",

            incident: {
              title:
                "Minor background worker warning",

              severity:
                "info",
            },

            service: {
              id:
                "background-worker",

              criticality:
                "low",
            },

            symptoms:
              [],

            evidence: {
              completeness:
                1,

              items:
                [],
            },

            topologyAnalysis: {
              affectedServices:
                [],
            },
          });

        expect(
          record
            .result
            .riskConfidence
        )
          .toBeGreaterThan(
            record
              .result
              .riskScore
          );
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const agent =
          new RiskImpactAgent({
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