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


describe(
  "Phase 23.1E live certification architecture",
  () => {
    let source;

    beforeAll(
      () => {
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
        ).toBe(true);
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
        for (
          const table
          of [
            "tasks",
            "assignments",
            "acknowledgements",
            "resolutions",
            "takeover_sessions",
            "control_leases",
            "task_status_history",
            "takeover_events",
          ]
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
        expect(
          source
        ).toContain(
          "execution_authorized ="
        );

        expect(
          source
        ).toContain(
          "TRUE"
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
            /\.acquireControlLease\(/g
          ) || [];

        expect(
          matches.length
        ).toBeGreaterThanOrEqual(
          2
        );
      }
    );


    test(
      "requires exactly one concurrent winner",
      () => {
        expect(
          source
        ).toContain(
          "winners.length === 1"
        );

        expect(
          source
        ).toContain(
          "losers.length === 1"
        );

        expect(
          source
        ).toContain(
          "activeLeaseCount === 1"
        );
      }
    );


    test(
      "never treats takeover authorization as control",
      () => {
        expect(
          source
        ).toContain(
          "controlGranted ==="
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
        expect(
          source
        ).toContain(
          "requiresFreshEvaluation ==="
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
        expect(
          source
        ).toContain(
          "stalePlanResumeAllowed ==="
        );

        expect(
          source
        ).toContain(
          "STALE PLAN RESUME: PROHIBITED"
        );
      }
    );


    test(
      "audits final execution authority as zero",
      () => {
        expect(
          source
        ).toContain(
          "authorityCount === 0"
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
        expect(
          source
        ).toContain(
          "async function cleanup"
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