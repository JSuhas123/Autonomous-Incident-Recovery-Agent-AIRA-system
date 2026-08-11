"use strict";

/**
 * AIRA Kubernetes Phase 3 End-to-End Golden Path Tests
 *
 * Scope:
 *
 * Investigation-style evidence
 *      ↓
 * deterministic Kubernetes diagnosis
 *      ↓
 * DiagnosisAgent root cause
 *      ↓
 * Kubernetes mapping
 *      ↓
 * deterministic PlaybookMatcher candidate set
 *      ↓
 * PlaybookSelectionAgent
 *
 * No real Kubernetes mutation occurs in this suite.
 */

const fs =
  require("fs");

const path =
  require("path");

const kubernetesDiagnosisService =
  require(
    "../../services/diagnosis/kubernetesDiagnosisService"
  );

const {
  DiagnosisAgent,
  ROOT_CAUSE,
} =
  require(
    "../../agents/v2/agents/diagnosisAgent"
  );

const {
  PlaybookSelectionAgent,
} =
  require(
    "../../agents/v2/agents/playbookSelectionAgent"
  );

const {
  kubernetesPlaybookMappingService,
} =
  require(
    "../../services/playbooks/kubernetesPlaybookMappingService"
  );

const BACKEND_ROOT =
  path.resolve(
    __dirname,
    "../.."
  );

const PLAYBOOK_ROOT =
  path.join(
    BACKEND_ROOT,
    "playbooks",
    "catalogue",
    "kubernetes"
  );

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function evidence({
  id,
  source =
    "aira-kubernetes-inventory",
  data = {},
}) {
  return {
    id,

    type:
      "KUBERNETES_EVENT",

    source,

    confidence:
      0.99,

    summary:
      id,

    structuredData:
      data,
  };
}

function reasoningProvider(
  output = {}
) {
  return {
    reason:
      jest.fn()
        .mockResolvedValue({
          manualRequired:
            false,

          output: {
            hypotheses:
              [],

            diagnosisConfidence:
              0,

            evidenceCompleteness:
              1,

            unresolvedQuestions:
              [],

            recommendedIncidentType:
              "unknown",

            ...output,
          },

          modelMetadata: {
            model:
              "phase3-e2e-mock",

            provider:
              "mock",
          },

          fallbackUsed:
            false,

          warnings:
            [],
        }),
  };
}

function selectionProvider(
  playbookId
) {
  return {
    reason:
      jest.fn()
        .mockResolvedValue({
          manualRequired:
            false,

          output: {
            recommendedPlaybookId:
              playbookId,

            candidateRankings: [
              {
                playbookId,
              },
            ],

            reasoningConfidence:
              0.95,

            evidenceIds:
              [],

            reasons: [
              "Golden-path candidate matches deterministic diagnosis",
            ],

            disqualifications:
              [],

            requiredAdditionalEvidence:
              [],

            recommendation:
              "EXECUTE_CANDIDATE",
          },

          modelMetadata: {
            model:
              "phase3-selection-mock",

            provider:
              "mock",
          },

          fallbackUsed:
            false,

          warnings:
            [],
        }),
  };
}

function matcherFor(
  playbookId,
  {
    approvalMode =
      "CONDITIONAL",

    riskLevel =
      "HIGH",
  } = {}
) {
  return {
    analyseIncident:
      jest.fn()
        .mockResolvedValue({
          outcome:
            "MATCHED",

          eligible: [
            {
              playbookId,

              semver:
                "1.0.0",

              name:
                playbookId,

              score:
                0.95,

              approvalMode,

              riskLevel,

              matchReasons: [
                "incident type matched",
              ],
            },
          ],

          candidates:
            [],

          disqualifications:
            [],

          missingEvidence:
            [],
        }),
  };
}

function findPrimary(
  diagnosisResult
) {
  return (
    diagnosisResult
      .hypotheses
      .find(
        (hypothesis) =>
          hypothesis.id ===
          diagnosisResult
            .primaryHypothesis
      ) ||
    null
  );
}

