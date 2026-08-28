"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const BACKEND_ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


function source(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      BACKEND_ROOT,
      relativePath
    ),
    "utf8"
  );
}


describe(
  "Phase 18.6 Mongo Playbook/Runbook canonical retirement",
  () => {

    test(
      "PlaybookRegistry no longer owns an in-memory canonical Map",
      () => {

        const text =
          source(
            "playbooks/registry/playbookRegistry.js"
          );


        expect(
          text
        )
          .toMatch(
            /PostgresPlaybookRepository/
          );


        expect(
          text
        )
          .not
          .toMatch(
            /this\._store\s*=\s*new\s+Map\s*\(/
          );
      }
    );


    test(
      "PlaybookRegistry does not import Playbook Mongo model",
      () => {

        const text =
          source(
            "playbooks/registry/playbookRegistry.js"
          );


        expect(
          text
        )
          .not
          .toMatch(
            /require\s*\(\s*["'][^"']*models\/Playbook["']\s*\)/
          );


        expect(
          text
        )
          .not
          .toMatch(
            /mongoose/i
          );
      }
    );


    test(
      "RunbookRegistry does not import Runbook Mongo model",
      () => {

        const text =
          source(
            "runbooks/registry/runbookRegistry.js"
          );


        expect(
          text
        )
          .toMatch(
            /PostgresRunbookRepository/
          );


        expect(
          text
        )
          .not
          .toMatch(
            /require\s*\(\s*["'][^"']*models\/Runbook["']\s*\)/
          );
      }
    );


    test(
      "RunbookRegistry no longer performs Mongoose persistence operations",
      () => {

        const text =
          source(
            "runbooks/registry/runbookRegistry.js"
          );


        expect(
          text
        )
          .not
          .toMatch(
            /\bRunbook\.(find|findOne|create|updateOne|findOneAndUpdate|deleteOne)\s*\(/
          );


        expect(
          text
        )
          .not
          .toMatch(
            /mongoose/i
          );
      }
    );


    test(
      "PostgreSQL Playbook repository is canonical",
      () => {

        const text =
          source(
            "persistence/postgres/PostgresPlaybookRepository.js"
          );


        expect(
          text
        )
          .toMatch(
            /knowledge\.playbook_definitions/
          );


        expect(
          text
        )
          .toMatch(
            /knowledge\.playbook_versions/
          );
      }
    );


    test(
      "PostgreSQL Runbook repository is canonical",
      () => {

        const text =
          source(
            "persistence/postgres/PostgresRunbookRepository.js"
          );


        expect(
          text
        )
          .toMatch(
            /knowledge\.runbook_definitions/
          );


        expect(
          text
        )
          .toMatch(
            /knowledge\.runbook_versions/
          );
      }
    );


    test(
      "definition registries preserve non-authorizing semantics",
      () => {

        const playbook =
          source(
            "playbooks/registry/playbookRegistry.js"
          );


        const runbook =
          source(
            "runbooks/registry/runbookRegistry.js"
          );


        expect(
          playbook
        )
          .toMatch(
            /executionAuthorized:\s*false/
          );


        expect(
          runbook
        )
          .toMatch(
            /executionAuthorized:\s*false/
          );
      }
    );


    test(
      "execution Mongo retirement is intentionally not claimed by 18.6",
      () => {

        const expectedLegacyModels = [
          "models/PlaybookExecution.js",
          "models/RunbookExecution.js",
        ];


        for (
          const relativePath
          of expectedLegacyModels
        ) {
          expect(
            fs.existsSync(
              path.join(
                BACKEND_ROOT,
                relativePath
              )
            )
          )
            .toBe(
              true
            );
        }
      }
    );
  }
);