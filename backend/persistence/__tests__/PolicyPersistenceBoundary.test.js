"use strict";

jest.mock(
  "../../models/TenantConfig",
  () => ({
    findOne:
      jest.fn(),
  })
);

jest.mock(
  "../../persistence/repositories",
  () => ({
    policyRepository: {
      findActiveForTenant:
        jest.fn(),
    },
  })
);

const TenantConfig =
  require(
    "../../models/TenantConfig"
  );

const {
  policyRepository,
} =
  require(
    "../../persistence/repositories"
  );

const TenantService =
  require(
    "../../services/core/tenantService"
  );

describe(
  "Policy persistence boundary",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();
      }
    );

    test(
      "tenant policy lookup uses PolicyRepository",
      async () => {
        TenantConfig
          .findOne
          .mockResolvedValue({
            tenantId:
              "tenant-1",

            status:
              "active",

            policyVersion:
              4,
          });

        policyRepository
          .findActiveForTenant
          .mockResolvedValue({
            tenantId:
              "tenant-1",

            version:
              4,
          });

        const result =
          await TenantService
            .getTenantPolicy(
              "tenant-1"
            );

        expect(
          policyRepository
            .findActiveForTenant
        ).toHaveBeenCalledWith(
          "tenant-1",
          4
        );

        expect(
          result.version
        ).toBe(
          4
        );
      }
    );
  }
);