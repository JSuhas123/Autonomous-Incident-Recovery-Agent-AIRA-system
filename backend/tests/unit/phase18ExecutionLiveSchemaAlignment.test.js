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
  "Phase 18.7 execution persistence live-schema alignment",
  () => {

    const playbookRepository =
      read(
        "persistence/postgres/PostgresPlaybookExecutionRepository.js"
      );


    const runbookRepository =
      read(
        "persistence/postgres/PostgresRunbookExecutionRepository.js"
      );


    const migration =
      read(
        "persistence/postgres/migrations/0074_execution_version_binding_integrity.sql"
      );


    test(
      "Playbook execution resolves canonical playbook_key",
      () => {

        expect(
          playbookRepository
        )
          .toMatch(
            /pd\.playbook_key\s*=\s*\$1/
          );


        expect(
          playbookRepository
        )
          .not
          .toMatch(
            /pd\.playbook_id\s*=\s*\$1/
          );
      }
    );


    test(
      "Runbook execution resolves canonical runbook_key",
      () => {

        expect(
          runbookRepository
        )
          .toMatch(
            /rd\.runbook_key\s*=\s*\$1/
          );


        expect(
          runbookRepository
        )
          .not
          .toMatch(
            /rd\.runbook_id\s*=\s*\$1/
          );
      }
    );


    test(
      "Playbook execution resolves incident public_id",
      () => {

        expect(
          playbookRepository
        )
          .toMatch(
            /OR public_id = \$1/
          );


        expect(
          playbookRepository
        )
          .not
          .toMatch(
            /OR incident_id = \$1/
          );
      }
    );


    test(
      "Runbook execution resolves incident public_id",
      () => {

        expect(
          runbookRepository
        )
          .toMatch(
            /OR public_id = \$1/
          );


        expect(
          runbookRepository
        )
          .not
          .toMatch(
            /OR incident_id = \$1/
          );
      }
    );


    test(
      "one initial pending Playbook binding is explicitly supported",
      () => {

        expect(
          migration
        )
          .toMatch(
            /OLD\.playbook_checksum\s*=\s*'pending'/
          );


        expect(
          migration
        )
          .toMatch(
            /NEW\.playbook_checksum\s*<>\s*'pending'/
          );


        expect(
          migration
        )
          .toMatch(
            /OLD\.status IN\s*\(\s*'CREATED',\s*'EVALUATING'\s*\)/
          );
      }
    );


    test(
      "later Playbook identity mutation remains blocked",
      () => {

        expect(
          migration
        )
          .toContain(
            "PLAYBOOK_EXECUTION_IMMUTABLE_VERSION_BINDING_VIOLATION"
          );


        expect(
          migration
        )
          .toContain(
            "PLAYBOOK_EXECUTION_IMMUTABLE_IDENTITY_VIOLATION"
          );
      }
    );


    test(
      "Playbook execution binding verifies canonical checksum",
      () => {

        expect(
          migration
        )
          .toContain(
            "PLAYBOOK_EXECUTION_PLAYBOOK_CHECKSUM_MISMATCH"
          );
      }
    );


    test(
      "Runbook execution binding verifies canonical checksum",
      () => {

        expect(
          migration
        )
          .toContain(
            "RUNBOOK_EXECUTION_RUNBOOK_CHECKSUM_MISMATCH"
          );
      }
    );


    test(
      "execution binding remains non-authorizing",
      () => {

        expect(
          migration
        )
          .not
          .toMatch(
            /execution_authorized\s*=\s*TRUE/i
          );


        expect(
          playbookRepository
        )
          .toMatch(
            /executionAuthorized:\s*false/
          );


        expect(
          runbookRepository
        )
          .toMatch(
            /executionAuthorized:\s*false/
          );
      }
    );
  }
);