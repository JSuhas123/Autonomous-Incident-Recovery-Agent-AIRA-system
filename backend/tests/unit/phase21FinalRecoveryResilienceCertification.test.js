"use strict";

const fs =
  require(
    "node:fs"
  );

const os =
  require(
    "node:os"
  );

const path =
  require(
    "node:path"
  );


const {
  CERTIFICATE_VERSION,

  REQUIRED_REPORT_VERSION,

  REQUIRED_GENERATOR_VERSION,

  REQUIRED_CAPACITY_CERTIFICATE,

  REQUIRED_TENANCY_CERTIFICATE,

  matchingMarkdownPath,

  validateFinalReport,

  buildFinalCertificate,
} =
  require(
    "../../scripts/certify-phase21-10d-final"
  );


function createValidReport() {
  return {
    phase:
      "21.10D",

    title:
      "Recovery, Resilience & Capacity Report",

    reportVersion:
      "21.10D-report-v1",

    generatedAt:
      "2026-08-31T10:50:00.000Z",

    status:
      "PASS",

    certificationClass:
      "EVIDENCE_CONSOLIDATION",

    safetyClass:
      "LAB_ONLY",

    evidenceSources: {
      phase21_10B: {
        certificateVersion:
          "21.10B-final-v2",

        status:
          "PASS",

        liveCertified:
          true,

        frozen:
          true,
      },

      phase21_10C: {
        certificateVersion:
          "21.10C-final-v1",

        status:
          "PASS",

        liveCertified:
          true,

        frozen:
          true,
      },
    },

    timing: {
      ttdMs: {
        name:
          "TTD",

        status:
          "NOT_MEASURED",

        value:
          null,

        unit:
          null,
      },
    },

    resilience: {
      recoveryEfficiency: {
        name:
          "Recovery Efficiency",

        status:
          "NOT_MEASURED",

        value:
          null,

        unit:
          null,
      },
    },

    capacity: {
      providers: [
        {
          provider:
            "webhook_incoming",

          safeSustainedRatePerSecond:
            1998.6506,

          highestTestedOfferedRatePerSecond:
            2000,

          degradationPoint:
            null,

          breakingPoint:
            null,

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

          safeSustainedRatePerSecond:
            124.81278082875686,

          highestTestedOfferedRatePerSecond:
            150,

          degradationPoint: {
            targetRatePerSecond:
              150,

            state:
              "SATURATED",
          },

          breakingPoint:
            null,

          recoveryPassed:
            true,

          productionCertified:
            false,

          executionAuthorized:
            false,
        },
      ],

      summary: {
        providerCount:
          2,

        allCertifiedProvidersRecovered:
          true,

        providersWithObservedDegradation: [
          "kubernetes",
        ],

        providersWithObservedBreakingPoint: [],

        providersWithNoObservedBreakingPoint: [
          "webhook_incoming",
          "kubernetes",
        ],
      },
    },

    tenancy: {
      tenantScales: [
        1,
        10,
        25,
        50,
        100,
      ],

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

          tenantInterferenceFactor:
            null,

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

          tenantInterferenceFactor:
            null,

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

          tenantInterferenceFactor:
            null,

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

          tenantInterferenceFactor:
            null,

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

          tenantInterferenceFactor:
            null,

          recoveryPassed:
            true,
        },
      ],

      maximumTenantInterferenceFactor:
        null,

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

      productionCertified:
        false,

      executionAuthorized:
        false,

      summary: {
        isolationPassed:
          true,

        zeroCrossTenantBoundaryViolations:
          true,

        zeroRedisIdempotencyCollisions:
          true,

        zeroRabbitMqEnvelopeLeaks:
          true,

        zeroNoisyNeighborStarvation:
          true,

        recoveryPassed:
          true,
      },
    },

    interpretation: {
      capacityEnvelopeIsMaximum:
        false,

      productionSloEstablished:
        false,

      externalProviderQuotaMeasured:
        false,

      missingMeasurementsInvented:
        false,

      notMeasuredValuesRemainNull:
        true,

      recoveryPassDoesNotGrantAuthority:
        true,

      tenantIsolationPassDoesNotGrantAuthority:
        true,

      reportAppliesToTestedLabEnvironment:
        true,
    },

    authority: {
      productionCertified:
        false,

      executionAuthorized:
        false,

      canGrantExecutionAuthorization:
        false,

      canGrantAutonomy:
        false,

      canModifyProductionAuthority:
        false,

      phase21IsEvidenceOnly:
        true,

      phase22ConsumesEvidence:
        true,
    },

    generator: {
      version:
        "21.10D-generator-v1",

      sourceArtifacts: {
        phase21_10B:
          "phase21-10b-final-certification-test.json",

        phase21_10C:
          "phase21-10c-final-certification-test.json",
      },
    },

    finalResult: {
      pass:
        true,

      productionCertified:
        false,

      executionAuthorized:
        false,

      frozen:
        false,

      reportGenerated:
        true,

      jsonGenerated:
        true,

      markdownGenerated:
        true,
    },
  };
}


