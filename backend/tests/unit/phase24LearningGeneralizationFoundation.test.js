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
  assertGeneralizationCannotAuthorize,

  assertTenantCandidateScope,
} =
  require(
    "../../contracts/humanLearningGeneralization"
  );


describe(
  "AIRA Phase 24.5 — generalization foundation",
  () => {
    test(
      "tenant generalization cannot grant authority",
      () => {
        expect(
          () =>
            assertGeneralizationCannotAuthorize({
              executionAuthorized:
                true,
            })
        ).toThrow();


        expect(
          () =>
            assertGeneralizationCannotAuthorize({
              productionAuthorized:
                true,
            })
        ).toThrow();
      }
    );


    test(
      "only tenant scopes may be source knowledge",
      () => {
        expect(
          () =>
            assertTenantCandidateScope(
              "ENVIRONMENT"
            )
        ).not.toThrow();


        expect(
          () =>
            assertTenantCandidateScope(
              "ORGANIZATION"
            )
        ).not.toThrow();


        expect(
          () =>
            assertTenantCandidateScope(
              "GLOBAL"
            )
        ).toThrow();
      }
    );


    test(
      "migration keeps global proposals quarantined and RLS forced",
      () => {
        const source =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/migrations/0101_learning_scope_generalization.sql"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "learning.generalization_requests"
        );


        expect(
          source
        ).toContain(
          "learning.generalization_artifacts"
        );


        expect(
          source
        ).toContain(
          "learning.generalization_isolation_checks"
        );


        expect(
          source
        ).toContain(
          "learning.generalization_reviews"
        );


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
          /publication_eligible[\s\S]*DEFAULT FALSE/
        );


        expect(
          source
        ).toMatch(
          /requires_independent_validation[\s\S]*DEFAULT TRUE/
        );


        expect(
          source
        ).toMatch(
          /execution_authorized[\s\S]*DEFAULT FALSE/
        );
      }
    );
  }
);