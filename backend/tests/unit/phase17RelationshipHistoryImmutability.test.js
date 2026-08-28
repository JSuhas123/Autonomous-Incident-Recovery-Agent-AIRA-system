"use strict";

const fs = require(
  "node:fs"
);

const path = require(
  "node:path"
);


describe(
  "Phase 17.7 - Temporal relationship integrity",
  function () {
    let migration;


    beforeAll(
      function () {
        migration =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/migrations/0069_relationship_history_immutability.sql"
            ),

            "utf8"
          );
      }
    );


    test(
      "relationship history is immutable",
      function () {
        expect(
          migration
        ).toContain(
          "trg_relationship_history_immutable_update"
        );

        expect(
          migration
        ).toContain(
          "trg_relationship_history_immutable_delete"
        );

        expect(
          migration
        ).toContain(
          "TEMPORAL_GRAPH_EVIDENCE_IMMUTABLE"
        );
      }
    );


    test(
      "graph change events are immutable",
      function () {
        expect(
          migration
        ).toContain(
          "trg_graph_change_events_immutable_update"
        );

        expect(
          migration
        ).toContain(
          "trg_graph_change_events_immutable_delete"
        );
      }
    );


    test(
      "history is validated against canonical relationship scope",
      function () {
        expect(
          migration
        ).toContain(
          "aira_validate_relationship_history_scope"
        );

        expect(
          migration
        ).toContain(
          "RELATIONSHIP_HISTORY_ORGANIZATION_MISMATCH"
        );

        expect(
          migration
        ).toContain(
          "RELATIONSHIP_HISTORY_ENVIRONMENT_MISMATCH"
        );
      }
    );


    test(
      "does not recreate temporal tables",
      function () {
        expect(
          migration
        ).not.toMatch(
          /CREATE\s+TABLE[\s\S]*relationship_history/i
        );

        expect(
          migration
        ).not.toMatch(
          /CREATE\s+TABLE[\s\S]*graph_change_events/i
        );
      }
    );
  }
);