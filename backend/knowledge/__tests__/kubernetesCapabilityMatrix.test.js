"use strict";

const {
  KUBERNETES_CAPABILITY_TARGETS,
  buildKubernetesCapabilityMatrix,
} =
  require(
    "../kubernetesCapabilityMatrix"
  );


describe(
  "Phase 13.7 — Kubernetes capability matrix",
  () => {
    test(
      "defines a broad Kubernetes capability target",
      () => {
        expect(
          KUBERNETES_CAPABILITY_TARGETS
            .length
        ).toBeGreaterThanOrEqual(
          15
        );
      }
    );


    test(
      "builds matrix against live deterministic handler registry",
      () => {
        const matrix =
          buildKubernetesCapabilityMatrix();

        expect(
          matrix
            .counts
            .total
        ).toBe(
          KUBERNETES_CAPABILITY_TARGETS
            .length
        );

        expect(
          matrix
            .counts
            .available +
          matrix
            .counts
            .missing
        ).toBe(
          matrix
            .counts
            .total
        );
      }
    );


    test(
      "reports capability domains independently",
      () => {
        const matrix =
          buildKubernetesCapabilityMatrix();

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "pod"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "deployment"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "node"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "storage"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "dns"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "service"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "ingress"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "autoscaling"
        );

        expect(
          matrix.byDomain
        ).toHaveProperty(
          "namespace"
        );
      }
    );


    test(
      "does not pretend missing handlers are available",
      () => {
        const matrix =
          buildKubernetesCapabilityMatrix();

        for (
          const capability
          of matrix.missing
        ) {
          expect(
            capability.available
          ).toBe(
            false
          );
        }
      }
    );


    test(
      "all capability entries identify affected playbooks",
      () => {
        const matrix =
          buildKubernetesCapabilityMatrix();

        for (
          const capability
          of matrix.capabilities
        ) {
          expect(
            Array.isArray(
              capability.requiredFor
            )
          ).toBe(
            true
          );

          expect(
            capability
              .requiredFor
              .length
          ).toBeGreaterThan(
            0
          );
        }
      }
    );
  }
);