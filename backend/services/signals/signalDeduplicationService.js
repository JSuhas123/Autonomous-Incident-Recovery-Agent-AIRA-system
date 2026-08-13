"use strict";

const {
  Signal,
} =
  require(
    "../../models/Signal"
  );

class SignalDeduplicationService {
  constructor() {
    this.defaultWindowMs =
      Number(
        process.env
          .SIGNAL_DEDUP_WINDOW_MS
      ) ||
      5 * 60 * 1000;
  }

  async findDuplicate(
    normalizedSignal,
    {
      windowMs =
        this.defaultWindowMs,
    } = {}
  ) {
    if (
      !normalizedSignal
        ?.organizationId ||
      !normalizedSignal
        ?.environmentId ||
      !normalizedSignal
        ?.fingerprint
    ) {
      throw Object.assign(
        new Error(
          "Signal deduplication requires organizationId, environmentId and fingerprint"
        ),
        {
          code:
            "SIGNAL_DEDUP_CONTEXT_REQUIRED",
        }
      );
    }

    const observedAt =
      normalizedSignal
        .observedAt
        ? new Date(
            normalizedSignal
              .observedAt
          )
        : new Date();

    const earliest =
      new Date(
        observedAt.getTime() -
        windowMs
      );

    return Signal
      .findOne({
        organizationId:
          normalizedSignal
            .organizationId,

        environmentId:
          normalizedSignal
            .environmentId,

        fingerprint:
          normalizedSignal
            .fingerprint,

        lastSeenAt: {
          $gte:
            earliest,
        },

        processingStatus: {
          $ne:
            "failed",
        },
      })
      .sort({
        lastSeenAt:
          -1,
      });
  }

  async registerDuplicate(
    existingSignal,
    incomingSignal
  ) {
    if (!existingSignal) {
      throw Object.assign(
        new Error(
          "Existing signal is required"
        ),
        {
          code:
            "SIGNAL_DUPLICATE_EXISTING_REQUIRED",
        }
      );
    }

    const observedAt =
      incomingSignal
        ?.observedAt
        ? new Date(
            incomingSignal
              .observedAt
          )
        : new Date();

    existingSignal
      .duplicateCount =
      (
        existingSignal
          .duplicateCount ||
        0
      ) + 1;

    if (
      !existingSignal
        .firstSeenAt
    ) {
      existingSignal
        .firstSeenAt =
        existingSignal
          .observedAt ||
        observedAt;
    }

    if (
      !existingSignal
        .lastSeenAt ||
      observedAt >
        existingSignal
          .lastSeenAt
    ) {
      existingSignal
        .lastSeenAt =
        observedAt;
    }

    /*
     * Preserve the highest severity observed.
     */
    existingSignal
      .severity =
      this
        .higherSeverity(
          existingSignal
            .severity,
          incomingSignal
            .severity
        );

    /*
     * If a duplicate is incident-worthy, the canonical
     * retained signal must remain incident-worthy too.
     */
    existingSignal
      .incidentCandidate =
      Boolean(
        existingSignal
          .incidentCandidate ||
        incomingSignal
          ?.incidentCandidate
      );

    /*
     * Keep bounded references to exact duplicate signal IDs.
     *
     * We don't need thousands of IDs on one document.
     */
    if (
      incomingSignal
        ?.signalId &&
      !existingSignal
        .correlatedSignalIds
        .includes(
          incomingSignal
            .signalId
        )
    ) {
      existingSignal
        .correlatedSignalIds
        .push(
          incomingSignal
            .signalId
        );

      existingSignal
        .correlatedSignalIds =
        existingSignal
          .correlatedSignalIds
          .slice(
            -100
          );
    }

    await existingSignal
      .save();

    return existingSignal;
  }

  higherSeverity(
    first,
    second
  ) {
    const order = {
      unknown:
        0,

      info:
        1,

      warning:
        2,

      critical:
        3,
    };

    return (
      (
        order[
          second
        ] ||
        0
      ) >
      (
        order[
          first
        ] ||
        0
      )
    )
      ? second
      : first;
  }

  async deduplicate(
    normalizedSignal,
    options = {}
  ) {
    const duplicate =
      await this
        .findDuplicate(
          normalizedSignal,
          options
        );

    if (!duplicate) {
      return {
        duplicate:
          false,

        signal:
          normalizedSignal,
      };
    }

    const updated =
      await this
        .registerDuplicate(
          duplicate,
          normalizedSignal
        );

    return {
      duplicate:
        true,

      signal:
        updated,
    };
  }
}

module.exports =
  new SignalDeduplicationService();

module.exports
  .SignalDeduplicationService =
  SignalDeduplicationService;