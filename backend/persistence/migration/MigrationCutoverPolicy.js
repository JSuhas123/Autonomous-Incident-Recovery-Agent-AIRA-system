"use strict";

const TRANSITIONS =
  Object.freeze({
    pending:
      new Set([
        "backfilling",
      ]),

    backfilling:
      new Set([
        "backfilling",
        "backfilled",
        "failed",
      ]),

    backfilled:
      new Set([
        "verifying",
        "backfilling",
        "failed",
      ]),

    verifying:
      new Set([
        "verified",
        "failed",
      ]),

    verified:
      new Set([
        "shadow",
        "verifying",
      ]),

    shadow:
      new Set([
        "cutover",
        "verified",
        "failed",
      ]),

    cutover:
      new Set([
        "rollback",
        "retired",
      ]),

    rollback:
      new Set([
        "shadow",
        "verified",
      ]),

    failed:
      new Set([
        "backfilling",
        "verifying",
      ]),

    retired:
      new Set(),
  });
  
class MigrationCutoverPolicy {
  canTransition(
    from,
    to
  ) {
    const allowed =
      TRANSITIONS[from];

    if (
      !allowed
    ) {
      return false;
    }

    return allowed.has(
      to
    );
  }

  assertTransition(
    from,
    to
  ) {
    if (
      this.canTransition(
        from,
        to
      )
    ) {
      return;
    }

    throw Object.assign(
      new Error(
        `Invalid migration transition: ${from} -> ${to}`
      ),
      {
        code:
          "MIGRATION_TRANSITION_INVALID",
        from,
        to,
      }
    );
  }

  assertCutoverAllowed(
    state
  ) {
    if (
      !state
        ?.backfill_complete
    ) {
      throw Object.assign(
        new Error(
          "Migration cutover requires completed backfill"
        ),
        {
          code:
            "MIGRATION_BACKFILL_INCOMPLETE",
        }
      );
    }

    if (
      !state
        ?.verification_complete
    ) {
      throw Object.assign(
        new Error(
          "Migration cutover requires successful verification"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_INCOMPLETE",
        }
      );
    }

    if (
      state.phase !==
      "shadow"
    ) {
      throw Object.assign(
        new Error(
          "Migration cutover requires shadow phase"
        ),
        {
          code:
            "MIGRATION_SHADOW_REQUIRED",
        }
      );
    }
  }

  getReadBackend(
    state
  ) {
    if (
      !state
    ) {
      return "mongo";
    }

    if (
      state.phase ===
        "cutover" ||
      state.phase ===
        "retired"
    ) {
      return "postgres";
    }

    return (
      state.read_backend ||
      "mongo"
    );
  }

  shouldShadowRead(
    state
  ) {
    return Boolean(
      state &&
      state.phase ===
        "shadow" &&
      state
        .shadow_reads_enabled
    );
  }
}

module.exports =
  MigrationCutoverPolicy;

module.exports
  .TRANSITIONS =
  TRANSITIONS;