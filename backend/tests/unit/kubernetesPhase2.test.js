"use strict";

/**
 * AIRA Kubernetes Phase 2 tests
 *
 * Tests:
 * - discovery shape
 * - inventory resource kinds
 * - authoritative topology types
 * - read-only investigation tool boundary
 * - RBAC safety
 * - no direct Kubernetes mutation in V2 tool layer
 */

const fs =
  require("fs");

const path =
  require("path");

const BACKEND_ROOT =
  path.resolve(
    __dirname,
    "../.."
  );
const REPO_ROOT =
  path.resolve(
    BACKEND_ROOT,
    ".."
  );

describe(
  "AIRA Kubernetes Phase 2",
  () => {
    test(
      "KubernetesResource supports ReplicaSet inventory",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "models",
              "KubernetesResource.js"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          '"replicaset"'
        );
      }
    );

    test(
      "cluster snapshot tracks ReplicaSets",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "models",
              "KubernetesClusterSnapshot.js"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          "replicaSets"
        );
      }
    );

    test(
      "discovery includes ReplicaSets",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "services",
              "discovery",
              "kubernetesDiscoveryService.js"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          "discoverReplicaSets"
        );

        expect(
          file
        ).toContain(
          "ownerReferences"
        );

        expect(
          file
        ).toContain(
          "_normaliseContainerState"
        );

        expect(
          file
        ).toContain(
          "_extractPodFailureSignals"
        );
      }
    );

    test(
      "inventory persists ReplicaSets and rich pod evidence",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "services",
              "discovery",
              "kubernetesInventoryService.js"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          "_normaliseReplicaSets"
        );

        expect(
          file
        ).toContain(
          "failureSignals"
        );

        expect(
          file
        ).toContain(
          "ownerReferences"
        );
      }
    );

    test(
      "topology supports authoritative ownership chain",
      () => {
        const model =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "models",
              "KubernetesResourceRelation.js"
            ),
            "utf8"
          );

        expect(
          model
        ).toContain(
          "deployment_owns_replicaset"
        );

        expect(
          model
        ).toContain(
          "replicaset_owns_pod"
        );

        expect(
          model
        ).toContain(
          "pod_runs_on_node"
        );

        expect(
          model
        ).toContain(
          "service_selects_pod"
        );
      }
    );

    test(
      "relationship service uses ownerReference evidence",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "services",
              "discovery",
              "kubernetesRelationshipService.js"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          "ownerReference"
        );

        expect(
          file
        ).toContain(
          "deployment_owns_replicaset"
        );

        expect(
          file
        ).toContain(
          "replicaset_owns_pod"
        );

        expect(
          file
        ).toContain(
          "label_selector_fallback"
        );
      }
    );

    test(
      "V2 Kubernetes investigation tools exist",
      () => {
        const toolPath =
          path.join(
            BACKEND_ROOT,
            "agents",
            "v2",
            "tools",
            "kubernetesInvestigationTools.js"
          );

        expect(
          fs.existsSync(
            toolPath
          )
        ).toBe(
          true
        );

        const file =
          fs.readFileSync(
            toolPath,
            "utf8"
          );

        expect(
          file
        ).toContain(
          "getPodEvidence"
        );

        expect(
          file
        ).toContain(
          "getPodsForDeployment"
        );

        expect(
          file
        ).toContain(
          "listUnhealthyPods"
        );

        expect(
          file
        ).toContain(
          "listUnhealthyNodes"
        );
      }
    );

    test(
      "V2 Kubernetes investigation tools contain no mutation calls",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "agents",
              "v2",
              "tools",
              "kubernetesInvestigationTools.js"
            ),
            "utf8"
          );

        const forbidden = [
          ".createNamespaced",
          ".replaceNamespaced",
          ".patchNamespaced",
          ".deleteNamespaced",
          "executeAction(",
          "restart_pod",
          "restart_deployment",
          "scale_deployment",
        ];

        for (
          const token
          of forbidden
        ) {
          expect(
            file
          ).not.toContain(
            token
          );
        }
      }
    );

    test(
      "observer RBAC exists",
      () => {
        expect(
          fs.existsSync(
            path.join(
              REPO_ROOT,
              "k8s",
              "aira-observer-rbac.yaml"
            )
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "observer RBAC grants read verbs",
      () => {
        const file =
          fs.readFileSync(
            path.join(
                REPO_ROOT,
              "k8s",
              "aira-observer-rbac.yaml"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          "- get"
        );

        expect(
          file
        ).toContain(
          "- list"
        );

        expect(
          file
        ).toContain(
          "- watch"
        );
      }
    );

    test(
      "observer RBAC does not grant mutation verbs",
      () => {
        const file =
          fs.readFileSync(
            path.join(
                REPO_ROOT,
              "k8s",
              "aira-observer-rbac.yaml"
            ),
            "utf8"
          );

        const forbiddenLines = [
          /^\s*-\s+create\s*$/m,
          /^\s*-\s+update\s*$/m,
          /^\s*-\s+patch\s*$/m,
          /^\s*-\s+delete\s*$/m,
          /^\s*-\s+deletecollection\s*$/m,
        ];

        for (
          const pattern
          of forbiddenLines
        ) {
          expect(
            pattern.test(
              file
            )
          ).toBe(
            false
          );
        }
      }
    );

    test(
      "observer RBAC does not grant Kubernetes secrets access",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              REPO_ROOT,
              "k8s",
              "aira-observer-rbac.yaml"
            ),
            "utf8"
          );

        /**
         * Remove comments before checking because documentation
         * may legitimately mention the word "secrets".
         */
        const operational =
          file
            .split("\n")
            .filter(
              (line) =>
                !line
                  .trim()
                  .startsWith(
                    "#"
                  )
            )
            .join("\n");

        expect(
          operational
        ).not.toMatch(
          /^\s*-\s+secrets\s*$/m
        );
      }
    );

    test(
      "server injects read-only investigation tools into V2 runtime",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "server.js"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          "kubernetesInvestigationTools"
        );

        expect(
          file
        ).toContain(
          "initializeAgentOrchestrator"
        );
      }
    );

    test(
      "InvestigationAgent can collect Kubernetes evidence",
      () => {
        const file =
          fs.readFileSync(
            path.join(
              BACKEND_ROOT,
              "agents",
              "v2",
              "agents",
              "investigationAgent.js"
            ),
            "utf8"
          );

        expect(
          file
        ).toContain(
          "_collectK8sEvidence"
        );

        expect(
          file
        ).toContain(
          "kubernetesInvestigationTools"
        );
      }
    );
  }
);