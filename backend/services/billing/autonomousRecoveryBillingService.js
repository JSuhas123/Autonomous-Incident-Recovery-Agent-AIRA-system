"use strict";

const EntitlementService =
  require(
    "../core/entitlementService"
  );

const {
  COMMERCIAL_ENTITLEMENTS,
} =
  require(
    "../../constants/commercialEntitlements"
  );

const {
  BILLING_METERS,
} =
  require(
    "../../constants/billingMeters"
  );

const {
  billingQuotaService,
} =
  require(
    "./billingQuotaService"
  );

const {
  recordUsage,
} =
  require(
    "./usageMeterService"
  );

const {
  autonomousRecoveryUsageKey,
} =
  require(
    "./usageIdempotency"
  );


function createError(
  message,
  code,
  status = 403,
  metadata = {}
) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.status =
    status;

  error.executionAuthorized =
    false;

  Object.assign(
    error,
    metadata
  );

  return error;
}


async function evaluateAutonomousRecovery({
  organizationId,

  environmentType =
    null,

  requestedQuantity =
    1,
}) {
  const enabled =
    await EntitlementService
      .isEnabled(
        organizationId,

        COMMERCIAL_ENTITLEMENTS
          .AUTONOMOUS_RECOVERY_ENABLED
      );


  if (
    !enabled
  ) {
    throw createError(
      "Autonomous recovery is not enabled for this subscription",
      "AUTONOMOUS_RECOVERY_ENTITLEMENT_REQUIRED",
      403
    );
  }


  if (
    String(
      environmentType ||
      ""
    )
      .toLowerCase() ===
      "production"
  ) {
    const productionEnabled =
      await EntitlementService
        .isEnabled(
          organizationId,

          COMMERCIAL_ENTITLEMENTS
            .PRODUCTION_AUTONOMY_ENABLED
        );


    if (
      !productionEnabled
    ) {
      throw createError(
        "Production autonomy is not enabled for this subscription",
        "PRODUCTION_AUTONOMY_ENTITLEMENT_REQUIRED",
        403
      );
    }
  }


  const quota =
    await billingQuotaService
      .evaluate({
        organizationId,

        meterCode:
          BILLING_METERS
            .AUTONOMOUS_RECOVERIES,

        entitlementKey:
          COMMERCIAL_ENTITLEMENTS
            .AUTONOMOUS_RECOVERY_MONTHLY_INCLUDED,

        requestedQuantity,

        mode:
          "METERED",
      });


  return {
    allowed:
      true,

    commercialEntitlement:
      true,

    quota,

    overageExpected:
      quota
        .overageQuantity >
      0,

    executionAuthorized:
      false,
  };
}


async function recordAutonomousRecoveryStarted({
  organizationId,

  environmentId =
    null,

  recoveryDecisionId =
    null,

  executionRequestId =
    null,

  incidentId =
    null,

  correlationId =
    null,

  metadata =
    {},
}) {
  const idempotencyKey =
    autonomousRecoveryUsageKey({
      recoveryDecisionId,

      executionRequestId,
    });


  const result =
    await recordUsage({
      organizationId,

      environmentId,

      meterCode:
        BILLING_METERS
          .AUTONOMOUS_RECOVERIES,

      quantity:
        1,

      idempotencyKey,

      sourceType:
        "autonomous_recovery",

      sourceId:
        recoveryDecisionId ||
        executionRequestId,

      correlationId,

      incidentId,

      executionRequestId,

      recoveryDecisionId,

      occurredAt:
        new Date(),

      metadata: {
        ...metadata,

        billingTrigger:
          "EXECUTION_STARTED",
      },
    });


  return {
    billable:
      result.created,

    duplicate:
      result.duplicate,

    usageEvent:
      result.event,

    idempotencyKey,
  };
}


module.exports = {
  evaluateAutonomousRecovery,

  recordAutonomousRecoveryStarted,
};