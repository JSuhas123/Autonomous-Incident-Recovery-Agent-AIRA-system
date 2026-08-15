"use strict";

/**
 * AIRA Health Verification Service
 *
 * Phase 9.3
 *
 * Performs post-execution health verification.
 *
 * Checks may include:
 *
 * - service health
 * - readiness
 * - liveness
 * - resource readiness
 * - dependency reachability
 *
 * DOES NOT:
 *
 * - close incidents
 * - authorize execution
 * - trigger rollback directly
 */

const {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
  createVerificationCheckResult,
} =
  require(
    "./verificationContracts"
  );

class HealthVerificationService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async verify(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const healthChecks =
      input.verificationPlan
        .checks
        .filter(
          (
            check
          ) =>
            [
              VERIFICATION_DIMENSION
                .HEALTH,

              VERIFICATION_DIMENSION
                .RESOURCE_STATE,

              VERIFICATION_DIMENSION
                .DEPENDENCY_STATE,
            ].includes(
              check.dimension
            )
        );

    const results =
      [];

    for (
      const check
      of healthChecks
    ) {
      results.push(
        await this.verifyCheck(
          check,
          input,
          dependencies
        )
      );
    }

    return {
      dimension:
        VERIFICATION_DIMENSION
          .HEALTH,

      checkCount:
        results.length,

      passedCount:
        results.filter(
          (
            result
          ) =>
            result.passed ===
            true
        )
          .length,

      failedCount:
        results.filter(
          (
            result
          ) =>
            result.failed ===
            true
        )
          .length,

      inconclusiveCount:
        results.filter(
          (
            result
          ) =>
            result.inconclusive ===
            true
        )
          .length,

      checks:
        results,

      executionAuthorized:
        false,

      verificationVersion:
        "phase9.3-v1",
    };
  }

  // ==========================================================================
  // CHECK ROUTER
  // ==========================================================================

  async verifyCheck(
    check,
    input,
    dependencies
  ) {
    const type =
      normalizeText(
        check.type
      );

    if (
      [
        "service_health",
        "health",
      ].includes(
        type
      )
    ) {
      return this.verifyServiceHealth(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "deployment_ready",
        "resource_ready",
        "pod_ready",
      ].includes(
        type
      )
    ) {
      return this.verifyResourceReadiness(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "liveness",
        "service_liveness",
      ].includes(
        type
      )
    ) {
      return this.verifyLiveness(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "readiness",
        "service_readiness",
      ].includes(
        type
      )
    ) {
      return this.verifyReadiness(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "dependency_health",
        "dependency_reachable",
      ].includes(
        type
      )
    ) {
      return this.verifyDependency(
        check,
        input,
        dependencies
      );
    }

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        check.dimension,

      status:
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

      reasons: [
        `Unsupported health verification type: ${check.type}`,
      ],

      warnings: [
        "No matching health verifier is registered.",
      ],

      metadata: {
        verifier:
          "healthVerificationService",
      },
    });
  }

  // ==========================================================================
  // SERVICE HEALTH
  // ==========================================================================

  async verifyServiceHealth(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getServiceHealth !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Service health provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getServiceHealth({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              executionRequestId:
                input.executionRequestId,

              serviceId:
                check.parameters
                  ?.serviceId ||
                input.context
                  ?.service
                  ?.id ||
                null,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const completedAt =
        new Date();

      const healthy =
        result
          ?.healthy ===
          true ||
        normalizeText(
          result
            ?.status
        ) ===
          "healthy" ||
        normalizeText(
          result
            ?.status
        ) ===
          "ready";

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          check.dimension,

        status:
          healthy
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          healthy
            ? 1
            : 0,

        observedValue:
          result
            ?.status ??
          result
            ?.healthy ??
          null,

        expectedValue:
          check.expectedValue ??
          "healthy",

        evidence:
          result
            ?.evidence ||
          [],

        reasons:
          healthy
            ? [
                "Service health check passed.",
              ]
            : [
                result
                  ?.reason ||
                "Service health check failed.",
              ],

        startedAt,

        completedAt,

        metadata: {
          verifier:
            "service_health",

          raw:
            sanitizeEvidence(
              result
            ),
        },
      });
    } catch (
      error
    ) {
      return this.handleError(
        check,
        error,
        startedAt
      );
    }
  }

  // ==========================================================================
  // RESOURCE READINESS
  // ==========================================================================

  async verifyResourceReadiness(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getResourceReadiness !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Resource readiness provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getResourceReadiness({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              resourceType:
                check.parameters
                  ?.resourceType ||
                input.context
                  ?.resource
                  ?.type ||
                null,

              resourceId:
                check.parameters
                  ?.resourceId ||
                input.context
                  ?.resource
                  ?.id ||
                input.context
                  ?.service
                  ?.id ||
                null,

              namespace:
                check.parameters
                  ?.namespace ||
                input.context
                  ?.service
                  ?.namespace ||
                null,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const completedAt =
        new Date();

      const ready =
        result
          ?.ready ===
          true ||
        normalizeText(
          result
            ?.status
        ) ===
          "ready" ||
        normalizeText(
          result
            ?.status
        ) ===
          "healthy";

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          check.dimension,

        status:
          ready
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          ready
            ? 1
            : 0,

        observedValue:
          result
            ?.status ??
          result
            ?.ready ??
          null,

        expectedValue:
          check.expectedValue ??
          "ready",

        evidence:
          result
            ?.evidence ||
          [],

        reasons:
          ready
            ? [
                "Resource readiness check passed.",
              ]
            : [
                result
                  ?.reason ||
                "Resource is not ready.",
              ],

        startedAt,

        completedAt,

        metadata: {
          verifier:
            "resource_readiness",

          raw:
            sanitizeEvidence(
              result
            ),
        },
      });
    } catch (
      error
    ) {
      return this.handleError(
        check,
        error,
        startedAt
      );
    }
  }

  // ==========================================================================
  // LIVENESS
  // ==========================================================================

  async verifyLiveness(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getLiveness !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Liveness provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getLiveness({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const completedAt =
        new Date();

      const alive =
        result
          ?.alive ===
          true ||
        normalizeText(
          result
            ?.status
        ) ===
          "alive";

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          check.dimension,

        status:
          alive
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          alive
            ? 1
            : 0,

        observedValue:
          result
            ?.alive ??
          result
            ?.status ??
          null,

        expectedValue:
          true,

        evidence:
          result
            ?.evidence ||
          [],

        reasons:
          alive
            ? [
                "Liveness check passed.",
              ]
            : [
                result
                  ?.reason ||
                "Liveness check failed.",
              ],

        startedAt,

        completedAt,
      });
    } catch (
      error
    ) {
      return this.handleError(
        check,
        error,
        startedAt
      );
    }
  }

  // ==========================================================================
  // READINESS
  // ==========================================================================

  async verifyReadiness(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getReadiness !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Readiness provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getReadiness({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const completedAt =
        new Date();

      const ready =
        result
          ?.ready ===
          true ||
        normalizeText(
          result
            ?.status
        ) ===
          "ready";

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          check.dimension,

        status:
          ready
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          ready
            ? 1
            : 0,

        observedValue:
          result
            ?.ready ??
          result
            ?.status ??
          null,

        expectedValue:
          true,

        evidence:
          result
            ?.evidence ||
          [],

        reasons:
          ready
            ? [
                "Readiness check passed.",
              ]
            : [
                result
                  ?.reason ||
                "Readiness check failed.",
              ],

        startedAt,

        completedAt,
      });
    } catch (
      error
    ) {
      return this.handleError(
        check,
        error,
        startedAt
      );
    }
  }

  // ==========================================================================
  // DEPENDENCY
  // ==========================================================================

  async verifyDependency(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getDependencyHealth !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Dependency health provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getDependencyHealth({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,

              dependencyId:
                check.parameters
                  ?.dependencyId ||
                null,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const completedAt =
        new Date();

      const healthy =
        result
          ?.healthy ===
          true ||
        result
          ?.reachable ===
          true;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          check.dimension,

        status:
          healthy
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          healthy
            ? 1
            : 0,

        observedValue:
          result
            ?.status ??
          result
            ?.reachable ??
          result
            ?.healthy ??
          null,

        expectedValue:
          true,

        evidence:
          result
            ?.evidence ||
          [],

        reasons:
          healthy
            ? [
                "Dependency health check passed.",
              ]
            : [
                result
                  ?.reason ||
                "Dependency health check failed.",
              ],

        startedAt,

        completedAt,
      });
    } catch (
      error
    ) {
      return this.handleError(
        check,
        error,
        startedAt
      );
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  inconclusive(
    check,
    reason
  ) {
    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        check.dimension,

      status:
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

      reasons: [
        reason,
      ],

      metadata: {
        verifier:
          "healthVerificationService",
      },
    });
  }

  handleError(
    check,
    error,
    startedAt
  ) {
    const timedOut =
      error.code ===
      "HEALTH_VERIFICATION_TIMEOUT";

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        check.dimension,

      status:
        timedOut
          ? VERIFICATION_CHECK_STATUS
              .TIMED_OUT
          : VERIFICATION_CHECK_STATUS
              .ERROR,

      reasons: [
        String(
          error.message ||
          "Health verification failed"
        ),
      ],

      warnings: [
        error.code ||
        "HEALTH_VERIFICATION_ERROR",
      ],

      startedAt,

      completedAt:
        new Date(),

      metadata: {
        verifier:
          "healthVerificationService",
      },
    });
  }

  async withTimeout(
    promise,
    timeoutMs
  ) {
    const timeout =
      Number.isFinite(
        Number(
          timeoutMs
        )
      )
        ? Math.max(
            1,
            Number(
              timeoutMs
            )
          )
        : 60000;

    let timer;

    try {
      return await Promise.race([
        promise,

        new Promise(
          (
            _resolve,
            reject
          ) => {
            timer =
              setTimeout(
                () => {
                  reject(
                    Object.assign(
                      new Error(
                        `Health verification timed out after ${timeout}ms`
                      ),
                      {
                        code:
                          "HEALTH_VERIFICATION_TIMEOUT",
                      }
                    )
                  );
                },
                timeout
              );
          }
        ),
      ]);
    } finally {
      if (
        timer
      ) {
        clearTimeout(
          timer
        );
      }
    }
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Health verification input is required"
        ),
        {
          code:
            "HEALTH_VERIFICATION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Health verification requires organization, environment and incident scope"
        ),
        {
          code:
            "HEALTH_VERIFICATION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Health verification requires executionRequestId"
        ),
        {
          code:
            "HEALTH_VERIFICATION_EXECUTION_REQUEST_REQUIRED",
        }
      );
    }

    if (
      !input.verificationPlan ||
      !Array.isArray(
        input
          .verificationPlan
          .checks
      )
    ) {
      throw Object.assign(
        new Error(
          "Health verification requires verification plan"
        ),
        {
          code:
            "HEALTH_VERIFICATION_PLAN_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Health verification cannot authorize execution"
        ),
        {
          code:
            "HEALTH_VERIFICATION_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeText(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return "";
  }

  return String(
    value
  )
    .trim()
    .toLowerCase();
}

function sanitizeEvidence(
  value
) {
  if (
    value ===
      undefined
  ) {
    return null;
  }

  try {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  } catch (
    error
  ) {
    return null;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new HealthVerificationService();

module.exports
  .HealthVerificationService =
  HealthVerificationService;