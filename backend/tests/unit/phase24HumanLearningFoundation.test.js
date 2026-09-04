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
  HUMAN_LEARNING_VERSION,

  TRUTH_LEVEL,

  INTERVENTION_EVENT_TYPE,

  KNOWLEDGE_CANDIDATE_TYPE,

  KNOWLEDGE_CANDIDATE_STATE,

  KNOWLEDGE_SCOPE,

  assertNoExecutionAuthority,

  assertCandidateTransition,
} =
  require(
    "../../contracts/humanLearning"
  );


function readMigration(
  name
) {
  return fs
    .readFileSync(
      path.join(
        __dirname,

        "../../persistence/postgres/migrations",

        name
      ),

      "utf8"
    );
}


describe(
  "AIRA Phase 24.0 — Human-to-AIRA learning safety foundation",
  () => {
    test(
      "exports the frozen Phase 24 contract",
      () => {
        expect(
          HUMAN_LEARNING_VERSION
        ).toBe(
          "24.0.0"
        );


        expect(
          TRUTH_LEVEL
            .CANDIDATE
        ).toBe(
          "CANDIDATE"
        );


        expect(
          INTERVENTION_EVENT_TYPE
            .QUERY_PERFORMED
        ).toBe(
          "QUERY_PERFORMED"
        );


        expect(
          KNOWLEDGE_CANDIDATE_TYPE
            .ANTI_PATTERN
        ).toBe(
          "ANTI_PATTERN"
        );


        expect(
          KNOWLEDGE_CANDIDATE_STATE
            .QUARANTINED
        ).toBe(
          "QUARANTINED"
        );


        expect(
          KNOWLEDGE_SCOPE
            .GLOBAL
        ).toBe(
          "GLOBAL"
        );
      }
    );


    test(
      "learning can never manufacture execution authority",
      () => {
        try {
          assertNoExecutionAuthority({
            executionAuthorized:
              true,
          });


          throw new Error(
            "expected authority rejection"
          );
        } catch (
          error
        ) {
          expect(
            error.code
          ).toBe(
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN"
          );


          expect(
            error.executionAuthorized
          ).toBe(
            false
          );
        }


        expect(
          () =>
            assertNoExecutionAuthority({
              executionAuthorized:
                false,
            })
        ).not.toThrow();
      }
    );


    test(
      "candidate lifecycle permits quarantine but forbids direct publication",
      () => {
        expect(
          assertCandidateTransition(
            "GENERATED",
            "QUARANTINED"
          )
        ).toBe(
          true
        );


        try {
          assertCandidateTransition(
            "GENERATED",
            "PUBLISHED"
          );


          throw new Error(
            "expected transition rejection"
          );
        } catch (
          error
        ) {
          expect(
            error.code
          ).toBe(
            "HUMAN_LEARNING_CANDIDATE_TRANSITION_FORBIDDEN"
          );
        }
      }
    );


    test(
      "migrations FORCE RLS and database-enforce no authority",
      () => {
        const intervention =
          readMigration(
            "0098_human_learning_intervention_capture.sql"
          );


        const candidates =
          readMigration(
            "0099_learning_candidate_foundation.sql"
          );


        expect(
          intervention
        ).toMatch(
          /FORCE ROW LEVEL SECURITY/
        );


        expect(
          candidates
        ).toMatch(
          /FORCE ROW LEVEL SECURITY/
        );


        expect(
          intervention
        ).toMatch(
          /execution_authorized[\s\S]*FALSE/
        );


        expect(
          candidates
        ).toMatch(
          /truth_level[\s\S]*'CANDIDATE'/
        );


        expect(
          candidates
        ).toMatch(
          /knowledge_scope[\s\S]*<>[\s\S]*'GLOBAL'/
        );
      }
    );
  }
);