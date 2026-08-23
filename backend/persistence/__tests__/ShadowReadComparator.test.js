"use strict";

const ShadowReadComparator =
  require(
    "../migration/ShadowReadComparator"
  );

describe(
  "ShadowReadComparator",
  () => {
    test(
      "null Mongo and null PostgreSQL are a match",
      () => {
        const adapter = {
          canonicalizeSource:
            jest.fn(
              () => {
                throw new Error(
                  "adapter should not be called"
                );
              }
            ),

          canonicalizeTarget:
            jest.fn(
              () => {
                throw new Error(
                  "adapter should not be called"
                );
              }
            ),
        };

        const comparator =
          new ShadowReadComparator();

        const result =
          comparator
            .compare({
              source:
                null,

              target:
                null,

              adapter,
            });

        expect(
          result.match
        )
          .toBe(
            true
          );

        expect(
          result.differences
        )
          .toEqual(
            []
          );

        expect(
          result.sourceHash
        )
          .toBe(
            result.targetHash
          );

        expect(
          adapter
            .canonicalizeSource
        )
          .not
          .toHaveBeenCalled();

        expect(
          adapter
            .canonicalizeTarget
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "Mongo record and missing PostgreSQL record is mismatch",
      () => {
        const comparator =
          new ShadowReadComparator();

        const result =
          comparator
            .compare({
              source: {
                id:
                  "incident-1",
              },

              target:
                null,
            });

        expect(
          result.match
        )
          .toBe(
            false
          );

        expect(
          result.differences
        )
          .toEqual([
            expect.objectContaining({
              path:
                "$",

              type:
                "TARGET_MISSING",
            }),
          ]);
      }
    );

    test(
      "missing Mongo record and PostgreSQL record is mismatch",
      () => {
        const comparator =
          new ShadowReadComparator();

        const result =
          comparator
            .compare({
              source:
                null,

              target: {
                id:
                  "incident-1",
              },
            });

        expect(
          result.match
        )
          .toBe(
            false
          );

        expect(
          result.differences[0]
            .type
        )
          .toBe(
            "SOURCE_MISSING"
          );
      }
    );

    test(
      "equivalent objects match regardless of property order",
      () => {
        const comparator =
          new ShadowReadComparator();

        const result =
          comparator
            .compare({
              source: {
                status:
                  "open",

                incidentId:
                  "incident-1",
              },

              target: {
                incidentId:
                  "incident-1",

                status:
                  "open",
              },
            });

        expect(
          result.match
        )
          .toBe(
            true
          );
      }
    );

    test(
      "different object content generates structural differences",
      () => {
        const comparator =
          new ShadowReadComparator();

        const result =
          comparator
            .compare({
              source: {
                status:
                  "open",
              },

              target: {
                status:
                  "closed",
              },
            });

        expect(
          result.match
        )
          .toBe(
            false
          );

        expect(
          result.differences
        )
          .toEqual([
            expect.objectContaining({
              path:
                "status",

              source:
                "open",

              target:
                "closed",
            }),
          ]);
      }
    );
  }
);