async function runDiagnosis({
  incidentId,
  incident,
  evidenceItems,
  resource = {},
}) {
  const agent =
    new DiagnosisAgent({
      reasoningProvider:
        reasoningProvider(),
    });

  return agent.execute({
    incidentId,

    correlationId:
      `corr-${incidentId}`,

    tenantId:
      "tenant-phase3",

    incident,

    evidence: {
      completeness:
        1,

      items:
        evidenceItems,
    },

    service: {
      id:
        "checkout-api",
    },

    resource,
  });
}

async function runSelection({
  incidentId,
  incident,
  diagnosisResult,
  evidenceItems,
  expectedPlaybookId,
  approvalMode =
    "CONDITIONAL",
}) {
  const agent =
    new PlaybookSelectionAgent({
      reasoningProvider:
        selectionProvider(
          expectedPlaybookId
        ),
    });

  return agent.execute(
    {
      incidentId,

      correlationId:
        `corr-${incidentId}`,

      tenantId:
        "tenant-phase3",

      incident,

      diagnosis:
        diagnosisResult,

      evidence: {
        completeness:
          1,

        items:
          evidenceItems,
      },
    },

    {
      incidentPlaybookService:
        matcherFor(
          expectedPlaybookId,
          {
            approvalMode,
          }
        ),
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe(
  "AIRA Kubernetes Phase 3 end-to-end golden paths",
  () => {
    test(
      "CrashLoopBackOff → diagnosis → canonical playbook",
      async () => {
        const incidentId =
          "e2e-crashloop";

        const evidenceItems = [
          evidence({
            id:
              `ev-k8s-pod-${incidentId}`,

            data: {
              restartCount:
                8,

              failureSignals: [
                {
                  type:
                    "waiting",

                  reason:
                    "CrashLoopBackOff",
                },

                {
                  type:
                    "previous_termination",

                  reason:
                    "Error",

                  exitCode:
                    1,
                },
              ],
            },
          }),
        ];

        const deterministic =
          kubernetesDiagnosisService
            .diagnose({
              incident: {
                type:
                  "kubernetes_failure",
              },

              evidencePackage: {
                items:
                  evidenceItems,
              },
            });

        expect(
          deterministic
            .primary
            .code
        ).toBe(
          "K8S_CRASH_LOOP_BACKOFF"
        );

        const diagnosis =
          await runDiagnosis({
            incidentId,

            incident: {
              type:
                "kubernetes_failure",
            },

            evidenceItems,

            resource: {
              namespace:
                "production",

              pod:
                "checkout-abc",
            },
          });

        expect(
          diagnosis.status
        ).toBe(
          "SUCCESS"
        );

        const diagnosisResult =
          diagnosis
            .result
            .diagnosisResult;

        const primary =
          findPrimary(
            diagnosisResult
          );

        expect(
          primary.rootCause
        ).toBe(
          ROOT_CAUSE
            .APPLICATION_STARTUP_FAILURE
        );

        const playbookId =
          kubernetesPlaybookMappingService
            .getPlaybookId(
              diagnosisResult
                .recommendedIncidentType
            );

        expect(
          playbookId
        ).toBe(
          "PB-K8S-CRASHLOOP-001"
        );

        const selection =
          await runSelection({
            incidentId,

            incident: {
              type:
                "CrashLoopBackOff",

              severity:
                "P1",

              provider:
                "kubernetes",
            },

            diagnosisResult,

            evidenceItems,

            expectedPlaybookId:
              playbookId,

            approvalMode:
              "CONDITIONAL",
          });

        expect(
          selection.status
        ).toBe(
          "SUCCESS"
        );

        expect(
          selection
            .result
            .recommendedPlaybookId
        ).toBe(
          "PB-K8S-CRASHLOOP-001"
        );
      }
    );

    test(
      "OOMKilled → diagnosis → approval-gated canonical playbook",
      async () => {
        const incidentId =
          "e2e-oom";

        const evidenceItems = [
          evidence({
            id:
              `ev-k8s-pod-${incidentId}`,

            data: {
              restartCount:
                3,

              failureSignals: [
                {
                  type:
                    "previous_termination",

                  reason:
                    "OOMKilled",

                  exitCode:
                    137,
                },
              ],
            },
          }),
        ];

        const diagnosis =
          await runDiagnosis({
            incidentId,

            incident: {
              type:
                "kubernetes_failure",
            },

            evidenceItems,

            resource: {
              namespace:
                "production",

              pod:
                "payments-xyz",
            },
          });

        expect(
          diagnosis.status
        ).toBe(
          "SUCCESS"
        );

        const diagnosisResult =
          diagnosis
            .result
            .diagnosisResult;

        const primary =
          findPrimary(
            diagnosisResult
          );

        expect(
          primary.rootCause
        ).toBe(
          ROOT_CAUSE.OOM
        );

        const playbookId =
          kubernetesPlaybookMappingService
            .getPlaybookId(
              diagnosisResult
                .recommendedIncidentType
            );

        expect(
          playbookId
        ).toBe(
          "PB-K8S-OOM-001"
        );

        const selection =
          await runSelection({
            incidentId,

            incident: {
              type:
                "OOMKilled",

              severity:
                "P1",

              provider:
                "kubernetes",
            },

            diagnosisResult,

            evidenceItems,

            expectedPlaybookId:
              playbookId,

            approvalMode:
              "REQUIRED",
          });

        expect(
          selection.status
        ).toBe(
          "SUCCESS"
        );

        expect(
          selection
            .result
            .recommendedPlaybookId
        ).toBe(
          "PB-K8S-OOM-001"
        );
      }
    );

    test(
      "Failed rollout → diagnosis → rollback playbook",
      async () => {
        const incidentId =
          "e2e-rollout";

        const evidenceItems = [
          evidence({
            id:
              `ev-k8s-ownership-${incidentId}`,

            source:
              "aira-kubernetes-topology",

            data: {
              deployment: {
                name:
                  "checkout-api",

                spec: {
                  replicas:
                    4,

                  revision:
                    "17",
                },

                status: {
                  readyReplicas:
                    1,

                  unavailableReplicas:
                    3,
                },
              },
            },
          }),

          evidence({
            id:
              `ev-k8s-siblings-${incidentId}`,

            source:
              "aira-kubernetes-topology",

            data: {
              health: {
                total:
                  4,

                running:
                  1,

                failed:
                  2,

                pending:
                  1,

                restarting:
                  2,

                unhealthy:
                  3,
              },
            },
          }),
        ];

        const diagnosis =
          await runDiagnosis({
            incidentId,

            incident: {
              type:
                "deployment_failure",
            },

            evidenceItems,

            resource: {
              namespace:
                "production",

              deployment:
                "checkout-api",
            },
          });

        expect(
          diagnosis.status
        ).toBe(
          "SUCCESS"
        );

        const diagnosisResult =
          diagnosis
            .result
            .diagnosisResult;

        const primary =
          findPrimary(
            diagnosisResult
          );

        expect(
          primary.rootCause
        ).toBe(
          ROOT_CAUSE
            .FAILED_DEPLOYMENT
        );

        const playbookId =
          kubernetesPlaybookMappingService
            .getPlaybookId(
              diagnosisResult
                .recommendedIncidentType
            );

        expect(
          playbookId
        ).toBe(
          "PB-K8S-FAILED-ROLLOUT-001"
        );

        const selection =
          await runSelection({
            incidentId,

            incident: {
              type:
                "FailedRollout",

              severity:
                "P1",

              provider:
                "kubernetes",
            },

            diagnosisResult,

            evidenceItems,

            expectedPlaybookId:
              playbookId,

            approvalMode:
              "REQUIRED",
          });

        expect(
          selection.status
        ).toBe(
          "SUCCESS"
        );

        expect(
          selection
            .result
            .recommendedPlaybookId
        ).toBe(
          "PB-K8S-FAILED-ROLLOUT-001"
        );
      }
    );

    test(
      "LLM cannot select playbook outside deterministic matcher set",
      async () => {
        const agent =
          new PlaybookSelectionAgent({
            reasoningProvider:
              selectionProvider(
                "PB-DELETE-PRODUCTION"
              ),
          });

        const record =
          await agent.execute(
            {
              incidentId:
                "e2e-hallucination",

              correlationId:
                "corr-hallucination",

              tenantId:
                "tenant-phase3",

              incident: {
                type:
                  "CrashLoopBackOff",
              },

              diagnosis: {
                recommendedIncidentType:
                  "K8S_CRASH_LOOP_BACKOFF",
              },

              evidence: {
                items:
                  [],
              },
            },

            {
              incidentPlaybookService:
                matcherFor(
                  "PB-K8S-CRASHLOOP-001"
                ),
            }
          );

        expect(
          record.status
        ).not.toBe(
          "SUCCESS"
        );
      }
    );

    test(
      "unknown Kubernetes diagnosis does not map to arbitrary playbook",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .getPlaybookId(
              "K8S_UNKNOWN_NEW_ERROR"
            )
        ).toBeNull();
      }
    );

    test(
      "golden-path playbook catalogue files exist",
      () => {
        const files = [
          "pb-k8s-crashloop-001.yaml",
          "pb-k8s-oom-001.yaml",
          "pb-k8s-failed-rollout-001.yaml",
        ];

        for (
          const file
          of files
        ) {
          expect(
            fs.existsSync(
              path.join(
                PLAYBOOK_ROOT,
                file
              )
            )
          ).toBe(
            true
          );
        }
      }
    );

    test(
      "golden-path playbooks are ACTIVE",
      () => {
        const files = [
          "pb-k8s-crashloop-001.yaml",
          "pb-k8s-oom-001.yaml",
          "pb-k8s-failed-rollout-001.yaml",
        ];

        for (
          const filename
          of files
        ) {
          const source =
            fs.readFileSync(
              path.join(
                PLAYBOOK_ROOT,
                filename
              ),

              "utf8"
            );

          expect(
            source
          ).toMatch(
            /lifecycle:\s*ACTIVE/i
          );
        }
      }
    );

    test(
      "OOM and failed rollout contain approval requirements",
      () => {
        for (
          const filename
          of [
            "pb-k8s-oom-001.yaml",
            "pb-k8s-failed-rollout-001.yaml",
          ]
        ) {
          const source =
            fs.readFileSync(
              path.join(
                PLAYBOOK_ROOT,
                filename
              ),

              "utf8"
            );

          expect(
            source
          ).toMatch(
            /approval:/i
          );

          expect(
            source
          ).toMatch(
            /REQUIRED|requiresApproval:\s*true/i
          );
        }
      }
    );

    test(
      "all golden paths include verification",
      () => {
        for (
          const filename
          of [
            "pb-k8s-crashloop-001.yaml",
            "pb-k8s-oom-001.yaml",
            "pb-k8s-failed-rollout-001.yaml",
          ]
        ) {
          const source =
            fs.readFileSync(
              path.join(
                PLAYBOOK_ROOT,
                filename
              ),

              "utf8"
            );

          expect(
            source
          ).toMatch(
            /VERIFICATION|VERIFY/i
          );
        }
      }
    );

    test(
      "failed rollout references canonical rollback runbook",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              PLAYBOOK_ROOT,
              "pb-k8s-failed-rollout-001.yaml"
            ),

            "utf8"
          );

        expect(
          source
        ).toContain(
          "RB-K8S-ROLLBACK-DEPLOYMENT"
        );
      }
    );

    test(
      "OOM path contains investigation and verification runbooks",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              PLAYBOOK_ROOT,
              "pb-k8s-oom-001.yaml"
            ),

            "utf8"
          );

        expect(
          source
        ).toContain(
          "RB-K8S-INVESTIGATE-OOM"
        );

        expect(
          source
        ).toContain(
          "RB-K8S-VERIFY-POD"
        );
      }
    );
  }
);