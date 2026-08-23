"use strict";

class BackfillReplayGuard {
  constructor(
    options = {}
  ) {
    this.logger =
      options.logger ||
      console;
  }

  isUniqueViolation(
    error
  ) {
    return (
      error?.code ===
        "23505" ||
      error?.originalCode ===
        "23505" ||
      error?.cause?.code ===
        "23505"
    );
  }

  async execute({
    domain,
    document,
    findExisting,
    write,
    compareIdentity,
  }) {
    if (
      typeof write !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "BackfillReplayGuard requires write function"
        ),
        {
          code:
            "MIGRATION_REPLAY_WRITE_REQUIRED",
        }
      );
    }

    if (
      typeof findExisting ===
      "function"
    ) {
      const existing =
        await findExisting();

      if (
        existing
      ) {
        if (
          typeof compareIdentity ===
            "function" &&
          !compareIdentity(
            existing,
            document
          )
        ) {
          throw Object.assign(
            new Error(
              `Backfill identity conflict in domain ${domain}`
            ),
            {
              code:
                "MIGRATION_IDENTITY_CONFLICT",

              domain,

              sourceDocumentId:
                document?._id ||
                null,
            }
          );
        }

        return {
          status:
            "skipped",

          reason:
            "already-exists",

          existing,
        };
      }
    }

    try {
      const result =
        await write();

      return {
        status:
          "migrated",

        result,
      };
    } catch (
      error
    ) {
      if (
        !this.isUniqueViolation(
          error
        )
      ) {
        throw error;
      }

      if (
        typeof findExisting !==
          "function"
      ) {
        throw error;
      }

      const existing =
        await findExisting();

      if (
        !existing
      ) {
        throw error;
      }

      if (
        typeof compareIdentity ===
          "function" &&
        !compareIdentity(
          existing,
          document
        )
      ) {
        throw Object.assign(
          new Error(
            `Unique conflict resolved to a different logical record in ${domain}`
          ),
          {
            code:
              "MIGRATION_IDENTITY_CONFLICT",

            domain,

            sourceDocumentId:
              document?._id ||
              null,

            cause:
              error,
          }
        );
      }

      this.logger.log(
        `[migration] replay-safe duplicate skipped domain=${domain} source=${document?._id || "unknown"}`
      );

      return {
        status:
          "skipped",

        reason:
          "duplicate-replay",

        existing,
      };
    }
  }
}

module.exports =
  BackfillReplayGuard;