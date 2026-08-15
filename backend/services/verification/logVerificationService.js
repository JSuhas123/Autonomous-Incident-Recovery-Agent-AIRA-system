"use strict";

/**
 * AIRA Log Verification Service
 *
 * Phase 9.5
 *
 * Verifies whether post-recovery error symptoms have cleared.
 *
 * Supports:
 *
 * - generic error-rate recovery
 * - incident error fingerprints
 * - HTTP 5xx patterns
 * - CrashLoop / restart-error signatures
 * - OOM signatures
 * - connection failure signatures
 * - exception volume comparison
 *
 * DOES NOT:
 *
 * - mark incident recovered
 * - trigger rollback directly
 * - authorize execution
 */

const {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
  createVerificationCheckResult,
} =
  require(
    "./verificationContracts"
  );

class LogVerificationService {
  // ==========================================================================
  // MAIN
  // ==========================================================================

  async verify(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const logChecks =
      input.verificationPlan
        .checks
        .filter(
          (
            check
          ) =>
            check.dimension ===
            VERIFICATION_DIMENSION
              .LOGS
        );

    const results =
      [];

    for (
      const check
      of logChecks
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
          .LOGS,

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
        "phase9.5-v1",
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
        "error_rate_recovery",
        "error_volume_recovery",
        "exception_rate_recovery",
      ].includes(
        type
      )
    ) {
      return this.verifyErrorVolume(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "error_fingerprint_cleared",
        "incident_error_cleared",
      ].includes(
        type
      )
    ) {
      return this.verifyFingerprint(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "http_5xx_cleared",
        "5xx_recovery",
      ].includes(
        type
      )
    ) {
      return this.verifyPattern(
        check,
        input,
        dependencies,
        {
          patterns: [
            "\\b5\\d\\d\\b",
            "http 5xx",
            "status=5",
          ],

          name:
            "HTTP 5xx",
        }
      );
    }

    if (
      [
        "crashloop_cleared",
        "crashloop_recovery",
      ].includes(
        type
      )
    ) {
      return this.verifyPattern(
        check,
        input,
        dependencies,
        {
          patterns: [
            "crashloopbackoff",
            "back-off restarting failed container",
            "container restart",
          ],

          name:
            "CrashLoop",
        }
      );
    }

    if (
      [
        "oom_cleared",
        "oom_recovery",
      ].includes(
        type
      )
    ) {
      return this.verifyPattern(
        check,
        input,
        dependencies,
        {
          patterns: [
            "oomkilled",
            "out of memory",
            "java.lang.outofmemoryerror",
            "memory allocation failed",
          ],

          name:
            "OOM",
        }
      );
    }

    if (
      [
        "connection_errors_cleared",
        "connection_recovery",
      ].includes(
        type
      )
    ) {
      return this.verifyPattern(
        check,
        input,
        dependencies,
        {
          patterns: [
            "connection refused",
            "connection reset",
            "connection timeout",
            "econnrefused",
            "econnreset",
            "etimedout",
          ],

          name:
            "connection failure",
        }
      );
    }

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .LOGS,

      status:
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

      reasons: [
        `Unsupported log verification type: ${check.type}`,
      ],

      warnings: [
        "No matching log verifier is registered.",
      ],

