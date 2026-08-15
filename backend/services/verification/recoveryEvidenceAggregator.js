"use strict";

/**
 * AIRA Recovery Evidence Aggregator
 *
 * Phase 9.7
 *
 * Combines verification outputs from:
 *
 * - health verification
 * - metrics verification
 * - logs verification
 * - incident-state verification
 *
 * Responsibilities:
 *
 * - merge all verification checks
 * - calculate completeness
 * - calculate required-check coverage
 * - detect conflicting signals
 * - preserve evidence
 * - produce canonical verification evidence package
 *
 * DOES NOT:
 *
 * - decide RECOVERED / FAILED
 * - trigger rollback
 * - authorize execution
 */

const {
  VERIFICATION_CHECK_STATUS,
} =
  require(
    "./verificationContracts"
  );

class RecoveryEvidenceAggregator {
  aggregate(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const sources = [
      {
        name:
          "health",

        result:
          input.healthResult,
      },

      {
        name:
          "metrics",

        result:
          input.metricsResult,
      },

      {
        name:
          "logs",

        result:
          input.logsResult,
      },

      {
        name:
          "incident_state",

        result:
          input.incidentStateResult,
      },
    ];

    const checks =
      [];

    const evidence =
      [];

    const warnings =
      [];

    const sourceSummaries =
      [];

    // ========================================================================
    // COLLECT SOURCES
    // ========================================================================

    for (
      const source
      of sources
    ) {
      const result =
        source.result;

      if (
        !result
      ) {
        warnings.push(
          `Verification source ${source.name} is missing.`
        );

        sourceSummaries.push({
          source:
            source.name,

          available:
            false,

          checkCount:
            0,
        });

        continue;
      }

      const sourceChecks =
        normalizeArray(
          result.checks
        );

      sourceSummaries.push({
        source:
          source.name,

        available:
          true,

        checkCount:
          sourceChecks.length,

        passedCount:
          Number(
            result.passedCount ||
            0
          ),

        failedCount:
          Number(
            result.failedCount ||
            0
          ),

        inconclusiveCount:
          Number(
            result.inconclusiveCount ||
            0
          ),
      });

      for (
        const check
        of sourceChecks
      ) {
        checks.push({
          ...check,

          source:
            source.name,
        });

        for (
          const item
          of normalizeArray(
            check.evidence
          )
        ) {
          evidence.push({
            source:
              source.name,

            checkId:
              check.checkId ||
              null,

            dimension:
              check.dimension ||
              null,

            evidence:
              item,
          });
        }
      }
    }

    // ========================================================================
    // PLAN CHECK INDEX
    // ========================================================================

    const plannedChecks =
      normalizeArray(
        input
          .verificationPlan
          ?.checks
      );

    const plannedById =
      new Map();

    for (
      const check
      of plannedChecks
    ) {
      if (
        check.checkId
      ) {
        plannedById.set(
          String(
            check.checkId
          ),
          check
        );
      }
    }

    // ========================================================================
    // CHECK COUNTS
    // ========================================================================

    const totalPlannedChecks =
      plannedChecks.length;

    const completedChecks =
      checks.filter(
        (
          check
        ) =>
          [
            VERIFICATION_CHECK_STATUS
              .PASSED,

            VERIFICATION_CHECK_STATUS
              .FAILED,

            VERIFICATION_CHECK_STATUS
              .INCONCLUSIVE,

            VERIFICATION_CHECK_STATUS
              .TIMED_OUT,

            VERIFICATION_CHECK_STATUS
              .ERROR,

            VERIFICATION_CHECK_STATUS
              .SKIPPED,
          ].includes(
            check.status
          )
      );

    const passedChecks =
      checks.filter(
        (
          check
        ) =>
          check.status ===
          VERIFICATION_CHECK_STATUS
            .PASSED
      );

    const failedChecks =
      checks.filter(
        (
          check
        ) =>
          check.status ===
          VERIFICATION_CHECK_STATUS
            .FAILED
      );

    const inconclusiveChecks =
      checks.filter(
        (
          check
        ) =>
          [
            VERIFICATION_CHECK_STATUS
              .INCONCLUSIVE,

            VERIFICATION_CHECK_STATUS
              .TIMED_OUT,

            VERIFICATION_CHECK_STATUS
              .ERROR,
          ].includes(
            check.status
          )
      );

    // ========================================================================
    // REQUIRED CHECKS
    // ========================================================================

    const requiredPlannedChecks =
      plannedChecks.filter(
        (
          check
        ) =>
          check.required !==
          false
      );

    const requiredResults =
      [];

    for (
      const planned
      of requiredPlannedChecks
    ) {
      const result =
        checks.find(
          (
            check
          ) =>
            String(
              check.checkId
            ) ===
            String(
              planned.checkId
            )
        );

      requiredResults.push({
        planned,

        result:
          result ||
          null,
      });
    }

    const requiredPassedCount =
      requiredResults.filter(
        (
          item
        ) =>
          item.result
            ?.status ===
          VERIFICATION_CHECK_STATUS
            .PASSED
      )
        .length;

    const requiredFailedCount =
      requiredResults.filter(
        (
          item
        ) =>
          item.result
            ?.status ===
          VERIFICATION_CHECK_STATUS
            .FAILED
      )
        .length;

    const requiredMissingCount =
      requiredResults.filter(
        (
          item
        ) =>
          !item.result
      )
        .length;

    const requiredInconclusiveCount =
      requiredResults.filter(
        (
          item
        ) =>
          item.result &&
          [
            VERIFICATION_CHECK_STATUS
              .INCONCLUSIVE,

            VERIFICATION_CHECK_STATUS
              .TIMED_OUT,

            VERIFICATION_CHECK_STATUS
              .ERROR,
          ].includes(
            item.result.status
          )
      )
        .length;

    // ========================================================================
    // COMPLETENESS
    // ========================================================================

    const completeness =
      totalPlannedChecks ===
        0
        ? 0
        : clamp01(
            completedChecks.length /
            totalPlannedChecks
          );

    const requiredCoverage =
      requiredPlannedChecks.length ===
        0
        ? 1
        : clamp01(
            (
              requiredPlannedChecks.length -
              requiredMissingCount
            ) /
            requiredPlannedChecks.length
          );

    const requiredSuccessRate =
      requiredPlannedChecks.length ===
        0
        ? 1
        : clamp01(
            requiredPassedCount /
            requiredPlannedChecks.length
          );

    // ========================================================================
    // SCORE
    // ========================================================================

    const scoredChecks =
      checks.filter(
        (
          check
        ) =>
          Number.isFinite(
            Number(
              check.score
            )
          )
      );

    const averageScore =
      scoredChecks.length ===
        0
        ? null
        : clamp01(
            scoredChecks.reduce(
              (
                total,
                check
              ) =>
                total +
                Number(
                  check.score
                ),
              0
            ) /
            scoredChecks.length
          );

    // ========================================================================
    // CONFLICT DETECTION
    // ========================================================================

    const conflicts =
      this.detectConflicts(
        checks
      );

    const hasConflicts =
      conflicts.length >
      0;

    // ========================================================================
    // REQUIRED CHECK FAILURES
    // ========================================================================

    const requiredFailures =
      requiredResults
        .filter(
          (
            item
          ) =>
            item.result
              ?.status ===
            VERIFICATION_CHECK_STATUS
              .FAILED
        )
        .map(
          (
            item
          ) => ({
            checkId:
              item.planned
                .checkId,

            dimension:
              item.planned
                .dimension,

            type:
              item.planned
                .type,

            result:
              item.result,
          })
        );

    // ========================================================================
    // MISSING REQUIRED CHECKS
    // ========================================================================

    const missingRequiredChecks =
      requiredResults
        .filter(
          (
            item
          ) =>
            !item.result
        )
        .map(
          (
            item
          ) => ({
            checkId:
              item.planned
                .checkId,

            dimension:
              item.planned
                .dimension,

            type:
              item.planned
                .type,
          })
        );

    // ========================================================================
    // CANONICAL PACKAGE
    // ========================================================================

    return {
      verificationPlanId:
        input
          .verificationPlan
          ?.verificationPlanId ||
        null,

      verificationPlanHash:
        input
          .verificationPlan
          ?.planHash ||
        null,

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      executionRequestId:
        input.executionRequestId,

      authorizationId:
        input.authorizationId ||
        null,

      recoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      sourceSummaries,

      checks,

      evidence:
        deduplicateEvidence(
          evidence
        ),

      totals: {
        planned:
          totalPlannedChecks,

        collected:
          checks.length,

        completed:
          completedChecks.length,

        passed:
          passedChecks.length,

        failed:
          failedChecks.length,

        inconclusive:
          inconclusiveChecks.length,
      },

      required: {
        planned:
          requiredPlannedChecks.length,

        passed:
          requiredPassedCount,

        failed:
          requiredFailedCount,

        missing:
          requiredMissingCount,

        inconclusive:
          requiredInconclusiveCount,

        failures:
          requiredFailures,

        missingChecks:
          missingRequiredChecks,
      },

      completeness,

      requiredCoverage,

      requiredSuccessRate,

      averageScore,

      conflicts,

      hasConflicts,

      warnings:
        uniqueStrings(
          warnings
        ),

      complete:
        completeness ===
          1 &&
        requiredCoverage ===
          1,

      executionAuthorized:
        false,

      aggregationVersion:
        "phase9.7-v1",

      aggregatedAt:
        new Date(),
    };
  }

