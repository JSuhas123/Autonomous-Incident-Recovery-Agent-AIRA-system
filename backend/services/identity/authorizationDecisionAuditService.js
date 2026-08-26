"use strict";

const {
  record:
    auditRecord,
} =
  require(
    "./identityAuditService"
  );


const AUTHORIZATION_AUDIT_EVENTS =
  Object.freeze({
    ALLOWED:
      "authorization_allowed",

    DENIED:
      "authorization_denied",
  });


function normalizeId(
  value
) {
  if (
    value == null
  ) {
    return null;
  }

  return String(
    value
      ?.toString?.() ??
    value
  );
}


async function recordAuthorizationDecision({
  req =
    null,

  principal =
    null,

  decision =
    null,

  permission =
    null,

  requiredPermissions =
    null,
}) {
  if (
    !decision
  ) {
    return;
  }

  const allowed =
    decision.allowed ===
    true;


  const eventType =
    allowed
      ? AUTHORIZATION_AUDIT_EVENTS
          .ALLOWED
      : AUTHORIZATION_AUDIT_EVENTS
          .DENIED;


  const outcome =
    allowed
      ? "success"
      : "failure";


  const organizationId =
    decision.organizationId ||
    principal
      ?.organizationId ||
    req
      ?.context
      ?.organizationId ||
    null;


  const environmentId =
    decision.environmentId ||
    req
      ?.context
      ?.environmentId ||
    null;


  try {
    await auditRecord(
      eventType,
      outcome,
      {
        userId:
          principal
            ?.userId ||
          null,

        organizationId,

        metadata: {
          actorType:
            principal
              ?.actorType ||
            null,

          actorId:
            principal
              ?.actorId ||
            null,

          serviceAccountId:
            principal
              ?.serviceAccountId ||
            null,

          authenticationType:
            principal
              ?.authenticationType ||
            null,

          permission:
            permission ||
            decision
              .permission ||
            null,

          requiredPermissions:
            Array.isArray(
              requiredPermissions
            )
              ? [
                  ...requiredPermissions,
                ]
              : null,

          decision:
            decision.decision ||
            (
              allowed
                ? "ALLOW"
                : "DENY"
            ),

          reason:
            decision.reason ||
            null,

          organizationId:
            normalizeId(
              organizationId
            ),

          environmentId:
            normalizeId(
              environmentId
            ),

          method:
            req
              ?.method ||
            null,

          path:
            req
              ?.originalUrl ||
            req
              ?.url ||
            null,

          requestId:
            req
              ?.requestId ||
            req
              ?.context
              ?.requestId ||
            null,
        },
      }
    );
  } catch {
    /**
     * Audit persistence is deliberately best-effort here.
     *
     * A failure to write an audit event MUST NOT:
     *
     * - convert DENY into ALLOW
     * - convert ALLOW into DENY
     * - crash authorization middleware
     *
     * The authorization decision remains authoritative.
     */
  }
}


module.exports = {
  AUTHORIZATION_AUDIT_EVENTS,

  recordAuthorizationDecision,
};