      metadata: {
        verifier:
          "logVerificationService",
      },
    });
  }

  // ==========================================================================
  // ERROR VOLUME
  // ==========================================================================

  async verifyErrorVolume(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getErrorVolume !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Error-volume provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getErrorVolume({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              executionRequestId:
                input.executionRequestId,

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

      const current =
        toFiniteNumber(
          result
            ?.current ??
          result
            ?.value
        );

      const baseline =
        toFiniteNumber(
          result
            ?.baseline
        );

      const threshold =
        firstFiniteNumber(
          check.threshold,
          check.expectedValue,
          result
            ?.recoveryThreshold
        );

      if (
        current ===
        null
      ) {
        return this.inconclusive(
          check,
          "Error-volume provider did not return a numeric current value.",
          {
            evidence:
              result
                ?.evidence ||
              [],
          }
        );
      }

      let passed =
        null;

      let expected =
        threshold;

      if (
        threshold !==
        null
      ) {
        passed =
          current <=
          threshold;
      } else if (
        baseline !==
        null
      ) {
        /*
         * If no explicit threshold exists,
         * post-recovery errors should be no worse than baseline.
         */
        expected =
          baseline;

        passed =
          current <=
          baseline;
      }

      if (
        passed ===
        null
      ) {
        return this.inconclusive(
          check,
          "No error-volume threshold or baseline is available.",
          {
            observedValue:
              current,

            evidence:
              result
                ?.evidence ||
              [],
          }
        );
      }

      const completedAt =
        new Date();

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .LOGS,

        status:
          passed
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          this.calculateRecoveryScore(
            current,
            expected
          ),

        observedValue:
          current,

        expectedValue:
          expected,

        baselineValue:
          baseline,

        evidence:
          result
            ?.evidence ||
          [],

        reasons: [
          passed
            ? "Post-recovery error volume is within acceptable range."
            : "Post-recovery error volume remains above acceptable range.",
        ],

        startedAt,

        completedAt,

        metadata: {
          verifier:
            "error_volume",

          comparison:
            "<=",
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
  // INCIDENT FINGERPRINT
  // ==========================================================================

  async verifyFingerprint(
    check,
    input,
    dependencies
  ) {
    const fingerprint =
      check.parameters
        ?.fingerprint ||
      input.incident
        ?.errorFingerprint ||
      input.incident
        ?.fingerprint ||
      null;

    if (
      !fingerprint
    ) {
      return this.inconclusive(
        check,
        "Incident error fingerprint is unavailable."
      );
    }

    if (
      typeof dependencies
        .searchLogs !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Log-search provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .searchLogs({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              executionRequestId:
                input.executionRequestId,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,

              query:
                fingerprint,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const matchCount =
        this.extractMatchCount(
          result
        );

      if (
        matchCount ===
        null
      ) {
        return this.inconclusive(
          check,
          "Log provider did not return fingerprint match count.",
          {
            evidence:
              result
                ?.evidence ||
              [],
          }
        );
      }

      const allowedMatches =
        firstFiniteNumber(
          check.threshold,
          check.parameters
            ?.allowedMatches,
          0
        );

      const passed =
        matchCount <=
        allowedMatches;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .LOGS,

        status:
          passed
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          passed
            ? 1
            : 0,

        observedValue:
          matchCount,

        expectedValue:
          allowedMatches,

        evidence:
          result
            ?.evidence ||
          [],

        reasons: [
          passed
            ? "Original incident error fingerprint is no longer present."
            : "Original incident error fingerprint is still present.",
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "error_fingerprint",

          fingerprint,
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
  // GENERIC LOG PATTERN
  // ==========================================================================

  async verifyPattern(
    check,
    input,
    dependencies,
    options
  ) {
    if (
      typeof dependencies
        .searchLogs !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Log-search provider is unavailable."
      );
    }

    const patterns =
      Array.isArray(
        check.parameters
          ?.patterns
      ) &&
      check.parameters
        .patterns
        .length >
        0
        ? check.parameters
            .patterns
        : options.patterns;

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .searchLogs({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              executionRequestId:
                input.executionRequestId,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,

              patterns,

              parameters:
                check.parameters ||
                {},
            }),

          check.timeoutMs
        );

      const matchCount =
        this.extractMatchCount(
          result
        );

      if (
        matchCount ===
        null
      ) {
        return this.inconclusive(
          check,
          `Log provider did not return ${options.name} match count.`,
          {
            evidence:
              result
                ?.evidence ||
              [],
          }
        );
      }

      const allowedMatches =
        firstFiniteNumber(
          check.threshold,
          check.parameters
            ?.allowedMatches,
          0
        );

      const passed =
        matchCount <=
        allowedMatches;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .LOGS,

        status:
          passed
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          passed
            ? 1
            : 0,

        observedValue:
          matchCount,

        expectedValue:
          allowedMatches,

        evidence:
          result
            ?.evidence ||
          [],

        reasons: [
          passed
            ? `${options.name} signatures are within acceptable range.`
            : `${options.name} signatures are still present.`,
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "log_pattern",

          patternGroup:
            options.name,

          patterns,
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
  // HELPERS
  // ==========================================================================

  extractMatchCount(
    result
  ) {
    const value =
      result
        ?.matchCount ??
      result
        ?.count ??
      (
        Array.isArray(
          result
            ?.matches
        )
          ? result.matches
              .length
          : null
      );

    return toFiniteNumber(
      value
    );
  }

  calculateRecoveryScore(
    current,
    threshold
  ) {
    if (
      threshold ===
      null
    ) {
      return null;
    }

    if (
      current <=
      threshold
    ) {
      return 1;
    }

    if (
      current <=
      0
    ) {
      return 1;
    }

    return Math.max(
      0,
      Math.min(
        1,
        threshold /
        current
      )
    );
  }

  inconclusive(
    check,
    reason,
    extras = {}
  ) {
    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .LOGS,

      status:
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

      reasons: [
        reason,
      ],

      evidence:
        extras.evidence ||
        [],

      observedValue:
        extras.observedValue ??
        null,

      metadata: {
        verifier:
          "logVerificationService",
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
      "LOG_VERIFICATION_TIMEOUT";

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .LOGS,

      status:
        timedOut
          ? VERIFICATION_CHECK_STATUS
              .TIMED_OUT
          : VERIFICATION_CHECK_STATUS
              .ERROR,

      reasons: [
        String(
          error.message ||
          "Log verification failed"
        ),
      ],

      warnings: [
        error.code ||
        "LOG_VERIFICATION_ERROR",
      ],

      startedAt,

      completedAt:
        new Date(),

      metadata: {
        verifier:
          "logVerificationService",
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
                        `Log verification timed out after ${timeout}ms`
                      ),
                      {
                        code:
                          "LOG_VERIFICATION_TIMEOUT",
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
          "Log verification input is required"
        ),
        {
          code:
            "LOG_VERIFICATION_INPUT_REQUIRED",
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
          "Log verification requires organization, environment and incident scope"
        ),
        {
          code:
            "LOG_VERIFICATION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Log verification requires executionRequestId"
        ),
        {
          code:
            "LOG_VERIFICATION_EXECUTION_REQUEST_REQUIRED",
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
          "Log verification requires verification plan"
        ),
        {
          code:
            "LOG_VERIFICATION_PLAN_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Log verification cannot authorize execution"
        ),
        {
          code:
            "LOG_VERIFICATION_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// PURE HELPERS
// ==========================================================================

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

function toFiniteNumber(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const numeric =
    Number(
      value
    );

  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}

function firstFiniteNumber(
  ...values
) {
  for (
    const value
    of values
  ) {
    const numeric =
      toFiniteNumber(
        value
      );

    if (
      numeric !==
      null
    ) {
      return numeric;
    }
  }

  return null;
}

// ============================================================================
// EXPORT
// ==========================================================================

module.exports =
  new LogVerificationService();

module.exports
  .LogVerificationService =
  LogVerificationService;