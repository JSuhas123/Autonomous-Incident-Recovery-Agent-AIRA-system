"use strict";

const {
  COVERAGE_CLASSIFICATIONS,

  COVERAGE_REASON_CODES,

  PRIMARY_COVERAGE_METRIC,

  COVERAGE_SAFETY,
} = require("../../constants/coverage");

const {
  assertValidCoverage,

  assertValidCoverageReason,

  assertValidCoverageSummary,
} = require("../../contracts/coverage");

describe(
  "Phase 19 Coverage Architecture Contract",
  () => {
    test(
      "canonical coverage classifications are frozen",
      () => {
        expect(
          Object.values(
            COVERAGE_CLASSIFICATIONS
          )
        ).toEqual([
          "COVERED",

          "PARTIAL",

          "HUMAN_ONLY",

          "UNKNOWN",
        ]);
      }
    );

    test(
      "canonical reason codes include critical enterprise gaps",
      () => {
        expect(
          COVERAGE_REASON_CODES.NO_FAILURE_MODE
        ).toBe("NO_FAILURE_MODE");

        expect(
          COVERAGE_REASON_CODES.NO_PLAYBOOK
        ).toBe("NO_PLAYBOOK");

        expect(
          COVERAGE_REASON_CODES.CAPABILITY_MISSING
        ).toBe("CAPABILITY_MISSING");

        expect(
          COVERAGE_REASON_CODES.ROLLBACK_MISSING
        ).toBe("ROLLBACK_MISSING");

        expect(
          COVERAGE_REASON_CODES.VERIFICATION_MISSING
        ).toBe("VERIFICATION_MISSING");
      }
    );

    test(
      "primary KPI is applicable failure mode coverage",
      () => {
        expect(
          PRIMARY_COVERAGE_METRIC.APPLICABLE_FAILURE_MODE_COVERAGE
        ).toBe(
          "APPLICABLE_FAILURE_MODE_COVERAGE"
        );
      }
    );

    test(
      "coverage contract forbids authorization",
      () => {
        const result =
          assertValidCoverage({
            resourceId: "res-1",

            resourceType:
              "postgres.database",

            failureModeId:
              "fm-1",

            failureModeVersion:
              "1.0.0",

            classification:
              "COVERED",

            reasons: [],

            readiness: {},

            confidence: 1,

            evaluatedAt:
              new Date(),

            executionAuthorized:
              false,
          });

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "coverage reason contract validates canonical codes",
      () => {
        expect(() =>
          assertValidCoverageReason({
            code: "CAPABILITY_MISSING",

            message:
              "Missing Kubernetes capability",
          })
        ).not.toThrow();
      }
    );

    test(
      "coverage summary contract validates dashboard payload",
      () => {
        expect(() =>
          assertValidCoverageSummary({
            resources: 8429,

            applicableFailureModes: 817,

            covered: 691,

            partial: 74,

            humanOnly: 29,

            unknown: 23,

            coverage: 84.6,

            executionAuthorized:
              false,
          })
        ).not.toThrow();
      }
    );

    test(
      "coverage KPI is mathematically consistent",
      () => {
        const applicable = 817;

        const covered = 691;

        const percentage =
          Number(
            (
              (covered /
                applicable) *
              100
            ).toFixed(1)
          );

        expect(
          percentage
        ).toBe(84.6);
      }
    );

    test(
      "coverage safety contract permanently blocks execution inference",
      () => {
        expect(
          COVERAGE_SAFETY.executionAuthorized
        ).toBe(false);

        expect(
          COVERAGE_SAFETY.coverageImpliesExecution
        ).toBe(false);

        expect(
          COVERAGE_SAFETY.capabilityImpliesAuthorization
        ).toBe(false);

        expect(
          COVERAGE_SAFETY.correlationIsCausation
        ).toBe(false);
      }
    );
  }
);