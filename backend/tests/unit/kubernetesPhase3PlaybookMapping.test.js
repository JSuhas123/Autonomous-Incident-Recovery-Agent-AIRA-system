"use strict";

const {
  kubernetesPlaybookMappingService,
  KUBERNETES_PLAYBOOK_MAPPINGS,
} = require(
  "../../services/playbooks/kubernetesPlaybookMappingService"
);

describe(
  "AIRA Kubernetes Phase 3 playbook mapping",
  () => {
    test(
      "maps CrashLoopBackOff to canonical recovery playbook",
      () => {
        const mapping =
          kubernetesPlaybookMappingService
            .getMapping(
              "K8S_CRASH_LOOP_BACKOFF"
            );

        expect(
          mapping
        ).not.toBeNull();

        expect(
          mapping.playbookId
        ).toBe(
          "PB-K8S-CRASHLOOP-001"
        );
      }
    );

    test(
      "maps OOMKilled to canonical recovery playbook",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .getPlaybookId(
              "K8S_OOM_KILLED"
            )
        ).toBe(
          "PB-K8S-OOM-001"
        );
      }
    );

    test(
      "maps failed rollout to canonical recovery playbook",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .getPlaybookId(
              "K8S_FAILED_ROLLOUT"
            )
        ).toBe(
          "PB-K8S-FAILED-ROLLOUT-001"
        );
      }
    );

    test(
      "maps image pull failure to canonical recovery playbook",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .getPlaybookId(
              "K8S_IMAGE_PULL_FAILURE"
            )
        ).toBe(
          "PB-K8S-IMAGEPULL-001"
        );
      }
    );

    test(
      "maps node not ready to canonical recovery playbook",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .getPlaybookId(
              "K8S_NODE_NOT_READY"
            )
        ).toBe(
          "PB-K8S-NODE-NOTREADY-001"
        );
      }
    );

    test(
      "unknown diagnosis does not produce playbook",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .getMapping(
              "SOMETHING_RANDOM"
            )
        ).toBeNull();
      }
    );

    test(
      "arbitrary playbook IDs are rejected",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .isApprovedPlaybook(
              "PB-DELETE-PRODUCTION"
            )
        ).toBe(
          false
        );
      }
    );

    test(
      "known Kubernetes recovery playbook is approved",
      () => {
        expect(
          kubernetesPlaybookMappingService
            .isApprovedPlaybook(
              "PB-K8S-CRASHLOOP-001"
            )
        ).toBe(
          true
        );
      }
    );

    test(
      "all configured mappings have mandatory metadata",
      () => {
        for (
          const mapping
          of Object.values(
            KUBERNETES_PLAYBOOK_MAPPINGS
          )
        ) {
          expect(
            mapping.playbookId
          ).toBeTruthy();

          expect(
            mapping.category
          ).toBeTruthy();

          expect(
            [
              "LOW",
              "MEDIUM",
              "HIGH",
            ]
          ).toContain(
            mapping.riskLevel
          );
        }
      }
    );
  }
);