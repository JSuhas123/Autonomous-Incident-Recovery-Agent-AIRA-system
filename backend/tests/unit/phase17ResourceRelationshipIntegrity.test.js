"use strict";

const fs = require(
  "node:fs"
);

const path = require(
  "node:path"
);


describe(
  "Phase 17.6 - Resource Relationship PostgreSQL integrity",
  function () {
    let migration;


    beforeAll(
      function () {
        migration =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/migrations/0068_resource_relationship_integrity.sql"
            ),

            "utf8"
          );
      }
    );


    test(
      "validates source and target Resource scope",
      function () {
        expect(
          migration
        ).toContain(
          "aira_validate_resource_relationship_scope"
        );


        expect(
          migration
        ).toContain(
          "RELATIONSHIP_SOURCE_RESOURCE_NOT_FOUND"
        );


        expect(
          migration
        ).toContain(
          "RELATIONSHIP_TARGET_RESOURCE_NOT_FOUND"
        );


        expect(
          migration
        ).toContain(
          "RELATIONSHIP_SOURCE_ORGANIZATION_MISMATCH"
        );


        expect(
          migration
        ).toContain(
          "RELATIONSHIP_TARGET_ORGANIZATION_MISMATCH"
        );


        expect(
          migration
        ).toContain(
          "RELATIONSHIP_SOURCE_ENVIRONMENT_MISMATCH"
        );


        expect(
          migration
        ).toContain(
          "RELATIONSHIP_TARGET_ENVIRONMENT_MISMATCH"
        );
      }
    );


    test(
      "guards relationship temporal validity",
      function () {
        expect(
          migration
        ).toContain(
          "RELATIONSHIP_VALIDITY_INVALID"
        );


        expect(
          migration
        ).toMatch(
          /NEW\.valid_to[\s\S]*NEW\.valid_from/i
        );
      }
    );


    test(
      "prevents duplicate live semantic edges",
      function () {
        expect(
          migration
        ).toContain(
          "idx_resource_relationships_one_live_edge"
        );


        expect(
          migration
        ).toMatch(
          /WHERE[\s\S]*status\s*=\s*'ACTIVE'[\s\S]*valid_to\s+IS\s+NULL/i
        );
      }
    );


    test(
      "does not create competing relationship table",
      function () {
        expect(
          migration
        ).not.toMatch(
          /CREATE\s+TABLE[\s\S]*resource_relationships/i
        );
      }
    );


    test(
      "does not implement relationship history prematurely",
      function () {
        expect(
          migration
        ).not.toMatch(
          /INSERT\s+INTO\s+resources\.relationship_history/i
        );
      }
    );
  }
);