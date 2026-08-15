"use strict";

const {
  PlaybookDiscoveryService,
} =
  require(
    "../playbookDiscoveryService"
  );

function createInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    diagnosis: {
      primaryHypothesis: {
        id:
          "hypothesis-1",

        rootCause:
          "Kubernetes deployment pods are unhealthy",

        category:
          "kubernetes",
      },

      hypotheses: [
        {
          id:
            "hypothesis-1",

          rootCause:
            "Kubernetes deployment pods are unhealthy",

          category:
            "kubernetes",
        },
      ],

      symptoms: [
        {
          type:
            "crash_loop",
        },
      ],

      risk: {
        riskLevel:
          "HIGH",
      },

      recommendedNextStep: {
        type:
          "EVALUATE_PLAYBOOK",
      },

      executionAuthorized:
        false,
    },

    safetyGate: {
      decision:
        "ALLOW_EVALUATION",

      canEvaluatePlaybook:
        true,
    },

    context: {
      organizationId:
        "org-1",

      environmentId:
        "env-1",

      environment:
        "production",

      incident: {
        title:
          "Payment API pods crashing",

        severity:
          "critical",

        status:
          "open",

        serviceId:
          "payment-api",
      },

      service: {
        id:
          "payment-api",

        name:
          "payment-api",

        type:
          "kubernetes_service",
      },

      topologyAnalysis: {
        affectedResources: [
          {
            type:
              "deployment",
          },
        ],
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

function repository(
  playbooks
) {
  return {
    async findApproved() {
      return playbooks;
    },
  };
}

describe(
  "PlaybookDiscoveryService",
  () => {
    test(
      "discovers approved matching playbooks",
      async () => {
        const service =
          new PlaybookDiscoveryService({
            playbookRepository:
              repository([
                {
                  playbookId:
                    "k8s.restart-deployment.v1",

                  version:
                    "1.0.0",

                  title:
                    "Restart Kubernetes Deployment",

                  description:
                    "Restart unhealthy Kubernetes deployment pods.",

                  status:
                    "approved",

                  category:
                    "kubernetes",

                  rootCauseCategories: [
                    "kubernetes",
                  ],

                  symptoms: [
                    "crash_loop",
                  ],

                  serviceTypes: [
                    "kubernetes_service",
                  ],

                  resourceTypes: [
                    "deployment",
                  ],

                  environments: [
                    "production",
                  ],

                  tags: [
                    "kubernetes",
                    "deployment",
                    "pods",
                    "restart",
                  ],
                },

                {
                  playbookId:
                    "database.failover.v1",

                  title:
                    "Database Failover",

                  status:
                    "approved",

                  category:
                    "database",

                  symptoms: [
                    "replication_failure",
                  ],

                  resourceTypes: [
                    "database",
                  ],
                },
              ]),
          });

        const result =
          await service.discover(
            createInput()
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.candidateCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .playbookId
        )
          .toBe(
            "k8s.restart-deployment.v1"
          );

        expect(
          result
            .candidates[0]
            .diagnosisMatch
            .score
        )
          .toBeGreaterThan(
            0.7
          );

        expect(
          result
            .candidates[0]
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "never discovers disabled or unapproved playbooks",
      async () => {
        const service =
          new PlaybookDiscoveryService({
            minimumDiscoveryScore:
              0,

            playbookRepository:
              repository([
                {
                  playbookId:
                    "unsafe-draft",

                  title:
                    "Draft Kubernetes Recovery",

                  status:
                    "draft",

                  category:
                    "kubernetes",
                },

                {
                  playbookId:
                    "disabled-playbook",

                  title:
                    "Disabled Kubernetes Recovery",

                  status:
                    "approved",

                  enabled:
                    false,

                  category:
                    "kubernetes",
                },

                {
                  playbookId:
                    "approved-playbook",

                  title:
                    "Approved Kubernetes Recovery",

                  status:
                    "approved",

                  category:
                    "kubernetes",
                },
              ]),
          });

        const result =
          await service.discover(
            createInput()
          );

        expect(
          result.candidates
            .map(
              (
                candidate
              ) =>
                candidate.playbookId
            )
        )
          .toEqual([
            "approved-playbook",
          ]);
      }
    );

    test(
      "blocks discovery when Phase 6 safety gate did not allow evaluation",
      async () => {
        const service =
          new PlaybookDiscoveryService({
            playbookRepository:
              repository(
                []
              ),
          });

        await expect(
          service.discover(
            createInput({
              safetyGate: {
                decision:
                  "HOLD_FOR_MORE_EVIDENCE",

                canEvaluatePlaybook:
                  false,
              },
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "PLAYBOOK_DISCOVERY_NOT_ALLOWED",
          });
      }
    );

    test(
      "blocks discovery when diagnosis does not request playbook evaluation",
      async () => {
        const input =
          createInput();

        input
          .diagnosis
          .recommendedNextStep =
          {
            type:
              "MANUAL_INVESTIGATION",
          };

        const service =
          new PlaybookDiscoveryService({
            playbookRepository:
              repository(
                []
              ),
          });

        await expect(
          service.discover(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "PLAYBOOK_DISCOVERY_NEXT_STEP_INVALID",
          });
      }
    );

    test(
      "returns safe empty result when no approved playbook matches",
      async () => {
        const service =
          new PlaybookDiscoveryService({
            playbookRepository:
              repository([
                {
                  playbookId:
                    "database.failover.v1",

                  title:
                    "Database Failover",

                  status:
                    "approved",

                  category:
                    "database",

                  symptoms: [
                    "replication_failure",
                  ],

                  resourceTypes: [
                    "database",
                  ],
                },
              ]),
          });

        const result =
          await service.discover(
            createInput()
          );

        expect(
          result.candidates
        )
          .toEqual(
            []
          );

        expect(
          result.noCandidates
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
      "orders discovery candidates deterministically by relevance",
      async () => {
        const service =
          new PlaybookDiscoveryService({
            minimumDiscoveryScore:
              0.1,

            playbookRepository:
              repository([
                {
                  playbookId:
                    "generic-k8s",

                  title:
                    "Generic Kubernetes Recovery",

                  status:
                    "approved",

                  category:
                    "kubernetes",
                },

                {
                  playbookId:
                    "specific-k8s",

                  title:
                    "Restart Kubernetes Deployment Pods",

                  status:
                    "approved",

                  category:
                    "kubernetes",

                  symptoms: [
                    "crash_loop",
                  ],

                  serviceTypes: [
                    "kubernetes_service",
                  ],

                  resourceTypes: [
                    "deployment",
                  ],

                  environments: [
                    "production",
                  ],
                },
              ]),
          });

        const result =
          await service.discover(
            createInput()
          );

        expect(
          result.candidates
            .map(
              (
                candidate
              ) =>
                candidate.playbookId
            )
        )
          .toEqual([
            "specific-k8s",
            "generic-k8s",
          ]);

        expect(
          result
            .candidates[0]
            .diagnosisMatch
            .score
        )
          .toBeGreaterThan(
            result
              .candidates[1]
              .diagnosisMatch
              .score
          );
      }
    );

    test(
      "refuses unsafe diagnosis that claims execution authorization",
      async () => {
        const service =
          new PlaybookDiscoveryService({
            playbookRepository:
              repository(
                []
              ),
          });

        await expect(
          service.discover(
            createInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "PLAYBOOK_DISCOVERY_UNSAFE_DIAGNOSIS",
          });
      }
    );
  }
);