"use strict";

const {
  PLAN_CODES,
} =
  require(
    "./plans"
  );


/**
 * ============================================================================
 * CANONICAL ENTITLEMENTS
 * ============================================================================
 *
 * Phase 15.4 will move production entitlement values into PostgreSQL.
 *
 * Until that cutover is certified, this file remains the backward-compatible
 * entitlement source used by EntitlementService.
 * ============================================================================
 */

const ENTITLEMENTS =
  Object.freeze({
    ORGANIZATIONS_MAX:
      "organizations.max",

    ENVIRONMENTS_MAX:
      "environments.max",

    MEMBERS_MAX:
      "members.max",

    TEAMS_MAX:
      "teams.max",

    PRODUCTION_ENVIRONMENT:
      "environments.production",
  });


const PLAN_ENTITLEMENTS =
  Object.freeze({
    [PLAN_CODES.DEVELOPER]: {
      [ENTITLEMENTS.ORGANIZATIONS_MAX]:
        1,

      [ENTITLEMENTS.ENVIRONMENTS_MAX]:
        1,

      [ENTITLEMENTS.MEMBERS_MAX]:
        2,

      [ENTITLEMENTS.TEAMS_MAX]:
        1,

      [ENTITLEMENTS.PRODUCTION_ENVIRONMENT]:
        false,
    },


    [PLAN_CODES.STARTER]: {
      [ENTITLEMENTS.ORGANIZATIONS_MAX]:
        1,

      [ENTITLEMENTS.ENVIRONMENTS_MAX]:
        3,

      [ENTITLEMENTS.MEMBERS_MAX]:
        5,

      [ENTITLEMENTS.TEAMS_MAX]:
        3,

      [ENTITLEMENTS.PRODUCTION_ENVIRONMENT]:
        true,
    },


    [PLAN_CODES.GROWTH]: {
      [ENTITLEMENTS.ORGANIZATIONS_MAX]:
        1,

      [ENTITLEMENTS.ENVIRONMENTS_MAX]:
        10,

      [ENTITLEMENTS.MEMBERS_MAX]:
        20,

      [ENTITLEMENTS.TEAMS_MAX]:
        10,

      [ENTITLEMENTS.PRODUCTION_ENVIRONMENT]:
        true,
    },


    [PLAN_CODES.SCALE]: {
      [ENTITLEMENTS.ORGANIZATIONS_MAX]:
        3,

      [ENTITLEMENTS.ENVIRONMENTS_MAX]:
        30,

      [ENTITLEMENTS.MEMBERS_MAX]:
        75,

      [ENTITLEMENTS.TEAMS_MAX]:
        30,

      [ENTITLEMENTS.PRODUCTION_ENVIRONMENT]:
        true,
    },


    [PLAN_CODES.ENTERPRISE]: {
      [ENTITLEMENTS.ORGANIZATIONS_MAX]:
        null,

      [ENTITLEMENTS.ENVIRONMENTS_MAX]:
        null,

      [ENTITLEMENTS.MEMBERS_MAX]:
        null,

      [ENTITLEMENTS.TEAMS_MAX]:
        null,

      [ENTITLEMENTS.PRODUCTION_ENVIRONMENT]:
        true,
    },
  });


module.exports = {
  ENTITLEMENTS,

  PLAN_ENTITLEMENTS,
};