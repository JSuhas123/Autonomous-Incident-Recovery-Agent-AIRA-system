"use strict";

const {
  createTenantStressModel,
  scopeKey,
} =
  require(
    "../../services/reliability/chaos/tenantIsolationModel"
  );


const {
  evaluateTenantIsolation,
} =
  require(
    "../../services/reliability/chaos/tenantIsolationAssertions"
  );


const {
  MultiTenantChaosRunner,
} =
  require(
    "../../services/reliability/chaos/multiTenantChaosRunner"
  );


describe(
  "Phase 21.10C multi-tenant chaos foundation",

  () => {
    test(
      "stress model is scoped, lab-only and non-authorizing",

      () => {
        const model =
          createTenantStressModel({
            tenantCount:
              3,

            runId:
              "run-test",

            baselineRatePerTenant:
              2,

            normalRatePerTenant:
              3,

            noisyRatePerTenant:
              9,
          });


        expect(
          model.safetyClass
        )
          .toBe(
            "LAB_ONLY"
          );


        expect(
          model.production
        )
          .toBe(
            false
          );


        expect(
          model.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          model.tenants
        )
          .toHaveLength(
            3
          );


        expect(
          model
            .tenants
            .filter(
              (
                tenant
              ) =>
                tenant.role ===
                "NOISY"
            )
        )
          .toHaveLength(
            1
          );


        expect(
          new Set(
            model
              .tenants
              .map(
                scopeKey
              )
          ).size
        )
          .toBe(
            3
          );
      }
    );


    test(
      "production target is rejected",

      () => {
        expect(
          () =>
            createTenantStressModel({
              production:
                true,
            })
        )
          .toThrow(
            /LAB_ONLY/
          );
      }
    );


    test(
      "cross-tenant critical operation fails isolation",

      () => {
        const model =
          createTenantStressModel({
            tenantCount:
              2,
          });


        const result =
          evaluateTenantIsolation({
            tenants:
              model.tenants,

            observations: [
              {
                type:
                  "MUTATION",

                sourceScope:
                  model.tenants[
                    0
                  ],

                targetScope:
                  model.tenants[
                    1
                  ],

                correlationId:
                  "corr-cross",
              },
            ],

            baselineByTenant:
              {},

            experimentByTenant:
              {},
          });


        expect(
          result.pass
        )
          .toBe(
            false
          );


        expect(
          result
            .boundaryViolations
        )
          .toHaveLength(
            1
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
      "noisy neighbor starvation is detected",

      () => {
        const model =
          createTenantStressModel({
            tenantCount:
              2,
          });


        const control =
          model
            .tenants
            .find(
              (
                tenant
              ) =>
                tenant.role ===
                "CONTROL"
            );


        const key =
          scopeKey(
            control
          );


        const result =
          evaluateTenantIsolation({
            tenants:
              model.tenants,

            baselineByTenant: {
              [key]: {
                successfulRatePerSecond:
                  10,

                p95LatencyMs:
                  10,

                errorRate:
                  0,
              },
            },

            experimentByTenant: {
              [key]: {
                successfulRatePerSecond:
                  5,

                p95LatencyMs:
                  50,

                errorRate:
                  0.1,
              },
            },
          });


        expect(
          result.pass
        )
          .toBe(
            false
          );


        expect(
          result
            .starvedControlTenants
        )
          .toContain(
            control.tenantId
          );
      }
    );


    test(
      "runner keeps same-scope observations isolated",

      async () => {
        const model =
          createTenantStressModel({
            tenantCount:
              3,

            baselineRatePerTenant:
              5,

            normalRatePerTenant:
              5,

            noisyRatePerTenant:
              10,
          });


        const runner =
          new MultiTenantChaosRunner({
            stageDurationMs:
              250,

            maxConcurrency:
              32,

            requestTimeoutMs:
              500,

            executor:
              async ({
                scope,
              }) => ({
                observation: {
                  type:
                    "READ",

                  sourceScope:
                    scope,

                  targetScope:
                    scope,
                },
              }),
          });


        const result =
          await runner.run({
            model,
          });


        expect(
          result
            .isolation
            .boundaryViolations
        )
          .toHaveLength(
            0
          );


        expect(
          result.recoveryPassed
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
  }
);