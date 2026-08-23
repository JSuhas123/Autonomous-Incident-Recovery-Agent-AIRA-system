"use strict";

const {
  parseArgs,
  assertArgs,
} =
  require(
    "../../scripts/postgres-backfill"
  );

describe(
  "postgres-backfill CLI",
  () => {
    test(
      "parses migration arguments",
      () => {
        const args =
          parseArgs([
            "--organization",
            "org-1",

            "--environment",
            "env-1",

            "--domain",
            "incidents",

            "--batch-size",
            "100",

            "--failure-policy",
            "continue",

            "--max-documents",
            "500",

            "--dry-run",

            "--no-resume",
          ]);

        expect(
          args
        ).toEqual({
          organizationId:
            "org-1",

          environmentId:
            "env-1",

          tenantId:
            null,

          domain:
            "incidents",

          batchSize:
            100,

          failurePolicy:
            "continue",

          maxDocuments:
            500,

          dryRun:
            true,

          resume:
            false,
        });
      }
    );

    test(
      "requires organization and environment",
      () => {
        expect(
          () =>
            assertArgs({
              organizationId:
                null,

              environmentId:
                "env",
            })
        )
          .toThrow(
            "--organization is required"
          );

        expect(
          () =>
            assertArgs({
              organizationId:
                "org",

              environmentId:
                null,
            })
        )
          .toThrow(
            "--environment is required"
          );
      }
    );

    test(
      "rejects unknown domain",
      () => {
        expect(
          () =>
            assertArgs({
              organizationId:
                "org",

              environmentId:
                "env",

              domain:
                "not-real",
            })
        )
          .toThrow(
            "Unknown migration domain"
          );
      }
    );

    test(
      "rejects unsafe batch size",
      () => {
        expect(
          () =>
            assertArgs({
              organizationId:
                "org",

              environmentId:
                "env",

              batchSize:
                99999,
            })
        )
          .toThrow(
            "--batch-size must be between 1 and 5000"
          );
      }
    );
  }
);