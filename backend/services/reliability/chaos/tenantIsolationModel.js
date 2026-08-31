"use strict";

const crypto =
  require(
    "node:crypto"
  );


const MODEL_VERSION =
  "21.10C-v1";

const SAFETY_CLASS =
  "LAB_ONLY";

const DEFAULT_TENANT_COUNTS =
  Object.freeze([
    1,
    10,
    25,
    50,
    100,
  ]);


function createTenantStressModel(
  options = {}
) {
  const tenantCount =
    positiveInteger(
      options.tenantCount,
      3
    );


  const baselineRatePerTenant =
    positiveNumber(
      options.baselineRatePerTenant,
      5
    );


  const normalRatePerTenant =
    positiveNumber(
      options.normalRatePerTenant,
      10
    );


  const noisyRatePerTenant =
    positiveNumber(
      options.noisyRatePerTenant,
      100
    );


  const noisyTenantIndex =
    integerInRange(
      options.noisyTenantIndex,
      0,
      tenantCount - 1,
      0
    );


  if (
    options.production ===
      true ||
    String(
      options.safetyClass ||
      SAFETY_CLASS
    ).toUpperCase() !==
      SAFETY_CLASS
  ) {
    throw labOnlyError(
      "Multi-tenant chaos is restricted to LAB_ONLY non-production targets"
    );
  }


  const runId =
    String(
      options.runId ||
      `mt_${crypto.randomUUID()}`
    );


  const tenants =
    Array.from(
      {
        length:
          tenantCount,
      },

      (
        _,
        index
      ) => {
        const ordinal =
          index + 1;


        const organizationId =
          String(
            options
              .organizationIds
              ?.[index] ||
            `phase21c-org-${ordinal}`
          );


        const environmentId =
          String(
            options
              .environmentIds
              ?.[index] ||
            `phase21c-env-${ordinal}`
          );


        const tenantId =
          String(
            options
              .tenantIds
              ?.[index] ||
            organizationId
          );


        return Object.freeze({
          index,

          tenantId,

          organizationId,

          environmentId,

          role:
            index ===
            noisyTenantIndex
              ? "NOISY"
              : "CONTROL",

          baselineRatePerSecond:
            baselineRatePerTenant,

          experimentRatePerSecond:
            index ===
            noisyTenantIndex
              ? noisyRatePerTenant
              : normalRatePerTenant,

          executionAuthorized:
            false,
        });
      }
    );


  assertUniqueScopes(
    tenants
  );


  return Object.freeze({
    modelVersion:
      MODEL_VERSION,

    runId,

    tenantCount,

    noisyTenantIndex,

    safetyClass:
      SAFETY_CLASS,

    production:
      false,

    tenantScaleClass:
      DEFAULT_TENANT_COUNTS
        .includes(
          tenantCount
        )
        ? "CERTIFICATION_SCALE"
        : "CUSTOM_SCALE",

    tenants,

    executionAuthorized:
      false,
  });
}


function scopeKey(
  scope = {}
) {
  return [
    scope.tenantId ||
      "",

    scope.organizationId ||
      "",

    scope.environmentId ||
      "",
  ]
    .map(
      String
    )
    .join(
      "::"
    );
}


function sameScope(
  left,
  right
) {
  return (
    scopeKey(
      left
    ) ===
    scopeKey(
      right
    )
  );
}


function assertUniqueScopes(
  tenants
) {
  const seen =
    new Set();


  for (
    const tenant
    of tenants
  ) {
    const key =
      scopeKey(
        tenant
      );


    if (
      seen.has(
        key
      )
    ) {
      throw Object.assign(
        new Error(
          `Duplicate tenant scope: ${key}`
        ),

        {
          name:
            "Phase21TenantStressModelError",

          code:
            "PHASE21_DUPLICATE_TENANT_SCOPE",

          executionAuthorized:
            false,
        }
      );
    }


    seen.add(
      key
    );
  }
}


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return (
    Number.isInteger(
      parsed
    ) &&
    parsed >
      0
  )
    ? parsed
    : fallback;
}


function positiveNumber(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return (
    Number.isFinite(
      parsed
    ) &&
    parsed >
      0
  )
    ? parsed
    : fallback;
}


function integerInRange(
  value,
  min,
  max,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return (
    Number.isInteger(
      parsed
    ) &&
    parsed >=
      min &&
    parsed <=
      max
  )
    ? parsed
    : fallback;
}


function labOnlyError(
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21TenantStressModelError",

      code:
        "PHASE21_MULTI_TENANT_LAB_ONLY",

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  MODEL_VERSION,

  SAFETY_CLASS,

  DEFAULT_TENANT_COUNTS,

  createTenantStressModel,

  scopeKey,

  sameScope,
};