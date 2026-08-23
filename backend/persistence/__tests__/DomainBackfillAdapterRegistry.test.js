"use strict";

const DomainBackfillAdapterRegistry =
  require(
    "../migration/DomainBackfillAdapterRegistry"
  );

describe(
  "DomainBackfillAdapterRegistry",
  () => {
    let repositories;
    let registry;
    let context;

    beforeEach(
      () => {
        repositories = {
          incidentRepository: {
            create:
              jest.fn(),
          },

          incidentEventRepository: {
            create:
              jest.fn(),
          },

          incidentLifecycleRepository: {
            createTransition:
              jest.fn(),

            upsertCurrent:
              jest.fn(),
          },

          signalRepository: {
            create:
              jest.fn(),
          },

          signalCorrelationRepository: {
            upsertGroup:
              jest.fn(),
          },

          correlationTopologyRepository:
            {},

          agentIntelligenceRunRepository: {
            create:
              jest.fn(),
          },

          incidentDiagnosisRepository: {
            create:
              jest.fn(),
          },

          decisionTraceRepository: {
            create:
              jest.fn(),
          },

          recoveryDecisionRepository: {
            createRun:
              jest.fn(),

            createDecision:
              jest.fn(),
          },

          executionAuthorizationRepository: {
            createAuthorization:
              jest.fn(),

            createExecutionRequest:
              jest.fn(),
          },

          runtimeRecoveryCheckpointRepository: {
            create:
              jest.fn(),
          },

          approvalRepository: {
            createRequest:
              jest.fn(),
          },

          auditRepository: {
            create:
              jest.fn(),
          },

          policyRepository: {
            create:
              jest.fn(),
          },

          workflowOutboxRepository: {
            create:
              jest.fn(),
          },
        };

        registry =
          new DomainBackfillAdapterRegistry({
            repositories,
          });

        context = {
          repositoryScope: {
            organizationId:
              "org-public",

            environmentId:
              "env-public",

            tenantId:
              "tenant-public",
          },
        };
      }
    );

    test(
      "registers all physical and derived migration domains",
      () => {
        expect(
          registry.has(
            "incidents"
          )
        ).toBe(
          true
        );

        expect(
          registry.has(
            "recoveryDecisionRuns"
          )
        ).toBe(
          true
        );

        expect(
          registry.has(
            "executionRequests"
          )
        ).toBe(
          true
        );

        expect(
          registry.has(
            "correlationTopology"
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "recovery decision run uses createRun",
      async () => {
        await registry.migrate({
          domain:
            "recoveryDecisionRuns",

          document: {
            _id:
              "mongo-run",

            incidentId:
              "incident-1",

            runId:
              "run-1",
          },

          context,
        });

        expect(
          repositories
            .recoveryDecisionRepository
            .createRun
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          repositories
            .recoveryDecisionRepository
            .createDecision
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "recovery decision uses createDecision",
      async () => {
        await registry.migrate({
          domain:
            "recoveryDecisions",

          document: {
            _id:
              "mongo-decision",

            incidentId:
              "incident-1",

            decisionId:
              "decision-1",
          },

          context,
        });

        expect(
          repositories
            .recoveryDecisionRepository
            .createDecision
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "execution request uses createExecutionRequest",
      async () => {
        await registry.migrate({
          domain:
            "executionRequests",

          document: {
            _id:
              "mongo-request",

            incidentId:
              "incident-1",

            executionRequestId:
              "request-1",
          },

          context,
        });

        expect(
          repositories
            .executionAuthorizationRepository
            .createExecutionRequest
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "signal correlation uses upsertGroup",
      async () => {
        await registry.migrate({
          domain:
            "signalCorrelations",

          document: {
            _id:
              "mongo-correlation",

            correlationGroupId:
              "group-1",

            signalIds: [
              "signal-1",
              "signal-2",
            ],
          },

          context,
        });

        expect(
          repositories
            .signalCorrelationRepository
            .upsertGroup
        )
          .toHaveBeenCalledWith(
            {
              organizationId:
                "org-public",

              environmentId:
                "env-public",
            },

            "group-1",

            expect.objectContaining({
              addSignalIds: [
                "signal-1",
                "signal-2",
              ],
            }),

            null
          );
      }
    );

    test(
      "lifecycle transition uses createTransition",
      async () => {
        await registry.migrate({
          domain:
            "incidentLifecycleTransitions",

          document: {
            _id:
              "transition-mongo",

            transitionId:
              "transition-1",

            incidentId:
              "incident-1",
          },

          context,
        });

        expect(
          repositories
            .incidentLifecycleRepository
            .createTransition
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "derived correlation topology performs no database write",
      async () => {
        const result =
          await registry.migrate({
            domain:
              "correlationTopology",

            document:
              {},

            context,
          });

        expect(
          result.status
        )
          .toBe(
            "skipped"
          );

        expect(
          result.reason
        )
          .toBe(
            "derived-domain"
          );
      }
    );

    test(
      "dry run never calls target repository",
      async () => {
        const result =
          await registry.migrate({
            domain:
              "incidents",

            document: {
              _id:
                "mongo-incident",
            },

            context,

            dryRun:
              true,
          });

        expect(
          result.status
        )
          .toBe(
            "validated"
          );

        expect(
          repositories
            .incidentRepository
            .create
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "safety critical migration forces executionAuthorized false",
      async () => {
        await registry.migrate({
          domain:
            "executionAuthorizations",

          document: {
            _id:
              "mongo-auth",

            incidentId:
              "incident-1",

            authorizationId:
              "auth-1",

            executionAuthorized:
              true,
          },

          context,
        });

        expect(
          repositories
            .executionAuthorizationRepository
            .createAuthorization
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              executionAuthorized:
                false,
            }),

            null
          );
      }
    );

    test(
      "workflow outbox cannot preserve execution authority in payload",
      async () => {
        await registry.migrate({
          domain:
            "workflowOutbox",

          document: {
            _id:
              "mongo-outbox",

            eventId:
              "event-1",

            incidentId:
              "incident-1",

            payload: {
              executionAuthorized:
                true,

              authorizationGranted:
                true,
            },
          },

          context,
        });

        expect(
          repositories
            .workflowOutboxRepository
            .create
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              executionAuthorized:
                false,

              payload:
                expect.objectContaining({
                  executionAuthorized:
                    false,

                  authorizationGranted:
                    false,
                }),
            }),

            null
          );
      }
    );

    test(
      "tenant scoped policy receives resolved tenant",
      async () => {
        await registry.migrate({
          domain:
            "policies",

          document: {
            _id:
              "mongo-policy",

            policyId:
              "policy-1",
          },

          context,
        });

        expect(
          repositories
            .policyRepository
            .create
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              tenantId:
                "tenant-public",
            }),

            null
          );
      }
    );
  }
);