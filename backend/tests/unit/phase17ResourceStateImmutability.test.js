"use strict";

const fs = require(
  "node:fs"
);

const path = require(
  "node:path"
);


describe(
  "Phase 17.4 - Resource State PostgreSQL immutability",
  function () {
    let migration;


    beforeAll(
      function () {
        const migrationPath =
          path.resolve(
            __dirname,

            "../../persistence/postgres/migrations/0066_resource_state_immutability.sql"
          );


        migration =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );
      }
    );


    test(
      "validates resource state resource scope",
      function () {
        expect(
          migration
        ).toContain(
          "aira_validate_resource_state_scope"
        );


        expect(
          migration
        ).toContain(
          "RESOURCE_STATE_RESOURCE_NOT_FOUND"
        );


        expect(
          migration
        ).toContain(
          "RESOURCE_STATE_ORGANIZATION_SCOPE_MISMATCH"
        );


        expect(
          migration
        ).toContain(
          "RESOURCE_STATE_ENVIRONMENT_SCOPE_MISMATCH"
        );
      }
    );


    test(
      "rejects resource state updates",
      function () {
        expect(
          migration
        ).toContain(
          "trg_resource_states_immutable_update"
        );


        expect(
          migration
        ).toMatch(
          /BEFORE\s+UPDATE[\s\S]*?ON\s+resources\.resource_states/i
        );
      }
    );


    test(
      "rejects resource state deletes",
      function () {
        expect(
          migration
        ).toContain(
          "trg_resource_states_immutable_delete"
        );


        expect(
          migration
        ).toMatch(
          /BEFORE\s+DELETE[\s\S]*?ON\s+resources\.resource_states/i
        );
      }
    );


    test(
      "uses shared immutable mutation guard",
      function () {
        expect(
          migration
        ).toContain(
          "aira_prevent_resource_state_mutation"
        );


        expect(
          migration
        ).toContain(
          "RESOURCE_STATE_IMMUTABLE"
        );
      }
    );


    test(
      "does not recreate or replace canonical resource state table",
      function () {
        expect(
          migration
        ).not.toMatch(
          /CREATE\s+TABLE[\s\S]*resources\.resource_states/i
        );
      }
    );
  }
);