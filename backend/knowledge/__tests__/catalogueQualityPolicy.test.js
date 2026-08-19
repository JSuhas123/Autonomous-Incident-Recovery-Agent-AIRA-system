"use strict";

const {
  validatePlaybookQuality,
  validateRunbookQuality,
} =
  require(
    "../catalogueQualityPolicy"
  );

const {
  planCatalogueWrite,
} =
  require(
    "../cataloguePackWriter"
  );


// ============================================================================
// FIXTURES
// ============================================================================

function createDeepPlaybook() {
  return {
    apiVersion:
      "aira.io/v1",

    kind:
      "Playbook",

    playbookId:
      "PB-K8S-QUALITY-TEST-001",

    name:
      "Kubernetes Quality Contract Test",

    description:
      "Validates that generated Kubernetes Playbooks preserve operational depth and catalogue metadata.",

    semver:
      "1.0.0",

    lifecycle:
      "DRAFT",

    owner: {
      ownerType:
        "system",

      name:
        "Platform Engineering",
    },

    scope: {
      environments: [
        "production",
        "staging",
      ],

      providers: [
        "kubernetes",
      ],
    },

    risk: {
      level:
        "LOW",

      blastRadius:
        "none",

      reversible:
        true,
    },

    parameters: [
      {
        name:
          "deployment",

        type:
          "string",

        required:
          true,

        description:
          "Deployment associated with the incident.",
      },
    ],

    stages: [
      {
        id:
          "investigate",

        name:
          "Investigate Deployment",

        type:
          "INVESTIGATION",

        runbooks: [
          {
            runbookId:
              "RB-K8S-INVESTIGATE-DEPLOYMENT",

            required:
              true,

            parameterMappings: {
              deployment:
                "${deployment}",
            },
          },
        ],
      },

      {
        id:
          "verify",

        name:
          "Verify Recovery",

        type:
          "VERIFICATION",

        runbooks: [
          {
            runbookId:
              "RB-K8S-VERIFY-DEPLOYMENT",

            required:
              true,
          },
        ],
      },
    ],

    rollback: {
      strategy:
        "NONE",
    },
  };
}


function createDeepRunbook() {
  return {
    apiVersion:
      "aira.io/v1",

    kind:
      "Runbook",

    runbookId:
      "RB-K8S-QUALITY-TEST",

    name:
      "Kubernetes Quality Contract Test",

    description:
      "Validates that generated Kubernetes Runbooks preserve execution, verification, rollback, and audit depth.",

    semver:
      "1.0.0",

    lifecycle:
      "DRAFT",

    owner: {
      ownerType:
        "system",

      name:
        "Platform Engineering",
    },

    scope: {
      environments: [
        "production",
        "staging",
      ],

      providers: [
        "kubernetes",
      ],
    },

    risk: {
      level:
        "LOW",

      blastRadius:
        "none",

      reversible:
        true,
    },

    parameters: [
      {
        name:
          "deployment",

        type:
          "string",

        required:
          true,

        description:
          "Deployment to inspect.",
      },

      {
        name:
          "namespace",

        type:
          "string",

        required:
          true,

        description:
          "Namespace containing the Deployment.",
      },
    ],

    steps: [
      {
        id:
          "step-01",

        name:
          "Read Deployment",

        order:
          1,

        type:
          "kubernetes",

        action:
          "get_deployment",

        params: {
          resource:
            "${deployment}",

          namespace:
            "${namespace}",
        },

        timeoutSeconds:
          30,

        failurePolicy:
          "STOP",
      },
    ],

    rollbackConfig: {
      strategy:
        "NONE",

      nonReversibleAcknowledged:
        false,
    },

    verification: {
      strategy:
        "ANY",

      timeoutSeconds:
        30,

      checks: [
        {
          id:
            "check-01",

          type:
            "deployment_available",

          description:
            "Deployment can be evaluated after investigation.",

          params: {
            deployment:
              "${deployment}",

            namespace:
              "${namespace}",
          },

          timeoutSeconds:
            30,

          optional:
            true,
        },
      ],
    },

    auditConfig: {
      redactSensitiveValues:
        false,
    },
  };
}


