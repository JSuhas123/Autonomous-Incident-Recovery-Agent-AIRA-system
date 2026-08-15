"use strict";

const {
  RecoveryDecisionLifecycleService,
} =
  require(
    "../recoveryDecisionLifecycleService"
  );

const {
  RecoveryDecisionEngine,
} =
  require(
    "../recoveryDecisionEngine"
  );

const {
  RecoveryDecisionCritic,
} =
  require(
    "../recoveryDecisionCritic"
  );

const {
  RecoveryFallbackService,
} =
  require(
    "../recoveryFallbackService"
  );

const {
  createRecoveryCandidate,
  createRecoveryDecision,
  CANDIDATE_STATUS,
  POLICY_STATUS,
  APPROVAL_MODE,
  ACTION_RISK,
  REVERSIBILITY,
  RECOVERY_DECISION,
} =
  require(
    "../recoveryDecisionContracts"
  );

// ============================================================================
// HELPERS
// ============================================================================

function baseDiagnosis() {
  return {
    diagnosisId:
      "diagnosis-1",

    revision:
      1,

    diagnosisConfidence:
      0.95,

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

        confidence:
          0.95,
      },
    ],

    symptoms: [
      {
        type:
          "crash_loop",

        severity:
          "critical",
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
  };
}

function baseContext() {
  return {
    incidentId:
      "incident-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    environment:
      "production",

    incident: {
      _id:
        "incident-1",

      status:
        "open",

      severity:
        "critical",

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

      criticality:
        "medium",

      namespace:
        "production",

      deployment:
        "payment-api",
    },

    integrations: [
      "kubernetes",
    ],

    topologyAnalysis: {
      affectedServices: [
        "payment-api",
      ],

      affectedResources: [
        {
          type:
            "deployment",
        },
      ],
    },

    executionAuthorized:
      false,
  };
}

function baseSafetyGate() {
  return {
    decision:
      "ALLOW_EVALUATION",

    canEvaluatePlaybook:
      true,

    requiresHuman:
      false,

    executionAuthorized:
      false,
  };
}

