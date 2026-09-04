"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  VALIDATION_STAGE,

  REPLAY_BINDING_ROLE,

  assertValidationCannotAuthorize,
} =
  require(
    "../../contracts/humanLearningValidation"
  );


describe(
  "AIRA Phase 24.4 — learning validation foundation",
  () => {
    test(
      "defines the four validation stages",
      () => {
        expect(
          Object.values(
            VALIDATION_STAGE
          )
        ).toEqual([
          "REPLAY",
          "RELIABILITY_LAB",
          "REGRESSION",
          "SAFETY",
        ]);
      }
    );


    test(
      "supports source, similar, negative and counterexample replay roles",
      () => {
        expect(
          Object.values(
            REPLAY_BINDING_ROLE
          )
        ).toEqual([
          "SOURCE_INCIDENT",
          "SIMILAR_CASE",
          "NEGATIVE_CASE",
          "COUNTEREXAMPLE",
        ]);
      }
    );


    test(
      "validation cannot manufacture authority",
      () => {
        expect(
          () =>
            assertValidationCannotAuthorize({
              executionAuthorized:
                true,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
          })
        );


        expect(
          () =>
            assertValidationCannotAuthorize({
              productionAuthorized:
                true,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_LEARNING_VALIDATION_AUTHORITY_FORBIDDEN",
          })
        );


        expect(
          () =>
            assertValidationCannotAuthorize({
              autonomyPromoted:
                true,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_LEARNING_VALIDATION_AUTHORITY_FORBIDDEN",
          })
        );
      }
    );


    test(
      "migration creates authoritative validation structures with FORCE RLS",
      () => {
        const source =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/migrations/0100_learning_validation_foundation.sql"
            ),

            "utf8"
          );


        for (
          const table
          of [
            "validation_runs",
            "validation_stages",
            "validation_evidence",
            "replay_bindings",
          ]
        ) {
          expect(
            source
          ).toContain(
            `learning.${table}`
          );
        }


        expect(
          (
            source.match(
              /FORCE ROW LEVEL SECURITY/g
            )
            ||
            []
          ).length
        ).toBeGreaterThanOrEqual(
          4
        );


        expect(
          source
        ).toMatch(
          /execution_authorized[\s\S]*FALSE/
        );
      }
    );
  }
);