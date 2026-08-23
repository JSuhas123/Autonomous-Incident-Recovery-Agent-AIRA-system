"use strict";

const mongoose =
  require(
    "mongoose"
  );

const BackfillDocumentNormalizer =
  require(
    "../migration/BackfillDocumentNormalizer"
  );

describe(
  "BackfillDocumentNormalizer",
  () => {
    test(
      "normalizes ObjectIds and preserves legacyMongoId",
      () => {
        const normalizer =
          new BackfillDocumentNormalizer();

        const id =
          new mongoose
            .Types
            .ObjectId();

        const result =
          normalizer.normalize({
            _id:
              id,

            organizationId:
              id,

            nested: {
              owner:
                id,
            },

            __v:
              9,
          });

        expect(
          result._id
        )
          .toBe(
            id.toHexString()
          );

        expect(
          result.legacyMongoId
        )
          .toBe(
            id.toHexString()
          );

        expect(
          result.organizationId
        )
          .toBe(
            id.toHexString()
          );

        expect(
          result.nested.owner
        )
          .toBe(
            id.toHexString()
          );

        expect(
          result.__v
        )
          .toBeUndefined();
      }
    );

    test(
      "preserves dates arrays and nested JSON",
      () => {
        const normalizer =
          new BackfillDocumentNormalizer();

        const now =
          new Date();

        const result =
          normalizer.normalize({
            _id:
              "abc",

            date:
              now,

            values: [
              1,
              {
                hello:
                  "world",
              },
            ],
          });

        expect(
          result.date
        )
          .toEqual(
            now
          );

        expect(
          result.values
        )
          .toEqual([
            1,
            {
              hello:
                "world",
            },
          ]);
      }
    );
  }
);