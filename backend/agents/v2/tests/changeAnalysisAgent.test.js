"use strict";

const {
  ChangeAnalysisAgent,
} =
  require(
    "../agents/changeAnalysisAgent"
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
          relevantChanges:
            [],

          suspiciousChanges:
            [],

          observations:
            [],

          contradictions:
            [],

          unknowns:
            [],

          changeConfidence:
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
  "ChangeAnalysisAgent",
  () => {
    test(
      "detects deployment shortly before incident",
      async () => {
        const agent =
          new ChangeAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const incidentTime =
          new Date(
            "2026-08-13T10:00:00Z"
          );

        const deploymentTime =
          new Date(
            "2026-08-13T09:45:00Z"
          );

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
                "Payment API outage",

              detectedAt:
                incidentTime,

              severity:
                "critical",
            },

            service: {
              id:
                "service-payment",

              name:
                "payment-api",
            },

            timing: {
              detectedAt:
                incidentTime,
            },

            symptoms:
              [],

            changes: [
              {
                id:
                  "deploy-1",

                type:
                  "deployment",

                serviceId:
                  "service-payment",

                version:
                  "2.4.0",

                previousVersion:
                  "2.3.9",

                occurredAt:
                  deploymentTime,
              },
            ],

            evidence: {
              items: [
                {
                  id:
                    "change:deploy-1",

                  type:
                    "DEPLOYMENT_CHANGE",
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
            .relevantChanges
            .length
        )
          .toBeGreaterThan(
            0
          );

        expect(
          record
            .result
            .closestChange
            .minutesBeforeIncident
        )
          .toBe(
            15
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
      "does not mark post-incident deployment as temporally relevant",
      async () => {
        const agent =
          new ChangeAnalysisAgent({
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
                "Worker failure",

              detectedAt:
                new Date(
                  "2026-08-13T10:00:00Z"
                ),
            },

            service: {
              id:
                "worker",
            },

            changes: [
              {
                id:
                  "deploy-after",

                type:
                  "deployment",

                occurredAt:
                  new Date(
                    "2026-08-13T10:30:00Z"
                  ),
              },
            ],

            evidence: {
              items:
                [],
            },
          });

        expect(
          record
            .result
            .relevantChanges
            .length
        )
          .toBe(
            0
          );
      }
    );

    test(
      "handles missing change evidence safely",
      async () => {
        const agent =
          new ChangeAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-3",

            correlationId:
              "correlation-3",

            incident: {
              title:
                "Unknown outage",

              detectedAt:
                new Date(),
            },

            changes:
              [],

            evidence: {
              items:
                [],
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
            .changes
            .length
        )
          .toBe(
            0
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
  }
);