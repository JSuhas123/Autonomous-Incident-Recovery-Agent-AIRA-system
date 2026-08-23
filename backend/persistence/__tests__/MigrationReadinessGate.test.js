"use strict";

const MigrationReadinessGate =
  require(
    "../migration/MigrationReadinessGate"
  );

describe(
  "MigrationReadinessGate",
  () => {
    function createGate({
      state = {},
      summary = {},
    } = {}) {
      const stateStore = {
        get:
          jest.fn()
            .mockResolvedValue({
              phase:
                "shadow",

              read_backend:
                "mongo",

              shadow_reads_enabled:
                true,

              backfill_complete:
                true,

              verification_complete:
                true,

              ...state,
            }),
      };

      const observationStore = {
        summary:
          jest.fn()
            .mockResolvedValue({
              total:
                100,

              matched:
                100,

              mismatched:
                0,

              errors:
                0,

              mismatchRate:
                0,

              errorRate:
                0,

              ...summary,
            }),
      };

      return new MigrationReadinessGate({
        stateStore,

        observationStore,

        minimumComparisons:
          100,

        maximumMismatchRate:
          0,

        maximumErrorRate:
          0,
      });
    }

    test(
      "passes when shadow evidence is clean",
      async () => {
        const gate =
          createGate();

        const report =
          await gate
            .evaluate({
              scope: {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              },

              domain:
                "incidents",
            });

        expect(
          report.ready
        )
          .toBe(
            true
          );

        expect(
          report.blockers
        )
          .toEqual(
            []
          );
      }
    );

    test(
      "blocks cutover when a mismatch exists",
      async () => {
        const gate =
          createGate({
            summary: {
              total:
                100,

              matched:
                99,

              mismatched:
                1,

              mismatchRate:
                0.01,
            },
          });

        const report =
          await gate
            .evaluate({
              scope: {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              },

              domain:
                "incidents",
            });

        expect(
          report.ready
        )
          .toBe(
            false
          );

        expect(
          report.blockers
        )
          .toContain(
            "mismatchRateAcceptable"
          );
      }
    );

    test(
      "blocks cutover without enough observations",
      async () => {
        const gate =
          createGate({
            summary: {
              total:
                10,

              matched:
                10,
            },
          });

        const report =
          await gate
            .evaluate({
              scope: {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              },

              domain:
                "incidents",
            });

        expect(
          report.ready
        )
          .toBe(
            false
          );

        expect(
          report.blockers
        )
          .toContain(
            "enoughComparisons"
          );
      }
    );

    test(
      "blocks cutover when shadow reads are disabled",
      async () => {
        const gate =
          createGate({
            state: {
              shadow_reads_enabled:
                false,
            },
          });

        const report =
          await gate
            .evaluate({
              scope: {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              },

              domain:
                "incidents",
            });

        expect(
          report.ready
        )
          .toBe(
            false
          );

        expect(
          report.blockers
        )
          .toContain(
            "shadowReadsEnabled"
          );
      }
    );
  }
);