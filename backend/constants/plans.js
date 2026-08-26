"use strict";

/**
 * ============================================================================
 * AIRA COMMERCIAL PLAN CATALOGUE
 * ============================================================================
 *
 * Canonical Phase 15 plan vocabulary:
 *
 * developer
 * starter
 * growth
 * scale
 * enterprise
 *
 * Legacy Phase 13/14 values:
 *
 * team      -> starter
 * business  -> growth
 *
 * IMPORTANT:
 *
 * New writes MUST use canonical plan codes.
 *
 * Legacy codes remain readable during the Phase 15 migration window so
 * existing subscriptions are not broken before tenancy.subscriptions is
 * upgraded in Phase 15.3.
 * ============================================================================
 */


const PLAN_CODES =
  Object.freeze({
    DEVELOPER:
      "developer",

    STARTER:
      "starter",

    GROWTH:
      "growth",

    SCALE:
      "scale",

    ENTERPRISE:
      "enterprise",
  });


const LEGACY_PLAN_CODES =
  Object.freeze({
    TEAM:
      "team",

    BUSINESS:
      "business",
  });


const LEGACY_PLAN_ALIASES =
  Object.freeze({
    [LEGACY_PLAN_CODES.TEAM]:
      PLAN_CODES
        .STARTER,

    [LEGACY_PLAN_CODES.BUSINESS]:
      PLAN_CODES
        .GROWTH,
  });


const PLAN_VALUES =
  Object.freeze(
    Object.values(
      PLAN_CODES
    )
  );


const LEGACY_PLAN_VALUES =
  Object.freeze(
    Object.values(
      LEGACY_PLAN_CODES
    )
  );


const ACCEPTED_PLAN_VALUES =
  Object.freeze([
    ...PLAN_VALUES,
    ...LEGACY_PLAN_VALUES,
  ]);


function normalizePlanCode(
  value
) {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    PLAN_VALUES.includes(
      normalized
    )
  ) {
    return normalized;
  }

  return (
    LEGACY_PLAN_ALIASES[
      normalized
    ] ||
    null
  );
}


function isCanonicalPlan(
  value
) {
  return PLAN_VALUES
    .includes(
      value
    );
}


function isAcceptedPlan(
  value
) {
  return normalizePlanCode(
    value
  ) !==
    null;
}


module.exports = {
  PLAN_CODES,

  LEGACY_PLAN_CODES,

  LEGACY_PLAN_ALIASES,

  PLAN_VALUES,

  LEGACY_PLAN_VALUES,

  ACCEPTED_PLAN_VALUES,

  normalizePlanCode,

  isCanonicalPlan,

  isAcceptedPlan,
};