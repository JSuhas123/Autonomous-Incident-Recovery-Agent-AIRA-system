"use strict";


const {
  AUTONOMY_LEVEL,

  CERTIFICATION_DOMAIN,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  Phase21LiveRecoveryEvidenceMapper,
} =
  require(
    "../../services/certification/phase21LiveRecoveryEvidenceMapper"
  );


const {
  RecoveryOutcomeStatisticsService,
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
  AutonomyQualificationEngine,
} =
  require(
    "../../services/certification/autonomyQualificationEngine"
  );


function phase21Evidence() {
  const experimentRunId =
    "exprun_live_001";


  const incidentId =
    "incident_live_001";


  return {
    batch7: {
      passed:
        true,

      experimentRunId,

      incidentId,

      selectedFailureMode:
        "kubernetes.pod.crash",

      diagnosisCorrect:
        true,

      executionAuthorized:
        false,

      productionCertified:
        false,

      groundTruthToAira:
        false,
    },


    batch8a: {
      passed:
        true,

      experimentRunId,

      incidentId,

      recoveryBoundaryRefused:
        true,

      executionAuthorized:
        false,

      productionCertified:
        false,
    },


    batch8b: {
      passed:
        true,

      experimentRunId,

      incidentId,

      selectedFailureMode:
        "kubernetes.pod.crash",

      authorizationId:
        "execa_001",

      executionRequestId:
        "execreq_001",

      planId:
        "execplan_001",

      selectedPlaybookId:
        "PB-PHASE21-K8S-RESTART-LAB-001",

      evaluation: {
        controlledExecutionObserved:
          true,
      },

      replacementObserved:
        true,

      replacementReady:
        true,

      executionAuthorized:
        false,

      productionCertified:
        false,
    },


    batch9: {
      passed:
        true,

      experimentRunId,

      incidentId,

      selectedFailureMode:
        "kubernetes.pod.crash",

      verification: {
        outcome:
          "VERIFIED_RECOVERY",

        recovered:
          true,

        recoveryConfirmed:
          true,

        independentVerificationObserved:
          true,

        recurrenceDetected:
          false,
      },

      completedAt:
        "2026-09-01T08:37:32.960Z",

      executionAuthorized:
        false,

      productionCertified:
        false,
    },


    canonicalEvidence: {
      experimentRun: {
        public_id:
          experimentRunId,
      },

      executionAuthorized:
        false,
    },
  };
}


describe(
  "Phase 22.15 first live capability certification",

  () => {
    test(
      "maps one frozen Phase-21 experiment to exactly one certification sample",

      () => {
        const mapped =
          new Phase21LiveRecoveryEvidenceMapper()
            .map(
              phase21Evidence()
            );


        expect(
          mapped.sampleCount
        )
          .toBe(
            1
          );


        expect(
          mapped.uniqueExperimentCount
        )
          .toBe(
            1
          );


        expect(
          mapped.samples[0]
            .failureMode
        )
          .toBe(
            "kubernetes.pod.crash"
          );


        expect(
          mapped.samples[0]
            .recoveryVerified
        )
          .toBe(
            true
          );


        expect(
          mapped.samples[0]
            .recurrenceDetected
        )
          .toBe(
            false
          );


        expect(
          mapped.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "one experiment is not multiplied by the number of artifacts",

      () => {
        const mapped =
          new Phase21LiveRecoveryEvidenceMapper()
            .map(
              phase21Evidence()
            );


        const statistics =
          new RecoveryOutcomeStatisticsService()
            .calculate({
              samples:
                mapped.samples,
            });


        expect(
          statistics.totalTests
        )
          .toBe(
            1
          );


        expect(
          statistics
            .independentExperimentCount
        )
          .toBe(
            1
          );
      }
    );


    test(
      "one successful real experiment remains insufficient for strong certification",

      () => {
        const mapped =
          new Phase21LiveRecoveryEvidenceMapper()
            .map(
              phase21Evidence()
            );


        const statistics =
          new RecoveryOutcomeStatisticsService()
            .calculate({
              samples:
                mapped.samples,
            });


        const sufficiency =
          new EvidenceSufficiencyService()
            .evaluate({
              statistics,

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          statistics
            .rates
            .verifiedRecovery
            .rate
        )
          .toBe(
            1
          );


        expect(
          sufficiency.sufficient
        )
          .toBe(
            false
          );


        expect(
          sufficiency.status
        )
          .toBe(
            "INSUFFICIENT_EVIDENCE"
          );
      }
    );


    test(
      "real evidence currently earns only what the promotion matrix supports",

      () => {
        const mapped =
          new Phase21LiveRecoveryEvidenceMapper()
            .map(
              phase21Evidence()
            );


        const statistics =
          new RecoveryOutcomeStatisticsService()
            .calculate({
              samples:
                mapped.samples,
            });


        const sufficiency =
          new EvidenceSufficiencyService()
            .evaluate({
              statistics,

              now:
                "2026-09-02T00:00:00.000Z",
            });


        const qualification =
          new AutonomyQualificationEngine()
            .evaluate({
              statistics,

              sufficiency,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,
            });


        expect(
          qualification
            .qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );


        expect(
          qualification
            .autonomousRecoveryEligible
        )
          .toBe(
            false
          );


        expect(
          qualification
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "Phase-21 pod crash evidence cannot be relabelled as CrashLoopBackOff",

      () => {
        const evidence =
          phase21Evidence();


        evidence.batch7
          .selectedFailureMode =
          "K8S_CRASH_LOOP_BACKOFF";


        evidence.batch8b
          .selectedFailureMode =
          "K8S_CRASH_LOOP_BACKOFF";


        evidence.batch9
          .selectedFailureMode =
          "K8S_CRASH_LOOP_BACKOFF";


        expect(
          () =>
            new Phase21LiveRecoveryEvidenceMapper()
              .map(
                evidence
              )
        )
          .toThrow(
            "Expected kubernetes.pod.crash"
          );
      }
    );


    test(
      "authority leakage in historical evidence is rejected",

      () => {
        const evidence =
          phase21Evidence();


        evidence.batch8b
          .phase21ExecutionAuthorized =
          true;


        expect(
          () =>
            new Phase21LiveRecoveryEvidenceMapper()
              .map(
                evidence
              )
        )
          .toThrow(
            "violates frozen Phase-21 safety"
          );
      }
    );


    test(
      "lineage disagreement across artifacts fails closed",

      () => {
        const evidence =
          phase21Evidence();


        evidence.batch9
          .experimentRunId =
          "different_experiment";


        expect(
          () =>
            new Phase21LiveRecoveryEvidenceMapper()
              .map(
                evidence
              )
        )
          .toThrow(
            "disagrees across frozen evidence"
          );
      }
    );
  }
);