// ============================================================================
// TESTS
// ============================================================================

describe(
  "Phase 13.7 — catalogue quality/depth contract",
  () => {
    test(
      "accepts a deep Playbook definition",
      () => {
        const result =
          validatePlaybookQuality(
            createDeepPlaybook()
          );

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          result.errors
        ).toBe(
          0
        );
      }
    );


    test(
      "rejects shallow Playbook missing operational metadata",
      () => {
        const result =
          validatePlaybookQuality({
            kind:
              "Playbook",

            playbookId:
              "PB-K8S-SHALLOW-001",

            name:
              "Shallow",

            description:
              "Too short",

            semver:
              "1.0.0",

            lifecycle:
              "DRAFT",

            stages:
              [],
          });

        expect(
          result.valid
        ).toBe(
          false
        );

        const codes =
          result
            .diagnostics
            .map(
              (
                diagnostic
              ) =>
                diagnostic
                  .code
            );

        expect(
          codes
        ).toEqual(
          expect.arrayContaining([
            "DESCRIPTION_TOO_SHALLOW",
            "OWNER_REQUIRED",
            "SCOPE_REQUIRED",
            "RISK_REQUIRED",
            "PLAYBOOK_STAGES_REQUIRED",
            "PLAYBOOK_RUNBOOK_REFERENCE_REQUIRED",
          ])
        );
      }
    );


    test(
      "accepts a deep Runbook definition",
      () => {
        const result =
          validateRunbookQuality(
            createDeepRunbook()
          );

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          result.errors
        ).toBe(
          0
        );
      }
    );


    test(
      "rejects shallow Runbook missing execution safety depth",
      () => {
        const result =
          validateRunbookQuality({
            kind:
              "Runbook",

            runbookId:
              "RB-K8S-SHALLOW",

            name:
              "Shallow",

            description:
              "Too short",

            semver:
              "1.0.0",

            lifecycle:
              "DRAFT",

            steps:
              [],
          });

        expect(
          result.valid
        ).toBe(
          false
        );

        const codes =
          result
            .diagnostics
            .map(
              (
                diagnostic
              ) =>
                diagnostic
                  .code
            );

        expect(
          codes
        ).toEqual(
          expect.arrayContaining([
            "DESCRIPTION_TOO_SHALLOW",
            "OWNER_REQUIRED",
            "SCOPE_REQUIRED",
            "RISK_REQUIRED",
            "RUNBOOK_STEPS_REQUIRED",
            "VERIFICATION_REQUIRED",
            "ROLLBACK_CONFIG_REQUIRED",
            "AUDIT_CONFIG_REQUIRED",
          ])
        );
      }
    );


    test(
      "writer plans a valid Playbook only inside playbooks/catalogue",
      () => {
        const plan =
          planCatalogueWrite({
            definition:
              createDeepPlaybook(),

            relativePath:
              "kubernetes/pb-k8s-quality-test-001.yaml",
          });

        expect(
          plan.kind
        ).toBe(
          "PLAYBOOK"
        );

        expect(
          plan.quality.valid
        ).toBe(
          true
        );

        expect(
          plan.target
            .replace(
              /\\/g,
              "/"
            )
        ).toContain(
          "/playbooks/catalogue/kubernetes/pb-k8s-quality-test-001.yaml"
        );
      }
    );


    test(
      "writer plans a valid Runbook only inside runbooks/definitions",
      () => {
        const plan =
          planCatalogueWrite({
            definition:
              createDeepRunbook(),

            relativePath:
              "kubernetes/rb-k8s-quality-test.yaml",
          });

        expect(
          plan.kind
        ).toBe(
          "RUNBOOK"
        );

        expect(
          plan.quality.valid
        ).toBe(
          true
        );

        expect(
          plan.target
            .replace(
              /\\/g,
              "/"
            )
        ).toContain(
          "/runbooks/definitions/kubernetes/rb-k8s-quality-test.yaml"
        );
      }
    );


    test(
      "writer rejects path traversal",
      () => {
        expect(
          () =>
            planCatalogueWrite({
              definition:
                createDeepPlaybook(),

              relativePath:
                "../../../server.js",
            })
        ).toThrow();
      }
    );
  }
);