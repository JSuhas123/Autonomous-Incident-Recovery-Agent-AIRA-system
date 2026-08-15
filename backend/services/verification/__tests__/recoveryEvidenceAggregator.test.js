"use strict";

const {
  RecoveryEvidenceAggregator,
} =
  require(
    "../recoveryEvidenceAggregator"
  );

const {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
  createVerificationCheckResult,
} =
  require(
    "../verificationContracts"
  );

function verificationPlan(
  checks
) {
  return {
    verificationPlanId:
      "verify-plan-1",

    planHash:
      "verify-hash-1",

    checks,
  };
}

function check(
  id,
  dimension,
  status,
  overrides = {}
) {
  return createVerificationCheckResult({
    checkId:
      id,

    dimension,

    status,

    score:
      status ===
        VERIFICATION_CHECK_STATUS
          .PASSED
        ? 1
        : status ===
            VERIFICATION_CHECK_STATUS
              .FAILED
          ? 0
          : null,

    ...overrides,
  });
}

function sourceResult(
  checks
) {
  return {
    checkCount:
      checks.length,

    passedCount:
      checks.filter(
        (
          item
        ) =>
          item.passed
      )
        .length,

    failedCount:
      checks.filter(
        (
          item
        ) =>
          item.failed
      )
        .length,

    inconclusiveCount:
      checks.filter(
        (
          item
        ) =>
          item.inconclusive
      )
        .length,

    checks,
  };
}

