"use strict";

jest.mock(
  "../../persistence/repositories",
  () => ({
    auditRepository: {
      create:
        jest.fn(),

      findLatestForTenant:
        jest.fn(),

      findOne:
        jest.fn(),

      list:
        jest.fn(),
    },
  })
);

const {
  auditRepository,
} =
  require(
    "../../persistence/repositories"
  );

const AuditService =
  require(
    "../../services/observability/auditService"
  );

describe(
  "Audit persistence boundary",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();

        process.env
          .AUDIT_SECRET =
          "phase13-test-audit-secret-that-is-long-enough-for-production-tests";
      }
    );

    test(
      "recordEvent persists complete hash before insertion",
      async () => {
        auditRepository
          .findLatestForTenant
          .mockResolvedValue(
            null
          );

        auditRepository
          .create
          .mockImplementation(
            async (
              value
            ) =>
              value
          );

        const result =
          await AuditService
            .recordEvent(
              "tenant-1",
              "decision_made",
              {
                decision:
                  "recover",
              }
            );

        expect(
          result.signature
        ).toBeTruthy();

        expect(
          result.eventHash
        ).toBeTruthy();

        expect(
          auditRepository
            .create
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    test(
      "verification is read-only",
      async () => {
        const timestamp =
          Date.now();

        const payload = {
          value:
            1,
        };

        const signature =
          AuditService
            ._computeSignature(
              "tenant-1",
              payload,
              timestamp
            );

        const result =
          await AuditService
            .verifyEvent({
              tenantId:
                "tenant-1",

              eventId:
                "event-1",

              payload,

              timestamp,

              signature,

              previousEventHash:
                null,
            });

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          auditRepository.create
        ).not.toHaveBeenCalled();
      }
    );
  }
);