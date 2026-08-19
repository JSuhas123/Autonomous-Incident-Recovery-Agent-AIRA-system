"use strict";

jest.mock(
  "../../models/PolicyDefinition",
  () => ({
    findOne:
      jest.fn(),

    find:
      jest.fn(),

    create:
      jest.fn(),

    findOneAndUpdate:
      jest.fn(),
  })
);

const PolicyDefinition =
  require(
    "../../models/PolicyDefinition"
  );

const MongoPolicyRepository =
  require(
    "../mongo/MongoPolicyRepository"
  );

describe(
  "MongoPolicyRepository",
  () => {
    let repository;

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoPolicyRepository();
      }
    );

    test(
      "active policy lookup preserves tenant and version",
      async () => {
        await repository
          .findActiveForTenant(
            "tenant-1",
            7
          );

        expect(
          PolicyDefinition
            .findOne
        ).toHaveBeenCalledWith({
          tenantId:
            "tenant-1",

          status:
            "active",

          version:
            7,
        });
      }
    );

    test(
      "save rejects non-document values",
      async () => {
        await expect(
          repository.save({
            version:
              7,
          })
        ).rejects.toMatchObject({
          code:
            "INVALID_POLICY_DOCUMENT",
        });
      }
    );
  }
);