function baseInput(
  overrides = {}
) {
  const plannedChecks = [
    {
      checkId:
        "health",

      dimension:
        VERIFICATION_DIMENSION
          .HEALTH,

      type:
        "service_health",

      required:
        true,
    },

    {
      checkId:
        "cpu",

      dimension:
        VERIFICATION_DIMENSION
          .METRICS,

      type:
        "cpu_recovery",

      required:
        true,
    },

    {
      checkId:
        "logs",

      dimension:
        VERIFICATION_DIMENSION
          .LOGS,

      type:
        "error_rate_recovery",

      required:
        true,
    },

    {
      checkId:
        "incident",

      dimension:
        VERIFICATION_DIMENSION
          .INCIDENT_STATE,

      type:
        "alerts_cleared",

      required:
        true,
    },
  ];

  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    executionRequestId:
      "request-1",

    authorizationId:
      "auth-1",

    recoveryDecisionId:
      "recovery-1",

    verificationPlan:
      verificationPlan(
        plannedChecks
      ),

    healthResult:
      sourceResult([
        check(
          "health",
          VERIFICATION_DIMENSION
            .HEALTH,
          VERIFICATION_CHECK_STATUS
            .PASSED
        ),
      ]),

    metricsResult:
      sourceResult([
        check(
          "cpu",
          VERIFICATION_DIMENSION
            .METRICS,
          VERIFICATION_CHECK_STATUS
            .PASSED
        ),
      ]),

    logsResult:
      sourceResult([
        check(
          "logs",
          VERIFICATION_DIMENSION
            .LOGS,
          VERIFICATION_CHECK_STATUS
            .PASSED
        ),
      ]),

    incidentStateResult:
      sourceResult([
        check(
          "incident",
          VERIFICATION_DIMENSION
            .INCIDENT_STATE,
          VERIFICATION_CHECK_STATUS
            .PASSED
        ),
      ]),

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "RecoveryEvidenceAggregator",
  () => {
    test(
      "aggregates complete passing evidence package",
      () => {
        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            baseInput()
          );

        expect(
          result.totals.planned
        )
          .toBe(
            4
          );

        expect(
          result.totals.passed
        )
          .toBe(
            4
          );

        expect(
          result.completeness
        )
          .toBe(
            1
          );

        expect(
          result.requiredCoverage
        )
          .toBe(
            1
          );

        expect(
          result.requiredSuccessRate
        )
          .toBe(
            1
          );

        expect(
          result.complete
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
      "calculates partial completeness",
      () => {
        const input =
          baseInput();

        input.logsResult = {
          checkCount:
            0,

          passedCount:
            0,

          failedCount:
            0,

          inconclusiveCount:
            0,

          checks:
            [],
        };

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.completeness
        )
          .toBe(
            0.75
          );

        expect(
          result.requiredCoverage
        )
          .toBe(
            0.75
          );
      }
    );

    test(
      "tracks failed required checks",
      () => {
        const input =
          baseInput();

        input.metricsResult =
          sourceResult([
            check(
              "cpu",
              VERIFICATION_DIMENSION
                .METRICS,
              VERIFICATION_CHECK_STATUS
                .FAILED
            ),
          ]);

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.required.failed
        )
          .toBe(
            1
          );

        expect(
          result.requiredSuccessRate
        )
          .toBe(
            0.75
          );

        expect(
          result.required.failures
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "tracks missing required checks",
      () => {
        const input =
          baseInput();

        input.incidentStateResult = {
          checks:
            [],

          checkCount:
            0,
        };

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.required.missing
        )
          .toBe(
            1
          );

        expect(
          result.required
            .missingChecks
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "tracks inconclusive required checks",
      () => {
        const input =
          baseInput();

        input.logsResult =
          sourceResult([
            check(
              "logs",
              VERIFICATION_DIMENSION
                .LOGS,
              VERIFICATION_CHECK_STATUS
                .INCONCLUSIVE
            ),
          ]);

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.required
            .inconclusive
        )
          .toBe(
            1
          );
      }
    );

    test(
      "calculates average score",
      () => {
        const input =
          baseInput();

        input.healthResult =
          sourceResult([
            check(
              "health",
              VERIFICATION_DIMENSION
                .HEALTH,
              VERIFICATION_CHECK_STATUS
                .PASSED,
              {
                score:
                  1,
              }
            ),
          ]);

        input.metricsResult =
          sourceResult([
            check(
              "cpu",
              VERIFICATION_DIMENSION
                .METRICS,
              VERIFICATION_CHECK_STATUS
                .FAILED,
              {
                score:
                  0.5,
              }
            ),
          ]);

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.averageScore
        )
          .toBeGreaterThan(
            0
          );

        expect(
          result.averageScore
        )
          .toBeLessThanOrEqual(
            1
          );
      }
    );

    test(
      "detects health dimension conflicts",
      () => {
        const input =
          baseInput();

        input
          .verificationPlan
          .checks
          .push({
            checkId:
              "health-2",

            dimension:
              VERIFICATION_DIMENSION
                .HEALTH,

            type:
              "readiness",

            required:
              false,
          });

        input.healthResult =
          sourceResult([
            check(
              "health",
              VERIFICATION_DIMENSION
                .HEALTH,
              VERIFICATION_CHECK_STATUS
                .PASSED
            ),

            check(
              "health-2",
              VERIFICATION_DIMENSION
                .HEALTH,
              VERIFICATION_CHECK_STATUS
                .FAILED
            ),
          ]);

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.hasConflicts
        )
          .toBe(
            true
          );

        expect(
          result.conflicts
            .some(
              (
                conflict
              ) =>
                conflict.type ===
                "DIMENSION_CONFLICT"
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects infrastructure versus incident conflict",
      () => {
        const input =
          baseInput();

        input.incidentStateResult =
          sourceResult([
            check(
              "incident",
              VERIFICATION_DIMENSION
                .INCIDENT_STATE,
              VERIFICATION_CHECK_STATUS
                .FAILED
            ),
          ]);

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.conflicts
            .some(
              (
                conflict
              ) =>
                conflict.type ===
                "INFRASTRUCTURE_INCIDENT_CONFLICT"
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects metrics versus logs conflict",
      () => {
        const input =
          baseInput();

        input.logsResult =
          sourceResult([
            check(
              "logs",
              VERIFICATION_DIMENSION
                .LOGS,
              VERIFICATION_CHECK_STATUS
                .FAILED
            ),
          ]);

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.conflicts
            .some(
              (
                conflict
              ) =>
                conflict.type ===
                "METRICS_LOGS_CONFLICT"
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "deduplicates evidence entries",
      () => {
        const duplicateEvidence = {
          source:
            "prometheus",

          metric:
            "cpu",
        };

        const input =
          baseInput();

        input.metricsResult =
          sourceResult([
            check(
              "cpu",
              VERIFICATION_DIMENSION
                .METRICS,
              VERIFICATION_CHECK_STATUS
                .PASSED,
              {
                evidence: [
                  duplicateEvidence,
                  duplicateEvidence,
                ],
              }
            ),
          ]);

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.evidence
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "missing verification source produces warning",
      () => {
        const input =
          baseInput({
            logsResult:
              null,
          });

        const service =
          new RecoveryEvidenceAggregator();

        const result =
          service.aggregate(
            input
          );

        expect(
          result.warnings
            .some(
              (
                warning
              ) =>
                warning.includes(
                  "logs"
                )
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "never accepts execution authorization",
      () => {
        const service =
          new RecoveryEvidenceAggregator();

        expect(
          () =>
            service.aggregate({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            "cannot authorize execution"
          );
      }
    );
  }
);