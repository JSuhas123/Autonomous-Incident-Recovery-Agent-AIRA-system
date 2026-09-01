"use strict";


const {
  AUTONOMY_LEVEL,

  CERTIFICATION_DOMAIN,
} =
  require(
    "../../constants/recoveryCertification"
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
  AutonomySafetyCapService,
} =
  require(
    "../../services/certification/autonomySafetyCapService"
  );


const {
  AutonomyQualificationEngine,
} =
  require(
    "../../services/certification/autonomyQualificationEngine"
  );


const {
  SAFETY_CAP_STATUS,
} =
  require(
    "../../constants/autonomyQualificationPolicy"
  );


function makeSamples(
  count,
  overrides =
    {}
) {
  return Array.from(
    {
      length:
        count,
    },

    (
      _,
      index
    ) => ({
      sampleId:
        `sample_${index}`,

      experimentRunId:
        `experiment_${Math.floor(
          index /
          20
        )}`,

      failureMode:
        `failure_${index % 3}`,

      infrastructureContext:
        `cluster_${index % 3}`,

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
        "2026-09-01T12:00:00.000Z",

      executionAuthorized:
        false,

      ...overrides,
    })
  );
}


function buildInputs(
  samples,
  now =
    "2026-09-01T13:00:00.000Z"
) {
  const statistics =
    new RecoveryOutcomeStatisticsService()
      .calculate({
        samples,
      });


  const sufficiency =
    new EvidenceSufficiencyService()
      .evaluate({
        statistics,

        now,
      });


  return {
    statistics,

    sufficiency,
  };
}


