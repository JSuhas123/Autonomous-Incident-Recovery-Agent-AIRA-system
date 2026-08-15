"use strict";

const {
  ExecutionApprovalStateService,
} =
  require(
    "../executionApprovalStateService"
  );

const {
  EXECUTION_APPROVAL_STATE,
} =
  require(
    "../executionAuthorizationContracts"
  );

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-1",

    recoveryDecisionRevision:
      3,

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "playbook-1",

    approvalRequired:
      true,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function approvedRecord(
  overrides = {}
) {
  return {
    approvalId:
      "approval-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-1",

    recoveryDecisionRevision:
      3,

    candidateId:
      "candidate-1",

    playbookId:
      "playbook-1",

    status:
      "approved",

    approvedBy:
      "user-1",

    approvedAt:
      new Date(),

    expiresAt:
      new Date(
        Date.now() +
        60000
      ),

    ...overrides,
  };
}

describe(
  "ExecutionApprovalStateService",
  () => {
    test(
      "approval is satisfied when not required",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput({
                approvalRequired:
                  false,
              })
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .NOT_REQUIRED
          );

        expect(
          result.satisfied
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "missing required approval remains pending",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return null;
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .PENDING
          );

        expect(
          result.satisfied
        )
          .toBe(
            false
          );
      }
    );

    test(
      "valid approved record satisfies approval requirement",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord();
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .APPROVED
          );

        expect(
          result.satisfied
        )
          .toBe(
            true
          );

        expect(
          result.approval
            .approvedBy
        )
          .toBe(
            "user-1"
          );
      }
    );

    test(
      "rejected approval blocks satisfaction",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord({
                    status:
                      "rejected",
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .REJECTED
          );

        expect(
          result.satisfied
        )
          .toBe(
            false
          );
      }
    );

    test(
      "expired approval is not valid",
      async () => {
        const now =
          new Date();

        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                now,

                async getApproval() {
                  return approvedRecord({
                    expiresAt:
                      new Date(
                        now.getTime() -
                        1000
                      ),
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .EXPIRED
          );

        expect(
          result.satisfied
        )
          .toBe(
            false
          );
      }
    );

    test(
      "cross-organization approval is rejected",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord({
                    organizationId:
                      "org-other",
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .REJECTED
          );

        expect(
          result.reasons
        )
          .toContain(
            "Approval belongs to a different organization."
          );
      }
    );

    test(
      "cross-environment approval is rejected",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord({
                    environmentId:
                      "env-other",
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .REJECTED
          );
      }
    );

    test(
      "approval for stale recovery revision is rejected",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord({
                    recoveryDecisionRevision:
                      2,
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .REJECTED
          );

        expect(
          result.reasons
        )
          .toContain(
            "Approval references a stale recovery decision revision."
          );
      }
    );

    test(
      "approval for different playbook is rejected",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord({
                    playbookId:
                      "other-playbook",
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .REJECTED
          );
      }
    );

    test(
      "unauthorized approver invalidates otherwise approved record",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord();
                },

                async validateApprover() {
                  return {
                    valid:
                      false,

                    reasons: [
                      "Approver lacks production recovery permission.",
                    ],
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .REJECTED
          );

        expect(
          result.reasons
        )
          .toContain(
            "Approver lacks production recovery permission."
          );
      }
    );

    test(
      "pending approval remains pending",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        const result =
          await service
            .resolve(
              baseInput(),
              {
                async getApproval() {
                  return approvedRecord({
                    status:
                      "pending",
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .PENDING
          );

        expect(
          result.satisfied
        )
          .toBe(
            false
          );
      }
    );

    test(
      "never accepts upstream execution authorization",
      async () => {
        const service =
          new ExecutionApprovalStateService();

        await expect(
          service
            .resolve({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_APPROVAL_UNSAFE_INPUT",
          });
      }
    );
  }
);