"use strict";

const MigrationStateStore =
  require(
    "./MigrationStateStore"
  );

const MigrationCutoverPolicy =
  require(
    "./MigrationCutoverPolicy"
  );

const ShadowReadObservationStore =
  require(
    "./ShadowReadObservationStore"
  );

class MigrationReadinessGate {
  constructor(
    options = {}
  ) {
    this.stateStore =
      options.stateStore ||
      new MigrationStateStore();

    this.cutoverPolicy =
      options.cutoverPolicy ||
      new MigrationCutoverPolicy();

    this.observationStore =
      options.observationStore ||
      new ShadowReadObservationStore();

    this.minimumComparisons =
      normalizeInteger(
        options.minimumComparisons ??
        process.env
          .MIGRATION_SHADOW_MIN_COMPARISONS,
        100
      );

    this.maximumMismatchRate =
      normalizeRate(
        options.maximumMismatchRate ??
        process.env
          .MIGRATION_SHADOW_MAX_MISMATCH_RATE,
        0
      );

    this.maximumErrorRate =
      normalizeRate(
        options.maximumErrorRate ??
        process.env
          .MIGRATION_SHADOW_MAX_ERROR_RATE,
        0
      );
  }

  async evaluate({
    scope,
    domain,
    since = null,
  } = {}) {
    const state =
      await this
        .stateStore
        .get(
          scope,
          domain
        );

    if (
      !state
    ) {
      return failure(
        domain,
        "MIGRATION_STATE_MISSING",
        "Migration domain state does not exist"
      );
    }

    const summary =
      await this
        .observationStore
        .summary(
          scope,
          domain,
          {
            since,
          }
        );

    const checks = {
      phaseIsShadow:
        state.phase ===
        "shadow",

      shadowReadsEnabled:
        state
          .shadow_reads_enabled ===
        true,

      backfillComplete:
        state
          .backfill_complete ===
        true,

      verificationComplete:
        state
          .verification_complete ===
        true,

      enoughComparisons:
        summary.total >=
        this
          .minimumComparisons,

      mismatchRateAcceptable:
        summary
          .mismatchRate <=
        this
          .maximumMismatchRate,

      errorRateAcceptable:
        summary
          .errorRate <=
        this
          .maximumErrorRate,
    };

    const ready =
      Object
        .values(
          checks
        )
        .every(
          Boolean
        );

    return {
      domain,

      ready,

      state: {
        phase:
          state.phase,

        readBackend:
          state.read_backend,

        shadowReadsEnabled:
          state
            .shadow_reads_enabled,

        backfillComplete:
          state
            .backfill_complete,

        verificationComplete:
          state
            .verification_complete,
      },

      shadow: summary,

      thresholds: {
        minimumComparisons:
          this
            .minimumComparisons,

        maximumMismatchRate:
          this
            .maximumMismatchRate,

        maximumErrorRate:
          this
            .maximumErrorRate,
      },

      checks,

      blockers:
        Object.entries(
          checks
        )
          .filter(
            (
              [
                ,
                passed,
              ]
            ) =>
              !passed
          )
          .map(
            (
              [
                name,
              ]
            ) =>
              name
          ),
    };
  }

  async assertReady(
    input
  ) {
    const report =
      await this
        .evaluate(
          input
        );

    if (
      !report.ready
    ) {
      throw Object.assign(
        new Error(
          `Migration domain is not ready for cutover: ${report.domain}`
        ),
        {
          code:
            "MIGRATION_CUTOVER_NOT_READY",

          report,
        }
      );
    }

    /*
     * Reuse the existing final safety policy as defence in depth.
     */
    const state =
      await this
        .stateStore
        .get(
          input.scope,
          input.domain
        );

    this
      .cutoverPolicy
      .assertCutoverAllowed(
        state
      );

    return report;
  }
}

function failure(
  domain,
  code,
  message
) {
  return {
    domain,

    ready:
      false,

    error: {
      code,
      message,
    },

    checks: {},

    blockers: [
      code,
    ],
  };
}

function normalizeInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number
    .isFinite(
      parsed
    ) &&
    parsed >=
      0
      ? parsed
      : fallback;
}

function normalizeRate(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0 ||
    parsed >
      1
  ) {
    return fallback;
  }

  return parsed;
}

module.exports =
  MigrationReadinessGate;