"use strict";

/**
 * Phase 18.15
 *
 * Historical execution records are evidence.
 *
 * They may influence confidence and ranking, but:
 *
 *   historical success != authorization
 *   historical frequency != safety
 *   previous approval != future approval
 */
class HistoricalEffectivenessEngine {
  evaluate({
    playbookId = null,
    runbookId = null,
    executions = [],
    minimumSampleSize = 3,
  } = {}) {
    const relevant =
      (Array.isArray(executions)
        ? executions
        : []
      ).filter(
        (execution) =>
          this._matches({
            execution,
            playbookId,
            runbookId,
          })
      );

    const successful =
      relevant.filter(
        (execution) =>
          normalizeStatus(
            execution.status
          ) === "SUCCEEDED"
      );

    const failed =
      relevant.filter(
        (execution) =>
          [
            "FAILED",
            "ROLLBACK_FAILED",
          ].includes(
            normalizeStatus(
              execution.status
            )
          )
      );

    const rolledBack =
      relevant.filter(
        (execution) =>
          [
            "ROLLED_BACK",
            "ROLLING_BACK",
            "ROLLBACK_PENDING",
          ].includes(
            normalizeStatus(
              execution.status
            )
          )
      );

    const escalated =
      relevant.filter(
        (execution) =>
          normalizeStatus(
            execution.status
          ) === "ESCALATED" ||
          execution.escalated === true
      );

    const verificationSucceeded =
      relevant.filter(
        (execution) =>
          verificationPassed(
            execution
          )
      );

    const durations =
      relevant
        .map(
          (execution) =>
            Number(
              execution.durationMs ??
              execution.timing?.durationMs
            )
        )
        .filter(
          (value) =>
            Number.isFinite(value) &&
            value >= 0
        );

    const sampleSize =
      relevant.length;

    const successRate =
      ratio(
        successful.length,
        sampleSize
      );

    const verifiedRecoveryRate =
      ratio(
        verificationSucceeded.length,
        sampleSize
      );

    const failureRate =
      ratio(
        failed.length,
        sampleSize
      );

    const rollbackRate =
      ratio(
        rolledBack.length,
        sampleSize
      );

    const escalationRate =
      ratio(
        escalated.length,
        sampleSize
      );

    const sampleConfidence =
      sampleSize === 0
        ? 0
        : Math.min(
            1,
            sampleSize /
              Math.max(
                1,
                minimumSampleSize
              )
          );

    /**
     * Verification matters more than a raw command-success status.
     */
    const effectivenessScore =
      clamp(
        (
          successRate * 0.40 +
          verifiedRecoveryRate * 0.40 +
          (
            1 - failureRate
          ) * 0.10 +
          (
            1 - escalationRate
          ) * 0.10
        ) *
        sampleConfidence
      );

    return {
      playbookId,
      runbookId,

      sampleSize,

      sufficientHistory:
        sampleSize >=
        minimumSampleSize,

      successfulExecutions:
        successful.length,

      failedExecutions:
        failed.length,

      rolledBackExecutions:
        rolledBack.length,

      escalatedExecutions:
        escalated.length,

      verifiedRecoveries:
        verificationSucceeded.length,

      successRate,
      verifiedRecoveryRate,
      failureRate,
      rollbackRate,
      escalationRate,

      averageDurationMs:
        average(
          durations
        ),

      effectivenessScore,

      sampleConfidence,

      historicalEvidenceOnly:
        true,

      executionAuthorized:
        false,
    };
  }

  _matches({
    execution,
    playbookId,
    runbookId,
  }) {
    if (
      playbookId &&
      execution.playbookId !==
        playbookId
    ) {
      return false;
    }

    if (
      runbookId &&
      execution.runbookId !==
        runbookId
    ) {
      return false;
    }

    return true;
  }
}

function verificationPassed(
  execution
) {
  const result =
    execution.verificationResult ||
    execution.outcome?.verification ||
    execution.verification ||
    null;

  if (!result) {
    return false;
  }

  return (
    result.passed === true ||
    result.success === true ||
    result.verified === true ||
    result.status === "SUCCEEDED" ||
    result.status === "PASSED"
  );
}

function normalizeStatus(
  value
) {
  return String(
    value || ""
  ).toUpperCase();
}

function ratio(
  numerator,
  denominator
) {
  if (!denominator) {
    return 0;
  }

  return numerator /
    denominator;
}

function average(
  values
) {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (total, value) =>
        total + value,
      0
    ) /
    values.length
  );
}

function clamp(
  value
) {
  return Math.max(
    0,
    Math.min(
      1,
      Number(value) || 0
    )
  );
}

module.exports =
  HistoricalEffectivenessEngine;