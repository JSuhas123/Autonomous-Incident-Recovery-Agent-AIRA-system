"use strict";


const {
  KubernetesReliabilityLabRuntime,
} =
  require(
    "../../services/reliability/runtimes/kubernetesReliabilityLabRuntime"
  );


const {
  DockerReliabilityLabRuntime,
} =
  require(
    "../../services/reliability/runtimes/dockerReliabilityLabRuntime"
  );


const {
  INJECTION_OPERATION,
} =
  require(
    "../../services/reliability/failureInjectionPlanFactory"
  );


function runtimeContext() {
  return {
    reliabilityLab:
      true,

    safetyClass:
      "LAB_ONLY",

    executionAuthorized:
      false,
  };
}


function kubernetesPlan(
  overrides =
    {}
) {
  return {
    planVersion:
      "21.9-v1",

    operation:
      INJECTION_OPERATION
        .K8S_DELETE_POD,

    failureKey:
      "kubernetes.pod.crash",

    target: {
      resourceType:
        "kubernetes.pod",

      namespace:
        "aira-reliability-lab",

      podName:
        "lab-api-abc123",

      labels: {
        "aira.reliability-lab":
          "true",

        "aira.safety-class":
          "LAB_ONLY",
      },
    },

    evaluatorGroundTruthIncluded:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function dockerPlan(
  overrides =
    {}
) {
  return {
    planVersion:
      "21.9-v1",

    operation:
      INJECTION_OPERATION
        .REDIS_UNAVAILABLE,

    failureKey:
      "redis.unavailable",

    target: {
      resourceType:
        "redis.instance",

      containerName:
        "aira-lab-redis",

      labels: {
        "aira.reliability-lab":
          "true",

        "aira.safety-class":
          "LAB_ONLY",
      },
    },

    evaluatorGroundTruthIncluded:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 21.9 Kubernetes Reliability Lab runtime",

  () => {
    test(
      "verifies real Kubernetes labels before deleting pod",

      async () => {
        const calls =
          [];


        const commandRunner =
          jest.fn(
            async (
              command,
              args
            ) => {
              calls.push({
                command,

                args,
              });


              if (
                args[0] ===
                  "get"
              ) {
                return {
                  stdout:
                    JSON.stringify({
                      metadata: {
                        name:
                          "lab-api-abc123",

                        namespace:
                          "aira-reliability-lab",

                        uid:
                          "uid-before",

                        labels: {
                          "aira.reliability-lab":
                            "true",

                          "aira.safety-class":
                            "LAB_ONLY",
                        },
                      },
                    }),

                  stderr:
                    "",

                  code:
                    0,

                  executionAuthorized:
                    false,
                };
              }


              return {
                stdout:
                  "pod deleted",

                stderr:
                  "",

                code:
                  0,

                executionAuthorized:
                  false,
              };
            }
          );


        const runtime =
          new KubernetesReliabilityLabRuntime({
            commandRunner,
          });


        const result =
          await runtime
            .execute(
              kubernetesPlan(),

              runtimeContext()
            );


        expect(
          result.success
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.provenance
            .targetUid
        ).toBe(
          "uid-before"
        );


        expect(
          calls
        ).toHaveLength(
          2
        );


        expect(
          calls[0]
            .args
        ).toEqual([
          "get",
          "pod",
          "lab-api-abc123",
          "-n",
          "aira-reliability-lab",
          "-o",
          "json",
        ]);


        expect(
          calls[1]
            .args
        ).toEqual([
          "delete",
          "pod",
          "lab-api-abc123",
          "-n",
          "aira-reliability-lab",
          "--wait=false",
        ]);
      }
    );


    test(
      "rejects real pod missing Reliability Lab label",

      async () => {
        const runtime =
          new KubernetesReliabilityLabRuntime({
            commandRunner:
              jest.fn(
                async () => ({
                  stdout:
                    JSON.stringify({
                      metadata: {
                        name:
                          "lab-api-abc123",

                        namespace:
                          "aira-reliability-lab",

                        uid:
                          "uid-before",

                        labels: {
                          "aira.safety-class":
                            "LAB_ONLY",
                        },
                      },
                    }),
                })
              ),
          });


        await expect(
          runtime.execute(
            kubernetesPlan(),

            runtimeContext()
          )
        ).rejects.toMatchObject({
          code:
            "KUBERNETES_RUNTIME_REAL_TARGET_NOT_LAB_RESOURCE",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "rejects namespace outside canonical lab",

      async () => {
        const runtime =
          new KubernetesReliabilityLabRuntime();


        await expect(
          runtime.execute(
            kubernetesPlan({
              target: {
                ...kubernetesPlan()
                  .target,

                namespace:
                  "production",
              },
            }),

            runtimeContext()
          )
        ).rejects.toMatchObject({
          code:
            "KUBERNETES_RUNTIME_TARGET_NAMESPACE_FORBIDDEN",
        });
      }
    );


    test(
      "does not pretend unsupported injector is live certified",

      async () => {
        const runtime =
          new KubernetesReliabilityLabRuntime();


        await expect(
          runtime.execute(
            kubernetesPlan({
              operation:
                INJECTION_OPERATION
                  .NETWORK_LATENCY,
            }),

            runtimeContext()
          )
        ).rejects.toMatchObject({
          code:
            "KUBERNETES_RUNTIME_OPERATION_NOT_LIVE_CERTIFIED",
        });
      }
    );
  }
);


describe(
  "Phase 21.9 Docker Reliability Lab runtime",

  () => {
    test(
      "verifies real Docker labels before stopping lab container",

      async () => {
        const calls =
          [];


        const commandRunner =
          jest.fn(
            async (
              command,
              args
            ) => {
              calls.push({
                command,

                args,
              });


              if (
                args[0] ===
                  "inspect"
              ) {
                return {
                  stdout:
                    JSON.stringify([
                      {
                        Id:
                          "docker-id",

                        Name:
                          "/aira-lab-redis",

                        Config: {
                          Labels: {
                            "aira.reliability-lab":
                              "true",

                            "aira.safety-class":
                              "LAB_ONLY",
                          },
                        },
                      },
                    ]),
                };
              }


              return {
                stdout:
                  "aira-lab-redis",

                stderr:
                  "",

                code:
                  0,
              };
            }
          );


        const runtime =
          new DockerReliabilityLabRuntime({
            commandRunner,
          });


        const result =
          await runtime
            .execute(
              dockerPlan(),

              runtimeContext()
            );


        expect(
          result.success
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          calls
        ).toHaveLength(
          2
        );


        expect(
          calls[1]
            .args
        ).toEqual([
          "stop",
          "--time",
          "10",
          "aira-lab-redis",
        ]);
      }
    );


    test(
      "rejects production-like Docker container",

      async () => {
        const runtime =
          new DockerReliabilityLabRuntime();


        await expect(
          runtime.execute(
            dockerPlan({
              target: {
                ...dockerPlan()
                  .target,

                containerName:
                  "production-redis",
              },
            }),

            runtimeContext()
          )
        ).rejects.toMatchObject({
          code:
            "DOCKER_RUNTIME_TARGET_NAME_INVALID",
        });
      }
    );


    test(
      "rejects resolved container without LAB_ONLY label",

      async () => {
        const runtime =
          new DockerReliabilityLabRuntime({
            commandRunner:
              jest.fn(
                async () => ({
                  stdout:
                    JSON.stringify([
                      {
                        Id:
                          "docker-id",

                        Name:
                          "/aira-lab-redis",

                        Config: {
                          Labels: {
                            "aira.reliability-lab":
                              "true",

                            "aira.safety-class":
                              "PRODUCTION",
                          },
                        },
                      },
                    ]),
                })
              ),
          });


        await expect(
          runtime.execute(
            dockerPlan(),

            runtimeContext()
          )
        ).rejects.toMatchObject({
          code:
            "DOCKER_RUNTIME_REAL_TARGET_NOT_LAB_ONLY",
        });
      }
    );
  }
);