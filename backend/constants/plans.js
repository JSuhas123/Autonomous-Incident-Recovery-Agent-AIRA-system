"use strict";

const PLAN_CODES = Object.freeze({
  DEVELOPER: "developer",
  TEAM: "team",
  BUSINESS: "business",
  ENTERPRISE: "enterprise",
});

const PLAN_VALUES = Object.values(PLAN_CODES);

module.exports = {
  PLAN_CODES,
  PLAN_VALUES,
};