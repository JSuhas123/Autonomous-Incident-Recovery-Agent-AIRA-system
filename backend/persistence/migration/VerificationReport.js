"use strict";

class VerificationReport {
  constructor(
    domain
  ) {
    this.domain =
      domain;

    this.sourceCount =
      0;

    this.targetCount =
      0;

    this.checkedCount =
      0;

    this.mismatches =
      [];

    this.startedAt =
      new Date();

    this.completedAt =
      null;
  }

  setCounts(
    sourceCount,
    targetCount
  ) {
    this.sourceCount =
      Number(
        sourceCount ||
        0
      );

    this.targetCount =
      Number(
        targetCount ||
        0
      );

    return this;
  }

  checked(
    count = 1
  ) {
    this.checkedCount +=
      count;

    return this;
  }

  mismatch({
    sourceId,
    targetId = null,
    type,
    sourceChecksum = null,
    targetChecksum = null,
    fields = [],
    message = null,
  }) {
    this.mismatches
      .push({
        sourceId,

        targetId,

        type,

        sourceChecksum,

        targetChecksum,

        fields,

        message,
      });

    return this;
  }

  complete() {
    this.completedAt =
      new Date();

    return this;
  }

  get mismatchCount() {
    return this
      .mismatches
      .length;
  }

  get countParity() {
    return (
      this.sourceCount ===
      this.targetCount
    );
  }

  get passed() {
    return (
      this.countParity &&
      this.mismatchCount ===
        0
    );
  }

  toJSON() {
    return {
      domain:
        this.domain,

      sourceCount:
        this.sourceCount,

      targetCount:
        this.targetCount,

      checkedCount:
        this.checkedCount,

      mismatchCount:
        this.mismatchCount,

      countParity:
        this.countParity,

      passed:
        this.passed,

      mismatches:
        this.mismatches,

      startedAt:
        this.startedAt,

      completedAt:
        this.completedAt,
    };
  }
}

module.exports =
  VerificationReport;