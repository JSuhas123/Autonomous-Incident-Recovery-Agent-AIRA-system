"use strict";

const PostgresKnownGoodStateRepository =
  require(
    "../../persistence/postgres/PostgresKnownGoodStateRepository"
  );


class KnownGoodStateService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresKnownGoodStateRepository(
        options
      );
  }


  async promote(
    input,
    transaction = null
  ) {
    requireEvidence(
      input
    );


    return this.repository
      .activateKnownGoodState(
        input,
        transaction
      );
  }


  async getActive(
    scope,
    transaction = null
  ) {
    return this.repository
      .getActiveKnownGoodState(
        scope,
        transaction
      );
  }


  async getAtTime(
    scope,
    transaction = null
  ) {
    return this.repository
      .getKnownGoodStateAtTime(
        scope,
        transaction
      );
  }


  async history(
    scope,
    transaction = null
  ) {
    return this.repository
      .listKnownGoodHistory(
        scope,
        transaction
      );
  }


  async revoke(
    scope,
    transaction = null
  ) {
    return this.repository
      .revokeActiveKnownGoodState(
        scope,
        transaction
      );
  }
}


function requireEvidence(
  input = {}
) {
  if (
    !input.healthEvidence ||
    typeof input.healthEvidence !==
      "object" ||
    Array.isArray(
      input.healthEvidence
    ) ||
    Object.keys(
      input.healthEvidence
    ).length ===
      0
  ) {
    throw Object.assign(
      new Error(
        "Known-good promotion requires health evidence"
      ),
      {
        code:
          "KNOWN_GOOD_HEALTH_EVIDENCE_REQUIRED",
      }
    );
  }


  if (
    !Number.isInteger(
      input.evidenceCount
    ) ||
    input.evidenceCount <
      1
  ) {
    throw Object.assign(
      new Error(
        "Known-good promotion requires positive evidenceCount"
      ),
      {
        code:
          "KNOWN_GOOD_EVIDENCE_REQUIRED",
      }
    );
  }
}


module.exports =
  KnownGoodStateService;