"use strict";

jest.mock(
  "../../models/ApprovalRequest",
  () => ({
    createApprovalRequest:
      jest.fn(),

    findPendingApprovals:
      jest.fn(),

    findByApprovalId:
      jest.fn(),

    countDocuments:
      jest.fn(),
  })
);

const ApprovalRequest =
  require(
    "../../models/ApprovalRequest"
  );

const MongoApprovalRepository =
  require(
    "../mongo/MongoApprovalRepository"
  );

describe(
  "MongoApprovalRepository",
  () => {
    let repository;

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoApprovalRepository();
      }
    );

    test(
      "uses canonical ApprovalRequest factory",
      async () => {
        ApprovalRequest
          .createApprovalRequest
          .mockResolvedValue({
            approvalId:
              "approval-1",
          });

        await repository
          .createRequest({
            approvalId:
              "approval-1",
          });

        expect(
          ApprovalRequest
            .createApprovalRequest
        ).toHaveBeenCalledWith({
          approvalId:
            "approval-1",
        });
      }
    );

    test(
      "finds pending approvals by tenant",
      async () => {
        await repository
          .findPending(
            "tenant-1"
          );

        expect(
          ApprovalRequest
            .findPendingApprovals
        ).toHaveBeenCalledWith(
          "tenant-1"
        );
      }
    );

    test(
      "counts status within tenant",
      async () => {
        await repository
          .countByStatus(
            "tenant-1",
            "pending"
          );

        expect(
          ApprovalRequest
            .countDocuments
        ).toHaveBeenCalledWith({
          tenantId:
            "tenant-1",

          status:
            "pending",
        });
      }
    );

    test(
      "save fails closed for plain object",
      async () => {
        await expect(
          repository.save({
            approvalId:
              "approval-1",
          })
        ).rejects.toMatchObject({
          code:
            "INVALID_APPROVAL_REQUEST_DOCUMENT",
        });
      }
    );
  }
);