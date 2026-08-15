"use strict";

const {
  TopologyAnalysisAgent,
} =
  require(
    "../agents/topologyAnalysisAgent"
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
          scope:
            "multi_service",

          likelySharedDependencies:
            [],

          propagationPaths:
            [],

          suspiciousResources:
            [],

          observations:
            [],

          unknowns:
            [],

          topologyConfidence:
            0.9,

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
  "TopologyAnalysisAgent",
  () => {
    test(
      "detects multi-service blast radius",
      async () => {
        const agent =
          new TopologyAnalysisAgent({
            reasoningProvider:
              reasoningProvider(),
          });

        const context = {
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
              "Payment outage",

            severity:
              "critical",
          },

          service: {
            id:
              "service-payment",

            name:
              "payment-api",
          },

          topology: {
            rootService: {
              id:
                "service-payment",

              name:
                "payment-api",
            },

            levels: [
              {
                depth:
                  1,

                services: [
                  {
                    id:
                      "service-checkout",

                    name:
                      "checkout-api",

                    dependencyType:
                      "synchronous",

                    confidence:
                      1,
                  },
                ],
              },
            ],
          },

          blastRadius: {
            summary: {
              affectedServiceCount:
                2,

              affectedResourceCount:
                1,

              userFacingImpact:
                true,

              maxCriticality:
                9,
            },

            affectedServices: [
              {
                id:
                  "service-checkout",

                name:
                  "checkout-api",

                dependencyType:
                  "synchronous",

                criticality:
                  9,
              },
            ],

            affectedResources: [
              {
                id:
                  "db-1",

                name:
                  "postgres",

                provider:
                  "kubernetes",

                resourceType:
                  "database",

                healthStatus:
                  "degraded",

                criticality:
                  "critical",
              },
            ],
          },

          dependencies:
            [],

          resources:
            [],

          symptoms:
            [],

          evidence: {
            items: [
              {
                id:
                  "topology:incident-1",

                type:
                  "TOPOLOGY",
              },

              {
                id:
                  "blast-radius:incident-1",

                type:
                  "BLAST_RADIUS",
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
            .scope
        )
          .toBe(
            "multi_service"
          );

        expect(
          record
            .result
            .suspiciousResources
            .length
        )
          .toBeGreaterThan(
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

    test(
      "handles isolated incident",
      async () => {
        const agent =
          new TopologyAnalysisAgent({
            reasoningProvider:
              reasoningProvider({
                scope:
                  "isolated",
              }),
          });

        const record =
          await agent.execute({
            incidentId:
              "incident-2",

            correlationId:
              "correlation-2",

            incident: {
              title:
                "Isolated pod error",

              severity:
                "warning",
            },

            service: {
              id:
                "service-1",

              name:
                "worker",
            },

            topology: {
              rootService: {
                id:
                  "service-1",

                name:
                  "worker",
              },

              levels:
                [],
            },

            blastRadius: {
              summary: {
                affectedServiceCount:
                  0,

                affectedResourceCount:
                  0,
              },

              affectedServices:
                [],

              affectedResources:
                [],
            },

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
            .scope
        )
          .toBe(
            "isolated"
          );
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const agent =
          new TopologyAnalysisAgent({
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
                "Topology test",
            },

            topology: {},

            blastRadius: {
              summary: {},

              affectedServices:
                [],

              affectedResources:
                [],
            },

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