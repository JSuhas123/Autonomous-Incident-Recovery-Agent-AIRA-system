"use strict";

const {
  ResilientK8sExecutor,
} =
  require(
    "../resilientK8sExecutor"
  );


describe(
  "ResilientK8sExecutor",
  () => {
    function createExecutor({
      restartPodResult = {
        restarted:
          true,
      },

      scaleResult = {
        scaled:
          true,
      },

      podStatus = {
        phase:
          "Running",
      },

      deploymentStatus = {
        desiredReplicas:
          3,

        updatedReplicas:
          3,
      },

      dependencyExecute,
    } = {}) {
      const k8sClient = {
        restartPod:
          jest.fn()
            .mockResolvedValue(
              restartPodResult
            ),

        scaleDeployment:
          jest.fn()
            .mockResolvedValue(
              scaleResult
            ),

        getPodStatus:
          jest.fn()
            .mockResolvedValue(
              podStatus
            ),

        getDeploymentStatus:
          jest.fn()
            .mockResolvedValue(
              deploymentStatus
            ),
      };

      const dependencyIsolation = {
        execute:
          dependencyExecute ||
          jest.fn(
            async (
              name,
              operation
            ) => ({
              ok:
                true,

              degraded:
                false,

              dependency:
                name,

              result:
                await operation(),

              circuit: {
                state:
                  "CLOSED",
              },

              executionAuthorized:
                false,
            })
          ),
      };

      const executor =
        new ResilientK8sExecutor(
          k8sClient,
          {
            dependencyIsolation,
          }
        );

      executor._delay =
        jest.fn()
          .mockResolvedValue();

      return {
        executor,
        k8sClient,
        dependencyIsolation,
      };
    }


    test(
      "restartPod uses dependency isolation for Kubernetes mutation",
      async () => {
        const {
          executor,
          dependencyIsolation,
          k8sClient,
        } =
          createExecutor();

        const result =
          await executor
            .restartPod(
              "api-123",
              "prod",
              {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",

                incidentId:
                  "incident-1",

                correlationId:
                  "corr-1",
              }
            );

        expect(
          dependencyIsolation
            .execute
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          dependencyIsolation
            .execute
        )
          .toHaveBeenCalledWith(
            "kubernetes",
            expect.any(
              Function
            ),
            expect.objectContaining({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              operation:
                "restart-pod",
            })
          );

        expect(
          k8sClient.restartPod
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result
        )
          .toMatchObject({
            success:
              true,

            restarted:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "scaleDeployment uses dependency isolation for Kubernetes mutation",
      async () => {
        const {
          executor,
          dependencyIsolation,
          k8sClient,
        } =
          createExecutor();

        const result =
          await executor
            .scaleDeployment(
              "api",
              "prod",
              3,
              {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",

                incidentId:
                  "incident-1",
              }
            );

        expect(
          dependencyIsolation
            .execute
        )
          .toHaveBeenCalledWith(
            "kubernetes",
            expect.any(
              Function
            ),
            expect.objectContaining({
              operation:
                "scale-deployment",
            })
          );

        expect(
          k8sClient
            .scaleDeployment
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.success
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
      "critical dependency failure fails closed",
      async () => {
        const dependencyFailure =
          Object.assign(
            new Error(
              "Kubernetes unavailable"
            ),
            {
              code:
                "CRITICAL_DEPENDENCY_UNAVAILABLE",

              circuitState:
                "OPEN",

              retryable:
                true,

              executionAuthorized:
                false,
            }
          );

        const {
          executor,
          k8sClient,
        } =
          createExecutor({
            dependencyExecute:
              jest.fn()
                .mockRejectedValue(
                  dependencyFailure
                ),
          });

        await expect(
          executor.restartPod(
            "api-123",
            "prod"
          )
        )
          .rejects
          .toMatchObject({
            code:
              "CRITICAL_DEPENDENCY_UNAVAILABLE",

            dependency:
              "kubernetes",

            circuitState:
              "OPEN",

            executionAuthorized:
              false,
          });

        expect(
          k8sClient.restartPod
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "open circuit prevents repeated Kubernetes mutation",
      async () => {
        const dependencyIsolation = {
          execute:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "Circuit open"
                  ),
                  {
                    code:
                      "DEPENDENCY_CIRCUIT_OPEN",

                    circuitState:
                      "OPEN",

                    retryable:
                      true,

                    executionAuthorized:
                      false,
                  }
                )
              ),
        };

        const {
          executor,
          k8sClient,
        } =
          createExecutor({
            dependencyExecute:
              dependencyIsolation
                .execute,
          });

        await expect(
          executor.scaleDeployment(
            "api",
            "prod",
            3
          )
        )
          .rejects
          .toMatchObject({
            code:
              "DEPENDENCY_CIRCUIT_OPEN",

            executionAuthorized:
              false,
          });

        expect(
          k8sClient
            .scaleDeployment
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "missing post-state after scale becomes UNKNOWN and requires reconciliation",
      async () => {
        const {
          executor,
        } =
          createExecutor({
            deploymentStatus:
              null,
          });

        await expect(
          executor
            .scaleDeployment(
              "api",
              "prod",
              3
            )
        )
          .rejects
          .toMatchObject({
            code:
              "K8S_SCALE_VERIFICATION_UNKNOWN",

            executionOutcome:
              "UNKNOWN",

            requiresReconciliation:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "incorrect post-state after scale requires reconciliation",
      async () => {
        const {
          executor,
        } =
          createExecutor({
            deploymentStatus: {
              desiredReplicas:
                1,

              updatedReplicas:
                1,
            },
          });

        await expect(
          executor
            .scaleDeployment(
              "api",
              "prod",
              3
            )
        )
          .rejects
          .toMatchObject({
            code:
              "K8S_SCALE_VERIFICATION_FAILED",

            executionOutcome:
              "UNKNOWN",

            requiresReconciliation:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "operation timeout is treated as unknown external outcome",
      async () => {
        const {
          executor,
        } =
          createExecutor();

        executor.defaultTimeout =
          5;

        executor
          .dependencyIsolation
          .execute =
          jest.fn(
            () =>
              new Promise(
                () => {}
              )
          );

        await expect(
          executor.restartPod(
            "api-123",
            "prod",
            {
              timeout:
                5,
            }
          )
        )
          .rejects
          .toMatchObject({
            code:
              "K8S_OPERATION_TIMEOUT",

            executionOutcome:
              "UNKNOWN",

            requiresReconciliation:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "pre-state failure remains best effort and does not block mutation",
      async () => {
        const {
          executor,
          k8sClient,
        } =
          createExecutor();

        k8sClient
          .getPodStatus
          .mockRejectedValueOnce(
            new Error(
              "read failed"
            )
          );

        const result =
          await executor.restartPod(
            "api-123",
            "prod"
          );

        expect(
          result.success
        )
          .toBe(
            true
          );

        expect(
          k8sClient.restartPod
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );
  }
);