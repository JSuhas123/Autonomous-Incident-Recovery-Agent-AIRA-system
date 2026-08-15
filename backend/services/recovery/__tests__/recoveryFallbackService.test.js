"use strict";

const {
  RecoveryFallbackService,
} =
  require(
    "../recoveryFallbackService"
  );

const {
  RECOVERY_DECISION,
  APPROVAL_MODE,
} =
  require(
    "../recoveryDecisionContracts"
  );

describe(
  "RecoveryFallbackService",
  () => {
    test(
      "no discovered playbook becomes NO_SAFE_ACTION",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "NO_DISCOVERED_PLAYBOOK",

            incidentId:
              "incident-1",

            candidates:
              [],
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .NO_SAFE_ACTION
          );

        expect(
          result
            .decision
            .selectedPlaybookId
        )
          .toBeNull();

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "no applicable candidate preserves failed preconditions",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "NO_APPLICABLE_PLAYBOOK",

            candidates: [
              {
                applicability: {
                  failedPreconditions: [
                    "namespace_missing",
                  ],
                },
              },
            ],
          });

        expect(
          result
            .decision
            .unknowns
        )
          .toContain(
            "namespace_missing"
          );
      }
    );

    test(
      "all risk blocked becomes manual intervention",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "ALL_RISK_BLOCKED",
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MANUAL_INTERVENTION
          );

        expect(
          result
            .decision
            .approvalMode
        )
          .toBe(
            APPROVAL_MODE
              .MANUAL_ONLY
          );
      }
    );

    test(
      "all policy blocked becomes NO_SAFE_ACTION",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "ALL_POLICY_BLOCKED",

            candidates: [
              {
                policy: {
                  reasons: [
                    "Production mutation denied.",
                  ],
                },
              },
            ],
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .NO_SAFE_ACTION
          );

        expect(
          result
            .decision
            .unknowns
        )
          .toContain(
            "Production mutation denied."
          );
      }
    );

    test(
      "critic rejection becomes manual intervention",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "CRITIC_REJECTED",

            criticResult: {
              violations: [
                "Selected candidate is policy blocked.",
              ],
            },
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MANUAL_INTERVENTION
          );

        expect(
          result
            .decision
            .reasons
        )
          .toContain(
            "Selected candidate is policy blocked."
          );
      }
    );

    test(
      "insufficient diagnosis collects more evidence",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "DIAGNOSIS_INSUFFICIENT",

            diagnosis: {
              unknowns: [
                "Database telemetry missing.",
              ],
            },
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .COLLECT_MORE_EVIDENCE
          );
      }
    );

    test(
      "recovered incident becomes monitor only",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "INCIDENT_RECOVERED",
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MONITOR_ONLY
          );
      }
    );

    test(
      "unknown fallback reason fails safely",
      () => {
        const service =
          new RecoveryFallbackService();

        const result =
          service.resolve({
            reason:
              "SOMETHING_NEW",
          });

        expect(
          result
            .decision
            .decision
        )
          .toBe(
            RECOVERY_DECISION
              .MANUAL_INTERVENTION
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);