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
  "Phase 21 recovery decision PostgreSQL schema parity",
  () => {
    test(
      "recovery_decisions insert respects canonical recovery revision schema",
      () => {
        const repositoryPath =
          path.resolve(
            __dirname,
            "../../persistence/postgres/PostgresRecoveryDecisionRepository.js"
          );


        const migrationPath =
          path.resolve(
            __dirname,
            "../../persistence/postgres/migrations/0003_intelligence_recovery_execution.sql"
          );


        const repositorySource =
          fs.readFileSync(
            repositoryPath,
            "utf8"
          );


        const migrationSource =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        // =====================================================================
        // LOCATE createDecision
        // =====================================================================

        const createDecisionStart =
          repositorySource
            .indexOf(
              "async createDecision("
            );


        expect(
          createDecisionStart
        )
          .toBeGreaterThanOrEqual(
            0
          );


        const createDecisionSource =
          repositorySource
            .slice(
              createDecisionStart
            );


        // =====================================================================
        // PARSE ACTUAL INSERT COLUMN LIST
        // =====================================================================

        const insertMatch =
          createDecisionSource
            .match(
              /INSERT\s+INTO\s+execution\.recovery_decisions\s*\(([\s\S]*?)\)\s*VALUES\s*\(/i
            );


        expect(
          insertMatch
        )
          .not
          .toBeNull();


        const insertColumns =
          insertMatch[1]
            .split(
              ","
            )
            .map(
              value =>
                value
                  .trim()
                  .toLowerCase()
            )
            .filter(
              Boolean
            );


        // =====================================================================
        // INVALID COLUMN MUST NOT BE INSERTED
        // =====================================================================

        /*
         * diagnosis_revision belongs to recovery_decision_runs,
         * not recovery_decisions.
         */
        expect(
          insertColumns
        )
          .not
          .toContain(
            "diagnosis_revision"
          );


        // =====================================================================
        // REQUIRED CANONICAL COLUMNS
        // =====================================================================

        expect(
          insertColumns
        )
          .toContain(
            "diagnosis_id"
          );


        expect(
          insertColumns
        )
          .toContain(
            "run_id"
          );


        expect(
          insertColumns
        )
          .toContain(
            "revision"
          );


        expect(
          insertColumns
        )
          .toContain(
            "is_current"
          );


        expect(
          insertColumns
        )
          .toContain(
            "execution_authorized"
          );


        // =====================================================================
        // ORIGINAL recovery_decisions TABLE
        // =====================================================================

        const recoveryDecisionTableMatch =
          migrationSource
            .match(
              /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+execution\.recovery_decisions\s*\(([\s\S]*?)\);/i
            );


        expect(
          recoveryDecisionTableMatch
        )
          .not
          .toBeNull();


        const recoveryDecisionTable =
          recoveryDecisionTableMatch[1]
            .toLowerCase();


        expect(
          recoveryDecisionTable
        )
          .not
          .toMatch(
            /\bdiagnosis_revision\b/
          );


        expect(
          recoveryDecisionTable
        )
          .toMatch(
            /\bdiagnosis_id\b/
          );


        expect(
          recoveryDecisionTable
        )
          .toMatch(
            /\brun_id\b/
          );


        expect(
          recoveryDecisionTable
        )
          .toMatch(
            /\brevision\b/
          );


        expect(
          recoveryDecisionTable
        )
          .toMatch(
            /\bis_current\b/
          );


        expect(
          recoveryDecisionTable
        )
          .toMatch(
            /\bexecution_authorized\b/
          );


        // =====================================================================
        // REVISION UNIQUENESS
        // =====================================================================

        /*
         * Revision identity is incident-scoped.
         *
         * Every recovery decision persisted for the same incident must use
         * a unique monotonically increasing revision.
         */
        expect(
          migrationSource
            .toLowerCase()
        )
          .toMatch(
            /idx_recovery_decision_revision[\s\S]*?incident_id[\s\S]*?revision/
          );


        // =====================================================================
        // CURRENT DECISION UNIQUENESS
        // =====================================================================

        expect(
          migrationSource
            .toLowerCase()
        )
          .toMatch(
            /idx_recovery_decision_current[\s\S]*?incident_id[\s\S]*?where\s+is_current\s*=\s*true/
          );


        // =====================================================================
        // diagnosis_revision VALIDLY EXISTS ON RUN TABLE
        // =====================================================================

        const recoveryDecisionRunsMatch =
          migrationSource
            .match(
              /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+execution\.recovery_decision_runs\s*\(([\s\S]*?)\);/i
            );


        expect(
          recoveryDecisionRunsMatch
        )
          .not
          .toBeNull();


        expect(
          recoveryDecisionRunsMatch[1]
            .toLowerCase()
        )
          .toMatch(
            /\bdiagnosis_revision\b/
          );
      }
    );
  }
);