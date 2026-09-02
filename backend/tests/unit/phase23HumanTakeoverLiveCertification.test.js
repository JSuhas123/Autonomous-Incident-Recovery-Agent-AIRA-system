"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const scriptPath =
  path.join(
    __dirname,
    "..",
    "..",
    "scripts",
    "certify-phase23-1-live.js"
  );


function semanticMatch(
  source,
  pattern
) {
  expect(
    source
  ).toMatch(
    pattern
  );
}


describe(
  "Phase 23.1E live certification architecture",
  () => {
    let source;


    beforeAll(
      () => {
        expect(
          fs.existsSync(
            scriptPath
          )
        ).toBe(
          true
        );


        source =
          fs.readFileSync(
            scriptPath,
            "utf8"
          );
      }
    );


    test(
      "live certification script exists",
      () => {
        expect(
          fs.existsSync(
            scriptPath
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "uses canonical PostgreSQL infrastructure",
      () => {
        expect(
          source
        ).toContain(
          "../persistence/postgres"
        );


        expect(
          source
        ).toContain(
          "PostgresTenantScope"
        );


        expect(
          source
        ).toContain(
          "PostgresHumanOperationsRepository"
        );


        expect(
          source
        ).toContain(
          "PostgresHumanTakeoverRepository"
        );
      }
    );


    test(
      "certifies every human operations table",
      () => {
        const requiredTables = [
          "tasks",
          "assignments",
          "acknowledgements",
          "resolutions",
          "takeover_sessions",
          "control_leases",
          "task_status_history",
          "takeover_events",
        ];


        for (
          const table
          of requiredTables
        ) {
          expect(
            source
          ).toContain(
            `"${table}"`
          );
        }
      }
    );


    test(
      "checks RLS enabled and FORCE RLS",
      () => {
        expect(
          source
        ).toContain(
          "relrowsecurity"
        );


        expect(
          source
        ).toContain(
          "relforcerowsecurity"
        );
      }
    );


    test(
      "performs foreign-scope read canary",
      () => {
        expect(
          source
        ).toContain(
          "foreignScopeReadCount"
        );


        expect(
          source
        ).toContain(
          "PHASE23_RLS_READ_LEAK"
        );
      }
    );


    test(
      "performs foreign-scope write canary",
      () => {
        expect(
          source
        ).toContain(
          "foreignScopeUpdateCount"
        );


        expect(
          source
        ).toContain(
          "PHASE23_RLS_WRITE_LEAK"
        );
      }
    );


    test(
      "attempts real database execution-authority violation",
      () => {
        semanticMatch(
          source,
          /execution_authorized\s*=\s*TRUE/i
        );


        expect(
          source
        ).toContain(
          "PHASE23_DATABASE_AUTHORITY_FENCE_FAILED"
        );
      }
    );


    test(
      "runs two concurrent lease acquisitions",
      () => {
        expect(
          source
        ).toContain(
          "Promise.allSettled"
        );


        const matches =
          source.match(
            /\.acquireControlLease\s*\(/g
          ) ||
          [];


        expect(
          matches.length
        ).toBeGreaterThanOrEqual(
          2
        );
      }
    );


    test(
      "requires exactly one concurrent winner and one loser",
      () => {
        /*
         * Concurrency certification:
         *
         * Two acquisition attempts race.
         *
         * Exactly:
         *
         *   1 fulfilled winner
         *   1 rejected loser
         *
         * must remain.
         *
         * Whitespace is intentionally ignored because Prettier may format:
         *
         *   winners.length ===
         *     1
         */
        semanticMatch(
          source,
          /winners\.length\s*===\s*1/
        );


        semanticMatch(
          source,
          /losers\.length\s*===\s*1/
        );


        semanticMatch(
          source,
          /activeLeaseCount\s*===\s*1/
        );


        expect(
          source
        ).toContain(
          "PHASE23_CONCURRENT_LEASE_WINNER_COUNT"
        );


        expect(
          source
        ).toContain(
          "PHASE23_CONCURRENT_LEASE_LOSER_COUNT"
        );


        expect(
          source
        ).toContain(
          "PHASE23_DATABASE_MULTIPLE_ACTIVE_LEASES"
        );
      }
    );


    test(
      "never treats takeover authorization as control",
      () => {
        semanticMatch(
          source,
          /controlGranted\s*===/
        );


        expect(
          source
        ).toContain(
          "AUTHORIZED != CONTROL"
        );
      }
    );


    test(
      "requires fresh evaluation after control release",
      () => {
        semanticMatch(
          source,
          /requiresFreshEvaluation\s*===/
        );


        expect(
          source
        ).toContain(
          "Fresh evaluation fence"
        );
      }
    );


    test(
      "explicitly prohibits stale plan resume",
      () => {
        semanticMatch(
          source,
          /stalePlanResumeAllowed\s*===/
        );


        expect(
          source
        ).toContain(
          "STALE PLAN RESUME: PROHIBITED"
        );
      }
    );


    test(
      "audits final execution authority as exactly zero",
      () => {
        semanticMatch(
          source,
          /authorityCount\s*===\s*0/
        );


        expect(
          source
        ).toContain(
          "PHASE23_EXECUTION_AUTHORITY_LEAK"
        );


        expect(
          source
        ).toContain(
          "Final execution-authority audit"
        );
      }
    );


    test(
      "live certification performs cleanup",
      () => {
        semanticMatch(
          source,
          /async\s+function\s+cleanup\s*\(/
        );


        expect(
          source
        ).toContain(
          "Certification cleanup"
        );
      }
    );


    test(
      "does not execute infrastructure recovery actions",
      () => {
        expect(
          source
        ).not.toContain(
          "kubectl "
        );


        expect(
          source
        ).not.toContain(
          "docker "
        );


        expect(
          source
        ).not.toContain(
          "child_process"
        );
      }
    );
  }
);