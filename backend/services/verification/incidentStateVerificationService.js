"use strict";

/**
 * AIRA Incident State Verification Service
 *
 * Phase 9.6
 *
 * Verifies incident-level recovery state after execution.
 *
 * Checks may include:
 *
 * - incident resolved
 * - incident severity reduced
 * - alerts cleared
 * - original symptoms cleared
 * - no new correlated signals
 * - incident not superseded unexpectedly
 *
 * DOES NOT:
 *
 * - close incidents
 * - trigger retry
 * - trigger rollback
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

class IncidentStateVerificationService {
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

    const checks =
      input.verificationPlan
        .checks
        .filter(
          (
            check
          ) =>
            check.dimension ===
            VERIFICATION_DIMENSION
              .INCIDENT_STATE
        );

    const results =
      [];

    for (
      const check
      of checks
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
          .INCIDENT_STATE,

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
        "phase9.6-v1",
    };
  }

  // ==========================================================================
  // ROUTER
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
        "incident_resolved",
        "incident_state",
      ].includes(
        type
      )
    ) {
      return this.verifyIncidentResolved(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "alerts_cleared",
        "alert_state",
      ].includes(
        type
      )
    ) {
      return this.verifyAlertsCleared(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "severity_reduced",
        "incident_severity",
      ].includes(
        type
      )
    ) {
      return this.verifySeverityReduced(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "symptoms_cleared",
        "incident_symptoms",
      ].includes(
        type
      )
    ) {
      return this.verifySymptomsCleared(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "no_new_correlated_signals",
        "correlated_signal_state",
      ].includes(
        type
      )
    ) {
      return this.verifyNoNewSignals(
        check,
        input,
        dependencies
      );
    }

    if (
      [
        "incident_not_superseded",
        "supersession_state",
      ].includes(
        type
      )
    ) {
      return this.verifySupersession(
        check,
        input,
        dependencies
      );
    }

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .INCIDENT_STATE,

      status:
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

      reasons: [
        `Unsupported incident-state verification type: ${check.type}`,
      ],

      warnings: [
        "No matching incident-state verifier is registered.",
      ],

      metadata: {
        verifier:
          "incidentStateVerificationService",
      },
    });
  }

  // ==========================================================================
  // INCIDENT RESOLUTION
  // ==========================================================================

  async verifyIncidentResolved(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getIncidentState !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Incident-state provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getIncidentState({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,
            }),

          check.timeoutMs
        );

      const status =
        normalizeText(
          result
            ?.status
        );

      const resolved =
        result
          ?.resolved ===
          true ||
        [
          "resolved",
          "closed",
          "recovered",
        ].includes(
          status
        );

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .INCIDENT_STATE,

        status:
          resolved
            ? VERIFICATION_CHECK_STATUS
                .PASSED
            : VERIFICATION_CHECK_STATUS
                .FAILED,

        score:
          resolved
            ? 1
            : 0,

        observedValue:
          result
            ?.status ??
          result
            ?.resolved ??
          null,

        expectedValue:
          check.expectedValue ??
          "resolved",

        evidence:
          result
            ?.evidence ||
          [],

        reasons: [
          resolved
            ? "Incident state indicates recovery."
            : "Incident remains active.",
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "incident_resolved",
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
  // ALERTS
  // ==========================================================================

  async verifyAlertsCleared(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getActiveAlerts !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Alert-state provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getActiveAlerts({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              serviceId:
                input.context
                  ?.service
                  ?.id ||
                null,
            }),

          check.timeoutMs
        );

      const count =
        firstFiniteNumber(
          result
            ?.activeCount,
          result
            ?.count,
          Array.isArray(
            result
              ?.alerts
          )
            ? result.alerts
                .length
            : null
        );

      if (
        count ===
        null
      ) {
        return this.inconclusive(
          check,
          "Alert provider did not return an active alert count."
        );
      }

      const allowed =
        firstFiniteNumber(
          check.threshold,
          check.expectedValue,
          0
        );

      const passed =
        count <=
        allowed;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .INCIDENT_STATE,

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
          count,

        expectedValue:
          allowed,

        evidence:
          result
            ?.evidence ||
          [],

        reasons: [
          passed
            ? "Incident alerts are cleared."
            : "Incident-related alerts are still active.",
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "alerts_cleared",
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
  // SEVERITY
  // ==========================================================================

  async verifySeverityReduced(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getIncidentState !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Incident-state provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getIncidentState({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,
            }),

          check.timeoutMs
        );

      const current =
        normalizeSeverity(
          result
            ?.severity
      );

      const original =
        normalizeSeverity(
          input.incident
            ?.severity
      );

      if (
        current ===
          null ||
        original ===
          null
      ) {
        return this.inconclusive(
          check,
          "Incident severity could not be compared."
        );
      }

      const passed =
        current <
        original;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .INCIDENT_STATE,

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
          result
            ?.severity ??
          null,

        expectedValue:
          "lower_than_original",

        baselineValue:
          input.incident
            ?.severity ??
          null,

        reasons: [
          passed
            ? "Incident severity reduced after recovery."
            : "Incident severity has not reduced.",
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "severity_reduced",
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
  // SYMPTOMS
  // ==========================================================================

  async verifySymptomsCleared(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getActiveSymptoms !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Incident symptom provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getActiveSymptoms({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,
            }),

          check.timeoutMs
        );

      const symptoms =
        Array.isArray(
          result
            ?.symptoms
        )
          ? result.symptoms
          : [];

      const count =
        firstFiniteNumber(
          result
            ?.activeCount,
          symptoms.length
        );

      const passed =
        count ===
        0;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .INCIDENT_STATE,

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
          count,

        expectedValue:
          0,

        evidence:
          result
            ?.evidence ||
          [],

        reasons: [
          passed
            ? "Original incident symptoms are no longer active."
            : "Original incident symptoms remain active.",
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "symptoms_cleared",
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
  // NEW SIGNALS
  // ==========================================================================

  async verifyNoNewSignals(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getNewCorrelatedSignals !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Correlated-signal provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getNewCorrelatedSignals({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              executionRequestId:
                input.executionRequestId,
            }),

          check.timeoutMs
        );

      const count =
        firstFiniteNumber(
          result
            ?.count,
          Array.isArray(
            result
              ?.signals
          )
            ? result.signals
                .length
            : null
        );

      if (
        count ===
        null
      ) {
        return this.inconclusive(
          check,
          "Correlated-signal provider did not return signal count."
        );
      }

      const allowed =
        firstFiniteNumber(
          check.threshold,
          0
        );

      const passed =
        count <=
        allowed;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .INCIDENT_STATE,

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
          count,

        expectedValue:
          allowed,

        evidence:
          result
            ?.evidence ||
          [],

        reasons: [
          passed
            ? "No new correlated failure signals appeared."
            : "New correlated failure signals appeared after recovery.",
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "no_new_correlated_signals",
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
  // SUPERSESSION
  // ==========================================================================

  async verifySupersession(
    check,
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getIncidentState !==
      "function"
    ) {
      return this.inconclusive(
        check,
        "Incident-state provider is unavailable."
      );
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          dependencies
            .getIncidentState({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,
            }),

          check.timeoutMs
        );

      const superseded =
        result
          ?.superseded ===
          true ||
        Boolean(
          result
            ?.supersededByIncidentId
        );

      const passed =
        superseded ===
        false;

      return createVerificationCheckResult({
        checkId:
          check.checkId,

        dimension:
          VERIFICATION_DIMENSION
            .INCIDENT_STATE,

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
          superseded,

        expectedValue:
          false,

        reasons: [
          passed
            ? "Incident remains the active incident record."
            : "Incident was superseded by another incident.",
        ],

        startedAt,

        completedAt:
          new Date(),

        metadata: {
          verifier:
            "incident_supersession",
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

  inconclusive(
    check,
    reason
  ) {
    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .INCIDENT_STATE,

      status:
        VERIFICATION_CHECK_STATUS
          .INCONCLUSIVE,

      reasons: [
        reason,
      ],

      metadata: {
        verifier:
          "incidentStateVerificationService",
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
      "INCIDENT_STATE_VERIFICATION_TIMEOUT";

    return createVerificationCheckResult({
      checkId:
        check.checkId,

      dimension:
        VERIFICATION_DIMENSION
          .INCIDENT_STATE,

      status:
        timedOut
          ? VERIFICATION_CHECK_STATUS
              .TIMED_OUT
          : VERIFICATION_CHECK_STATUS
              .ERROR,

      reasons: [
        String(
          error.message ||
          "Incident-state verification failed"
        ),
      ],

      warnings: [
        error.code ||
        "INCIDENT_STATE_VERIFICATION_ERROR",
      ],

      startedAt,

      completedAt:
        new Date(),

      metadata: {
        verifier:
          "incidentStateVerificationService",
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
                        `Incident-state verification timed out after ${timeout}ms`
                      ),
                      {
                        code:
                          "INCIDENT_STATE_VERIFICATION_TIMEOUT",
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
          "Incident-state verification input is required"
        ),
        {
          code:
            "INCIDENT_STATE_VERIFICATION_INPUT_REQUIRED",
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
          "Incident-state verification requires organization, environment and incident scope"
        ),
        {
          code:
            "INCIDENT_STATE_VERIFICATION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Incident-state verification requires executionRequestId"
        ),
        {
          code:
            "INCIDENT_STATE_VERIFICATION_EXECUTION_REQUEST_REQUIRED",
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
          "Incident-state verification requires verification plan"
        ),
        {
          code:
            "INCIDENT_STATE_VERIFICATION_PLAN_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Incident-state verification cannot authorize execution"
        ),
        {
          code:
            "INCIDENT_STATE_VERIFICATION_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
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

function firstFiniteNumber(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value ===
        ""
    ) {
      continue;
    }

    const numeric =
      Number(
        value
      );

    if (
      Number.isFinite(
        numeric
      )
    ) {
      return numeric;
    }
  }

  return null;
}

function normalizeSeverity(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();

  const map = {
    info:
      0,

    low:
      1,

    warning:
      2,

    medium:
      2,

    high:
      3,

    critical:
      4,

    sev4:
      1,

    sev3:
      2,

    sev2:
      3,

    sev1:
      4,

    p4:
      1,

    p3:
      2,

    p2:
      3,

    p1:
      4,
  };

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        map,
        normalized
      )
  ) {
    return map[
      normalized
    ];
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

// ============================================================================
// EXPORT
// ==========================================================================

module.exports =
  new IncidentStateVerificationService();

module.exports
  .IncidentStateVerificationService =
  IncidentStateVerificationService;