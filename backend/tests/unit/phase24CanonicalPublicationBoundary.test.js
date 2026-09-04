"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


describe(
  "AIRA Phase 24.8 — canonical Phase 18 publication boundary",
  () => {
    test(
      "existing Phase 18 repositories still reject uncontrolled GLOBAL writes",
      () => {
        const playbookSource =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/PostgresPlaybookRepository.js"
            ),

            "utf8"
          );


        const runbookSource =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/PostgresRunbookRepository.js"
            ),

            "utf8"
          );


        expect(
          playbookSource
        ).toContain(
          "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
        );


        expect(
          runbookSource
        ).toContain(
          "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
        );
      }
    );


    test(
      "learning publisher delegates to canonical Phase 18 repositories",
      () => {
        const source =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../services/humanLearning/learningKnowledgePublicationService.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "runbookRepository"
        );


        expect(
          source
        ).toContain(
          "playbookRepository"
        );


        expect(
          source
        ).not.toMatch(
          /INSERT\s+INTO\s+knowledge\./i
        );
      }
    );
  }
);