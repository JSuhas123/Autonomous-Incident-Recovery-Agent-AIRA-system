"use strict";


const {
  REALITY_IMPERFECT_OBSERVABILITY_VERSION,

  IMPERFECT_OBSERVABILITY_PROFILE,

  buildImperfectObservabilityPlan,
} =
  require(
    "../../services/reality/realityImperfectObservabilityService"
  );


function replayCase() {
  return {
    executionAuthorized:
      false,

    groundTruthIncluded:
      false,

    realityCase: {
      timeline:
        Array.from(
          {
            length:
              12,
          },

          (
            _,
            index
          ) => ({
            eventId:
              `evt_${index + 1}`,

            offsetMs:
              index *
              1000,

            kind:
              index %
                2 ===
              0
                ? "METRIC"
                : "LOG",

            artifactId:
              `artifact_${index + 1}`,
          })
        ),

      replayConfiguration: {
        seed:
          23,
      },

      sealing: {
        groundTruthAgentVisible:
          false,
      },

      executionAuthorized:
        false,
    },
  };
}


describe(
  "Phase 23R.11 imperfect observability lab",

  () => {
    test(
      "freezes the 23R.11 contract",

      () => {
        expect(
          REALITY_IMPERFECT_OBSERVABILITY_VERSION
        ).toBe(
          "23R.11.0"
        );
      }
    );


    test(
      "same case plus seed produces deterministic degradation",

      () => {
        const first =
          buildImperfectObservabilityPlan({
            caseResult:
              replayCase(),

            profile:
              IMPERFECT_OBSERVABILITY_PROFILE
                .DEGRADED,

            seed:
              77,
          });


        const second =
          buildImperfectObservabilityPlan({
            caseResult:
              replayCase(),

            profile:
              IMPERFECT_OBSERVABILITY_PROFILE
                .DEGRADED,

            seed:
              77,
          });


        expect(
          first
        ).toEqual(
          second
        );


        expect(
          first.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "clean profile preserves all events",

      () => {
        const result =
          buildImperfectObservabilityPlan({
            caseResult:
              replayCase(),

            profile:
              "CLEAN",
          });


        expect(
          result.originalEventCount
        ).toBe(
          12
        );


        expect(
          result.deliveredEventCount
        ).toBe(
          12
        );


        expect(
          result.operations
        ).toEqual(
          []
        );
      }
    );


    test(
      "degraded profile introduces deterministic imperfections",

      () => {
        const result =
          buildImperfectObservabilityPlan({
            caseResult:
              replayCase(),

            profile:
              "DEGRADED",

            seed:
              23,
          });


        expect(
          result.schedule.length
        ).toBeGreaterThan(
          0
        );


        expect(
          result.operations.length
        ).toBeGreaterThan(
          0
        );


        expect(
          result
            .groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          result
            .guarantees
            .evaluationChannelModified
        ).toBe(
          false
        );
      }
    );


    test(
      "severe profile remains non-authorizing",

      () => {
        const result =
          buildImperfectObservabilityPlan({
            caseResult:
              replayCase(),

            profile:
              "SEVERE",

            seed:
              23,
          });


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.productionCertified
        ).toBe(
          false
        );


        expect(
          result
            .guarantees
            .executionAuthorityCreated
        ).toBe(
          false
        );
      }
    );


    test(
      "rejects evaluator truth in replay-visible context",

      () => {
        const value =
          replayCase();


        value
          .realityCase
          .sealedEvaluation =
          {
            expectedDiagnosis:
              "secret",
          };


        expect(
          () =>
            buildImperfectObservabilityPlan({
              caseResult:
                value,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_IMPERFECT_OBSERVABILITY_CONTEXT_FORBIDDEN",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "rejects nested ground truth leakage",

      () => {
        const value =
          replayCase();


        value
          .realityCase
          .timeline[
            0
          ]
          .metadata =
          {
            rootCause:
              "database",
          };


        expect(
          () =>
            buildImperfectObservabilityPlan({
              caseResult:
                value,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_IMPERFECT_OBSERVABILITY_CONTEXT_FORBIDDEN",
          })
        );
      }
    );


    test(
      "rejects authority leakage",

      () => {
        const value =
          replayCase();


        value
          .realityCase
          .executionAuthorized =
          true;


        expect(
          () =>
            buildImperfectObservabilityPlan({
              caseResult:
                value,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_IMPERFECT_OBSERVABILITY_CONTEXT_FORBIDDEN",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "unknown profile fails closed",

      () => {
        expect(
          () =>
            buildImperfectObservabilityPlan({
              caseResult:
                replayCase(),

              profile:
                "CHAOS_EVERYTHING",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_IMPERFECT_OBSERVABILITY_PROFILE_UNKNOWN",
          })
        );
      }
    );
  }
);