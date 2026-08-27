"use strict";


const {
  MemoryTrustScorer,
  MEMORY_STATUS_SCORE,
} =
  require(
    "../../services/memory/context/memoryTrustScorer"
  );


describe(
  "Phase 16.14D memory trust scoring",
  () => {

    let scorer;


    const now =
      new Date(
        "2026-08-28T00:00:00.000Z"
      );


    beforeEach(
      () => {
        scorer =
          new MemoryTrustScorer({
            freshnessHalfLifeDays:
              30,
          });
      }
    );


    function memory(
      overrides =
        {}
    ) {
      return {
        publicId:
          "mem-test",

        memoryType:
          "EPISODIC",

        scopeType:
          "INCIDENT",

        status:
          "ACTIVE",

        confidence:
          0.9,

        trustScore:
          0.9,

        evidenceCount:
          5,

        sourceCount:
          4,

        observedAt:
          "2026-08-28T00:00:00.000Z",

        metadata: {
          executionAuthorized:
            false,
        },

        ...overrides,
      };
    }


    test(
      "active trusted evidence receives high score",
      () => {
        const result =
          scorer.score({
            memory:
              memory(),

            scopeScore:
              600,

            now,
          });


        expect(
          result.score
        ).toBeGreaterThan(
          0.85
        );


        expect(
          result.components.scope
        ).toBe(
          1
        );


        expect(
          result.components.status
        ).toBe(
          1
        );
      }
    );


    test(
      "scope score is normalized from operational hierarchy",
      () => {
        expect(
          scorer.normalizeScopeScore(
            600
          )
        ).toBe(
          1
        );


        expect(
          scorer.normalizeScopeScore(
            300
          )
        ).toBe(
          0.5
        );


        expect(
          scorer.normalizeScopeScore(
            100
          )
        ).toBeCloseTo(
          1 /
          6
        );
      }
    );


    test(
      "evidence strength saturates instead of growing without bound",
      () => {
        expect(
          scorer.normalizeEvidenceCount(
            0
          )
        ).toBe(
          0
        );


        expect(
          scorer.normalizeEvidenceCount(
            1
          )
        ).toBe(
          0.2
        );


        expect(
          scorer.normalizeEvidenceCount(
            5
          )
        ).toBe(
          1
        );


        expect(
          scorer.normalizeEvidenceCount(
            500
          )
        ).toBe(
          1
        );
      }
    );


    test(
      "multiple provenance sources strengthen memory trust",
      () => {
        expect(
          scorer.normalizeSourceCount(
            1
          )
        ).toBe(
          0.25
        );


        expect(
          scorer.normalizeSourceCount(
            4
          )
        ).toBe(
          1
        );


        expect(
          scorer.normalizeSourceCount(
            20
          )
        ).toBe(
          1
        );
      }
    );


    test(
      "freshness decays with time",
      () => {
        const fresh =
          scorer.calculateFreshness(
            memory({
              observedAt:
                "2026-08-28T00:00:00.000Z",
            }),
            now
          );


        const thirtyDaysOld =
          scorer.calculateFreshness(
            memory({
              observedAt:
                "2026-07-29T00:00:00.000Z",
            }),
            now
          );


        const veryOld =
          scorer.calculateFreshness(
            memory({
              observedAt:
                "2025-08-28T00:00:00.000Z",
            }),
            now
          );


        expect(
          fresh
        ).toBeCloseTo(
          1
        );


        expect(
          thirtyDaysOld
        ).toBeCloseTo(
          0.5
        );


        expect(
          veryOld
        ).toBeLessThan(
          thirtyDaysOld
        );
      }
    );


    test(
      "confirmed successful outcome receives maximum outcome quality",
      () => {
        const result =
          scorer.calculateOutcomeQuality(
            memory({
              memoryType:
                "OUTCOME",

              metadata: {
                recoveryConfirmed:
                  true,
              },
            })
          );


        expect(
          result
        ).toBe(
          1
        );
      }
    );


    test(
      "failed outcome is not treated as successful recovery evidence",
      () => {
        const result =
          scorer.calculateOutcomeQuality(
            memory({
              memoryType:
                "OUTCOME",

              metadata: {
                recoveryConfirmed:
                  false,
              },
            })
          );


        expect(
          result
        ).toBe(
          0.25
        );
      }
    );


    test(
      "revoked memory receives zero status contribution",
      () => {
        expect(
          MEMORY_STATUS_SCORE.REVOKED
        ).toBe(
          0
        );


        expect(
          scorer.calculateStatusScore(
            memory({
              status:
                "REVOKED",
            })
          )
        ).toBe(
          0
        );
      }
    );


    test(
      "strong service evidence can outrank weak incident evidence",
      () => {
        const weakIncident = {
          memory:
            memory({
              publicId:
                "weak-incident",

              confidence:
                0.15,

              trustScore:
                0.15,

              evidenceCount:
                0,

              sourceCount:
                0,

              observedAt:
                "2025-08-28T00:00:00.000Z",

              status:
                "STALE",

              metadata: {
                recoveryConfirmed:
                  false,
              },
            }),

          resolution: {
            scopeType:
              "INCIDENT",

            scopeScore:
              600,
          },
        };


        const strongService = {
          memory:
            memory({
              publicId:
                "strong-service",

              memoryType:
                "PROCEDURAL",

              scopeType:
                "SERVICE",

              confidence:
                0.98,

              trustScore:
                0.98,

              evidenceCount:
                12,

              sourceCount:
                8,

              observedAt:
                "2026-08-28T00:00:00.000Z",

              status:
                "ACTIVE",

              metadata: {
                outcomeQuality:
                  1,
              },
            }),

          resolution: {
            scopeType:
              "SERVICE",

            scopeScore:
              400,
          },
        };


        const result =
          scorer.scoreMany({
            resolvedMemories: [
              weakIncident,
              strongService,
            ],

            now,
          });


        expect(
          result[0]
            .memory
            .publicId
        ).toBe(
          "strong-service"
        );


        expect(
          result[0]
            .trust
            .score
        ).toBeGreaterThan(
          result[1]
            .trust
            .score
        );
      }
    );


    test(
      "equally trusted incident evidence outranks broader scope",
      () => {
        const incident = {
          memory:
            memory({
              publicId:
                "incident",
            }),

          resolution: {
            scopeType:
              "INCIDENT",

            scopeScore:
              600,
          },
        };


        const service = {
          memory:
            memory({
              publicId:
                "service",

              scopeType:
                "SERVICE",
            }),

          resolution: {
            scopeType:
              "SERVICE",

            scopeScore:
              400,
          },
        };


        const result =
          scorer.scoreMany({
            resolvedMemories: [
              service,
              incident,
            ],

            now,
          });


        expect(
          result[0]
            .memory
            .publicId
        ).toBe(
          "incident"
        );
      }
    );


    test(
      "trust scoring never grants execution authority",
      () => {
        const result =
          scorer.score({
            memory:
              memory({
                trustScore:
                  1,

                confidence:
                  1,

                metadata: {
                  executionAuthorized:
                    true,
                },
              }),

            scopeScore:
              600,

            now,
          });


        expect(
          result.safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.safety
            .grantsExecutionPermission
        ).toBe(
          false
        );


        expect(
          result.safety
            .bypassesPolicy
        ).toBe(
          false
        );


        expect(
          result.safety
            .suppressesAlerts
        ).toBe(
          false
        );
      }
    );


    test(
      "scores are always constrained to zero through one",
      () => {
        const result =
          scorer.score({
            memory:
              memory({
                confidence:
                  900,

                trustScore:
                  -50,

                evidenceCount:
                  100000,

                sourceCount:
                  100000,
              }),

            scopeScore:
              999999,

            now,
          });


        expect(
          result.score
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          result.score
        ).toBeLessThanOrEqual(
          1
        );


        for (
          const component
          of Object.values(
            result.components
          )
        ) {
          expect(
            component
          ).toBeGreaterThanOrEqual(
            0
          );


          expect(
            component
          ).toBeLessThanOrEqual(
            1
          );
        }
      }
    );
  }
);