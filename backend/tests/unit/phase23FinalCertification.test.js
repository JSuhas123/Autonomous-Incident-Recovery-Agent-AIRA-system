"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  PHASE23_FINAL_INVARIANTS,

  REQUIRED_PHASE23_CERTIFICATIONS,

  certifyPhase23Final,

  certifyAuthorityCount,

  certifyRlsState,

  certifySchemaState,
} =
  require(
    "../../services/certification/phase23FinalCertificationService"
  );


function passingResults() {
  return REQUIRED_PHASE23_CERTIFICATIONS
    .map(
      (
        id
      ) => ({
        id,

        passed:
          true,
      })
    );
}


describe(
  "Phase 23.9 final closed-loop certification",
  () => {
    test(
      "permanent Phase 23 safety invariants are frozen",
      () => {
        expect(
          PHASE23_FINAL_INVARIANTS
            .ASSIGNMENT_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .ACKNOWLEDGEMENT_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .NOTIFICATION_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .HANDOFF_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .TAKEOVER_REQUEST_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .TAKEOVER_AUTHORIZATION_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .HUMAN_CONTROL_IS_NOT_EXECUTION_AUTHORIZATION
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .RETURN_CONTROL_IS_NOT_RESUME
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .STALE_PLAN_RESUME_PROHIBITED
        ).toBe(
          true
        );


        expect(
          PHASE23_FINAL_INVARIANTS
            .PHASE23_EXECUTION_AUTHORITY_MUST_REMAIN_ZERO
        ).toBe(
          true
        );
      }
    );


    test(
      "all final certification gates are mandatory",
      () => {
        expect(
          REQUIRED_PHASE23_CERTIFICATIONS
        ).toEqual(
          expect.arrayContaining([
            "PHASE23_1_LIVE_CONTROL_FOUNDATION",

            "PHASE23_1F_DURABLE_LEASE_EXPIRY",

            "PHASE23_8_TENANT_ADVERSARIAL",

            "PHASE23_DATABASE_SCHEMA",

            "PHASE23_DATABASE_RLS",

            "PHASE23_ACTIVE_LEASE_UNIQUENESS",

            "PHASE23_RETURN_CONTROL_FENCE",

            "PHASE23_STALE_PLAN_FENCE",

            "PHASE23_EXECUTION_AUTHORITY_AUDIT",

            "PHASE23_FINAL_FREEZE",
          ])
        );
      }
    );


    test(
      "complete passing certification freezes Phase 23",
      () => {
        const report =
          certifyPhase23Final(
            passingResults()
          );


        expect(
          report.certification
        ).toBe(
          "PASS"
        );


        expect(
          report.passed
        ).toBe(
          true
        );


        expect(
          report.frozen
        ).toBe(
          true
        );


        expect(
          report.executionAuthorized
        ).toBe(
          false
        );


        expect(
          report.stalePlanResumeAllowed
        ).toBe(
          false
        );
      }
    );


    test(
      "one failed certification prevents Phase 23 freeze",
      () => {
        const results =
          passingResults();


        results[2] = {
          ...results[2],

          passed:
            false,
        };


        const report =
          certifyPhase23Final(
            results
          );


        expect(
          report.certification
        ).toBe(
          "FAIL"
        );


        expect(
          report.frozen
        ).toBe(
          false
        );
      }
    );


    test(
      "missing certification prevents final certification",
      () => {
        expect(
          () =>
            certifyPhase23Final([
              {
                id:
                  "PHASE23_FINAL_FREEZE",

                passed:
                  true,
              },
            ])
        ).toThrow(
          expect.objectContaining({
            code:
              "PHASE23_FINAL_CERTIFICATIONS_MISSING",
          })
        );
      }
    );


    test(
      "execution authority audit requires zero TRUE rows",
      () => {
        expect(
          certifyAuthorityCount(
            0
          )
        ).toMatchObject({
          passed:
            true,

          observed:
            0,

          executionAuthorized:
            false,
        });


        expect(
          certifyAuthorityCount(
            1
          ).passed
        ).toBe(
          false
        );
      }
    );


    test(
      "schema certification rejects missing authoritative table",
      () => {
        const result =
          certifySchemaState({
            expectedTables: [
              "tasks",
              "control_leases",
            ],

            existingTables: [
              "tasks",
            ],
          });


        expect(
          result.passed
        ).toBe(
          false
        );


        expect(
          result.observed.missing
        ).toContain(
          "control_leases"
        );
      }
    );


    test(
      "RLS certification requires ENABLE and FORCE",
      () => {
        const passResult =
          certifyRlsState({
            expectedTables: [
              "tasks",
            ],

            observedTables: [
              {
                tableName:
                  "tasks",

                rlsEnabled:
                  true,

                rlsForced:
                  true,
              },
            ],
          });


        expect(
          passResult.passed
        ).toBe(
          true
        );


        const failResult =
          certifyRlsState({
            expectedTables: [
              "tasks",
            ],

            observedTables: [
              {
                tableName:
                  "tasks",

                rlsEnabled:
                  true,

                rlsForced:
                  false,
              },
            ],
          });


        expect(
          failResult.passed
        ).toBe(
          false
        );
      }
    );


    test(
      "final live script composes all earlier live certifications",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-final-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "certify-phase23-1-live.js"
        );


        expect(
          source
        ).toContain(
          "certify-phase23-1f-lease-expiry-live.js"
        );


        expect(
          source
        ).toContain(
          "certify-phase23-8-adversarial-live.js"
        );


        expect(
          source
        ).toContain(
          "spawnSync"
        );
      }
    );


    test(
      "final certification audits one-active-lease invariant",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-final-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "PHASE23_ACTIVE_LEASE_UNIQUENESS"
        );


        expect(
          source
        ).toContain(
          "HAVING"
        );


        expect(
          source
        ).toMatch(
          /COUNT\(\*\)\s*>\s*1/
        );
      }
    );


    test(
      "final certification requires durable return-control trigger",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-final-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "trg_control_return_fence"
        );


        expect(
          source
        ).toContain(
          "PHASE23_RETURN_CONTROL_FENCE"
        );
      }
    );


    test(
      "final certification explicitly audits stale plan violations",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-final-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "stale_plan_resume_allowed"
        );


        expect(
          source
        ).toContain(
          "STALE PLAN RESUME: PROHIBITED"
        );
      }
    );


    test(
      "final live certification audits execution authority",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-final-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "execution_authorized"
        );


        expect(
          source
        ).toContain(
          "EXECUTION AUTHORITY: 0"
        );


        expect(
          source
        ).toContain(
          "PHASE23_EXECUTION_AUTHORITY_AUDIT"
        );
      }
    );


    test(
      "final certification never executes infrastructure recovery",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-final-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).not.toContain(
          "k8sClient"
        );


        expect(
          source
        ).not.toContain(
          "executeRecovery"
        );


        expect(
          source
        ).not.toContain(
          "kubectl "
        );


        expect(
          source
        ).not.toContain(
          "docker exec"
        );
      }
    );


    test(
      "final output freezes Phase 23 only on PASS",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-final-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "AIRA PHASE 23 — FINAL PASS / FROZEN"
        );


        expect(
          source
        ).toContain(
          "phase23Frozen"
        );


        expect(
          source
        ).toContain(
          "PHASE23_FINAL_FREEZE"
        );
      }
    );
  }
);