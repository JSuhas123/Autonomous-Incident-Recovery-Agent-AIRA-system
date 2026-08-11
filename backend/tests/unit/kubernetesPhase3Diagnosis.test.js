"use strict";

const kubernetesDiagnosisService =
  require("../../services/diagnosis/kubernetesDiagnosisService");

const {
  DiagnosisAgent,
  ROOT_CAUSE,
} = require("../../agents/v2/agents/diagnosisAgent");

function createEvidenceItem({
  id,
  source = "aira-kubernetes-inventory",
  structuredData = {},
}) {
  return {
    id,
    type: "KUBERNETES_EVENT",
    source,
    confidence: 0.99,
    summary: id,
    structuredData,
  };
}

function createMockReasoningProvider(
  output = {}
) {
  return {
    reason: jest.fn().mockResolvedValue({
      manualRequired: false,

      output: {
        hypotheses: [],
        diagnosisConfidence: 0,
        evidenceCompleteness: 1,
        unresolvedQuestions: [],
        recommendedIncidentType: "unknown",
        ...output,
      },

      modelMetadata: {
        model: "mock-diagnosis",
        provider: "mock",
      },

      fallbackUsed: false,
      warnings: [],
    }),
  };
}

describe(
  "AIRA Kubernetes Phase 3 diagnosis",
  () => {
    test(
      "diagnoses CrashLoopBackOff",
      () => {
        const result =
          kubernetesDiagnosisService.diagnose({
            incident: {
              type: "kubernetes_failure",
            },

            evidencePackage: {
              items: [
                createEvidenceItem({
                  id: "ev-k8s-pod-inc-1",

                  structuredData: {
                    restartCount: 7,

                    failureSignals: [
                      {
                        type: "waiting",
                        reason:
                          "CrashLoopBackOff",
                      },

                      {
                        type:
                          "previous_termination",
                        reason: "Error",
                        exitCode: 1,
                      },
                    ],
                  },
                }),
              ],
            },
          });

        expect(
          result.primary
        ).not.toBeNull();

        expect(
          result.primary.code
        ).toBe(
          "K8S_CRASH_LOOP_BACKOFF"
        );

        expect(
          result.primary.confidence
        ).toBeGreaterThanOrEqual(
          0.9
        );

        // Diagnosis identifies the failure.
        // Playbook selection is tested separately.
        expect(
          result.primary.category
        ).toBe(
          "container_failure"
        );
      }
    );

    test(
      "diagnoses OOMKilled",
      () => {
        const result =
          kubernetesDiagnosisService.diagnose({
            incident: {
              type: "kubernetes_failure",
            },

            evidencePackage: {
              items: [
                createEvidenceItem({
                  id: "ev-k8s-pod-inc-2",

                  structuredData: {
                    restartCount: 3,

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
              ],
            },
          });

        expect(
          result.primary.code
        ).toBe(
          "K8S_OOM_KILLED"
        );

        expect(
          result.primary.confidence
        ).toBeGreaterThanOrEqual(
          0.95
        );

        // Diagnosis identifies resource exhaustion.
        // Playbook selection is tested separately.
        expect(
          result.primary.category
        ).toBe(
          "resource_exhaustion"
        );
      }
    );

    test(
      "diagnoses image pull failure",
      () => {
        const result =
          kubernetesDiagnosisService.diagnose({
            incident: {
              type: "kubernetes_failure",
            },

            evidencePackage: {
              items: [
                createEvidenceItem({
                  id: "ev-k8s-pod-inc-3",

                  structuredData: {
                    failureSignals: [
                      {
                        type: "waiting",

                        reason:
                          "ImagePullBackOff",

                        message:
                          "Failed to pull image",
                      },
                    ],
                  },
                }),
              ],
            },
          });

        expect(
          result.primary.code
        ).toBe(
          "K8S_IMAGE_PULL_FAILURE"
        );
      }
    );

    test(
      "diagnoses failed deployment rollout",
      () => {
        const result =
          kubernetesDiagnosisService.diagnose({
            incident: {
              type: "deployment_failure",
            },

            evidencePackage: {
              items: [
                createEvidenceItem({
                  id:
                    "ev-k8s-ownership-inc-4",

                  source:
                    "aira-kubernetes-topology",

                  structuredData: {
                    deployment: {
                      name:
                        "checkout-api",

                      spec: {
                        replicas:
                          4,

                        revision:
                          "12",
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

                createEvidenceItem({
                  id:
                    "ev-k8s-siblings-inc-4",

                  source:
                    "aira-kubernetes-topology",

                  structuredData: {
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
              ],
            },
          });

        expect(
          result.primary.code
        ).toBe(
          "K8S_FAILED_ROLLOUT"
        );

        expect(
          result.primary.evidence
            .deployment
        ).toBe(
          "checkout-api"
        );
      }
    );

    test(
      "diagnoses unhealthy node",
      () => {
        const result =
          kubernetesDiagnosisService.diagnose({
            incident: {
              type:
                "kubernetes_failure",
            },

            evidencePackage: {
              items: [
                createEvidenceItem({
                  id:
                    "ev-k8s-node-inc-5",

                  source:
                    "aira-kubernetes-topology",

                  structuredData: {
                    node: {
                      name:
                        "worker-3",

                      status: {
                        conditions: [
                          {
                            type:
                              "Ready",

                            status:
                              "False",

                            reason:
                              "KubeletNotReady",
                          },
                        ],
                      },
                    },
                  },
                }),
              ],
            },
          });

        expect(
          result.primary.code
        ).toBe(
          "K8S_NODE_NOT_READY"
        );

        expect(
          result.primary.evidence
            .node
        ).toBe(
          "worker-3"
        );
      }
    );

    test(
      "returns no diagnosis when Kubernetes evidence is insufficient",
      () => {
        const result =
          kubernetesDiagnosisService.diagnose({
            incident: {
              type:
                "unknown",
            },

            evidencePackage: {
              items: [],
            },
          });

        expect(
          result.primary
        ).toBeNull();

        expect(
          result.candidates
        ).toEqual([]);
      }
    );

    test(
      "DiagnosisAgent maps CrashLoopBackOff to application startup failure",
      async () => {
        const provider =
          createMockReasoningProvider();

        const agent =
          new DiagnosisAgent({
            reasoningProvider:
              provider,
          });

        const record =
          await agent.execute({
            incidentId:
              "inc-crash",

            correlationId:
              "corr-crash",

            tenantId:
              "tenant-a",

            incident: {
              type:
                "kubernetes_failure",
            },

            evidence: {
              completeness:
                1,

              items: [
                createEvidenceItem({
                  id:
                    "ev-k8s-pod-inc-crash",

                  structuredData: {
                    restartCount:
                      6,

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
              ],
            },

            service: {
              id:
                "checkout",
            },

            resource: {
              namespace:
                "production",

              pod:
                "checkout-api-123",
            },
          });

        expect(
          record.status
        ).toBe(
          "SUCCESS"
        );

        const result =
          record.result
            .diagnosisResult;

        expect(
          result.hypotheses
            .length
        ).toBeGreaterThan(
          0
        );

        const primary =
          result.hypotheses
            .find(
              (hypothesis) =>
                hypothesis.id ===
                result.primaryHypothesis
            );

        expect(
          primary.rootCause
        ).toBe(
          ROOT_CAUSE
            .APPLICATION_STARTUP_FAILURE
        );

        expect(
          primary
            .evidenceSupporting
        ).toContain(
          "ev-k8s-pod-inc-crash"
        );
      }
    );

    test(
      "DiagnosisAgent maps OOMKilled to OOM",
      async () => {
        const provider =
          createMockReasoningProvider();

        const agent =
          new DiagnosisAgent({
            reasoningProvider:
              provider,
          });

        const record =
          await agent.execute({
            incidentId:
              "inc-oom",

            correlationId:
              "corr-oom",

            tenantId:
              "tenant-a",

            incident: {
              type:
                "kubernetes_failure",
            },

            evidence: {
              completeness:
                1,

              items: [
                createEvidenceItem({
                  id:
                    "ev-k8s-pod-inc-oom",

                  structuredData: {
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
              ],
            },

            service: {},
            resource: {},
          });

        const result =
          record.result
            .diagnosisResult;

        const primary =
          result.hypotheses
            .find(
              (hypothesis) =>
                hypothesis.id ===
                result.primaryHypothesis
            );

        expect(
          primary.rootCause
        ).toBe(
          ROOT_CAUSE.OOM
        );
      }
    );

    test(
      "unsupported AI evidence IDs are removed",
      async () => {
        const provider =
          createMockReasoningProvider({
            hypotheses: [
              {
                rootCause:
                  "BAD_CONFIGURATION",

                confidence:
                  0.95,

                evidenceSupporting: [
                  "fake-evidence-id",
                ],

                evidenceAgainst:
                  [],

                explanation:
                  "Configuration problem",
              },
            ],

            diagnosisConfidence:
              0.95,
          });

        const agent =
          new DiagnosisAgent({
            reasoningProvider:
              provider,
          });

        const record =
          await agent.execute({
            incidentId:
              "inc-ai",

            correlationId:
              "corr-ai",

            tenantId:
              "tenant-a",

            incident: {
              type:
                "unknown",
            },

            evidence: {
              completeness:
                0.5,

              items: [
                createEvidenceItem({
                  id:
                    "real-evidence",
                }),
              ],
            },

            service: {},
            resource: {},
          });

        const hypothesis =
          record.result
            .diagnosisResult
            .hypotheses[0];

        expect(
          hypothesis
            .evidenceSupporting
        ).toEqual([]);

        expect(
          hypothesis.confidence
        ).toBeLessThanOrEqual(
          0.35
        );
      }
    );

    test(
      "deterministic Kubernetes diagnosis survives LLM failure",
      async () => {
        const provider = {
          reason:
            jest
              .fn()
              .mockResolvedValue({
                manualRequired:
                  true,

                manualReason:
                  "REASONING_FAILED",

                output:
                  null,

                modelMetadata:
                  null,

                fallbackUsed:
                  true,

                warnings: [
                  "provider unavailable",
                ],
              }),
        };

        const agent =
          new DiagnosisAgent({
            reasoningProvider:
              provider,
          });

        const record =
          await agent.execute({
            incidentId:
              "inc-fallback",

            correlationId:
              "corr-fallback",

            tenantId:
              "tenant-a",

            incident: {
              type:
                "kubernetes_failure",
            },

            evidence: {
              completeness:
                1,

              items: [
                createEvidenceItem({
                  id:
                    "ev-k8s-pod-inc-fallback",

                  structuredData: {
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
              ],
            },

            service: {},
            resource: {},
          });

        expect(
          record.status
        ).toBe(
          "SUCCESS"
        );

        expect(
          record.fallbackUsed
        ).toBe(
          true
        );

        expect(
          record.result
            .diagnosisResult
            .hypotheses[0]
            .rootCause
        ).toBe(
          ROOT_CAUSE.OOM
        );
      }
    );
  }
);