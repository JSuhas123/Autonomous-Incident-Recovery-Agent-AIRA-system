
"use strict";

const {
  sameScope,
  scopeKey,
} =
  require(
    "./tenantIsolationModel"
  );


const ASSERTION_VERSION =
  "21.10C-v1";


const CRITICAL_OPERATION_TYPES =
  new Set([
    "READ",

    "MUTATION",

    "EXECUTION",

    "CREDENTIAL_ACCESS",

    "RESOURCE_GRAPH_ACCESS",

    "KNOWLEDGE_ACCESS",

    "COVERAGE_ACCESS",

    "RECOVERY",

    "QUEUE_DELIVERY",

    "IDEMPOTENCY_CLAIM",
  ]);


function evaluateTenantIsolation(
  input = {}
) {
  const tenants =
    Array.isArray(
      input.tenants
    )
      ? input.tenants
      : [];


  const observations =
    Array.isArray(
      input.observations
    )
      ? input.observations
      : [];


  const baselineByTenant =
    input.baselineByTenant ||
    {};


  const experimentByTenant =
    input.experimentByTenant ||
    {};


  const thresholds = {
    minControlThroughputRatio:
      finite(
        input
          .thresholds
          ?.minControlThroughputRatio,
        0.8
      ),

    maxControlP95LatencyFactor:
      finite(
        input
          .thresholds
          ?.maxControlP95LatencyFactor,
        3
      ),

    maxControlErrorRateIncrease:
      finite(
        input
          .thresholds
          ?.maxControlErrorRateIncrease,
        0.02
      ),
  };


  const boundaryViolations =
    [];


  for (
    const observation
    of observations
  ) {
    const type =
      String(
        observation.type ||
        ""
      )
        .toUpperCase();


    if (
      !CRITICAL_OPERATION_TYPES
        .has(
          type
        )
    ) {
      continue;
    }


    if (
      !observation.sourceScope ||
      !observation.targetScope
    ) {
      continue;
    }


    if (
      !sameScope(
        observation.sourceScope,
        observation.targetScope
      )
    ) {
      boundaryViolations.push({
        type,

        sourceScope:
          scopeKey(
            observation.sourceScope
          ),

        targetScope:
          scopeKey(
            observation.targetScope
          ),

        correlationId:
          observation.correlationId ||
          null,
      });
    }
  }


  const tenantResults =
    tenants.map(
      (
        tenant
      ) => {
        const key =
          scopeKey(
            tenant
          );


        const baseline =
          baselineByTenant[
            key
          ] ||
          {};


        const experiment =
          experimentByTenant[
            key
          ] ||
          {};


        const baselineThroughput =
          finite(
            baseline
              .successfulRatePerSecond,
            0
          );


        const experimentThroughput =
          finite(
            experiment
              .successfulRatePerSecond,
            0
          );


        const baselineP95 =
          Math.max(
            1,

            finite(
              baseline
                .p95LatencyMs,
              1
            )
          );


        const experimentP95 =
          finite(
            experiment
              .p95LatencyMs,
            baselineP95
          );


        const baselineError =
          finite(
            baseline
              .errorRate,
            0
          );


        const experimentError =
          finite(
            experiment
              .errorRate,
            0
          );


        const throughputRatio =
          baselineThroughput >
          0
            ? experimentThroughput /
              baselineThroughput
            : 1;


        const latencyFactor =
          experimentP95 /
          baselineP95;


        const errorRateIncrease =
          Math.max(
            0,

            experimentError -
            baselineError
          );


        const errorFactor =
          1 +
          (
            errorRateIncrease /
            Math.max(
              thresholds
                .maxControlErrorRateIncrease,
              0.000001
            )
          );


        /*
         * Tenant Interference Factor:
         *
         * 1.0 = no meaningful degradation.
         *
         * Larger values represent increased tenant interference.
         *
         * This does NOT authorize anything.
         */
        const tenantInterferenceFactor =
          Math.max(
            latencyFactor,

            throughputRatio >
            0
              ? 1 /
                throughputRatio
              : Number
                  .POSITIVE_INFINITY,

            errorFactor
          );


        const isControl =
          tenant.role ===
          "CONTROL";


        const starved =
          isControl &&
          (
            throughputRatio <
              thresholds
                .minControlThroughputRatio ||

            latencyFactor >
              thresholds
                .maxControlP95LatencyFactor ||

            errorRateIncrease >
              thresholds
                .maxControlErrorRateIncrease
          );


        return {
          tenantId:
            tenant.tenantId,

          organizationId:
            tenant.organizationId,

          environmentId:
            tenant.environmentId,

          role:
            tenant.role,

          throughputRatio,

          latencyFactor,

          errorRateIncrease,

          tenantInterferenceFactor,

          starved,

          executionAuthorized:
            false,
        };
      }
    );


  const starvedControls =
    tenantResults
      .filter(
        (
          result
        ) =>
          result.role ===
            "CONTROL" &&
          result.starved
      );


  const pass =
    boundaryViolations.length ===
      0 &&
    starvedControls.length ===
      0;


  return {
    assertionVersion:
      ASSERTION_VERSION,

    pass,

    boundaryViolations,

    tenantResults,

    starvedControlTenants:
      starvedControls
        .map(
          (
            result
          ) =>
            result.tenantId
        ),

    thresholds,

    executionAuthorized:
      false,
  };
}


function assertTenantIsolation(
  input
) {
  const result =
    evaluateTenantIsolation(
      input
    );


  if (
    !result.pass
  ) {
    throw Object.assign(
      new Error(
        `Tenant isolation failed: boundaryViolations=${result.boundaryViolations.length}, starvedControls=${result.starvedControlTenants.length}`
      ),

      {
        name:
          "Phase21TenantIsolationAssertionError",

        code:
          result
            .boundaryViolations
            .length >
          0
            ? "PHASE21_CROSS_TENANT_BOUNDARY_VIOLATION"
            : "PHASE21_NOISY_NEIGHBOR_STARVATION",

        result,

        executionAuthorized:
          false,
      }
    );
  }


  return result;
}


function finite(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;
}


module.exports = {
  ASSERTION_VERSION,

  CRITICAL_OPERATION_TYPES,

  evaluateTenantIsolation,

  assertTenantIsolation,
};