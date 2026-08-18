"use strict";

const {
  AGENT_CONTEXT_SCHEMA_VERSION,
  createAgentContext,
  createInvestigationContext,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

describe(
  "Phase 12.2 canonical AgentContext",
  () => {
    test(
      "creates canonical tenant, environment and correlation envelopes",
      () => {
        const context =
          createAgentContext({
            incidentId:
              "incident-1",

            tenantId:
              "tenant-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            environment:
              "production",

            correlationId:
              "corr-1",
          });

        expect(
          context.schemaVersion
        ).toBe(
          AGENT_CONTEXT_SCHEMA_VERSION
        );

        expect(
          context.tenant
        ).toEqual({
          tenantId:
            "tenant-1",

          organizationId:
            "org-1",
        });

        expect(
          context.environment
        ).toEqual({
          environmentId:
            "env-1",

          type:
            "production",

          name:
            "production",
        });

        expect(
          context.correlation
        ).toEqual({
          correlationId:
            "corr-1",

          correlationGroupId:
            null,
        });

        /*
         * Existing agents still receive compatibility aliases.
         */
        expect(
          context.tenantId
        ).toBe(
          "tenant-1"
        );

        expect(
          context.organizationId
        ).toBe(
          "org-1"
        );

        expect(
          context.environmentId
        ).toBe(
          "env-1"
        );

        expect(
          context.correlationId
        ).toBe(
          "corr-1"
        );
      }
    );

    test(
      "InvestigationContext is built through canonical AgentContext",
      () => {
        const context =
          createInvestigationContext({
            incidentId:
              "incident-2",

            organizationId:
              "org-2",

            environmentId:
              "env-2",

            tenantId:
              "tenant-2",

            correlationId:
              "corr-2",

            incident: {
              severity:
                "critical",

              environment:
                "production",
            },

            signals: [
              {
                signalId:
                  "signal-1",
              },
            ],

            historicalIncidents: [
              {
                id:
                  "old-incident",
              },
            ],
          });

        expect(
          context.schemaVersion
        ).toBe(
          AGENT_CONTEXT_SCHEMA_VERSION
        );

        expect(
          context.tenant
            .organizationId
        ).toBe(
          "org-2"
        );

        expect(
          context.environment
            .environmentId
        ).toBe(
          "env-2"
        );

        expect(
          context.historicalContext
        ).toHaveLength(
          1
        );

        expect(
          context.historicalIncidents
        ).toHaveLength(
          1
        );

        expect(
          context.metadata
            .contextOrigin
        ).toBe(
          "investigation_context_service"
        );

        expect(
          context.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "redacts credentials recursively from agent context",
      () => {
        const context =
          createAgentContext({
            incidentId:
              "incident-3",

            tenantId:
              "tenant-3",

            organizationId:
              "org-3",

            environmentId:
              "env-3",

            correlationId:
              "corr-3",

            signals: [
              {
                provider:
                  "example",

                metadata: {
                  apiKey:
                    "super-secret-api-key",

                  access_token:
                    "access-secret",

                  safeField:
                    "keep-me",
                },
              },
            ],

            service: {
              name:
                "payments",

              credentials: {
                username:
                  "aira",

                password:
                  "do-not-copy",
              },
            },

            evidence: {
              structuredData: {
                authorization:
                  "Bearer dangerous-token",

                tokenEstimate:
                  450,

                outputTokens:
                  120,
              },
            },
          });

        expect(
          context
            .signals[0]
            .metadata
            .apiKey
        ).toBe(
          "[REDACTED]"
        );

        expect(
          context
            .signals[0]
            .metadata
            .access_token
        ).toBe(
          "[REDACTED]"
        );

        expect(
          context
            .signals[0]
            .metadata
            .safeField
        ).toBe(
          "keep-me"
        );

        expect(
          context
            .service
            .credentials
        ).toBe(
          "[REDACTED]"
        );

        expect(
          context
            .evidence
            .structuredData
            .authorization
        ).toBe(
          "[REDACTED]"
        );

        /*
         * Token accounting is not credential material.
         */
        expect(
          context
            .evidence
            .structuredData
            .tokenEstimate
        ).toBe(
          450
        );

        expect(
          context
            .evidence
            .structuredData
            .outputTokens
        ).toBe(
          120
        );
      }
    );

    test(
      "contains a stable budget envelope without inventing runtime limits",
      () => {
        const context =
          createAgentContext({
            incidentId:
              "incident-4",

            tenantId:
              "tenant-4",

            organizationId:
              "org-4",

            environmentId:
              "env-4",

            correlationId:
              "corr-4",

            budgets: {
              maxSteps:
                30,

              maxToolCalls:
                12,

              maxInputTokens:
                8000,

              maxOutputTokens:
                2000,

              timeoutMs:
                45000,
            },
          });

        expect(
          context.budgets
        ).toEqual({
          maxSteps:
            30,

          maxToolCalls:
            12,

          maxModelCalls:
            null,

          maxRetries:
            null,

          maxInputTokens:
            8000,

          maxOutputTokens:
            2000,

          timeoutMs:
            45000,

          maxEstimatedCost:
            null,
        });
      }
    );

    test(
      "AgentContext can never begin with execution authority",
      () => {
        const context =
          createAgentContext({
            incidentId:
              "incident-5",

            tenantId:
              "tenant-5",

            organizationId:
              "org-5",

            environmentId:
              "env-5",

            correlationId:
              "corr-5",

            /*
             * Even if a malicious/incorrect caller tries to smuggle execution
             * authority inside metadata, the actual contract authority remains
             * false.
             */
            metadata: {
              executionAuthorized:
                true,
            },
          });

        expect(
          context.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "canonical investigation context requires complete ownership scope",
      () => {
        expect(
          () =>
            createInvestigationContext({
              incidentId:
                "incident-6",

              tenantId:
                "tenant-6",

              organizationId:
                "org-6",
            })
        ).toThrow(
          "InvestigationContext.environmentId is required"
        );
      }
    );
  }
);