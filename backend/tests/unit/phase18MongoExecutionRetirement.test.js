"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8"
  );
}

describe(
  "Phase 18.7C Mongo execution retirement",
  () => {
    const playbookRuntime = read(
      "playbooks/execution/playbookExecutionService.js"
    );

    const runbookRuntime = read(
      "runbooks/execution/runbookExecutionEngine.js"
    );

    const playbookAdapter = read(
      "persistence/postgres/PostgresPlaybookExecutionAdapter.js"
    );

    const runbookAdapter = read(
      "persistence/postgres/PostgresRunbookExecutionAdapter.js"
    );

    test(
      "active Playbook execution runtime has no Mongo execution model dependency",
      () => {
        expect(playbookRuntime).not.toMatch(
          /require\s*\(\s*["'][^"']*models\/PlaybookExecution["']\s*\)/
        );

        expect(playbookRuntime).toMatch(
          /PostgresPlaybookExecutionAdapter/
        );
      }
    );

    test(
      "active Runbook execution runtime has no Mongo execution model dependency",
      () => {
        expect(runbookRuntime).not.toMatch(
          /require\s*\(\s*["'][^"']*models\/RunbookExecution["']\s*\)/
        );

        expect(runbookRuntime).toMatch(
          /PostgresRunbookExecutionAdapter/
        );
      }
    );

    test(
      "active execution runtime does not import mongoose",
      () => {
        expect(playbookRuntime).not.toMatch(
          /require\s*\(\s*["']mongoose["']\s*\)/
        );

        expect(runbookRuntime).not.toMatch(
          /require\s*\(\s*["']mongoose["']\s*\)/
        );
      }
    );

    test(
      "PostgreSQL adapters contain no Mongo model dependency",
      () => {
        expect(playbookAdapter).not.toMatch(
          /models\/PlaybookExecution/
        );

        expect(runbookAdapter).not.toMatch(
          /models\/RunbookExecution/
        );
      }
    );

    test(
      "PostgreSQL adapters delegate to canonical repositories",
      () => {
        expect(playbookAdapter).toMatch(
          /PostgresPlaybookExecutionRepository/
        );

        expect(runbookAdapter).toMatch(
          /PostgresRunbookExecutionRepository/
        );
      }
    );

    test(
      "execution history remains non-authorizing evidence",
      () => {
        expect(playbookAdapter).not.toMatch(
          /executionAuthorized\s*:\s*true/i
        );

        expect(runbookAdapter).not.toMatch(
          /executionAuthorized\s*:\s*true/i
        );
      }
    );
  }
);