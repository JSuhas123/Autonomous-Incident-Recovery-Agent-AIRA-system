"use strict";

const VerificationCanonicalizer =
  require(
    "../migration/VerificationCanonicalizer"
  );

describe(
  "VerificationCanonicalizer",
  () => {
    test(
      "object key order does not change checksum",
      () => {
        const canonicalizer =
          new VerificationCanonicalizer();

        const first = {
          b:
            2,

          a:
            1,
        };

        const second = {
          a:
            1,

          b:
            2,
        };

        expect(
          canonicalizer
            .checksum(
              first
            )
        )
          .toBe(
            canonicalizer
              .checksum(
                second
              )
          );
      }
    );

    test(
      "ignored database fields do not cause mismatch",
      () => {
        const canonicalizer =
          new VerificationCanonicalizer();

        expect(
          canonicalizer
            .equivalent(
              {
                _id:
                  "mongo",

                id:
                  "postgres",

                name:
                  "AIRA",
              },

              {
                id:
                  "pg-uuid",

                name:
                  "AIRA",
              }
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "real content difference changes checksum",
      () => {
        const canonicalizer =
          new VerificationCanonicalizer();

        expect(
          canonicalizer
            .equivalent(
              {
                status:
                  "open",
              },

              {
                status:
                  "closed",
              }
            )
        )
          .toBe(
            false
          );
      }
    );
  }
);