describe(
  "Phase 22.6 + 22.7 autonomy qualification and promotion matrix",

  () => {
    test(
      "tiny perfect evidence cannot jump to autonomous levels",

      () => {
        const {
          statistics,
          sufficiency,
        } =
          buildInputs(
            makeSamples(
              1
            )
          );


        const result =
          new AutonomyQualificationEngine()
            .evaluate({
              statistics,

              sufficiency,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,
            });


        expect(
          result.qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );


        expect(
          result
            .autonomousRecoveryEligible
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
      }
    );


    test(
      "moderate evidence can earn diagnosis or recommendation without execution authority",

      () => {
        const {
          statistics,
          sufficiency,
        } =
          buildInputs(
            makeSamples(
              25
            )
          );


        const result =
          new AutonomyQualificationEngine()
            .evaluate({
              statistics,

              sufficiency,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,
            });


        expect(
          [
            AUTONOMY_LEVEL.L1,

            AUTONOMY_LEVEL.L2,
          ]
        )
          .toContain(
            result.qualifiedLevel
          );


        expect(
          result
            .autonomousRecoveryEligible
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
      }
    );


    test(
      "strong sufficient evidence can earn bounded autonomous eligibility",

      () => {
        const {
          statistics,
          sufficiency,
        } =
          buildInputs(
            makeSamples(
              400
            )
          );


        const result =
          new AutonomyQualificationEngine()
            .evaluate({
              statistics,

              sufficiency,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,
            });


        expect(
          result.qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L4
          );


        expect(
          result
            .autonomousRecoveryEligible
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
      "L5 requires substantially more evidence than L4",

      () => {
        const l4Inputs =
          buildInputs(
            makeSamples(
            400
            )
          );


        const l4 =
          new AutonomyQualificationEngine()
            .evaluate({
              ...l4Inputs,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,
            });


        const l5Inputs =
          buildInputs(
            makeSamples(
              2000
            )
          );


        const l5 =
          new AutonomyQualificationEngine()
            .evaluate({
              ...l5Inputs,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,
            });


        expect(
          l4.qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L4
          );


        expect(
          l5.qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          l5.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "physical systems cannot inherit software autonomy levels",

      () => {
        const inputs =
          buildInputs(
            makeSamples(
              2000
            )
          );


        const result =
          new AutonomyQualificationEngine()
            .evaluate({
              ...inputs,

              domain:
                CERTIFICATION_DOMAIN
                  .PHYSICAL_SYSTEM,
            });


        expect(
          result
            .evidenceDerivedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          result
            .domainAdjustedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
          );


        expect(
          result.qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
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
      "safety-critical domain is capped at L1",

      () => {
        const inputs =
          buildInputs(
            makeSamples(
              1200
            )
          );


        const result =
          new AutonomyQualificationEngine()
            .evaluate({
              ...inputs,

              domain:
                CERTIFICATION_DOMAIN
                  .SAFETY_CRITICAL,
            });


        expect(
          result.qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L1
          );


        expect(
          result
            .autonomousRecoveryEligible
        )
          .toBe(
            false
          );
      }
    );
  }
);


describe(
  "Phase 22.8 safety caps and automatic demotion",

  () => {
    test(
      "authority leak is fatal and forces L0",

      () => {
        const samples =
          makeSamples(
            1200
          );


        samples[0]
          .authorityLeak =
          true;


        const {
          statistics,
        } =
          buildInputs(
            samples
          );


        const cap =
          new AutonomySafetyCapService()
            .evaluate({
              statistics,

              requestedLevel:
                AUTONOMY_LEVEL.L5,
            });


        expect(
          cap.status
        )
          .toBe(
            SAFETY_CAP_STATUS
              .FAILED
          );


        expect(
          cap.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );


        expect(
          cap.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "production boundary violation is fatal",

      () => {
        const {
          statistics,
        } =
          buildInputs(
            makeSamples(
              1200
            )
          );


        const cap =
          new AutonomySafetyCapService()
            .evaluate({
              statistics,

              requestedLevel:
                AUTONOMY_LEVEL.L5,

              productionBoundaryViolationCount:
                1,
            });


        expect(
          cap.status
        )
          .toBe(
            SAFETY_CAP_STATUS
              .FAILED
          );


        expect(
          cap.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );
      }
    );


    test(
      "unauthorized action suspends autonomous qualification and caps at L2",

      () => {
        const samples =
          makeSamples(
            1200
          );


        samples[0]
          .unauthorizedAction =
          true;


        const {
          statistics,
        } =
          buildInputs(
            samples
          );


        const cap =
          new AutonomySafetyCapService()
            .evaluate({
              statistics,

              requestedLevel:
                AUTONOMY_LEVEL.L5,
            });


        expect(
          cap.status
        )
          .toBe(
            SAFETY_CAP_STATUS
              .SUSPENDED
          );


        expect(
          cap.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
          );
      }
    );


    test(
      "risky mutation without strong rollback assurance cannot exceed L3",

      () => {
        const samples =
          makeSamples(
            1200,

            {
              rollbackAttempted:
                false,

              rollbackSucceeded:
                false,
            }
          );


        const {
          statistics,
        } =
          buildInputs(
            samples
          );


        const cap =
          new AutonomySafetyCapService()
            .evaluate({
              statistics,

              requestedLevel:
                AUTONOMY_LEVEL.L5,

              riskyMutation:
                true,
            });


        expect(
          cap.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );


        expect(
          cap.status
        )
          .toBe(
            SAFETY_CAP_STATUS
              .CAPPED
          );
      }
    );


    test(
      "automatic demotion is recorded against previous level",

      () => {
        const samples =
          makeSamples(
            1200
          );


        samples[0]
          .unauthorizedAction =
          true;


        const inputs =
          buildInputs(
            samples
          );


        const result =
          new AutonomyQualificationEngine()
            .evaluate({
              ...inputs,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,

              previousLevel:
                AUTONOMY_LEVEL.L5,
            });


        expect(
          result.demoted
        )
          .toBe(
            true
          );


        expect(
          result.demotionFrom
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          result.demotionTo
        )
          .toBe(
            AUTONOMY_LEVEL.L2
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
      "qualification can promote reputation but still cannot authorize execution",

      () => {
        const inputs =
          buildInputs(
            makeSamples(
              2000
            )
          );


        const result =
          new AutonomyQualificationEngine()
            .evaluate({
              ...inputs,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,

              previousLevel:
                AUTONOMY_LEVEL.L3,
            });


        expect(
          result.promoted
        )
          .toBe(
            true
          );


        expect(
          result.qualifiedLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


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