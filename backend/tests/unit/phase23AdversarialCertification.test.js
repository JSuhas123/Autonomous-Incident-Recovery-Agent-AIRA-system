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
  PHASE23_ADVERSARIAL_INVARIANTS,

  REQUIRED_ADVERSARIAL_CASES,

  certifyResults,

  certifyConcurrency,

  certifyForeignScope,

  certifyAuthorityAudit,
} =
  require(
    "../../services/certification/phase23AdversarialCertificationService"
  );


describe(
  "Phase 23.8 Tenant + Adversarial Certification",
  () => {
    test(
      "adversarial safety invariants are frozen",
      () => {
        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .CROSS_TENANT_READ_PROHIBITED
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .CROSS_TENANT_WRITE_PROHIBITED
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .CROSS_TENANT_CONTROL_PROHIBITED
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .FORGED_EXECUTION_AUTHORITY_PROHIBITED
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .LEASE_THEFT_PROHIBITED
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .RETURN_CONTROL_IS_NOT_RESUME
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .STALE_PLAN_RESUME_PROHIBITED
        ).toBe(
          true
        );


        expect(
          PHASE23_ADVERSARIAL_INVARIANTS
            .HUMAN_CONTROL_NEVER_AUTHORIZES_EXECUTION
        ).toBe(
          true
        );
      }
    );


    test(
      "requires all canonical adversarial cases",
      () => {
        expect(
          REQUIRED_ADVERSARIAL_CASES
        ).toEqual(
          expect.arrayContaining([
            "SOURCE_SCOPE_READ",

            "FOREIGN_SCOPE_READ",

            "FOREIGN_SCOPE_WRITE",

            "DATABASE_AUTHORITY_FORGERY",

            "CONCURRENT_CONTROL_ACQUISITION",

            "LEASE_OWNER_MISMATCH",

            "EXPIRED_LEASE_HEARTBEAT",

            "RETURN_CONTROL_FENCE",

            "STALE_PLAN_RESUME",

            "FINAL_EXECUTION_AUTHORITY_AUDIT",
          ])
        );
      }
    );


    test(
      "foreign scope certification requires zero reads and writes",
      () => {
        expect(
          certifyForeignScope({
            readCount:
              0,

            writeCount:
              0,
          })
        ).toEqual([
          expect.objectContaining({
            id:
              "FOREIGN_SCOPE_READ",

            passed:
              true,

            observed:
              0,
          }),

          expect.objectContaining({
            id:
              "FOREIGN_SCOPE_WRITE",

            passed:
              true,

            observed:
              0,
          }),
        ]);
      }
    );


    test(
      "foreign tenant visibility fails certification",
      () => {
        const [
          read,
          write,
        ] =
          certifyForeignScope({
            readCount:
              1,

            writeCount:
              1,
          });


        expect(
          read.passed
        ).toBe(
          false
        );


        expect(
          write.passed
        ).toBe(
          false
        );
      }
    );


    test(
      "control concurrency requires exactly one winner",
      () => {
        const result =
          certifyConcurrency({
            winners:
              1,

            losers:
              1,

            activeLeaseCount:
              1,
          });


        expect(
          result.passed
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "two concurrent control winners fail certification",
      () => {
        const result =
          certifyConcurrency({
            winners:
              2,

            losers:
              0,

            activeLeaseCount:
              2,
          });


        expect(
          result.passed
        ).toBe(
          false
        );
      }
    );


    test(
      "zero winners also fails certification",
      () => {
        const result =
          certifyConcurrency({
            winners:
              0,

            losers:
              2,

            activeLeaseCount:
              0,
          });


        expect(
          result.passed
        ).toBe(
          false
        );
      }
    );


    test(
      "authority audit requires exactly zero TRUE rows",
      () => {
        expect(
          certifyAuthorityAudit(
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
          certifyAuthorityAudit(
            1
          ).passed
        ).toBe(
          false
        );
      }
    );


    test(
      "complete passing result produces Phase 23.8 PASS",
      () => {
        const report =
          certifyResults([
            {
              id:
                "SOURCE_SCOPE_READ",

              passed:
                true,
            },

            {
              id:
                "FOREIGN_SCOPE_READ",

              passed:
                true,
            },

            {
              id:
                "FOREIGN_SCOPE_WRITE",

              passed:
                true,
            },

            {
              id:
                "DATABASE_AUTHORITY_FORGERY",

              passed:
                true,
            },

            {
              id:
                "CONCURRENT_CONTROL_ACQUISITION",

              passed:
                true,
            },

            {
              id:
                "LEASE_OWNER_MISMATCH",

              passed:
                true,
            },

            {
              id:
                "EXPIRED_LEASE_HEARTBEAT",

              passed:
                true,
            },

            {
              id:
                "RETURN_CONTROL_FENCE",

              passed:
                true,
            },

            {
              id:
                "STALE_PLAN_RESUME",

              passed:
                true,
            },

            {
              id:
                "FINAL_EXECUTION_AUTHORITY_AUDIT",

              passed:
                true,
            },
          ]);


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
          report.failedCount
        ).toBe(
          0
        );


        expect(
          report.stalePlanResumeAllowed
        ).toBe(
          false
        );


        expect(
          report.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "missing adversarial case cannot be certified",
      () => {
        expect(
          () =>
            certifyResults([
              {
                id:
                  "SOURCE_SCOPE_READ",

                passed:
                  true,
              },
            ])
        ).toThrow(
          expect.objectContaining({
            code:
              "PHASE23_ADVERSARIAL_CASES_MISSING",
          })
        );
      }
    );


    test(
      "one failed adversarial case fails whole certification",
      () => {
        const results =
          REQUIRED_ADVERSARIAL_CASES
            .map(
              (
                id
              ) => ({
                id,

                passed:
                  id !==
                  "LEASE_OWNER_MISMATCH",
              })
            );


        const report =
          certifyResults(
            results
          );


        expect(
          report.certification
        ).toBe(
          "FAIL"
        );


        expect(
          report.failedCases
        ).toContain(
          "LEASE_OWNER_MISMATCH"
        );
      }
    );


    test(
      "live script exists and uses hardened RLS role",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-8-adversarial-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "createRlsCertificationRole"
        );


        expect(
          source
        ).toContain(
          "certifyRlsRole"
        );


        expect(
          source
        ).toContain(
          "runAsRlsRole"
        );


        expect(
          source
        ).toContain(
          "crypto.randomUUID()"
        );
      }
    );


    test(
      "live certification explicitly attacks cross-tenant reads and writes",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-8-adversarial-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "foreignScopeReadCount"
        );


        expect(
          source
        ).toContain(
          "foreignScopeWriteCount"
        );


        expect(
          source
        ).toContain(
          "CROSS-TENANT READ: PROHIBITED"
        );


        expect(
          source
        ).toContain(
          "CROSS-TENANT WRITE: PROHIBITED"
        );
      }
    );


    test(
      "live certification attacks database execution authority",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-8-adversarial-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toMatch(
          /execution_authorized\s*=\s*TRUE/
        );


        expect(
          source
        ).toContain(
          "certifyDatabaseAuthorityForgery"
        );


        expect(
          source
        ).toContain(
          "countExecutionAuthorityRows"
        );
      }
    );


    test(
      "live certification contains control concurrency attack",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-8-adversarial-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "Promise.allSettled"
        );


        expect(
          source
        ).toContain(
          "certifyConcurrency"
        );


        expect(
          source
        ).toContain(
          "exactly 1 winner"
        );
      }
    );


    test(
      "live certification explicitly forbids stale-plan resume",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-8-adversarial-live.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "STALE PLAN RESUME: PROHIBITED"
        );


        expect(
          source
        ).toContain(
          "requiresFreshEvaluation"
        );


        expect(
          source
        ).toContain(
          "stalePlanResumeAllowed"
        );
      }
    );

       test(
      "expired-lease certification checks semantics rather than brittle SQL formatting",
      () => {
        const certificationSource =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-8-adversarial-live.js"
            ),

            "utf8"
          );


        const repositorySource =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "persistence",

              "postgres",

              "PostgresHumanTakeoverRepository.js"
            ),

            "utf8"
          );


        expect(
          certificationSource
        ).toContain(
          "hasHeartbeatMethod"
        );


        expect(
          certificationSource
        ).toContain(
          "hasExpiredDomainError"
        );


        expect(
          certificationSource
        ).toContain(
          "hasExpiredLifecycleEvent"
        );


        expect(
          certificationSource
        ).toContain(
          "hasControlLeaseExpiryWrite"
        );


        expect(
          certificationSource
        ).toContain(
          "hasTakeoverSessionExpiryWrite"
        );


        expect(
          certificationSource
        ).toContain(
          "hasPostCommitExpiryContract"
        );


        expect(
          certificationSource
        ).not.toContain(
          'takeoverRepositorySource.includes(\n        "status = \'EXPIRED\'"'
        );


        expect(
          repositorySource
        ).toMatch(
          /async\s+heartbeatLease\s*\(/
        );


        expect(
          repositorySource
        ).toContain(
          "HUMAN_CONTROL_LEASE_EXPIRED"
        );


        expect(
          repositorySource
        ).toContain(
          "CONTROL_LEASE_EXPIRED"
        );
      }
    ); 

    test(
      "certification script cannot execute infrastructure recovery",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "scripts",

              "certify-phase23-8-adversarial-live.js"
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
          "executeRecovery"
        );
      }
    );
  }
);