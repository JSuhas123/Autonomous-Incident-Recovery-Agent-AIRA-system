"use strict";


const mockPatchNamespacedDeployment =
  jest.fn();


jest.mock(
  "@kubernetes/client-node",
  () => {
    class MockKubeConfig {
      loadFromString() {}

      loadFromCluster() {}

      makeApiClient(
        ApiClass
      ) {
        if (
          ApiClass ===
          MockAppsV1Api
        ) {
          return {
            patchNamespacedDeployment:
              mockPatchNamespacedDeployment,
          };
        }


        return {
          getCode:
            jest.fn()
              .mockResolvedValue({
                gitVersion:
                  "v1.test",
              }),
        };
      }
    }


    class MockAppsV1Api {}

    class MockVersionApi {}


    return {
      KubeConfig:
        MockKubeConfig,

      AppsV1Api:
        MockAppsV1Api,

      VersionApi:
        MockVersionApi,

      PatchUtils: {
        PATCH_FORMAT_STRATEGIC_MERGE_PATCH:
          "application/strategic-merge-patch+json",
      },
    };
  }
);


const kubernetesAdapter =
  require(
    "../../services/integrations/adapters/kubernetesAdapter"
  );


function connection(
  overrides = {}
) {
  return {
    provider:
      "kubernetes",

    _decryptedSecret:
      "apiVersion: v1",

    nonSecretConfig: {
      authMode:
        "kubeconfig",

      allowedNamespaces: [
        "aira-reliability-lab",
      ],

      allowedExecutionCapabilities: [
        "kubernetes.restartDeployment",
      ],

      allowedDeployments: [
        "aira-reliability-lab/lab-api",
      ],

      ...(
        overrides
          .nonSecretConfig ||
        {}
      ),
    },

    ...overrides,
  };
}


function authorizationMetadata(
  overrides = {}
) {
  return {
    authorizationProof: {
      verified:
        true,

      authorizationId:
        "auth-1",

      executionRequestId:
        "request-1",

      planId:
        "plan-1",

      planHash:
        "hash-1",

      capability:
        "kubernetes.restartDeployment",

      ...overrides,
    },
  };
}


describe(
  "Phase 20 Kubernetes executeCapability",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();


        mockPatchNamespacedDeployment
          .mockResolvedValue({
            body: {
              metadata: {
                name:
                  "lab-api",

                resourceVersion:
                  "11",
              },
            },
          });
      }
    );


    test(
      "advertises execute capability",
      () => {
        expect(
          kubernetesAdapter
            .capabilities
        )
          .toContain(
            "execute_capability"
          );


        expect(
          typeof kubernetesAdapter
            .executeCapability
        )
          .toBe(
            "function"
          );
      }
    );


    test(
      "rejects execution without verified authorization",
      async () => {
        await expect(
          kubernetesAdapter
            .executeCapability(
              connection(),

              {
                capability:
                  "kubernetes.restartDeployment",

                parameters: {
                  namespace:
                    "aira-reliability-lab",

                  deploymentName:
                    "lab-api",
                },
              },

              {}
            )
        )
          .rejects
          .toMatchObject({
            code:
              "KUBERNETES_EXECUTION_AUTHORIZATION_REQUIRED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "rejects arbitrary capability",
      async () => {
        await expect(
          kubernetesAdapter
            .executeCapability(
              connection(),

              {
                capability:
                  "kubernetes.deleteNamespace",

                parameters: {
                  namespace:
                    "aira-reliability-lab",

                  deploymentName:
                    "lab-api",
                },
              },

              authorizationMetadata({
                capability:
                  "kubernetes.deleteNamespace",
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "KUBERNETES_EXECUTION_CAPABILITY_UNSUPPORTED",
          });
      }
    );


    test(
      "rejects namespace outside explicit allow list",
      async () => {
        await expect(
          kubernetesAdapter
            .executeCapability(
              connection(),

              {
                capability:
                  "kubernetes.restartDeployment",

                parameters: {
                  namespace:
                    "production",

                  deploymentName:
                    "lab-api",
                },
              },

              authorizationMetadata()
            )
        )
          .rejects
          .toMatchObject({
            code:
              "KUBERNETES_EXECUTION_NAMESPACE_NOT_ALLOWED",
          });
      }
    );


    test(
      "requires explicit execution capability opt in",
      async () => {
        await expect(
          kubernetesAdapter
            .executeCapability(
              connection({
                nonSecretConfig: {
                  authMode:
                    "kubeconfig",

                  allowedNamespaces: [
                    "aira-reliability-lab",
                  ],

                  allowedExecutionCapabilities:
                    [],

                  allowedDeployments: [
                    "lab-api",
                  ],
                },
              }),

              {
                capability:
                  "kubernetes.restartDeployment",

                parameters: {
                  namespace:
                    "aira-reliability-lab",

                  deploymentName:
                    "lab-api",
                },
              },

              authorizationMetadata()
            )
        )
          .rejects
          .toMatchObject({
            code:
              "KUBERNETES_EXECUTION_CAPABILITY_NOT_ALLOWED",
          });
      }
    );


    test(
      "performs authorized strategic merge rollout restart",
      async () => {
        const result =
          await kubernetesAdapter
            .executeCapability(
              connection(),

              {
                capability:
                  "kubernetes.restartDeployment",

                parameters: {
                  namespace:
                    "aira-reliability-lab",

                  deploymentName:
                    "lab-api",
                },
              },

              authorizationMetadata()
            );


        expect(
          mockPatchNamespacedDeployment
        )
          .toHaveBeenCalledTimes(
            1
          );


        const call =
          mockPatchNamespacedDeployment
            .mock
            .calls[0];


        expect(
          call[0]
        )
          .toBe(
            "lab-api"
          );


        expect(
          call[1]
        )
          .toBe(
            "aira-reliability-lab"
          );


        expect(
          call[2]
            .spec
            .template
            .metadata
            .annotations[
              "kubectl.kubernetes.io/restartedAt"
            ]
        )
          .toBeTruthy();


        expect(
          call[8]
            .headers[
              "Content-Type"
            ]
        )
          .toBe(
            "application/strategic-merge-patch+json"
          );


        expect(
          result.success
        )
          .toBe(
            true
          );


        expect(
          result.status
        )
          .toBe(
            "SUCCEEDED"
          );


        expect(
          result.operation
        )
          .toBe(
            "restartDeployment"
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
      "surfaces Kubernetes API error detail",
      async () => {
        mockPatchNamespacedDeployment
          .mockRejectedValueOnce({
            statusCode:
              415,

            body: {
              message:
                "unsupported media type",
            },

            message:
              "HTTP request failed",
          });


        await expect(
          kubernetesAdapter
            .executeCapability(
              connection(),

              {
                capability:
                  "kubernetes.restartDeployment",

                parameters: {
                  namespace:
                    "aira-reliability-lab",

                  deploymentName:
                    "lab-api",
                },
              },

              authorizationMetadata()
            )
        )
          .rejects
          .toMatchObject({
            code:
              "KUBERNETES_RESTART_DEPLOYMENT_FAILED",

            statusCode:
              415,

            kubernetesDetail:
              "unsupported media type",

            executionAuthorized:
              false,
          });
      }
    );
  }
);