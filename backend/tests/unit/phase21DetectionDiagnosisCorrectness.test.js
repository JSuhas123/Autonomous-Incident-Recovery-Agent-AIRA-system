"use strict";


const {
  AiraDiagnosisHarness,
} =
  require(
    "../../services/reliability/airaDiagnosisHarness"
  );


const {
  DetectionDiagnosisEvaluator,

  evaluateDetection,

  evaluateCorrelation,

  evaluateDiagnosis,
} =
  require(
    "../../services/reliability/detectionDiagnosisEvaluator"
  );


function buildRepositoryStub() {
  return {
    observations:
      [],

    assertions:
      [],

    metrics:
      [],


    async appendObservation(
      input
    ) {
      this.observations
        .push(
          input
        );


      return {
        ...input,

        executionAuthorized:
          false,
      };
    },


    async upsertAssertionResult(
      input
    ) {
      this.assertions
        .push(
          input
        );


      return {
        ...input,

        executionAuthorized:
          false,
      };
    },


    async upsertMetric(
      input
    ) {
      this.metrics
        .push(
          input
        );


      return {
        ...input,

        executionAuthorized:
          false,
      };
    },
  };
}


const groundTruth = {
  expectedFailureModeKey:
    "kubernetes.pod.crash",

  expectedSymptoms: [
    "pod unavailable",

    "restart or replacement pod observed",
  ],

  expectedDiagnosis:
    "KUBERNETES_POD_CRASH",
};


function buildPassingCorrelation() {
  return {
    accepted:
      true,

    duplicate:
      false,

    signalId:
      "sig_1",

    correlationObserved:
      true,

    correlationGroupId:
      "cg_1",

    incidentCandidate:
      true,

    incidentId:
      "inc_1",

    routed:
      true,

    startedAt:
      "2026-08-31T10:00:01.000Z",

    completedAt:
      "2026-08-31T10:00:01.500Z",

    executionAuthorized:
      false,
  };
}