function approvedPlaybook(
  overrides = {}
) {
  return {
    playbookId:
      overrides.playbookId ||
      "k8s.restart-deployment.v1",

    version:
      "1.0.0",

    title:
      "Restart Kubernetes Deployment",

    description:
      "Restart unhealthy Kubernetes deployment pods.",

    status:
      "approved",

    enabled:
      true,

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

    requiredIntegrations: [
      "kubernetes",
    ],

    requiredParameters: [
      "namespace",
      "deployment",
    ],

    rollback: {
      steps: [
        {
          action:
            "restore_previous_state",
        },
      ],

      reversibility:
        "FULL",
    },

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

    tags: [
      "kubernetes",
      "restart",
      "deployment",
    ],

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

    async getById(
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

function persistenceStub() {
  let revision =
    0;

  let previousDecision =
    null;

  return {
    async persist({
      engineResult,
      criticResult,
      organizationId,
      environmentId,
      incidentId,
      diagnosisId,
      diagnosisRevision,
    }) {
      revision +=
        1;

      const currentDecision = {
        ...engineResult.decision,

        _id:
          `mongo-decision-${revision}`,

        organizationId,

        environmentId,

        incidentId,

        diagnosisId,

        diagnosisRevision,

        revision,

        isCurrent:
          true,

        criticResult,

        executionAuthorized:
          false,
      };

      if (
        previousDecision
      ) {
        previousDecision.isCurrent =
          false;

        previousDecision.status =
          "superseded";

        currentDecision.supersedesDecisionId =
          previousDecision._id;
      }

      previousDecision =
        currentDecision;

      return {
        run: {
          runId:
            `run-${revision}`,

          executionAuthorized:
            false,
        },

        decision:
          currentDecision,

        revision,

        isCurrent:
          true,

        executionAuthorized:
          false,
      };
    },

    getCurrent() {
      return previousDecision;
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "Phase 7 Recovery E2E",
  () => {
    test(
      "safe verified diagnosis produces a validated recovery recommendation",
      async () => {
        const repo =
          repository([
            approvedPlaybook(),
          ]);

        const persistence =
          persistenceStub();

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence,
          });

        const result =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              diagnosisId:
                "diagnosis-1",

              diagnosisRevision:
                1,

              diagnosis:
                baseDiagnosis(),

              safetyGate:
                baseSafetyGate(),

              context:
                baseContext(),

              executionAuthorized:
                false,
            },

            {
              playbookRepository:
                repo,

              availableIntegrations: [
                "kubernetes",
              ],
            }
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .RECOMMEND_PLAYBOOK
          );

        expect(
          result
            .decision
            .selectedPlaybookId
        )
          .toBe(
            "k8s.restart-deployment.v1"
          );

        expect(
          result
            .criticResult
            .accepted
        )
          .toBe(
            true
          );

        expect(
          result
            .criticResult
            .rejected
        )
          .toBe(
            false
          );

        expect(
          result
            .decision
            .revision
        )
          .toBe(
            1
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .decision
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .persisted
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "no matching playbook produces NO_SAFE_ACTION",
      async () => {
        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence:
              persistenceStub(),
          });

        const result =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-2",

              diagnosis:
                baseDiagnosis(),

              safetyGate:
                baseSafetyGate(),

              context: {
                ...baseContext(),

                incidentId:
                  "incident-2",
              },
            },

            {
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
            }
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .NO_SAFE_ACTION
          );

        expect(
          result
            .decision
            .selectedPlaybookId
        )
          .toBeNull();

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "playbook failing preconditions produces NO_SAFE_ACTION",
      async () => {
        const badPlaybook =
          approvedPlaybook({
            requiredParameters: [
              "cluster",
            ],
          });

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence:
              persistenceStub(),
          });

        const result =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-3",

              diagnosis:
                baseDiagnosis(),

              safetyGate:
                baseSafetyGate(),

              context: {
                ...baseContext(),

                incidentId:
                  "incident-3",

                cluster:
                  null,
              },
            },

            {
              playbookRepository:
                repository([
                  badPlaybook,
                ]),

              availableIntegrations: [
                "kubernetes",
              ],
            }
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .NO_SAFE_ACTION
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
      "dangerous recovery candidate does not become automatic recommendation",
      async () => {
        const dangerous =
          approvedPlaybook({
            category:
              "database",

            metadata: {
              destructive:
                true,

              dataMutation:
                true,

              mutationScope:
                "global",

              actionType:
                "destroy",
            },

            rollback: {
              reversible:
                false,
            },
          });

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence:
              persistenceStub(),
          });

        const diagnosis =
          baseDiagnosis();

        diagnosis.primaryHypothesis.category =
          "database";

        diagnosis.primaryHypothesis.rootCause =
          "Database corruption";

        diagnosis.hypotheses[0].category =
          "database";

        diagnosis.hypotheses[0].rootCause =
          "Database corruption";

        const context =
          baseContext();

        context.service.criticality =
          "critical";

        context.service.type =
          "database_service";

        context.topologyAnalysis = {
          affectedServices: [
            "a",
            "b",
            "c",
            "d",
            "e",
          ],

          affectedResources: [
            {
              type:
                "database",
            },

            {
              type:
                "database",
            },

            {
              type:
                "database",
            },
          ],
        };

        dangerous.serviceTypes = [
          "database_service",
        ];

        dangerous.resourceTypes = [
          "database",
        ];

        dangerous.rootCauseCategories = [
          "database",
        ];

        const result =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-4",

              diagnosis,

              safetyGate:
                baseSafetyGate(),

              context,
            },

            {
              playbookRepository:
                repository([
                  dangerous,
                ]),
            }
          );

        expect(
          result
            .decision
            .decision
        )
          .not
          .toBe(
            RECOVERY_DECISION
              .RECOMMEND_PLAYBOOK
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
      "policy-blocked recovery produces NO_SAFE_ACTION",
      async () => {
        const playbook =
          approvedPlaybook();

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence:
              persistenceStub(),
          });

        const result =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-5",

              diagnosis:
                baseDiagnosis(),

              safetyGate:
                baseSafetyGate(),

              context:
                baseContext(),
            },

            {
              playbookRepository:
                repository([
                  playbook,
                ]),

              availableIntegrations: [
                "kubernetes",
              ],

              policyEvaluator:
                async () => ({
                  blocked:
                    true,

                  policyIds: [
                    "prod-protected",
                  ],

                  reasons: [
                    "Production service is protected.",
                  ],
                }),
            }
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .NO_SAFE_ACTION
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
      "approval-required recovery remains behind approval boundary",
      async () => {
        const playbook =
          approvedPlaybook();

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence:
              persistenceStub(),
          });

        const result =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-6",

              diagnosis:
                baseDiagnosis(),

              safetyGate:
                baseSafetyGate(),

              context:
                baseContext(),
            },

            {
              playbookRepository:
                repository([
                  playbook,
                ]),

              availableIntegrations: [
                "kubernetes",
              ],

              policyEvaluator:
                async () => ({
                  requiresApproval:
                    true,

                  reasons: [
                    "Production approval required.",
                  ],

                  policyIds: [
                    "prod-approval",
                  ],
                }),
            }
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .REQUIRE_APPROVAL
          );

        expect(
          result
            .decision
            .approvalRequired
        )
          .toBe(
            true
          );

        expect(
          result
            .decision
            .approvalMode
        )
          .not
          .toBe(
            APPROVAL_MODE
              .NONE
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
      "critic rejection downgrades recovery to manual intervention",
      async () => {
        const engine = {
          async decide() {
            const selected =
              createRecoveryCandidate({
                playbookId:
                  "unsafe-playbook",

                candidateId:
                  "unsafe-candidate",

                status:
                  CANDIDATE_STATUS
                    .POLICY_BLOCKED,

                diagnosisMatch: {
                  score:
                    0.95,
                },

                applicability: {
                  applicable:
                    true,

                  score:
                    0.95,
                },

                policy: {
                  status:
                    POLICY_STATUS
                      .BLOCKED,
                },

                approval: {
                  required:
                    false,

                  mode:
                    APPROVAL_MODE
                      .NONE,
                },

                actionRisk: {
                  level:
                    ACTION_RISK
                      .LOW,

                  score:
                    0.2,
                },

                rollback: {
                  available:
                    true,

                  reversibility:
                    REVERSIBILITY
                      .FULL,
                },

                ranking: {
                  score:
                    0.95,

                  rank:
                    1,
                },
              });

            const decision =
              createRecoveryDecision({
                decisionId:
                  "unsafe-decision",

                incidentId:
                  "incident-7",

                decision:
                  RECOVERY_DECISION
                    .RECOMMEND_PLAYBOOK,

                selectedCandidateId:
                  selected.candidateId,

                selectedPlaybookId:
                  selected.playbookId,

                confidence:
                  0.95,

                candidates: [
                  selected,
                ],

                policyStatus:
                  POLICY_STATUS
                    .ELIGIBLE,

                approvalRequired:
                  false,

                approvalMode:
                  APPROVAL_MODE
                    .NONE,

                rollbackAvailable:
                  true,

                reversibility:
                  REVERSIBILITY
                    .FULL,
              });

            return {
              decision,

              selectedCandidate:
                selected,

              candidates: [
                selected,
              ],

              stageTrace:
                [],

              executionAuthorized:
                false,
            };
          },
        };

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            engine,

            critic:
              new RecoveryDecisionCritic(),

            fallback:
              new RecoveryFallbackService(),

            persistence:
              persistenceStub(),
          });

        const result =
          await lifecycle.run({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-7",

            diagnosis:
              baseDiagnosis(),

            safetyGate:
              baseSafetyGate(),

            context:
              baseContext(),
          });

        expect(
          result
            .criticResult
            .rejected
        )
          .toBe(
            true
          );

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MANUAL_INTERVENTION
          );

        expect(
          result
            .fallback
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
      "insufficient diagnosis becomes COLLECT_MORE_EVIDENCE",
      async () => {
        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence:
              persistenceStub(),
          });

        const diagnosis =
          baseDiagnosis();

        diagnosis.recommendedNextStep = {
          type:
            "COLLECT_MORE_EVIDENCE",
        };

        const result =
          await lifecycle.run({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-8",

            diagnosis,

            safetyGate: {
              decision:
                "HOLD_FOR_MORE_EVIDENCE",

              canEvaluatePlaybook:
                false,
            },

            context:
              baseContext(),
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .COLLECT_MORE_EVIDENCE
          );

        expect(
          result
            .fallback
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
      "unexpected recovery subsystem failure becomes safe manual fallback",
      async () => {
        const engine = {
          async decide() {
            throw Object.assign(
              new Error(
                "Recovery dependency unavailable"
              ),
              {
                code:
                  "RECOVERY_DEPENDENCY_FAILED",
              }
            );
          },
        };

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            engine,

            persistence:
              persistenceStub(),
          });

        const result =
          await lifecycle.run({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-9",

            diagnosis:
              baseDiagnosis(),

            safetyGate:
              baseSafetyGate(),

            context:
              baseContext(),
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MANUAL_INTERVENTION
          );

        expect(
          result
            .fallback
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
      "successive recovery evaluations create increasing revisions",
      async () => {
        const persistence =
          persistenceStub();

        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence,
          });

        const dependencies = {
          playbookRepository:
            repository([
              approvedPlaybook(),
            ]),

          availableIntegrations: [
            "kubernetes",
          ],
        };

        const first =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-10",

              diagnosisId:
                "diagnosis-10",

              diagnosisRevision:
                1,

              diagnosis:
                baseDiagnosis(),

              safetyGate:
                baseSafetyGate(),

              context:
                baseContext(),
            },

            dependencies
          );

        const second =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-10",

              diagnosisId:
                "diagnosis-10",

              diagnosisRevision:
                2,

              diagnosis: {
                ...baseDiagnosis(),

                revision:
                  2,
              },

              safetyGate:
                baseSafetyGate(),

              context:
                baseContext(),
            },

            dependencies
          );

        expect(
          first
            .decision
            .revision
        )
          .toBe(
            1
          );

        expect(
          second
            .decision
            .revision
        )
          .toBe(
            2
          );

        expect(
          second
            .decision
            .isCurrent
        )
          .toBe(
            true
          );

        expect(
          second.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "absolute Phase 7 invariant: no layer authorizes execution",
      async () => {
        const lifecycle =
          new RecoveryDecisionLifecycleService({
            persistence:
              persistenceStub(),
          });

        const result =
          await lifecycle.run(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-11",

              diagnosis:
                baseDiagnosis(),

              safetyGate:
                baseSafetyGate(),

              context:
                baseContext(),
            },

            {
              playbookRepository:
                repository([
                  approvedPlaybook(),
                ]),

              availableIntegrations: [
                "kubernetes",
              ],
            }
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .engineResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .engineResult
            .decision
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .criticResult
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .persisted
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .persisted
            .decision
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);