"use strict";

const {
  SymptomAnalysisAgent,
} =
  require(
    "../agents/symptomAnalysisAgent"
  );

const {
  AGENT_STATUS,
} =
  require(
    "../contracts/agentContracts"
  );

describe(
  "SymptomAnalysisAgent",
  () => {
    function reasoningProvider(
      output = {}
    ) {
      return {
        async reason() {
          return {
            output: {
              symptoms:
                [],

              observations:
                [],

              unknowns:
                [],

              symptomConfidence:
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

    test(
      "extracts HTTP failure symptom",
      async () => {
        const agent =
          new SymptomAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const context = {
          incidentId:
            "incident-1",

          correlationId:
            "correlation-1",

          tenantId:
            "tenant-1",

          organizationId:
            "507f1f77bcf86cd799439011",

          environmentId:
            "507f1f77bcf86cd799439012",

          incident: {
            title:
              "Payment API unavailable",

            severity:
              "critical",

            status:
              "open",

            reopenCount:
              0,
          },

          service: {
            id:
              "service-1",

            name:
              "payment-api",
          },

          signals: [
            {
              signalId:
                "signal-1",

              signalType:
                "alert",

              eventType:
                "alert.open",

              severity:
                "critical",

              statusCode:
                503,

              serviceId:
                "service-1",

              observedAt:
                new Date(),
            },
          ],

          metrics:
            [],

          logs:
            [],

          traces:
            [],

          alerts:
            [],

          kubernetes: {
            signals:
              [],
          },

          blastRadius: {
            summary: {
              userFacingImpact:
                true,
            },

            affectedServices:
              [],
          },

          incidentEvents:
            [],

          evidence: {
            completeness:
              0.8,

            items: [
              {
                id:
                  "signal:signal-1",
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
            .symptoms
            .length
        )
          .toBeGreaterThan(
            0
          );

        const http =
          record
            .result
            .symptoms
            .find(
              (
                symptom
              ) =>
                symptom.type ===
                "http_error_rate"
            );

        expect(
          http
        )
          .toBeDefined();

        expect(
          http.severity
        )
          .toBe(
            "critical"
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
      "detects recurrence",
      async () => {
        const agent =
          new SymptomAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-2",

            correlationId:
              "correlation-2",

            tenantId:
              "tenant-1",

            incident: {
              title:
                "Recurring outage",

              severity:
                "warning",

              status:
                "open",

              reopenCount:
                2,
            },

            signals:
              [],

            metrics:
              [],

            kubernetes: {
              signals:
                [],
            },

            blastRadius: {
              summary: {},
            },

            incidentEvents: [
              {
                eventId:
                  "event-1",

                eventType:
                  "incident.reopened",
              },
            ],

            evidence: {
              completeness:
                0.5,

              items:
                [],
            },
          });

        const recurrence =
          record
            .result
            .symptoms
            .find(
              (
                symptom
              ) =>
                symptom.type ===
                "recurrence"
            );

        expect(
          recurrence
        )
          .toBeDefined();

        expect(
          recurrence
            .confidence
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
          new SymptomAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-3",

            correlationId:
              "correlation-3",

            tenantId:
              "tenant-1",

            incident: {
              title:
                "Unknown incident",

              severity:
                "warning",

              status:
                "open",
            },

            signals:
              [],

            metrics:
              [],

            kubernetes: {
              signals:
                [],
            },

            blastRadius: {
              summary: {},
            },

            evidence: {
              completeness:
                0.1,

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