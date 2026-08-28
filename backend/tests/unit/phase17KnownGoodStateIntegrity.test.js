"use strict";

const fs = require(
  "node:fs"
);

const path = require(
  "node:path"
);


describe(
  "Phase 17.5 - Known-Good State PostgreSQL integrity",
  function () {
    let migration;


    beforeAll(
      function () {
        migration =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/migrations/0067_known_good_state_integrity.sql"
            ),

            "utf8"
          );
      }
    );


    test(
      "validates Resource and ResourceState scope",
      function () {
        expect(
          migration
        ).toContain(
          "aira_validate_known_good_state_scope"
        );


        expect(
          migration
        ).toContain(
          "KNOWN_GOOD_STATE_RESOURCE_MISMATCH"
        );


        expect(
          migration
        ).toContain(
          "KNOWN_GOOD_STATE_ORGANIZATION_MISMATCH"
        );


        expect(
          migration
        ).toContain(
          "KNOWN_GOOD_STATE_ENVIRONMENT_MISMATCH"
        );
      }
    );


    test(
      "freezes evidence and provenance",
      function () {
        expect(
          migration
        ).toContain(
          "aira_guard_known_good_state_update"
        );


        expect(
          migration
        ).toContain(
          "KNOWN_GOOD_STATE_EVIDENCE_IMMUTABLE"
        );
      }
    );


    test(
      "allows lifecycle fields to remain outside immutable evidence check",
      function () {
        const functionStart =
          migration.indexOf(
            "aira_guard_known_good_state_update"
          );


        const functionBody =
          migration.slice(
            functionStart
          );


        expect(
          functionBody
        ).not.toMatch(
          /NEW\.status\s+IS\s+DISTINCT\s+FROM\s+OLD\.status/i
        );


        expect(
          functionBody
        ).not.toMatch(
          /NEW\.valid_until\s+IS\s+DISTINCT\s+FROM\s+OLD\.valid_until/i
        );


        expect(
          functionBody
        ).not.toMatch(
          /NEW\.superseded_by\s+IS\s+DISTINCT\s+FROM\s+OLD\.superseded_by/i
        );
      }
    );


    test(
      "does not recreate canonical known-good table",
      function () {
        expect(
          migration
        ).not.toMatch(
          /CREATE\s+TABLE[\s\S]*resources\.known_good_states/i
        );
      }
    );
  }
);