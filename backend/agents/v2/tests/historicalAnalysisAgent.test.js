"use strict";

const {
  HistoricalAnalysisAgent,
} =
  require(
    "../agents/historicalAnalysisAgent"
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
          historicalPatterns:
            [],

          relevantIncidents:
            [],

          previousSuccessfulActions:
            [],

          previousFailedActions:
            [],

          contradictions:
            [],

          observations:
            [],

          unknowns:
            [],

          historyConfidence:
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
  "HistoricalAnalysisAgent",
  () => {
    test(
      "detects exact recurring fingerprint",
      async () => {
        const agent =
          new HistoricalAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const context = {
          incidentId:
            "incident-current",

          correlationId:
            "correlation-1",

          organizationId:
            "507f1f77bcf86cd799439011",

          environmentId:
            "507f1f77bcf86cd799439012",

          incident: {
            title:
              "Payment API 503",

            fingerprint:
              "payment::503",

            serviceId:
              "payment-api",

            severity:
              "critical",

            errorCode:
              "HTTP_503",
          },

          service: {
            id:
              "payment-api",

            name:
              "payment-api",
          },

          symptoms: [
            {
              type:
                "http_error_rate",

              title:
                "HTTP server failures observed",
            },
          ],

          historicalIncidents: [
            {
              id:
                "incident-old",

              title:
                "Payment API 503",

              fingerprint:
                "payment::503",

              serviceId:
                "payment-api",

              severity:
                "critical",

              errorCode:
                "HTTP_503",

              status:
                "resolved",

              resolution:
                "Recovered after restoring database connectivity.",

              rootCause:
                "Database connectivity failure",

              symptoms: [
                {
                  type:
                    "http_error_rate",
                },
              ],

              actions: [
                {
                  id:
                    "action-1",

                  action:
                    "restart_payment_api",

                  status:
                    "successful",

                  effectiveness:
                    0.9,
                },
              ],
            },
          ],

          evidence: {
            items: [
              {
                id:
                  "history:incident-old",

                type:
                  "INCIDENT_HISTORY",
              },

              {
                id:
                  "effectiveness:action-1",

                type:
                  "ACTION_EFFECTIVENESS",
              },
            ],
          },
        };

        const record =
          await agent.execute(
            context
          );

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
            .similarIncidents
            .length
        )
          .toBe(
            1
          );

        expect(
          record
            .result
            .recurrenceDetected
        )
          .toBe(
            true
          );

        expect(
          record
            .result
            .recurringFingerprint
        )
          .toBe(
            true
          );

        expect(
          record
            .result
            .successfulActions
            .length
        )
          .toBe(
            1
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
      "detects conflicting historical action outcomes",
      async () => {
        const agent =
          new HistoricalAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const base = {
          title:
            "Worker timeout",

          serviceId:
            "worker",

          severity:
            "warning",
        };

        const record =
          await agent.execute({
            incidentId:
              "incident-current",

            correlationId:
              "correlation-2",

            incident: {
              ...base,

              fingerprint:
                "worker::timeout",
            },

            service: {
              id:
                "worker",
            },

            historicalIncidents: [
              {
                id:
                  "old-1",

                ...base,

                fingerprint:
                  "worker::timeout",

                actions: [
                  {
                    action:
                      "restart_worker",

                    status:
                      "successful",
                  },
                ],
              },

              {
                id:
                  "old-2",

                ...base,

                fingerprint:
                  "worker::timeout",

                actions: [
                  {
                    action:
                      "restart_worker",

                    status:
                      "failed",
                  },
                ],
              },
            ],

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
            .conflictingOutcomes
            .length
        )
          .toBe(
            1
          );

        expect(
          record
            .result
            .conflictingOutcomes[0]
            .action
        )
          .toBe(
            "restart_worker"
          );
      }
    );

    test(
      "handles no historical matches safely",
      async () => {
        const agent =
          new HistoricalAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-new",

            correlationId:
              "correlation-3",

            incident: {
              title:
                "Completely new failure",

              fingerprint:
                "new::failure",

              serviceId:
                "new-service",

              severity:
                "critical",
            },

            service: {
              id:
                "new-service",
            },

            historicalIncidents:
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
            .similarIncidents
            .length
        )
          .toBe(
            0
          );

        expect(
          record
            .result
            .historyConfidence
        )
          .toBe(
            0.8
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
      "does not compare incident against itself",
      async () => {
        const agent =
          new HistoricalAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-1",

            correlationId:
              "correlation-4",

            incident: {
              title:
                "API failure",

              fingerprint:
                "api::failure",

              serviceId:
                "api",
            },

            historicalIncidents: [
              {
                id:
                  "incident-1",

                title:
                  "API failure",

                fingerprint:
                  "api::failure",

                serviceId:
                  "api",
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
            .similarIncidents
        )
          .toHaveLength(
            0
          );
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const agent =
          new HistoricalAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-safe",

            correlationId:
              "correlation-safe",

            incident: {
              title:
                "Safety test",
            },

            historicalIncidents:
              [],

            evidence: {
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