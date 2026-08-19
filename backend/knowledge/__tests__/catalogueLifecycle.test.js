"use strict";

const {
  canPlaybookDependOnRunbook,
  canPromoteRunbook,
} =
  require(
    "../catalogueLifecyclePolicy"
  );


describe(
  "Phase 13.6 — catalogue lifecycle policy",
  () => {
    test(
      "ACTIVE playbook may depend on ACTIVE runbook",
      () => {
        const result =
          canPlaybookDependOnRunbook({
            playbookLifecycle:
              "ACTIVE",

            runbookLifecycle:
              "ACTIVE",

            required:
              true,
          });

        expect(
          result.allowed
        ).toBe(
          true
        );
      }
    );


    test(
      "ACTIVE playbook cannot depend on DRAFT required runbook",
      () => {
        const result =
          canPlaybookDependOnRunbook({
            playbookLifecycle:
              "ACTIVE",

            runbookLifecycle:
              "DRAFT",

            required:
              true,
          });

        expect(
          result.allowed
        ).toBe(
          false
        );

        expect(
          result.reason
        ).toBe(
          "ACTIVE_PLAYBOOK_REQUIRES_ACTIVE_RUNBOOK"
        );
      }
    );


    test(
      "optional dependency does not block activation",
      () => {
        const result =
          canPlaybookDependOnRunbook({
            playbookLifecycle:
              "ACTIVE",

            runbookLifecycle:
              "DRAFT",

            required:
              false,
          });

        expect(
          result.allowed
        ).toBe(
          true
        );
      }
    );


    test(
      "runbook with missing action handler cannot be ACTIVE-ready",
      () => {
        const result =
          canPromoteRunbook({
            lifecycle:
              "ACTIVE",

            validationValid:
              true,

            missingHandlers: [
              {
                key:
                  "kubernetes/patch_deployment_memory",
              },
            ],
          });

        expect(
          result.allowed
        ).toBe(
          false
        );

        expect(
          result.reason
        ).toBe(
          "RUNBOOK_HANDLER_MISSING"
        );
      }
    );


    test(
      "validated runbook with all handlers can be ACTIVE-ready",
      () => {
        const result =
          canPromoteRunbook({
            lifecycle:
              "ACTIVE",

            validationValid:
              true,

            missingHandlers:
              [],
          });

        expect(
          result.allowed
        ).toBe(
          true
        );
      }
    );
  }
);