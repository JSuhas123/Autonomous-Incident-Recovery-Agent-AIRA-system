"use strict";


const {
  RecoveryOutcomeStatisticsService,

  wilsonInterval,
} =
  require(
    "../../services/certification/recoveryOutcomeStatisticsService"
  );


const {
  EvidenceSufficiencyService,
} =
  require(
    "../../services/certification/evidenceSufficiencyService"
  );


const {
  EVIDENCE_SUFFICIENCY_STATUS,
} =
  require(
    "../../constants/recoveryCertificationMetrics"
  );


describe(
  "Phase 22.4 Recovery Outcome Statistics",

  () => {
    const statisticsService =
      new RecoveryOutcomeStatisticsService();


    function sample(
      index,
      overrides = {}
    ) {
      return {
        sampleId:
          `sample_${index}`,

        experimentRunId:
          `experiment_${Math.floor(
            index /
            10
          )}`,

        failureMode:
          index %
            2 ===
            0
            ? "kubernetes.pod.crash"
            : "kubernetes.pod.crashloop",

        infrastructureContext:
          index %
            2 ===
            0
            ? "kind-cluster-a"
            : "kind-cluster-b",

        diagnosisCorrect:
          true,

        recoverySelectionCorrect:
          true,

        executionAttempted:
          true,

        executionSucceeded:
          true,

        recoveryVerified:
          true,

        falseRecovery:
          false,

        recurrenceDetected:
          false,

        rollbackAttempted:
          true,

        rollbackSucceeded:
          true,

        manualEscalation:
          false,

        verificationPerformed:
          true,

        evidenceComplete:
          true,

        unauthorizedAction:
          false,

        authorityLeak:
          false,

        safetyViolation:
          false,

        observedAt:
          new Date(
            Date.UTC(
              2026,
              7,
              1 +
                index
            )
          )
            .toISOString(),

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    test(
      "calculates deterministic recovery statistics",

      () => {
        const samples =
          Array.from(
            {
              length:
                100,
            },

            (
              _,
              index
            ) =>
              sample(
                index
              )
          );


        samples[0]
          .diagnosisCorrect =
          false;

        samples[1]
          .recoveryVerified =
          false;

        samples[1]
          .falseRecovery =
          true;

        samples[2]
          .recurrenceDetected =
          true;


        const result =
          statisticsService
            .calculate({
              samples,
            });


        expect(
          result.totalTests
        )
          .toBe(
            100
          );


        expect(
          result
            .rates
            .diagnosisCorrect
            .rate
        )
          .toBeCloseTo(
            0.99
          );


        expect(
          result
            .rates
            .verifiedRecovery
            .rate
        )
          .toBeCloseTo(
            0.99
          );


        expect(
          result
            .rates
            .falseRecovery
            .rate
        )
          .toBeCloseTo(
            0.01
          );


        expect(
          result
            .rates
            .recurrence
            .rate
        )
          .toBeCloseTo(
            0.01
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
      }
    );


    test(
      "counts independent experiments failure modes and infrastructure contexts",

      () => {
        const result =
          statisticsService
            .calculate({
              samples: [
                sample(
                  0
                ),

                sample(
                  11
                ),

                sample(
                  22
                ),
              ],
            });


        expect(
          result
            .independentExperimentCount
        )
          .toBe(
            3
          );


        expect(
          result
            .failureModeCount
        )
          .toBeGreaterThanOrEqual(
            1
          );


        expect(
          result
            .infrastructureContextCount
        )
          .toBeGreaterThanOrEqual(
            1
          );
      }
    );


    test(
      "rollback success denominator includes only rollback attempts",

      () => {
        const result =
          statisticsService
            .calculate({
              samples: [
                sample(
                  1,
                  {
                    rollbackAttempted:
                      true,

                    rollbackSucceeded:
                      true,
                  }
                ),

                sample(
                  2,
                  {
                    rollbackAttempted:
                      false,

                    rollbackSucceeded:
                      false,
                  }
                ),
              ],
            });


        expect(
          result
            .rates
            .rollbackSuccess
            .denominator
        )
          .toBe(
            1
          );


        expect(
          result
            .rates
            .rollbackSuccess
            .rate
        )
          .toBe(
            1
          );
      }
    );


    test(
      "execution success considers only attempted executions",

      () => {
        const result =
          statisticsService
            .calculate({
              samples: [
                sample(
                  1,
                  {
                    executionAttempted:
                      true,

                    executionSucceeded:
                      true,
                  }
                ),

                sample(
                  2,
                  {
                    executionAttempted:
                      false,

                    executionSucceeded:
                      false,
                  }
                ),
              ],
            });


        expect(
          result
            .rates
            .executionSuccess
            .denominator
        )
          .toBe(
            1
          );


        expect(
          result
            .rates
            .executionSuccess
            .rate
        )
          .toBe(
            1
          );
      }
    );


    test(
      "unauthorized actions authority leaks and safety violations are counted",

      () => {
        const result =
          statisticsService
            .calculate({
              samples: [
                sample(
                  1,
                  {
                    unauthorizedAction:
                      true,
                  }
                ),

                sample(
                  2,
                  {
                    authorityLeak:
                      true,
                  }
                ),

                sample(
                  3,
                  {
                    safetyViolation:
                      true,
                  }
                ),
              ],
            });


        expect(
          result.safety
        )
          .toEqual(
            expect.objectContaining({
              unauthorizedActionCount:
                1,

              authorityLeakCount:
                1,

              safetyViolationCount:
                1,

              clean:
                false,
            })
          );
      }
    );


    test(
      "statistics input cannot grant execution authority",

      () => {
        expect(
          () =>
            statisticsService
              .calculate({
                samples: [
                  sample(
                    1,
                    {
                      executionAuthorized:
                        true,
                    }
                  ),
                ],
              })
        )
          .toThrow(
            "cannot grant execution authorization"
          );
      }
    );


    test(
      "small samples produce wider Wilson confidence intervals",

      () => {
        const small =
          wilsonInterval(
            1,
            1
          );


        const large =
          wilsonInterval(
            100,
            100
          );


        expect(
          small.lower
        )
          .toBeLessThan(
            large.lower
          );


        expect(
          large.lower
        )
          .toBeGreaterThan(
            0.95
          );
      }
    );


    test(
      "empty evidence remains non-authorizing and contains null rates",

      () => {
        const result =
          statisticsService
            .calculate({
              samples:
                [],
            });


        expect(
          result.totalTests
        )
          .toBe(
            0
          );


        expect(
          result
            .rates
            .verifiedRecovery
            .rate
        )
          .toBeNull();


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


describe(
  "Phase 22.5 Statistical Confidence and Evidence Sufficiency",

  () => {
    const statisticsService =
      new RecoveryOutcomeStatisticsService();


    const sufficiencyService =
      new EvidenceSufficiencyService();


    function strongSample(
      index,
      overrides = {}
    ) {
      return {
        sampleId:
          `sample_${index}`,

        experimentRunId:
          `experiment_${Math.floor(
            index /
            10
          )}`,

        failureMode:
          index %
            2 ===
            0
            ? "kubernetes.pod.crash"
            : "kubernetes.pod.crashloop",

        infrastructureContext:
          index %
            2 ===
            0
            ? "cluster-a"
            : "cluster-b",

        diagnosisCorrect:
          true,

        recoverySelectionCorrect:
          true,

        executionAttempted:
          true,

        executionSucceeded:
          true,

        recoveryVerified:
          true,

        falseRecovery:
          false,

        recurrenceDetected:
          false,

        rollbackAttempted:
          true,

        rollbackSucceeded:
          true,

        verificationPerformed:
          true,

        evidenceComplete:
          true,

        unauthorizedAction:
          false,

        authorityLeak:
          false,

        safetyViolation:
          false,

        observedAt:
          "2026-09-01T12:00:00.000Z",

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    test(
      "sufficient evidence passes the Phase-22.5 evidence gate",

      () => {
        const statistics =
          statisticsService
            .calculate({
              samples:
                Array.from(
                  {
                    length:
                      40,
                  },

                  (
                    _,
                    index
                  ) =>
                    strongSample(
                      index
                    )
                ),
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T13:00:00.000Z",
            });


        expect(
          result.status
        )
          .toBe(
            EVIDENCE_SUFFICIENCY_STATUS
              .SUFFICIENT
          );


        expect(
          result.sufficient
        )
          .toBe(
            true
          );


        expect(
          result.safetyBlocked
        )
          .toBe(
            false
          );


        expect(
          result.qualifiedLevel
        )
          .toBeNull();


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "one perfect experiment does not become sufficient evidence",

      () => {
        const statistics =
          statisticsService
            .calculate({
              samples: [
                strongSample(
                  1
                ),
              ],
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T13:00:00.000Z",
            });


        expect(
          result.status
        )
          .toBe(
            EVIDENCE_SUFFICIENCY_STATUS
              .INSUFFICIENT_EVIDENCE
          );


        expect(
          result.failedChecks
        )
          .toEqual(
            expect.arrayContaining([
              "MINIMUM_SAMPLE_COUNT",

              "INDEPENDENT_EXPERIMENT_COUNT",

              "DIAGNOSIS_SAMPLE_COUNT",

              "RECOVERY_VERIFICATION_SAMPLE_COUNT",
            ])
          );
      }
    );


    test(
      "unauthorized action immediately safety-blocks certification sufficiency",

      () => {
        const samples =
          Array.from(
            {
              length:
                40,
            },

            (
              _,
              index
            ) =>
              strongSample(
                index
              )
          );


        samples[10]
          .unauthorizedAction =
          true;


        const statistics =
          statisticsService
            .calculate({
              samples,
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T13:00:00.000Z",
            });


        expect(
          result.status
        )
          .toBe(
            EVIDENCE_SUFFICIENCY_STATUS
              .SAFETY_BLOCKED
          );


        expect(
          result.failedChecks
        )
          .toContain(
            "ZERO_UNAUTHORIZED_ACTIONS"
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
      "authority leak safety-blocks certification",

      () => {
        const samples =
          Array.from(
            {
              length:
                40,
            },

            (
              _,
              index
            ) =>
              strongSample(
                index
              )
          );


        samples[5]
          .authorityLeak =
          true;


        const statistics =
          statisticsService
            .calculate({
              samples,
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T13:00:00.000Z",
            });


        expect(
          result.status
        )
          .toBe(
            "SAFETY_BLOCKED"
          );


        expect(
          result.failedChecks
        )
          .toContain(
            "ZERO_AUTHORITY_LEAKS"
          );
      }
    );


    test(
      "stale evidence is insufficient",

      () => {
        const statistics =
          statisticsService
            .calculate({
              samples:
                Array.from(
                  {
                    length:
                      40,
                  },

                  (
                    _,
                    index
                  ) =>
                    strongSample(
                      index,
                      {
                        observedAt:
                          "2025-01-01T00:00:00.000Z",
                      }
                    )
                ),
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T00:00:00.000Z",
            });


        expect(
          result.status
        )
          .toBe(
            "INSUFFICIENT_EVIDENCE"
          );


        expect(
          result.failedChecks
        )
          .toContain(
            "EVIDENCE_FRESHNESS"
          );
      }
    );


    test(
      "low verification coverage prevents evidence sufficiency",

      () => {
        const samples =
          Array.from(
            {
              length:
                40,
            },

            (
              _,
              index
            ) =>
              strongSample(
                index
              )
          );


        for (
          let index =
            0;

          index <
            10;

          index +=
            1
        ) {
          samples[index]
            .verificationPerformed =
            false;
        }


        const statistics =
          statisticsService
            .calculate({
              samples,
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T13:00:00.000Z",
            });


        expect(
          result.failedChecks
        )
          .toContain(
            "VERIFICATION_COVERAGE"
          );


        expect(
          result.sufficient
        )
          .toBe(
            false
          );
      }
    );


    test(
      "evidence requirements may be strengthened without changing autonomy authority",

      () => {
        const statistics =
          statisticsService
            .calculate({
              samples:
                Array.from(
                  {
                    length:
                      40,
                  },

                  (
                    _,
                    index
                  ) =>
                    strongSample(
                      index
                    )
                ),
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T13:00:00.000Z",

              requirements: {
                minimumSamples:
                  100,
              },
            });


        expect(
          result.sufficient
        )
          .toBe(
            false
          );


        expect(
          result.failedChecks
        )
          .toContain(
            "MINIMUM_SAMPLE_COUNT"
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
      "confidence summary exposes lower and upper statistical bounds",

      () => {
        const statistics =
          statisticsService
            .calculate({
              samples:
                Array.from(
                  {
                    length:
                      40,
                  },

                  (
                    _,
                    index
                  ) =>
                    strongSample(
                      index
                    )
                ),
            });


        const result =
          sufficiencyService
            .evaluate({
              statistics,

              now:
                "2026-09-01T13:00:00.000Z",
            });


        expect(
          result
            .confidenceSummary
            .verifiedRecovery
            .lower95
        )
          .toBeGreaterThan(
            0
          );


        expect(
          result
            .confidenceSummary
            .verifiedRecovery
            .upper95
        )
          .toBeLessThanOrEqual(
            1
          );
      }
    );
  }
);