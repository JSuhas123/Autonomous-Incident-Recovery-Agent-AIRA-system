"use strict";

const Organization = require("../models/Organization");
const OrganizationMembership = require("../models/OrganizationMembership");
const { record: auditRecord } = require("../services/identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../constants/authEvents");

function requireOrgAccess(allowedRoles = null) {
  return async function orgAuthMiddleware(req, res, next) {
    if (!req.auth) {
      return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
    }

    const tenantIdFromUrl = req.params.tenantId;
    if (!tenantIdFromUrl) {
      return res.status(400).json({ error: "Missing tenantId", code: "MISSING_TENANT_ID" });
    }

    // Verify via Organization — do not trust URL param alone
    const org = await Organization.findOne({ tenantId: tenantIdFromUrl, status: "active" });
    if (!org) {
      return res.status(403).json({ error: "Access denied", code: "TENANT_NOT_FOUND" });
    }

    if (!req.auth.tenantId || req.auth.tenantId !== tenantIdFromUrl) {
      await auditRecord(AUTH_EVENT_TYPES.PERMISSION_DENIED, AUTH_EVENT_OUTCOMES.DENIED, {
        userId: req.auth.userId,
        organizationId: req.auth.organizationId,
        reasonCode: "CROSS_TENANT_ACCESS",
        metadata: { requestedTenant: tenantIdFromUrl, sessionTenant: req.auth.tenantId },
      });
      return res.status(403).json({ error: "Access denied", code: "CROSS_TENANT_ACCESS" });
    }

    const membership = await OrganizationMembership.findOne({
      userId: req.auth.userId,
      organizationId: org._id,
      status: "active",
    });
    if (!membership) {
      await auditRecord(AUTH_EVENT_TYPES.PERMISSION_DENIED, AUTH_EVENT_OUTCOMES.DENIED, {
        userId: req.auth.userId,
        organizationId: org._id,
        reasonCode: "NO_ACTIVE_MEMBERSHIP",
      });
      return res.status(403).json({ error: "Access denied", code: "NO_MEMBERSHIP" });
    }

    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      await auditRecord(AUTH_EVENT_TYPES.PERMISSION_DENIED, AUTH_EVENT_OUTCOMES.DENIED, {
        userId: req.auth.userId,
        organizationId: org._id,
        reasonCode: "INSUFFICIENT_ROLE",
        metadata: { required: allowedRoles, actual: membership.role },
      });
      return res.status(403).json({ error: "Access denied", code: "INSUFFICIENT_ROLE" });
    }

    req.auth.organizationId = org._id;
    req.auth.tenantId = org.tenantId;
    req.auth.membershipId = membership._id;
    req.auth.role = membership.role;

    next();
  };
}

module.exports = { requireOrgAccess };
