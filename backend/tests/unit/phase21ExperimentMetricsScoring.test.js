"use strict";


const {
  ExperimentMetricsScoringService,

  SCORE_CLASSIFICATION,

  SCORE_VERSION,
} =
  require(
    "../../services/reliability/experimentMetricsScoringService"
  );


describe(
  "Phase 21.18 experiment metrics and scoring",
  () => {
    let service;


    beforeEach(
      () => {
        service =
          new ExperimentMetricsScoringService();
      }
    );


    function successfulExperiment(
      overrides = {}
    ) {
      return {
        experimentRunId:
          "exprun-phase21-test",

        timestamps: {
          failureInjectedAt:
            "2026-09-01T00:00:00.000Z",

          detectedAt:
            "2026-09-01T00:00:02.000Z",

          correlatedAt:
            "2026-09-01T00:00:03.000Z",

          diagnosedAt:
            "2026-09-01T00:00:05.000Z",

          recoveryRecommendedAt:
            "2026-09-01T00:00:06.000Z",

          approvedAt:
            "2026-09-01T00:00:07.000Z",

          executionStartedAt:
            "2026-09-01T00:00:08.000Z",

          executionCompletedAt:
            "2026-09-01T00:00:10.000Z",

          verificationCompletedAt:
            "2026-09-01T00:00:15.000Z",

          recoveryConfirmedAt:
            "2026-09-01T00:00:15.000Z",

          recoveryVerified:
            true,
        },

        correctness: {
          detectionCorrect:
            true,

          correlationCorrect:
            true,

          diagnosisCorrect:
            true,

          recoverySelectionCorrect:
            true,

          executionSafetyCorrect:
            true,
        },

        safety: {
          unauthorizedActionCount:
            0,

          unsafeActionRejected:
            true,

          authorityLeakDetected:
            false,
        },

        recovery: {
          verified:
            true,

          rollbackSuccessful:
            null,

          manualEscalation:
            false,

          recurrenceDetected:
            false,

          labResetSuccessful:
            true,
        },

        counts: {
          falseRecoveryCount:
            0,

          verifiedRecoveryCount:
            1,

          recoveryVerificationCount:
            1,

          successfulRollbackCount:
            0,

          rollbackAttemptCount:
            0,

          unsafeActionRejectedCount:
            1,

          unsafeActionAttemptCount:
            1,

          recurrenceCount:
            0,

          manualEscalationCount:
            0,

          experimentCount:
            1,
        },

        executionAuthorized:
          false,

        productionCertified:
          false,

        ...overrides,
      };
    }


    test(
      "calculates deterministic latency metrics",
      () => {
        const result =
          service.calculate(
            successfulExperiment()
          );


        expect(
          result.metrics
            .latency
            .mttdMs
        )
          .toBe(
            2000
          );


        expect(
          result.metrics
            .latency
            .correlationLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .diagnosisLatencyMs
        )
          .toBe(
            2000
          );


        expect(
          result.metrics
            .latency
            .recommendationLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .approvalLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .executionQueueLatencyMs
        )
          .toBe(
            1000
          );


        expect(
          result.metrics
            .latency
            .executionLatencyMs
        )
          .toBe(
            2000
          );


        expect(
          result.metrics
            .latency
            .verificationLatencyMs
        )
          .toBe(
            5000
          );


        expect(
          result.metrics
            .latency
            .mttrMs
        )
          .toBe(
            15000
          );
      }
    );


    test(
      "scores fully successful experiment at 100",
      () => {
        const result =
          service.calculate(
            successfulExperiment()
          );


        expect(
          result.scoreVersion
        )
          .toBe(
            SCORE_VERSION
          );


        expect(
          result.score.value
        )
          .toBe(
            100
          );


        expect(
          result.score.classification
        )
          .toBe(
            SCORE_CLASSIFICATION
              .PASS
          );


        expect(
          result.score.safetyCapApplied
        )
          .toBe(
            false
          );
      }
    );


    test(
      "failed recovery reduces score",
      () => {
        const input =
          successfulExperiment();


        input.recovery = {
          ...input.recovery,

          verified:
            false,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.score.value
        )
          .toBeLessThan(
            100
          );


        expect(
          result.metrics
            .correctness
            .recoveryVerified
        )
          .toBe(
            false
          );
      }
    );


    test(
      "unauthorized action forces failing safety cap",
      () => {
        const input =
          successfulExperiment();


        input.safety = {
          ...input.safety,

          unauthorizedActionCount:
            1,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.score
            .safetyCapApplied
        )
          .toBe(
            true
          );


        expect(
          result.score.value
        )
          .toBeLessThanOrEqual(
            49
          );


        expect(
          result.score.classification
        )
          .toBe(
            SCORE_CLASSIFICATION
              .FAIL
          );
      }
    );


    test(
      "authority leak forces failing safety cap",
      () => {
        const input =
          successfulExperiment();


        input.safety = {
          ...input.safety,

          authorityLeakDetected:
            true,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.score
            .safetyCapApplied
        )
          .toBe(
            true
          );


        expect(
          result.score.classification
        )
          .toBe(
            SCORE_CLASSIFICATION
              .FAIL
          );
      }
    );


    test(
      "calculates false recovery rate",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          falseRecoveryCount:
            2,

          verifiedRecoveryCount:
            8,

          recoveryVerificationCount:
            10,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .falseRecoveryRate
        )
          .toBe(
            0.2
          );


        expect(
          result.metrics
            .rates
            .recoverySuccessRate
        )
          .toBe(
            0.8
          );
      }
    );


    test(
      "calculates rollback success rate",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          successfulRollbackCount:
            3,

          rollbackAttemptCount:
            4,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .rollbackSuccessRate
        )
          .toBe(
            0.75
          );
      }
    );


    test(
      "calculates unsafe action rejection rate",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          unsafeActionRejectedCount:
            9,

          unsafeActionAttemptCount:
            10,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .unsafeActionRejectionRate
        )
          .toBe(
            0.9
          );
      }
    );


    test(
      "calculates recurrence and manual escalation rates",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          recurrenceCount:
            2,

          recoveryVerificationCount:
            10,

          manualEscalationCount:
            3,

          experimentCount:
            10,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .recurrenceRate
        )
          .toBe(
            0.2
          );


        expect(
          result.metrics
            .rates
            .manualEscalationRate
        )
          .toBe(
            0.3
          );
      }
    );


    test(
      "zero denominator produces null rate instead of fake zero",
      () => {
        const input =
          successfulExperiment();


        input.counts = {
          ...input.counts,

          successfulRollbackCount:
            0,

          rollbackAttemptCount:
            0,
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .rates
            .rollbackSuccessRate
        )
          .toBeNull();
      }
    );


    test(
      "negative or reversed timestamps do not create negative latency",
      () => {
        const input =
          successfulExperiment();


        input.timestamps = {
          ...input.timestamps,

          failureInjectedAt:
            "2026-09-01T00:00:10.000Z",

          detectedAt:
            "2026-09-01T00:00:05.000Z",
        };


        const result =
          service.calculate(
            input
          );


        expect(
          result.metrics
            .latency
            .mttdMs
        )
          .toBeNull();
      }
    );


    test(
      "unobserved dimensions are excluded rather than silently failed",
      () => {
        const input =
          successfulExperiment();


        input.correctness = {
          detectionCorrect:
            true,

          correlationCorrect:
            null,

          diagnosisCorrect:
            null,

          recoverySelectionCorrect:
            null,

          executionSafetyCorrect:
            true,
        };


        input.recovery = {
          verified:
            true,

          rollbackSuccessful:
            null,

          manualEscalation:
            false,

          recurrenceDetected:
            false,

          labResetSuccessful:
            true,
        };


        const result =
          service.calculate(
            input
          );


        const correlation =
          result.score
            .breakdown
            .find(
              item =>
                item.dimension ===
                "correlationCorrect"
            );


        expect(
          correlation.included
        )
          .toBe(
            false
          );


        expect(
          result.score
            .possibleWeight
        )
          .toBeLessThan(
            100
          );
      }
    );


    test(
      "metrics never authorize execution",
      () => {
        const result =
          service.calculate(
            successfulExperiment()
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result.productionCertified
        )
          .toBe(
            false
          );


        expect(
          result.score
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "rejects Phase21 authority leakage",
      () => {
        expect(
          () =>
            service.calculate(
              successfulExperiment({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_METRICS_AUTHORITY_LEAK",
            })
          );
      }
    );


    test(
      "rejects production certification leakage",
      () => {
        expect(
          () =>
            service.calculate(
              successfulExperiment({
                productionCertified:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "PHASE21_METRICS_AUTHORITY_LEAK",
            })
          );
      }
    );
  }
);