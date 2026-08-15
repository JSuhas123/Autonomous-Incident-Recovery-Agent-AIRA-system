"use strict";

const {
  ExecutorRegistry,
} =
  require(
    "../executorRegistry"
  );

const {
  EXECUTOR_DOMAIN,
  EXECUTOR_RESULT_STATUS,
  EXECUTOR_ERROR,
} =
  require(
    "../executorContracts"
  );

function definition(
  overrides = {}
) {
  return {
    capability:
      "kubernetes.restartDeployment",

    domain:
      EXECUTOR_DOMAIN
        .KUBERNETES,

    description:
      "Restart deployment",

    enabled:
      true,

    requiresAuthorization:
      true,

    handler:
      jest.fn(
        async () => ({
          changed:
            true,

          deployment:
            "api",
        })
      ),

    ...overrides,
  };
}

describe(
  "ExecutorRegistry",
  () => {
    test(
      "registers an allowlisted capability",
      () => {
        const registry =
          new ExecutorRegistry();

        const result =
          registry.register(
            definition()
          );

        expect(
          result.capability
        )
          .toBe(
            "kubernetes.restartDeployment"
          );

        expect(
          registry.has(
            "kubernetes.restartDeployment"
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects duplicate capability",
      () => {
        const registry =
          new ExecutorRegistry();

        registry.register(
          definition()
        );

        expect(
          () =>
            registry.register(
              definition()
            )
        )
          .toThrow(
            /already registered/
          );
      }
    );

    test(
      "rejects unknown capability",
      async () => {
        const registry =
          new ExecutorRegistry();

        await expect(
          registry.execute(
            "kubernetes.deleteEverything",
            {},
            {
              authorizationVerified:
                true,
            }
          )
        )
          .rejects
          .toMatchObject({
            code:
              EXECUTOR_ERROR
                .CAPABILITY_NOT_REGISTERED,
          });
      }
    );

    test(
      "requires verified authorization",
      async () => {
        const registry =
          new ExecutorRegistry();

        registry.register(
          definition()
        );

        await expect(
          registry.execute(
            "kubernetes.restartDeployment",
            {},
            {}
          )
        )
          .rejects
          .toMatchObject({
            code:
              EXECUTOR_ERROR
                .UNSAFE_INPUT,
          });
      }
    );

    test(
      "executes registered capability with verified authorization",
      async () => {
        const registry =
          new ExecutorRegistry();

        registry.register(
          definition()
        );

        const result =
          await registry
            .execute(
              "kubernetes.restartDeployment",
              {
                namespace:
                  "production",

                deployment:
                  "api",
              },
              {
                authorizationVerified:
                  true,
              }
            );

        expect(
          result.status
        )
          .toBe(
            EXECUTOR_RESULT_STATUS
              .SUCCEEDED
          );

        expect(
          result.success
        )
          .toBe(
            true
          );

        expect(
          result.changed
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
      "disabled capability cannot execute",
      async () => {
        const registry =
          new ExecutorRegistry();

        registry.register(
          definition({
            enabled:
              false,
          })
        );

        await expect(
          registry.execute(
            "kubernetes.restartDeployment",
            {},
            {
              authorizationVerified:
                true,
            }
          )
        )
          .rejects
          .toMatchObject({
            code:
              EXECUTOR_ERROR
                .CAPABILITY_DISABLED,
          });
      }
    );

    test(
      "validator can reject executor input",
      async () => {
        const registry =
          new ExecutorRegistry();

        registry.register(
          definition({
            validate:
              (
                input
              ) => ({
                valid:
                  Boolean(
                    input.namespace &&
                    input.deployment
                  ),

                reason:
                  "namespace and deployment required",
              }),
          })
        );

        await expect(
          registry.execute(
            "kubernetes.restartDeployment",
            {},
            {
              authorizationVerified:
                true,
            }
          )
        )
          .rejects
          .toMatchObject({
            code:
              EXECUTOR_ERROR
                .INVALID_INPUT,
          });
      }
    );

    test(
      "handler failures become safe failed results",
      async () => {
        const registry =
          new ExecutorRegistry();

        registry.register(
          definition({
            handler:
              async () => {
                throw Object.assign(
                  new Error(
                    "cluster unavailable"
                  ),
                  {
                    code:
                      "CLUSTER_UNAVAILABLE",
                  }
                );
              },
          })
        );

        const result =
          await registry
            .execute(
              "kubernetes.restartDeployment",
              {},
              {
                authorizationVerified:
                  true,
              }
            );

        expect(
          result.status
        )
          .toBe(
            EXECUTOR_RESULT_STATUS
              .FAILED
          );

        expect(
          result.success
        )
          .toBe(
            false
          );

        expect(
          result.error.code
        )
          .toBe(
            "CLUSTER_UNAVAILABLE"
          );
      }
    );

    test(
      "lists capabilities deterministically",
      () => {
        const registry =
          new ExecutorRegistry();

        registry.register(
          definition({
            capability:
              "docker.restartContainer",

            domain:
              EXECUTOR_DOMAIN
                .DOCKER,
          })
        );

        registry.register(
          definition()
        );

        expect(
          registry
            .list()
            .map(
              (
                item
              ) =>
                item.capability
            )
        )
          .toEqual([
            "docker.restartContainer",
            "kubernetes.restartDeployment",
          ]);
      }
    );
  }
);