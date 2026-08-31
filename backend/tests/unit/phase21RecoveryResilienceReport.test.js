"use strict";


const {
  METRIC_VERSION,

  MEASUREMENT_STATUS,

  deriveRecoveryMetrics,

  calculateDegradationFactor,

  calculateRecoveryEfficiency,

  calculateRecoveryAmplification,
} =
  require(
    "../../services/reliability/reporting/recoveryResilienceMetrics"
  );


const {
  REPORT_VERSION,

  RecoveryResilienceReportBuilder,
} =
  require(
    "../../services/reliability/reporting/recoveryResilienceReportBuilder"
  );


function createCapacityCertificate() {
  return {
    certificateVersion:
      "21.10B-final-v2",

    status:
      "PASS",

    productionCertified:
      false,

    executionAuthorized:
      false,

    providerResults: [
      {
        provider:
          "webhook_incoming",

        operation:
          "receive_event",

        pathClass:
          "AIRA_LOCAL_INGESTION_PATH",

        highestTestedOfferedRatePerSecond:
          2000,

        highestObservedSuccessfulRatePerSecond:
          1998.6506,

        safeSustainedRatePerSecond:
          1998.6506,

        degradationPoint:
          null,

        saturationPoint:
          null,

        breakingPoint:
          null,

        highestHealthyStage: {
          targetRatePerSecond:
            2000,

          successfulRatePerSecond:
            1998.6506,

          state:
            "HEALTHY",

          p95LatencyMs:
            1,
        },

        recoveryPassed:
          true,

        productionCertified:
          false,

        executionAuthorized:
          false,
      },

      {
        provider:
          "kubernetes",

        operation:
          "get_health",

        pathClass:
          "REAL_INFRASTRUCTURE_PATH",

        highestTestedOfferedRatePerSecond:
          150,

        highestObservedSuccessfulRatePerSecond:
          149.32059130954158,

        safeSustainedRatePerSecond:
          124.81278082875686,

        degradationPoint: {
          targetRatePerSecond:
            150,

          achievedRatePerSecond:
            149.32059130954158,

          successfulRatePerSecond:
            149.32059130954158,

          state:
            "SATURATED",

          p95LatencyMs:
            281.8722,

          p99LatencyMs:
            322.2483,

          successRate:
            1,

          errorRate:
            0,
        },

        saturationPoint: {
          targetRatePerSecond:
            150,

          state:
            "SATURATED",
        },

        breakingPoint:
          null,

        highestHealthyStage: {
          targetRatePerSecond:
            125,

          successfulRatePerSecond:
            124.81278082875686,

          state:
            "HEALTHY",

          p95LatencyMs:
            66.6511,
        },

        recoveryPassed:
          true,

        productionCertified:
          false,

        executionAuthorized:
          false,
      },
    ],

    finalResult: {
      pass:
        true,

      liveCertified:
        true,

      frozen:
        true,

      executionAuthorized:
        false,
    },
  };
}


function createTenancyCertificate() {
  return {
    phase:
      "21.10C",

    certificateVersion:
      "21.10C-final-v1",

    status:
      "PASS",

    pass:
      true,

    liveCertified:
      true,

    frozen:
      true,

    productionCertified:
      false,

    executionAuthorized:
      false,

    redisIsolation: {
      collisions:
        0,

      pass:
        true,
    },

    rabbitMqIsolation: {
      envelopeLeaks:
        0,

      pass:
        true,
    },

    multiTenant: {
      scaleRuns: [
        {
          tenantCount:
            1,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.956,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            10,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            25,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.5898,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            50,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            100,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.3536,

          recoveryPassed:
            true,
        },
      ],

      boundaryViolations:
        0,

      starvedControlTenants:
        0,

      recoveryPassed:
        true,
    },

    finalResult: {
      pass:
        true,

      productionCertified:
        false,

      executionAuthorized:
        false,
    },
  };
}


