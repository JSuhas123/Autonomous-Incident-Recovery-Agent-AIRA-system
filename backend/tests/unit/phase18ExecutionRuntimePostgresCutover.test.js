"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


function read(
  relative
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relative
    ),
    "utf8"
  );
}


describe(
  "Phase 18.7B PostgreSQL execution runtime cutover",
  () => {

    const playbookService =
      read(
        "playbooks/execution/playbookExecutionService.js"
      );


    const runbookEngine =
      read(
        "runbooks/execution/runbookExecutionEngine.js"
      );


    const playbookAdapter =
      read(
        "persistence/postgres/PostgresPlaybookExecutionAdapter.js"
      );


    const runbookAdapter =
      read(
        "persistence/postgres/PostgresRunbookExecutionAdapter.js"
      );


    test(
      "Playbook runtime no longer imports Mongo PlaybookExecution model",
      () => {

        expect(
          playbookService
        )
          .not
          .toMatch(
            /models\/PlaybookExecution/
          );


        expect(
          playbookService
        )
          .toMatch(
            /PostgresPlaybookExecutionAdapter/
          );
      }
    );


    test(
      "Runbook runtime no longer imports Mongo RunbookExecution model",
      () => {

        expect(
          runbookEngine
        )
          .not
          .toMatch(
            /models\/RunbookExecution/
          );


        expect(
          runbookEngine
        )
          .toMatch(
            /PostgresRunbookExecutionAdapter/
          );
      }
    );


   test(
  "Playbook adapter delegates to PostgreSQL repository without Mongo persistence",
  () => {

    expect(
      playbookAdapter
    )
      .toMatch(
        /PostgresPlaybookExecutionRepository/
      );


    expect(
      playbookAdapter
    )
      .not
      .toMatch(
        /require\s*\(\s*["']mongoose["']\s*\)/
      );


    expect(
      playbookAdapter
    )
      .not
      .toMatch(
        /require\s*\(\s*["'][^"']*models\/PlaybookExecution["']\s*\)/
      );
  }
);
test(
  "Runbook adapter delegates to PostgreSQL repository without Mongo persistence",
  () => {

    expect(
      runbookAdapter
    )
      .toMatch(
        /PostgresRunbookExecutionRepository/
      );


    expect(
      runbookAdapter
    )
      .not
      .toMatch(
        /require\s*\(\s*["']mongoose["']\s*\)/
      );


    expect(
      runbookAdapter
    )
      .not
      .toMatch(
        /require\s*\(\s*["'][^"']*models\/RunbookExecution["']\s*\)/
      );
  }
);


    test(
      "Playbook adapter supports existing document compatibility contract",
      () => {

        expect(
          playbookAdapter
        )
          .toMatch(
            /"save"/
          );


        expect(
          playbookAdapter
        )
          .toMatch(
            /"toObject"/
          );


        expect(
          playbookAdapter
        )
          .toMatch(
            /"markModified"/
          );
      }
    );


    test(
      "Runbook adapter supports existing execution engine contract",
      () => {

        expect(
          runbookAdapter
        )
          .toMatch(
            /function updateOne/
          );


        expect(
          runbookAdapter
        )
          .toMatch(
            /function findOne/
          );


        expect(
          runbookAdapter
        )
          .toMatch(
            /lean\(\)/
          );
      }
    );


    test(
      "Runbook execution filter includes complete tenant scope",
      () => {

        expect(
          runbookEngine
        )
          .toMatch(
            /tenantId:\s*execution\.tenantId/
          );


        expect(
          runbookEngine
        )
          .toMatch(
            /organizationId:\s*execution\.organizationId/
          );


        expect(
          runbookEngine
        )
          .toMatch(
            /environmentId:\s*execution\.environmentId/
          );
      }
    );


    test(
      "Playbook adapter performs exact version binding",
      () => {

        expect(
          playbookAdapter
        )
          .toMatch(
            /bindResolvedVersion/
          );


        expect(
          playbookAdapter
        )
          .toMatch(
            /persistedChecksum\s*===\s*"pending"/
          );
      }
    );


    test(
      "Runbook step attempts use PostgreSQL append semantics",
      () => {

        expect(
          runbookAdapter
        )
          .toMatch(
            /appendStepAttempt/
          );
      }
    );


    test(
      "neither active adapter grants execution authorization",
      () => {

        expect(
          playbookAdapter
        )
          .not
          .toMatch(
            /executionAuthorized\s*:\s*true/i
          );


        expect(
          runbookAdapter
        )
          .not
          .toMatch(
            /executionAuthorized\s*:\s*true/i
          );
      }
    );
  }
);