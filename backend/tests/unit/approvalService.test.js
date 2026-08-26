"use strict";

/**
 * ============================================================================
 * AIRA APPROVAL SERVICE UNIT TESTS
 * ============================================================================
 *
 * Phase 13 / Phase 14 architecture:
 *
 * - PostgreSQL is authoritative.
 * - Approval operations are organization + environment scoped.
 * - Unit tests do NOT boot MongoDB.
 * - Persistence is mocked at the ApprovalQueue boundary.
 *
 * These tests validate:
 *
 * - confidence threshold behavior
 * - strict operational scope
 * - approval creation
 * - approval reads
 * - approval/rejection
 * - tenant/environment isolation contract
 * - decision handling
 * - queue statistics
 * - cleanup
 */

const mockQueue = {
  addApprovalRequest:
    jest.fn(),

  getPendingApprovals:
    jest.fn(),

  getApprovalRequest:
    jest.fn(),

  approveRequest:
    jest.fn(),

  rejectRequest:
    jest.fn(),

  getStats:
    jest.fn(),

  cleanupExpired:
    jest.fn(),
};

jest.mock(
  "../../services/approval/approvalQueue",
  () => ({
    getApprovalQueue:
      jest.fn(
        () =>
          mockQueue
      ),
  })
);

jest.mock(
  "../../services/core",
  () => ({
    decisionTraceService: {},
  })
);

jest.mock(
  "../../services/infrastructure",
  () => ({
    loggingService: {
      logDecision:
        jest.fn(),

      logStructured:
        jest.fn(),
    },
  })
);

const {
  ApprovalService,
} = require(
  "../../services/approval/approvalService"
);