function createValidMarkdown() {
  return [
    "# AIRA Phase 21.10D — Recovery, Resilience & Capacity Report",
    "",
    "Status: **PASS**",
    "",
    "Safety class: **LAB_ONLY**",
    "",
    "Production certified: **false**",
    "",
    "Execution authorized: **false**",
    "",
    "## Recovery Timing",
    "",
    "- ttdMs: NOT_MEASURED",
    "",
    "## Interpretation Boundaries",
    "",
    "- Measured capacity envelope is not a universal maximum.",
    "- This report does not establish a production SLO.",
    "- Missing measurements remain NOT_MEASURED rather than being estimated.",
    "",
  ]
    .join(
      "\n"
    );
}


describe(
  "Phase 21.10D final certification",

  () => {
    test(
      "final certificate contracts are frozen",

      () => {
        expect(
          CERTIFICATE_VERSION
        )
          .toBe(
            "21.10D-final-v1"
          );


        expect(
          REQUIRED_REPORT_VERSION
        )
          .toBe(
            "21.10D-report-v1"
          );


        expect(
          REQUIRED_GENERATOR_VERSION
        )
          .toBe(
            "21.10D-generator-v1"
          );


        expect(
          REQUIRED_CAPACITY_CERTIFICATE
        )
          .toBe(
            "21.10B-final-v2"
          );


        expect(
          REQUIRED_TENANCY_CERTIFICATE
        )
          .toBe(
            "21.10C-final-v1"
          );
      }
    );


    test(
      "matching Markdown path is derived from JSON path",

      () => {
        const result =
          matchingMarkdownPath(
            "C:\\aira\\phase21-10d-test.json"
          );


        expect(
          result.endsWith(
            "phase21-10d-test.md"
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "valid report and Markdown pass final validation",

      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-phase21-10d-final-"
            )
          );


        const jsonPath =
          path.join(
            directory,
            "report.json"
          );


        const markdownPath =
          path.join(
            directory,
            "report.md"
          );


        fs.writeFileSync(
          jsonPath,
          JSON.stringify(
            createValidReport()
          ),
          "utf8"
        );


        fs.writeFileSync(
          markdownPath,
          createValidMarkdown(),
          "utf8"
        );


        const validation =
          validateFinalReport({
            report:
              createValidReport(),

            markdown:
              createValidMarkdown(),

            jsonPath,

            markdownPath,
          });


        expect(
          validation.pass
        )
          .toBe(
            true
          );


        expect(
          validation
            .checks
            .every(
              (
                check
              ) =>
                check.pass ===
                true
            )
        )
          .toBe(
            true
          );


        fs.rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true,
          }
        );
      }
    );


    test(
      "authority violation fails final validation",

      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-phase21-10d-final-"
            )
          );


        const jsonPath =
          path.join(
            directory,
            "report.json"
          );


        const markdownPath =
          path.join(
            directory,
            "report.md"
          );


        const report =
          createValidReport();


        report
          .authority
          .executionAuthorized =
          true;


        fs.writeFileSync(
          jsonPath,
          "{}",
          "utf8"
        );


        fs.writeFileSync(
          markdownPath,
          createValidMarkdown(),
          "utf8"
        );


        const validation =
          validateFinalReport({
            report,

            markdown:
              createValidMarkdown(),

            jsonPath,

            markdownPath,
          });


        expect(
          validation.pass
        )
          .toBe(
            false
          );


        fs.rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true,
          }
        );
      }
    );


    test(
      "capacity maximum claim fails final validation",

      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-phase21-10d-final-"
            )
          );


        const jsonPath =
          path.join(
            directory,
            "report.json"
          );


        const markdownPath =
          path.join(
            directory,
            "report.md"
          );


        const report =
          createValidReport();


        report
          .interpretation
          .capacityEnvelopeIsMaximum =
          true;


        fs.writeFileSync(
          jsonPath,
          "{}",
          "utf8"
        );


        fs.writeFileSync(
          markdownPath,
          createValidMarkdown(),
          "utf8"
        );


        const validation =
          validateFinalReport({
            report,

            markdown:
              createValidMarkdown(),

            jsonPath,

            markdownPath,
          });


        expect(
          validation.pass
        )
          .toBe(
            false
          );


        fs.rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true,
          }
        );
      }
    );


    test(
      "inventing missing evidence fails final validation",

      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-phase21-10d-final-"
            )
          );


        const jsonPath =
          path.join(
            directory,
            "report.json"
          );


        const markdownPath =
          path.join(
            directory,
            "report.md"
          );


        const report =
          createValidReport();


        report
          .interpretation
          .missingMeasurementsInvented =
          true;


        fs.writeFileSync(
          jsonPath,
          "{}",
          "utf8"
        );


        fs.writeFileSync(
          markdownPath,
          createValidMarkdown(),
          "utf8"
        );


        const validation =
          validateFinalReport({
            report,

            markdown:
              createValidMarkdown(),

            jsonPath,

            markdownPath,
          });


        expect(
          validation.pass
        )
          .toBe(
            false
          );


        fs.rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true,
          }
        );
      }
    );


    test(
      "tenant isolation failure blocks final certification",

      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-phase21-10d-final-"
            )
          );


        const jsonPath =
          path.join(
            directory,
            "report.json"
          );


        const markdownPath =
          path.join(
            directory,
            "report.md"
          );


        const report =
          createValidReport();


        report
          .tenancy
          .boundaryViolations =
          1;


        fs.writeFileSync(
          jsonPath,
          "{}",
          "utf8"
        );


        fs.writeFileSync(
          markdownPath,
          createValidMarkdown(),
          "utf8"
        );


        const validation =
          validateFinalReport({
            report,

            markdown:
              createValidMarkdown(),

            jsonPath,

            markdownPath,
          });


        expect(
          validation.pass
        )
          .toBe(
            false
          );


        fs.rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true,
          }
        );
      }
    );


    test(
      "final certificate freezes evidence without granting authority",

      () => {
        const report =
          createValidReport();


        const validation = {
          pass:
            true,

          checks: [
            {
              name:
                "test",

              pass:
                true,
            },
          ],
        };


        const certificate =
          buildFinalCertificate({
            report,

            validation,

            jsonPath:
              "C:\\aira\\report.json",

            markdownPath:
              "C:\\aira\\report.md",
          });


        expect(
          certificate.status
        )
          .toBe(
            "PASS"
          );


        expect(
          certificate.liveCertified
        )
          .toBe(
            true
          );


        expect(
          certificate.frozen
        )
          .toBe(
            true
          );


        expect(
          certificate
            .authority
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .productionCertified
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .canGrantExecutionAuthorization
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .canGrantAutonomy
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .phase22ConsumesEvidence
        )
          .toBe(
            true
          );


        expect(
          certificate
            .finalResult
            .frozen
        )
          .toBe(
            true
          );
      }
    );
  }
);