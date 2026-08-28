
"use strict";

const fs =
  require("fs");

const path =
  require("path");


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}


describe(
  "Phase 18 execution lineage",
  () => {
    const playbookService =
      read(
        "playbooks/execution/playbookExecutionService.js"
      );

    const runbookEngine =
      read(
        "runbooks/execution/runbookExecutionEngine.js"
      );

    test(
      "Playbook execution passes parent execution identity into Runbook execution",
      () => {
        expect(
          playbookService
        ).toMatch(
          /playbookExecutionId\s*:\s*record\.executionId/
        );

        expect(
          playbookService
        ).toMatch(
          /playbookExecutionId\s*:\s*options\.playbookExecutionId/
        );
      }
    );


    test(
      "Runbook execution persists parent Playbook execution identity",
      () => {
        expect(
          runbookEngine
        ).toMatch(
          /playbookExecutionId\s*:\s*executionInput\.playbookExecutionId/
        );
      }
    );


    test(
      "execution lineage remains non-authorizing",
      () => {
        expect(
          playbookService
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );

        expect(
          runbookEngine
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );
  }
);