describe(
  "Phase 21.10D recovery resilience metrics and reporting",

  () => {
    test(
      "versions are frozen",

      () => {
        expect(
          METRIC_VERSION
        )
          .toBe(
            "21.10D-metrics-v1"
          );


        expect(
          REPORT_VERSION
        )
          .toBe(
            "21.10D-report-v1"
          );
      }
    );


    test(
      "missing timing evidence remains NOT_MEASURED",

      () => {
        const metrics =
          deriveRecoveryMetrics();


        expect(
          metrics
            .timing
            .ttdMs
            .status
        )
          .toBe(
            MEASUREMENT_STATUS
              .NOT_MEASURED
          );


        expect(
          metrics
            .timing
            .ttdMs
            .value
        )
          .toBeNull();
      }
    );


    test(
      "timing metrics are derived only from real timestamps",

      () => {
        const metrics =
          deriveRecoveryMetrics({
            timing: {
              failureInjectedAt:
                "2026-08-31T10:00:00.000Z",

              detectedAt:
                "2026-08-31T10:00:02.500Z",

              verifiedAt:
                "2026-08-31T10:00:10.000Z",
            },
          });


        expect(
          metrics
            .timing
            .ttdMs
            .value
        )
          .toBe(
            2500
          );


        expect(
          metrics
            .timing
            .mttrMs
            .value
        )
          .toBe(
            10000
          );
      }
    );


    test(
      "degradation factor uses measured latency when available",

      () => {
        const result =
          calculateDegradationFactor(
            {
              p95LatencyMs:
                10,
            },

            {
              p95LatencyMs:
                30,
            }
          );


        expect(
          result.status
        )
          .toBe(
            MEASUREMENT_STATUS
              .DERIVED
          );


        expect(
          result.value
        )
          .toBe(
            3
          );
      }
    );


    test(
      "recovery efficiency compares recovered throughput with baseline",

      () => {
        const result =
          calculateRecoveryEfficiency(
            {
              successfulRatePerSecond:
                100,
            },

            {
              successfulRatePerSecond:
                95,
            }
          );


        expect(
          result.value
        )
          .toBe(
            0.95
          );
      }
    );


    test(
      "recovery amplification is not invented without work measurements",

      () => {
        const result =
          calculateRecoveryAmplification(
            null,
            null
          );


        expect(
          result.status
        )
          .toBe(
            MEASUREMENT_STATUS
              .NOT_MEASURED
          );


        expect(
          result.value
        )
          .toBeNull();
      }
    );


    test(
      "capacity evidence preserves machine-specific envelope",

      () => {
        const metrics =
          deriveRecoveryMetrics({
            capacity: {
              providers:
                createCapacityCertificate()
                  .providerResults,
            },
          });


        const kubernetes =
          metrics
            .capacity
            .providers
            .find(
              (
                provider
              ) =>
                provider.provider ===
                "kubernetes"
            );


        expect(
          kubernetes
            .safeSustainedRatePerSecond
        )
          .toBeCloseTo(
            124.81278082875686
          );


        expect(
          kubernetes
            .degradationPoint
            .targetRatePerSecond
        )
          .toBe(
            150
          );


        expect(
          metrics
            .capacity
            .claims
            .measuredEnvelopeNotMaximum
        )
          .toBe(
            true
          );


        expect(
          metrics
            .capacity
            .claims
            .productionSloClaimed
        )
          .toBe(
            false
          );
      }
    );


    test(
      "tenant interference factor is preserved when raw scale evidence exists",

      () => {
        const metrics =
          deriveRecoveryMetrics({
            tenancy: {
              scaleRuns:
                createTenancyCertificate()
                  .multiTenant
                  .scaleRuns,

              boundaryViolations:
                0,

              redisIdempotencyCollisions:
                0,

              rabbitMqEnvelopeLeaks:
                0,

              starvedControlTenants:
                0,

              recoveryPassed:
                true,
            },
          });


        expect(
          metrics
            .tenancy
            .maximumTenantInterferenceFactor
        )
          .toBeCloseTo(
            1.956
          );
      }
    );


    test(
      "report consolidates 21.10B and 21.10C without granting authority",

      () => {
        const builder =
          new RecoveryResilienceReportBuilder();


        const report =
          builder.build({
            capacityCertificate:
              createCapacityCertificate(),

            tenancyCertificate:
              createTenancyCertificate(),
          });


        expect(
          report.status
        )
          .toBe(
            "PASS"
          );


        expect(
          report
            .capacity
            .summary
            .allCertifiedProvidersRecovered
        )
          .toBe(
            true
          );


        expect(
          report
            .tenancy
            .summary
            .isolationPassed
        )
          .toBe(
            true
          );


        expect(
          report
            .tenancy
            .maximumTenantInterferenceFactor
        )
          .toBeCloseTo(
            1.956
          );


        expect(
          report
            .authority
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          report
            .authority
            .canGrantAutonomy
        )
          .toBe(
            false
          );


        expect(
          report
            .finalResult
            .frozen
        )
          .toBe(
            false
          );
      }
    );


    test(
      "report identifies Kubernetes as degraded but not broken",

      () => {
        const builder =
          new RecoveryResilienceReportBuilder();


        const report =
          builder.build({
            capacityCertificate:
              createCapacityCertificate(),

            tenancyCertificate:
              createTenancyCertificate(),
          });


        expect(
          report
            .capacity
            .summary
            .providersWithObservedDegradation
        )
          .toContain(
            "kubernetes"
          );


        expect(
          report
            .capacity
            .summary
            .providersWithObservedBreakingPoint
        )
          .not
          .toContain(
            "kubernetes"
          );
      }
    );


    test(
      "markdown report clearly marks missing measurements",

      () => {
        const builder =
          new RecoveryResilienceReportBuilder();


        const report =
          builder.build({
            capacityCertificate:
              createCapacityCertificate(),

            tenancyCertificate:
              createTenancyCertificate(),
          });


        const markdown =
          builder.toMarkdown(
            report
          );


        expect(
          markdown
        )
          .toContain(
            "NOT_MEASURED"
          );


        expect(
          markdown
        )
          .toContain(
            "Execution authorized: **false**"
          );


        expect(
          markdown
        )
          .toContain(
            "Measured capacity envelope is not a universal maximum."
          );
      }
    );


    test(
      "source certificate containing production authority is rejected",

      () => {
        const bad =
          createCapacityCertificate();


        bad.executionAuthorized =
          true;


        const builder =
          new RecoveryResilienceReportBuilder();


        expect(
          () =>
            builder.build({
              capacityCertificate:
                bad,

              tenancyCertificate:
                createTenancyCertificate(),
            })
        )
          .toThrow(
            "forbidden authority"
          );
      }
    );
  }
);