describe(
  "ApprovalService — PostgreSQL scoped approval runtime",
  () => {
    let approvalService;

    const scope = {
      tenantId:
        "tenant-1",

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      incidentId:
        "incident-1",

      userAgent:
        "jest",

      ipAddress:
        "127.0.0.1",
    };

    function buildDecision(
      overrides = {}
    ) {
      return {
        tenantId:
          "tenant-1",

        incidentId:
          "incident-1",

        decisionId:
          "decision-1",

        correlationId:
          "correlation-1",

        action:
          "restart_pod",

        reason:
          "CPU threshold exceeded",

        severity:
          "high",

        confidence:
          0.75,

        resource:
          "api-pod",

        namespace:
          "default",

        additionalParams:
          {},

        decisionTrace: {
          source:
            "unit-test",
        },

        ...overrides,
      };
    }

    function buildApproval(
      overrides = {}
    ) {
      return {
        approvalId:
          "approval-1",

        tenantId:
          "tenant-1",

        organizationId:
          "org-1",

        environmentId:
          "env-1",

        incidentId:
          "incident-1",

        decisionId:
          "decision-1",

        action:
          "restart_pod",

        reason:
          "CPU threshold exceeded",

        confidence:
          0.75,

        resource:
          "api-pod",

        namespace:
          "default",

        status:
          "pending",

        createdAt:
          new Date(),

        expiresAt:
          new Date(
            Date.now() +
            60_000
          ),

        approvedBy:
          null,

        rejectedBy:
          null,

        rejectionReason:
          null,

        ...overrides,
      };
    }

    beforeEach(
      () => {
        jest
          .clearAllMocks();

        delete process.env
          .ESCALATION_THRESHOLD;

        delete process.env
          .AUTO_EXECUTE_THRESHOLD;

        mockQueue
          .addApprovalRequest
          .mockImplementation(
            async (
              decision,
              operationScope
            ) =>
              buildApproval({
                tenantId:
                  decision
                    .tenantId,

                organizationId:
                  operationScope
                    .organizationId,

                environmentId:
                  operationScope
                    .environmentId,

                incidentId:
                  decision
                    .incidentId,

                decisionId:
                  decision
                    .decisionId,

                action:
                  decision
                    .action,

                resource:
                  decision
                    .resource,

                confidence:
                  decision
                    .confidence,

                reason:
                  decision
                    .reason,
              })
          );

        mockQueue
          .getPendingApprovals
          .mockResolvedValue([
            buildApproval(),
          ]);

        mockQueue
          .getApprovalRequest
          .mockResolvedValue(
            buildApproval()
          );

        mockQueue
          .approveRequest
          .mockResolvedValue(
            true
          );

        mockQueue
          .rejectRequest
          .mockResolvedValue(
            true
          );

        mockQueue
          .getStats
          .mockResolvedValue({
            pending:
              1,

            approved:
              2,

            rejected:
              3,

            backend:
              "persistence",
          });

        mockQueue
          .cleanupExpired
          .mockResolvedValue(
            2
          );

        approvalService =
          new ApprovalService();
      }
    );

    // ========================================================================
    // APPROVAL REQUIREMENT
    // ========================================================================

    describe(
      "Approval requirement logic",
      () => {
        test(
          "high confidence auto-executes at threshold",
          () => {
            const result =
              approvalService
                .requiresApproval(
                  0.85
                );

            expect(
              result
                .requiresApproval
            ).toBe(
              false
            );

            expect(
              result.tier
            ).toBe(
              "AUTO_EXECUTE"
            );
          }
        );

        test(
          "very high confidence auto-executes",
          () => {
            const result =
              approvalService
                .requiresApproval(
                  0.99
                );

            expect(
              result
                .requiresApproval
            ).toBe(
              false
            );

            expect(
              result.tier
            ).toBe(
              "AUTO_EXECUTE"
            );
          }
        );

        test(
          "medium confidence requires escalation",
          () => {
            const result =
              approvalService
                .requiresApproval(
                  0.75
                );

            expect(
              result
                .requiresApproval
            ).toBe(
              true
            );

            expect(
              result.tier
            ).toBe(
              "ESCALATE"
            );
          }
        );

        test(
          "exact escalation threshold requires approval",
          () => {
            const result =
              approvalService
                .requiresApproval(
                  0.60
                );

            expect(
              result
                .requiresApproval
            ).toBe(
              true
            );

            expect(
              result.tier
            ).toBe(
              "ESCALATE"
            );
          }
        );

        test(
          "low confidence is OBSERVE",
          () => {
            const result =
              approvalService
                .requiresApproval(
                  0.40
                );

            expect(
              result
                .requiresApproval
            ).toBe(
              true
            );

            expect(
              result.tier
            ).toBe(
              "OBSERVE"
            );
          }
        );

        test(
          "just below auto-execution threshold requires approval",
          () => {
            const result =
              approvalService
                .requiresApproval(
                  0.849
                );

            expect(
              result
                .requiresApproval
            ).toBe(
              true
            );

            expect(
              result.tier
            ).toBe(
              "ESCALATE"
            );
          }
        );

        test(
          "just below escalation threshold becomes OBSERVE",
          () => {
            const result =
              approvalService
                .requiresApproval(
                  0.599
                );

            expect(
              result
                .requiresApproval
            ).toBe(
              true
            );

            expect(
              result.tier
            ).toBe(
              "OBSERVE"
            );
          }
        );
      }
    );

    // ========================================================================
    // THRESHOLD CONFIGURATION
    // ========================================================================

    describe(
      "Threshold configuration",
      () => {
        test(
          "loads thresholds from environment",
          () => {
            process.env
              .ESCALATION_THRESHOLD =
              "0.50";

            process.env
              .AUTO_EXECUTE_THRESHOLD =
              "0.90";

            const service =
              new ApprovalService();

            expect(
              service
                .escalationThreshold
            ).toBe(
              0.50
            );

            expect(
              service
                .autoExecuteThreshold
            ).toBe(
              0.90
            );
          }
        );

        test(
          "uses safe defaults",
          () => {
            const service =
              new ApprovalService();

            expect(
              service
                .escalationThreshold
            ).toBe(
              0.60
            );

            expect(
              service
                .autoExecuteThreshold
            ).toBe(
              0.85
            );
          }
        );
      }
    );

    // ========================================================================
    // STRICT SCOPE
    // ========================================================================

    describe(
      "Operational scope enforcement",
      () => {
        test(
          "requires organizationId",
          async () => {
            await expect(
              approvalService
                .getPendingApprovals({
                  tenantId:
                    "tenant-1",

                  environmentId:
                    "env-1",
                })
            ).rejects
              .toMatchObject({
                code:
                  "APPROVAL_SCOPE_REQUIRED",

                status:
                  400,
              });
          }
        );

        test(
          "requires environmentId",
          async () => {
            await expect(
              approvalService
                .getPendingApprovals({
                  tenantId:
                    "tenant-1",

                  organizationId:
                    "org-1",
                })
            ).rejects
              .toMatchObject({
                code:
                  "APPROVAL_SCOPE_REQUIRED",
              });
          }
        );

        test(
          "does not allow tenant-only operational reads",
          async () => {
            await expect(
              approvalService
                .getPendingApprovals({
                  tenantId:
                    "tenant-1",
                })
            ).rejects
              .toMatchObject({
                code:
                  "APPROVAL_SCOPE_REQUIRED",
              });

            expect(
              mockQueue
                .getPendingApprovals
            ).not
              .toHaveBeenCalled();
          }
        );
      }
    );

    // ========================================================================
    // CREATE
    // ========================================================================

    describe(
      "Approval request creation",
      () => {
        test(
          "creates scoped approval request",
          async () => {
            const decision =
              buildDecision();

            const result =
              await approvalService
                .createApprovalRequest(
                  decision,
                  scope
                );

            expect(
              result.approvalId
            ).toBe(
              "approval-1"
            );

            expect(
              mockQueue
                .addApprovalRequest
            ).toHaveBeenCalledTimes(
              1
            );

            const [
              persistedDecision,
              persistedScope,
            ] =
              mockQueue
                .addApprovalRequest
                .mock
                .calls[0];

            expect(
              persistedDecision
            ).toMatchObject({
              tenantId:
                "tenant-1",

              incidentId:
                "incident-1",

              decisionId:
                "decision-1",

              action:
                "restart_pod",
            });

            expect(
              persistedScope
            ).toMatchObject({
              tenantId:
                "tenant-1",

              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",
            });
          }
        );

        test(
          "rejects missing decision fields",
          async () => {
            await expect(
              approvalService
                .createApprovalRequest(
                  {
                    tenantId:
                      "tenant-1",

                    decisionId:
                      "decision-1",

                    action:
                      "restart_pod",
                  },

                  scope
                )
            ).rejects
              .toThrow(
                "Missing required decision fields"
              );
          }
        );

        test(
          "rejects approval creation for auto-executable decision",
          async () => {
            await expect(
              approvalService
                .createApprovalRequest(
                  buildDecision({
                    confidence:
                      0.95,
                  }),

                  scope
                )
            ).rejects
              .toThrow(
                "Approval not needed"
              );

            expect(
              mockQueue
                .addApprovalRequest
            ).not
              .toHaveBeenCalled();
          }
        );
      }
    );

    // ========================================================================
    // LIST
    // ========================================================================

    describe(
      "Scoped approval reads",
      () => {
        test(
          "passes organization/environment scope to queue",
          async () => {
            const result =
              await approvalService
                .getPendingApprovals(
                  scope
                );

            expect(
              result
            ).toHaveLength(
              1
            );

            expect(
              mockQueue
                .getPendingApprovals
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              })
            );
          }
        );

        test(
          "gets one approval inside scope",
          async () => {
            const result =
              await approvalService
                .getApprovalStatus(
                  "approval-1",
                  scope
                );

            expect(
              result
            ).toMatchObject({
              approvalId:
                "approval-1",

              organizationId:
                "org-1",

              environmentId:
                "env-1",

              status:
                "pending",
            });

            expect(
              mockQueue
                .getApprovalRequest
            ).toHaveBeenCalledWith(
              "approval-1",

              expect.objectContaining({
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              })
            );
          }
        );

        test(
          "returns stable not-found error",
          async () => {
            mockQueue
              .getApprovalRequest
              .mockResolvedValueOnce(
                null
              );

            await expect(
              approvalService
                .getApprovalStatus(
                  "missing",
                  scope
                )
            ).rejects
              .toMatchObject({
                code:
                  "APPROVAL_NOT_FOUND",

                status:
                  404,
              });
          }
        );
      }
    );

    // ========================================================================
    // APPROVE
    // ========================================================================

    describe(
      "Approval workflow",
      () => {
        test(
          "approves a pending request inside scope",
          async () => {
            const result =
              await approvalService
                .approveAndExecute(
                  "approval-1",
                  "user-approver",
                  scope
                );

            expect(
              result
            ).toMatchObject({
              approvalId:
                "approval-1",

              status:
                "approved",

              approvedBy:
                "user-approver",

              environmentId:
                "env-1",
            });

            expect(
              mockQueue
                .approveRequest
            ).toHaveBeenCalledWith(
              "approval-1",

              "user-approver",

              expect.objectContaining({
                userAgent:
                  "jest",

                ipAddress:
                  "127.0.0.1",
              }),

              expect.objectContaining({
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              })
            );
          }
        );

        test(
          "rejects an approval inside scope",
          async () => {
            const result =
              await approvalService
                .rejectRequest(
                  "approval-1",

                  "user-reviewer",

                  "unsafe operation",

                  scope
                );

            expect(
              result
            ).toMatchObject({
              approvalId:
                "approval-1",

              status:
                "rejected",

              rejectedBy:
                "user-reviewer",

              reason:
                "unsafe operation",

              environmentId:
                "env-1",
            });

            expect(
              mockQueue
                .rejectRequest
            ).toHaveBeenCalledWith(
              "approval-1",

              "user-reviewer",

              "unsafe operation",

              expect.objectContaining({
                userAgent:
                  "jest",

                ipAddress:
                  "127.0.0.1",
              }),

              expect.objectContaining({
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              })
            );
          }
        );

        test(
          "rejects approval of non-existent request",
          async () => {
            mockQueue
              .getApprovalRequest
              .mockResolvedValueOnce(
                null
              );

            await expect(
              approvalService
                .approveAndExecute(
                  "missing",
                  "user-1",
                  scope
                )
            ).rejects
              .toMatchObject({
                code:
                  "APPROVAL_NOT_FOUND",
              });
          }
        );

        test(
          "rejects approval of expired request",
          async () => {
            mockQueue
              .getApprovalRequest
              .mockResolvedValueOnce(
                buildApproval({
                  expiresAt:
                    new Date(
                      Date.now() -
                      1000
                    ),
                })
              );

            await expect(
              approvalService
                .approveAndExecute(
                  "approval-1",
                  "user-1",
                  scope
                )
            ).rejects
              .toThrow(
                "expired"
              );

            expect(
              mockQueue
                .approveRequest
            ).not
              .toHaveBeenCalled();
          }
        );

        test(
          "rejects already completed approval",
          async () => {
            mockQueue
              .getApprovalRequest
              .mockResolvedValueOnce(
                buildApproval({
                  status:
                    "approved",
                })
              );

            await expect(
              approvalService
                .approveAndExecute(
                  "approval-1",
                  "user-1",
                  scope
                )
            ).rejects
              .toThrow(
                "Cannot approve"
              );
          }
        );
      }
    );

    // ========================================================================
    // DECISION HANDLING
    // ========================================================================

    describe(
      "Decision handling",
      () => {
        test(
          "auto-executes high confidence decision",
          async () => {
            const result =
              await approvalService
                .handleDecision(
                  buildDecision({
                    confidence:
                      0.95,
                  }),

                  scope
                );

            expect(
              result
            ).toMatchObject({
              requiresApproval:
                false,

              autoExecuted:
                true,

              tier:
                "AUTO_EXECUTE",
            });

            expect(
              mockQueue
                .addApprovalRequest
            ).not
              .toHaveBeenCalled();
          }
        );

        test(
          "creates approval for medium confidence",
          async () => {
            const result =
              await approvalService
                .handleDecision(
                  buildDecision({
                    confidence:
                      0.72,
                  }),

                  scope
                );

            expect(
              result
            ).toMatchObject({
              requiresApproval:
                true,

              autoExecuted:
                false,

              tier:
                "ESCALATE",
            });

            expect(
              result
                .approvalRequest
            ).toBeDefined();

            expect(
              mockQueue
                .addApprovalRequest
            ).toHaveBeenCalledTimes(
              1
            );
          }
        );

        test(
          "low confidence remains approval gated",
          async () => {
            const result =
              await approvalService
                .handleDecision(
                  buildDecision({
                    confidence:
                      0.45,
                  }),

                  scope
                );

            expect(
              result
            ).toMatchObject({
              requiresApproval:
                true,

              autoExecuted:
                false,

              tier:
                "OBSERVE",
            });
          }
        );
      }
    );

    // ========================================================================
    // ISOLATION CONTRACT
    // ========================================================================

    describe(
      "Organization/environment isolation contract",
      () => {
        test(
          "different environments are passed independently to persistence",
          async () => {
            await approvalService
              .getPendingApprovals({
                ...scope,

                environmentId:
                  "env-production",
              });

            await approvalService
              .getPendingApprovals({
                ...scope,

                environmentId:
                  "env-staging",
              });

            expect(
              mockQueue
                .getPendingApprovals
            ).toHaveBeenNthCalledWith(
              1,

              expect.objectContaining({
                organizationId:
                  "org-1",

                environmentId:
                  "env-production",
              })
            );

            expect(
              mockQueue
                .getPendingApprovals
            ).toHaveBeenNthCalledWith(
              2,

              expect.objectContaining({
                organizationId:
                  "org-1",

                environmentId:
                  "env-staging",
              })
            );
          }
        );

        test(
          "different organizations are never collapsed into tenant-only scope",
          async () => {
            await approvalService
              .getPendingApprovals({
                ...scope,

                organizationId:
                  "org-a",
              });

            await approvalService
              .getPendingApprovals({
                ...scope,

                organizationId:
                  "org-b",
              });

            expect(
              mockQueue
                .getPendingApprovals
            ).toHaveBeenNthCalledWith(
              1,

              expect.objectContaining({
                organizationId:
                  "org-a",

                environmentId:
                  "env-1",
              })
            );

            expect(
              mockQueue
                .getPendingApprovals
            ).toHaveBeenNthCalledWith(
              2,

              expect.objectContaining({
                organizationId:
                  "org-b",

                environmentId:
                  "env-1",
              })
            );
          }
        );
      }
    );

    // ========================================================================
    // QUEUE STATS
    // ========================================================================

    describe(
      "Approval statistics",
      () => {
        test(
          "statistics require explicit operational scope",
          async () => {
            await expect(
              approvalService
                .getQueueStats({
                  tenantId:
                    "tenant-1",
                })
            ).rejects
              .toMatchObject({
                code:
                  "APPROVAL_SCOPE_REQUIRED",
              });
          }
        );

        test(
          "returns scoped queue statistics",
          async () => {
            const stats =
              await approvalService
                .getQueueStats(
                  scope
                );

            expect(
              stats
            ).toEqual({
              pending:
                1,

              approved:
                2,

              rejected:
                3,

              backend:
                "persistence",
            });

            expect(
              mockQueue
                .getStats
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              })
            );
          }
        );
      }
    );

    // ========================================================================
    // CLEANUP
    // ========================================================================

    describe(
      "Cleanup",
      () => {
        test(
          "delegates expired approval cleanup to queue",
          async () => {
            const result =
              await approvalService
                .cleanupExpired();

            expect(
              result
            ).toBe(
              2
            );

            expect(
              mockQueue
                .cleanupExpired
            ).toHaveBeenCalledTimes(
              1
            );
          }
        );
      }
    );
  }
);