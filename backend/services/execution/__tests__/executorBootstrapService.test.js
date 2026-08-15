"use strict";

const {
  ExecutorRegistry,
} =
  require(
    "../executorRegistry"
  );

const {
  ExecutorBootstrapService,
  INITIAL_CAPABILITIES,
} =
  require(
    "../executorBootstrapService"
  );

describe(
  "ExecutorBootstrapService",
  () => {
    test(
      "registers default capabilities",
      () => {
        const registry =
          new ExecutorRegistry();

        const service =
          new ExecutorBootstrapService({
            registry,
          });

        const result =
          service
            .registerDefaults();

        expect(
          result.registered
        )
          .toBe(
            true
          );

        expect(
          result.count
        )
          .toBe(
            INITIAL_CAPABILITIES
              .length
          );

        for (
          const definition
          of INITIAL_CAPABILITIES
        ) {
          expect(
            registry.has(
              definition
                .capability
            )
          )
            .toBe(
              true
            );
        }
      }
    );

    test(
      "registration is idempotent",
      () => {
        const registry =
          new ExecutorRegistry();

        const service =
          new ExecutorBootstrapService({
            registry,
          });

        service
          .registerDefaults();

        service
          .registerDefaults();

        expect(
          registry
            .list()
        )
          .toHaveLength(
            INITIAL_CAPABILITIES
              .length
          );
      }
    );

    test(
      "default adapters do not mutate infrastructure yet",
      async () => {
        const registry =
          new ExecutorRegistry();

        const service =
          new ExecutorBootstrapService({
            registry,
          });

        service
          .registerDefaults();

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
          result.success
        )
          .toBe(
            false
          );

        expect(
          result.error.code
        )
          .toBe(
            "EXECUTOR_ADAPTER_NOT_IMPLEMENTED"
          );
      }
    );
  }
);