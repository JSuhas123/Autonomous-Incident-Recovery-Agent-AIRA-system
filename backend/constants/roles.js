"use strict";

const ORGANIZATION_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  PLATFORM_ENGINEER: "platform_engineer",
  DEVELOPER: "developer",
  SECURITY_ANALYST: "security_analyst",
  AUDITOR: "auditor",
  VIEWER: "viewer",
};

const ORGANIZATION_ROLE_VALUES = Object.values(ORGANIZATION_ROLES);

module.exports = { ORGANIZATION_ROLES, ORGANIZATION_ROLE_VALUES };