  // ==========================================================================
  // CONFLICT DETECTION
  // ==========================================================================

  detectConflicts(
    checks
  ) {
    const conflicts =
      [];

    const passedByDimension =
      new Map();

    const failedByDimension =
      new Map();

    for (
      const check
      of checks
    ) {
      const dimension =
        check.dimension ||
        "UNKNOWN";

      if (
        check.status ===
        VERIFICATION_CHECK_STATUS
          .PASSED
      ) {
        if (
          !passedByDimension.has(
            dimension
          )
        ) {
          passedByDimension.set(
            dimension,
            []
          );
        }

        passedByDimension
          .get(
            dimension
          )
          .push(
            check
          );
      }

      if (
        check.status ===
        VERIFICATION_CHECK_STATUS
          .FAILED
      ) {
        if (
          !failedByDimension.has(
            dimension
          )
        ) {
          failedByDimension.set(
            dimension,
            []
          );
        }

        failedByDimension
          .get(
            dimension
          )
          .push(
            check
          );
      }
    }

    for (
      const dimension
      of new Set([
        ...passedByDimension
          .keys(),

        ...failedByDimension
          .keys(),
      ])
    ) {
      const passed =
        passedByDimension
          .get(
            dimension
          ) ||
        [];

      const failed =
        failedByDimension
          .get(
            dimension
          ) ||
        [];

      if (
        passed.length >
          0 &&
        failed.length >
          0
      ) {
        conflicts.push({
          type:
            "DIMENSION_CONFLICT",

          dimension,

          message:
            `Verification dimension ${dimension} contains both passing and failing signals.`,

          passedCheckIds:
            passed.map(
              (
                check
              ) =>
                check.checkId
            ),

          failedCheckIds:
            failed.map(
              (
                check
              ) =>
                check.checkId
            ),
        });
      }
    }

    /*
     * Strong cross-domain contradiction:
     *
     * infrastructure appears healthy but the incident itself
     * still shows failed state.
     */
    const infrastructurePassed =
      checks.some(
        (
          check
        ) =>
          [
            "HEALTH",
            "RESOURCE_STATE",
          ].includes(
            check.dimension
          ) &&
          check.status ===
            VERIFICATION_CHECK_STATUS
              .PASSED
      );

    const incidentFailed =
      checks.some(
        (
          check
        ) =>
          check.dimension ===
            "INCIDENT_STATE" &&
          check.status ===
            VERIFICATION_CHECK_STATUS
              .FAILED
      );

    if (
      infrastructurePassed &&
      incidentFailed
    ) {
      conflicts.push({
        type:
          "INFRASTRUCTURE_INCIDENT_CONFLICT",

        message:
          "Infrastructure health passed while incident-state verification still failed.",
      });
    }

    const metricsPassed =
      checks.some(
        (
          check
        ) =>
          check.dimension ===
            "METRICS" &&
          check.status ===
            VERIFICATION_CHECK_STATUS
              .PASSED
      );

    const logsFailed =
      checks.some(
        (
          check
        ) =>
          check.dimension ===
            "LOGS" &&
          check.status ===
            VERIFICATION_CHECK_STATUS
              .FAILED
      );

    if (
      metricsPassed &&
      logsFailed
    ) {
      conflicts.push({
        type:
          "METRICS_LOGS_CONFLICT",

        message:
          "Metrics appear recovered while failure signatures remain in logs.",
      });
    }

    return conflicts;
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
          "Recovery evidence aggregation input is required"
        ),
        {
          code:
            "RECOVERY_EVIDENCE_INPUT_REQUIRED",
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
          "Recovery evidence aggregation requires organization, environment and incident scope"
        ),
        {
          code:
            "RECOVERY_EVIDENCE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Recovery evidence aggregation requires executionRequestId"
        ),
        {
          code:
            "RECOVERY_EVIDENCE_EXECUTION_REQUEST_REQUIRED",
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
          "Recovery evidence aggregation requires verification plan"
        ),
        {
          code:
            "RECOVERY_EVIDENCE_PLAN_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Recovery evidence aggregation cannot authorize execution"
        ),
        {
          code:
            "RECOVERY_EVIDENCE_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ==========================================================================

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function clamp01(
  value
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      numeric
    )
  );
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      normalizeArray(
        values
      )
        .filter(
          Boolean
        )
        .map(
          String
        )
    ),
  ];
}

function deduplicateEvidence(
  evidence
) {
  const seen =
    new Set();

  const result =
    [];

  for (
    const item
    of evidence
  ) {
    let key;

    try {
      key =
        JSON.stringify(
          item
        );
    } catch (
      error
    ) {
      key =
        String(
          item
        );
    }

    if (
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    result.push(
      item
    );
  }

  return result;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new RecoveryEvidenceAggregator();

module.exports
  .RecoveryEvidenceAggregator =
  RecoveryEvidenceAggregator;