describe(
  "Phase 21.13 + 21.14 Detection and Diagnosis Correctness",
  () => {
    test(
      "passes expected detection when a failure signal becomes an incident candidate",
      () => {
        const result =
          evaluateDetection({
            accepted:
              true,

            signalId:
              "sig_1",

            incidentCandidate:
              true,

            routed:
              true,

            executionAuthorized:
              false,
          });


        expect(
          result.status
        )
          .toBe(
            "PASS"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "EXPECTED_FAILURE_DETECTED"
          );
      }
    );


    test(
      "fails a false negative",
      () => {
        const result =
          evaluateDetection({
            accepted:
              true,

            signalId:
              "sig_1",

            incidentCandidate:
              false,

            executionAuthorized:
              false,
          });


        expect(
          result.status
        )
          .toBe(
            "FAIL"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "FAILURE_NOT_CLASSIFIED_AS_INCIDENT_CANDIDATE"
          );
      }
    );


    test(
      "passes correlation only when a correlation group is actually observed",
      () => {
        expect(
          evaluateCorrelation({
            correlationObserved:
              true,

            correlationGroupId:
              "cg_1",
          })
            .status
        )
          .toBe(
            "PASS"
          );


        expect(
          evaluateCorrelation({
            correlationObserved:
              false,

            correlationGroupId:
              null,
          })
            .status
        )
          .toBe(
            "FAIL"
          );
      }
    );


    test(
      "passes diagnosis for canonical equivalent failure-mode identity",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                "KUBERNETES_POD_CRASH",

              diagnosisOutcome:
                "DIAGNOSED",

              diagnosisConfidence:
                0.9,

              evidenceCompleteness:
                0.8,

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "PASS"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_MATCHES_GROUND_TRUTH"
          );
      }
    );


    test(
      "fails a wrong diagnosis even if a diagnosis exists",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                "postgres.connection.exhaustion",

              diagnosisOutcome:
                "DIAGNOSED",

              diagnosisConfidence:
                0.95,

              evidenceCompleteness:
                0.9,

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "FAIL"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_MISMATCHES_GROUND_TRUTH"
          );
      }
    );


    /*
     * Important:
     *
     * This specifically validates missing machine-readable identity.
     *
     * The diagnosis has positive confidence so that the evaluator reaches
     * the identity check rather than correctly stopping earlier at the
     * confidence safety gate.
     */
    test(
      "diagnosis without canonical machine-readable identity stays inconclusive",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                null,

              diagnosisOutcome:
                "INCONCLUSIVE",

              diagnosisConfidence:
                0.5,

              evidenceCompleteness:
                0.5,

              primaryHypothesisId:
                "hyp_1",

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_IDENTITY_NOT_EXPOSED"
          );
      }
    );


    test(
      "diagnosis with no observation stays inconclusive",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,
            null
          );


        expect(
          result.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_NOT_OBSERVED"
          );
      }
    );


    test(
      "diagnosis marked insufficient evidence stays inconclusive even when identity matches",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                "kubernetes.pod.crash",

              diagnosisOutcome:
                "INSUFFICIENT_EVIDENCE",

              diagnosisConfidence:
                0.91,

              evidenceCompleteness:
                0.1,

              primaryHypothesisId:
                "hyp_1",

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_INSUFFICIENT_EVIDENCE"
          );


        expect(
          result.actual
            .selectedFailureMode
        )
          .toBe(
            "kubernetes.pod.crash"
          );
      }
    );


    test(
      "diagnosis with zero confidence stays inconclusive even when identity matches",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                "kubernetes.pod.crash",

              diagnosisOutcome:
                "DIAGNOSED",

              diagnosisConfidence:
                0,

              evidenceCompleteness:
                0.9,

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_CONFIDENCE_INSUFFICIENT"
          );


        expect(
          result.actual
            .diagnosisConfidence
        )
          .toBe(
            0
          );
      }
    );


    test(
      "diagnosis with absent confidence stays inconclusive even when identity matches",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                "kubernetes.pod.crash",

              diagnosisOutcome:
                "DIAGNOSED",

              evidenceCompleteness:
                0.9,

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_CONFIDENCE_INSUFFICIENT"
          );


        expect(
          result.actual
            .diagnosisConfidence
        )
          .toBeNull();
      }
    );


    test(
      "insufficient evidence takes precedence over zero confidence",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                null,

              diagnosisOutcome:
                "INSUFFICIENT_EVIDENCE",

              diagnosisConfidence:
                0,

              evidenceCompleteness:
                0.0875,

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_INSUFFICIENT_EVIDENCE"
          );
      }
    );


    test(
      "diagnosis identity mismatch remains a real failure when confidence is positive",
      () => {
        const result =
          evaluateDiagnosis(
            groundTruth,

            {
              selectedFailureMode:
                "kubernetes.oom.killed",

              diagnosisOutcome:
                "DIAGNOSED",

              diagnosisConfidence:
                0.88,

              evidenceCompleteness:
                0.8,

              executionAuthorized:
                false,
            }
          );


        expect(
          result.status
        )
          .toBe(
            "FAIL"
          );


        expect(
          result.reasonCode
        )
          .toBe(
            "DIAGNOSIS_MISMATCHES_GROUND_TRUTH"
          );
      }
    );


    test(
      "diagnosis harness never receives evaluator ground truth",
      async () => {
        const repository =
          buildRepositoryStub();


        const coordinator = {
          async diagnose() {
            throw new Error(
              "should not execute"
            );
          },
        };


        const harness =
          new AiraDiagnosisHarness({
            repository,

            diagnosisCoordinator:
              coordinator,
          });


        await expect(
          harness.observe({
            organizationId:
              "org",

            environmentId:
              "env",

            tenantId:
              "tenant",

            experimentRunId:
              "run",

            correlationId:
              "corr",

            incidentId:
              "inc",

            diagnosisDependencies: {
              evaluatorGroundTruth:
                groundTruth,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_GROUND_TRUTH_LEAK_BLOCKED",
          });
      }
    );


    test(
      "diagnosis harness persists actual AIRA diagnosis as non-authorizing evidence",
      async () => {
        const repository =
          buildRepositoryStub();


        const coordinator = {
          async diagnose(
            scope,
            incidentId
          ) {
            expect(
              scope
                .evaluatorGroundTruth
            )
              .toBeUndefined();


            expect(
              incidentId
            )
              .toBe(
                "inc_1"
              );


            return {
              runId:
                "diagrun_1",

              incidentId,

              diagnosis: {
                recommendedIncidentType:
                  "kubernetes.pod.crash",

                outcome:
                  "DIAGNOSED",

                diagnosisConfidence:
                  0.87,

                evidenceCompleteness:
                  0.8,

                primaryHypothesisId:
                  "hyp_1",

                primaryHypothesis: {
                  id:
                    "hyp_1",

                  title:
                    "Pod crash",

                  category:
                    "infrastructure",

                  rootCause:
                    "Kubernetes pod terminated",

                  confidence:
                    0.87,
                },

                supportingEvidenceIds: [
                  "ev_1",
                ],

                contradictingEvidenceIds:
                  [],

                executionAuthorized:
                  false,
              },

              executionAuthorized:
                false,
            };
          },
        };


        const harness =
          new AiraDiagnosisHarness({
            repository,

            diagnosisCoordinator:
              coordinator,

            now:
              (() => {
                const values = [
                  new Date(
                    "2026-08-31T10:00:00.000Z"
                  ),

                  new Date(
                    "2026-08-31T10:00:00.250Z"
                  ),
                ];


                return () =>
                  values.shift();
              })(),
          });


        const result =
          await harness.observe({
            organizationId:
              "org",

            environmentId:
              "env",

            tenantId:
              "tenant",

            experimentRunId:
              "run",

            correlationId:
              "corr",

            incidentId:
              "inc_1",
          });


        expect(
          result.selectedFailureMode
        )
          .toBe(
            "kubernetes.pod.crash"
          );


        expect(
          result.durationMs
        )
          .toBe(
            250
          );


        expect(
          result.groundTruthConsumed
        )
          .toBe(
            false
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          repository.observations
        )
          .toHaveLength(
            1
          );
      }
    );


    test(
      "combined evaluator persists DETECTED, CORRELATED and DIAGNOSIS_CORRECT plus metrics",
      async () => {
        const repository =
          buildRepositoryStub();


        const evaluator =
          new DetectionDiagnosisEvaluator({
            repository,

            now:
              () =>
                new Date(
                  "2026-08-31T10:00:05.000Z"
                ),
          });


        const result =
          await evaluator.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            experimentRunId:
              "run",

            groundTruth,

            correlation:
              buildPassingCorrelation(),

            diagnosisObservation: {
              incidentId:
                "inc_1",

              selectedFailureMode:
                "kubernetes.pod.crash",

              diagnosisOutcome:
                "DIAGNOSED",

              diagnosisConfidence:
                0.91,

              evidenceCompleteness:
                0.9,

              durationMs:
                300,

              executionAuthorized:
                false,
            },

            failureInjectedAt:
              "2026-08-31T10:00:00.000Z",

            firstObservableAt:
              "2026-08-31T10:00:00.500Z",

            incidentCreatedAt:
              "2026-08-31T10:00:02.000Z",
          });


        expect(
          result.detection.status
        )
          .toBe(
            "PASS"
          );


        expect(
          result.correlation.status
        )
          .toBe(
            "PASS"
          );


        expect(
          result.diagnosis.status
        )
          .toBe(
            "PASS"
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          repository.assertions
            .map(
              (
                item
              ) =>
                item.assertionKey
            )
        )
          .toEqual([
            "DETECTED",

            "CORRELATED",

            "DIAGNOSIS_CORRECT",
          ]);


        expect(
          repository.metrics
            .map(
              (
                item
              ) =>
                item.metricKey
            )
        )
          .toEqual(
            expect.arrayContaining([
              "time_to_observable_ms",

              "time_to_signal_ms",

              "time_to_incident_ms",

              "diagnosis_latency_ms",

              "diagnosis_confidence",
            ])
          );
      }
    );


    test(
      "combined evaluator persists inconclusive diagnosis for insufficient evidence",
      async () => {
        const repository =
          buildRepositoryStub();


        const evaluator =
          new DetectionDiagnosisEvaluator({
            repository,

            now:
              () =>
                new Date(
                  "2026-08-31T10:00:05.000Z"
                ),
          });


        const result =
          await evaluator.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            experimentRunId:
              "run_insufficient",

            groundTruth,

            correlation:
              buildPassingCorrelation(),

            diagnosisObservation: {
              incidentId:
                "inc_1",

              selectedFailureMode:
                "kubernetes.pod.crash",

              diagnosisOutcome:
                "INSUFFICIENT_EVIDENCE",

              diagnosisConfidence:
                0,

              evidenceCompleteness:
                0.0875,

              durationMs:
                169,

              executionAuthorized:
                false,
            },
          });


        expect(
          result.diagnosis.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.diagnosis.reasonCode
        )
          .toBe(
            "DIAGNOSIS_INSUFFICIENT_EVIDENCE"
          );


        const diagnosisAssertion =
          repository.assertions
            .find(
              (
                assertion
              ) =>
                assertion.assertionKey ===
                "DIAGNOSIS_CORRECT"
            );


        expect(
          diagnosisAssertion
            .status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          diagnosisAssertion
            .reasonCode
        )
          .toBe(
            "DIAGNOSIS_INSUFFICIENT_EVIDENCE"
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
      "combined evaluator does not convert null confidence into zero metric",
      async () => {
        const repository =
          buildRepositoryStub();


        const evaluator =
          new DetectionDiagnosisEvaluator({
            repository,

            now:
              () =>
                new Date(
                  "2026-08-31T10:00:05.000Z"
                ),
          });


        const result =
          await evaluator.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            experimentRunId:
              "run_null_confidence",

            groundTruth,

            correlation:
              buildPassingCorrelation(),

            diagnosisObservation: {
              incidentId:
                "inc_1",

              selectedFailureMode:
                "kubernetes.pod.crash",

              diagnosisOutcome:
                "DIAGNOSED",

              diagnosisConfidence:
                null,

              evidenceCompleteness:
                0.8,

              durationMs:
                100,

              executionAuthorized:
                false,
            },
          });


        expect(
          result.diagnosis.status
        )
          .toBe(
            "INCONCLUSIVE"
          );


        expect(
          result.diagnosis.reasonCode
        )
          .toBe(
            "DIAGNOSIS_CONFIDENCE_INSUFFICIENT"
          );


        expect(
          result.metrics
        )
          .not
          .toHaveProperty(
            "diagnosisConfidence"
          );


        expect(
          repository.metrics
            .some(
              (
                metric
              ) =>
                metric.metricKey ===
                "diagnosis_confidence"
            )
        )
          .toBe(
            false
          );
      }
    );


    test(
      "evaluator rejects any authorizing correlation observation",
      async () => {
        const evaluator =
          new DetectionDiagnosisEvaluator({
            repository:
              buildRepositoryStub(),
          });


        await expect(
          evaluator.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            experimentRunId:
              "run",

            groundTruth,

            correlation: {
              executionAuthorized:
                true,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_EVALUATION_AUTHORITY_VIOLATION",
          });
      }
    );


    test(
      "evaluator rejects any authorizing diagnosis observation",
      async () => {
        const evaluator =
          new DetectionDiagnosisEvaluator({
            repository:
              buildRepositoryStub(),
          });


        await expect(
          evaluator.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            experimentRunId:
              "run",

            groundTruth,

            correlation:
              buildPassingCorrelation(),

            diagnosisObservation: {
              selectedFailureMode:
                "kubernetes.pod.crash",

              diagnosisOutcome:
                "DIAGNOSED",

              diagnosisConfidence:
                0.9,

              executionAuthorized:
                true,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_EVALUATION_AUTHORITY_VIOLATION",
          });
      }
    );
  }
);