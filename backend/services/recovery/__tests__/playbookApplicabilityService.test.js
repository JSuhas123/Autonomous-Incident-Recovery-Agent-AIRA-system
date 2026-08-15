"use strict";

const {
  PlaybookApplicabilityService,
} =
  require(
    "../playbookApplicabilityService"
  );

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
} =
  require(
    "../recoveryDecisionContracts"
  );

function candidate(
  playbookId
) {
  return createRecoveryCandidate({
    playbookId,

    status:
      CANDIDATE_STATUS
        .DISCOVERED,

    diagnosisMatch: {
      score:
        0.9,
    },
  });
}

function repository(
  playbooks
) {
  return {
    async findByPlaybookId(
      id
    ) {
      return (
        playbooks.find(
          (
            playbook
          ) =>
            playbook.playbookId ===
            id
        ) ||
        null
      );
    },
  };
}

function baseInput(
  overrides = {}
) {
  return {
    diagnosis: {
      diagnosisConfidence:
        0.9,

      primaryHypothesis: {
        rootCause:
          "Kubernetes deployment failure",

        category:
          "kubernetes",
      },
    },

    candidates: [
      candidate(
        "k8s.restart.v1"
      ),
    ],

    context: {
      organizationId:
        "org-1",

      environmentId:
        "env-1",

      environment:
        "production",

      incidentId:
        "incident-1",

      incident: {
        status:
          "open",

        severity:
          "critical",

        serviceId:
          "service-1",
      },

      service: {
        id:
          "service-1",

        name:
          "payment-api",

        type:
          "kubernetes_service",

        namespace:
          "production",

        deployment:
          "payment-api",
      },

      integrations: [
        "kubernetes",
      ],

      evidence: {
        providerCoverage: [
          "kubernetes",
        ],
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

describe(
  "PlaybookApplicabilityService",
  () => {
    test(
      "marks candidate applicable when all preconditions pass",
      async () => {
        const service =
          new PlaybookApplicabilityService();

        const result =
          await service
            .evaluateCandidates(
              baseInput(),
              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "k8s.restart.v1",

                      status:
                        "approved",

                      enabled:
                        true,

                      environments: [
                        "production",
                      ],

                      serviceTypes: [
                        "kubernetes_service",
                      ],

                      resourceTypes: [
                        "deployment",
                      ],

                      requiredIntegrations: [
                        "kubernetes",
                      ],

                      requiredParameters: [
                        "namespace",
                        "deployment",
                      ],

                      preconditions: {
                        checks: [
                          {
                            id:
                              "status-open",

                            type:
                              "incident_status",

                            allowed: [
                              "open",
                              "investigating",
                            ],
                          },

                          {
                            id:
                              "confidence",

                            type:
                              "diagnosis_confidence",

                            minimum:
                              0.8,
                          },
                        ],
                      },
                    },
                  ]),
              }
            );

        expect(
          result.applicableCount
        )
          .toBe(
            1
          );

        expect(
          result
            .candidates[0]
            .status
        )
          .toBe(
            CANDIDATE_STATUS
              .APPLICABLE
          );

        expect(
          result
            .candidates[0]
            .applicability
            .applicable
        )
          .toBe(
            true
          );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsupported environment",
      async () => {
        const service =
          new PlaybookApplicabilityService();

        const result =
          await service
            .evaluateCandidates(
              baseInput(),
              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "k8s.restart.v1",

                      status:
                        "approved",

                      enabled:
                        true,

                      environments: [
                        "staging",
                      ],
                    },
                  ]),
              }
            );

        expect(
          result.applicableCount
        )
          .toBe(
            0
          );

        expect(
          result
            .candidates[0]
            .applicability
            .failedPreconditions
        )
          .toContain(
            "environment_not_supported"
          );
      }
    );

    test(
      "rejects missing required integration",
      async () => {
        const input =
          baseInput();

        input.context.integrations =
          [];

        input
          .context
          .evidence
          .providerCoverage =
          [];

        const service =
          new PlaybookApplicabilityService();

        const result =
          await service
            .evaluateCandidates(
              input,
              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "k8s.restart.v1",

                      status:
                        "approved",

                      enabled:
                        true,

                      requiredIntegrations: [
                        "kubernetes",
                      ],
                    },
                  ]),
              }
            );

        expect(
          result
            .candidates[0]
            .applicability
            .failedPreconditions
        )
          .toContain(
            "integration_missing:kubernetes"
          );
      }
    );

    test(
      "rejects missing required parameter",
      async () => {
        const input =
          baseInput();

        delete input
          .context
          .service
          .deployment;

        const service =
          new PlaybookApplicabilityService();

        const result =
          await service
            .evaluateCandidates(
              input,
              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "k8s.restart.v1",

                      status:
                        "approved",

                      enabled:
                        true,

                      requiredParameters: [
                        "deployment",
                      ],
                    },
                  ]),
              }
            );

        expect(
          result
            .candidates[0]
            .applicability
            .failedPreconditions
        )
          .toContain(
            "parameter_missing:deployment"
          );
      }
    );

    test(
      "rejects diagnosis confidence below declared threshold",
      async () => {
        const input =
          baseInput();

        input
          .diagnosis
          .diagnosisConfidence =
          0.5;

        const service =
          new PlaybookApplicabilityService();

        const result =
          await service
            .evaluateCandidates(
              input,
              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "k8s.restart.v1",

                      status:
                        "approved",

                      enabled:
                        true,

                      preconditions: {
                        checks: [
                          {
                            id:
                              "minimum-confidence",

                            type:
                              "diagnosis_confidence",

                            minimum:
                              0.8,
                          },
                        ],
                      },
                    },
                  ]),
              }
            );

        expect(
          result
            .candidates[0]
            .status
        )
          .toBe(
            CANDIDATE_STATUS
              .PRECONDITION_FAILED
          );

        expect(
          result
            .candidates[0]
            .applicability
            .failedPreconditions
        )
          .toContain(
            "minimum-confidence"
          );
      }
    );

    test(
      "supports custom precondition evaluator",
      async () => {
        const service =
          new PlaybookApplicabilityService();

        const result =
          await service
            .evaluateCandidates(
              baseInput(),
              {
                playbookRepository:
                  repository([
                    {
                      playbookId:
                        "k8s.restart.v1",

                      status:
                        "approved",

                      enabled:
                        true,

                      preconditions: {
                        checks: [
                          {
                            id:
                              "custom-health",

                            type:
                              "custom",
                          },
                        ],
                      },
                    },
                  ]),

                preconditionEvaluator:
                  async () => ({
                    passed:
                      true,

                    reason:
                      "Custom health condition passed.",
                  }),
              }
            );

        expect(
          result.applicableCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "returns safe rejection when playbook definition is missing",
      async () => {
        const service =
          new PlaybookApplicabilityService();

        const result =
          await service
            .evaluateCandidates(
              baseInput(),
              {
                playbookRepository:
                  repository(
                    []
                  ),
              }
            );

        expect(
          result.applicableCount
        )
          .toBe(
            0
          );

        expect(
          result
            .candidates[0]
            .applicability
            .failedPreconditions
        )
          .toContain(
            "PLAYBOOK_NOT_FOUND"
          );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const service =
          new PlaybookApplicabilityService();

        await expect(
          service.evaluateCandidates({
            ...baseInput(),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PLAYBOOK_APPLICABILITY_UNSAFE_INPUT",
          });
      }
    );
  }
);