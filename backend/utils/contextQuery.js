"use strict";

/**
 * Canonical query helpers.
 *
 * These helpers intentionally overwrite ownership fields
 * so caller input can never switch organizations/environments.
 */

function requireOrganizationContext(
  context
) {
  if (!context?.organizationId) {
    throw new Error(
      "Organization context is required"
    );
  }
}

function requireEnvironmentContext(
  context
) {
  requireOrganizationContext(
    context
  );

  if (!context?.environmentId) {
    throw new Error(
      "Environment context is required"
    );
  }
}

function organizationQuery(
  context,
  query = {}
) {
  requireOrganizationContext(
    context
  );

  return {
    ...query,

    organizationId:
      context.organizationId,
  };
}

function environmentQuery(
  context,
  query = {}
) {
  requireEnvironmentContext(
    context
  );

  return {
    ...query,

    organizationId:
      context.organizationId,

    environmentId:
      context.environmentId,
  };
}

function organizationCreateData(
  context,
  data = {}
) {
  requireOrganizationContext(
    context
  );

  const safeData = {
    ...data,
  };

  delete safeData.organizationId;
  delete safeData.environmentId;
  delete safeData.tenantId;

  return {
    ...safeData,

    organizationId:
      context.organizationId,

    ...(context.tenantId
      ? {
          tenantId:
            context.tenantId,
        }
      : {}),
  };
}

function environmentCreateData(
  context,
  data = {}
) {
  requireEnvironmentContext(
    context
  );

  return {
    ...organizationCreateData(
      context,
      data
    ),

    environmentId:
      context.environmentId,
  };
}

function organizationUpdateData(
  context,
  data = {}
) {
  requireOrganizationContext(
    context
  );

  const safeData = {
    ...data,
  };

  delete safeData.organizationId;
  delete safeData.environmentId;
  delete safeData.tenantId;

  return safeData;
}

function environmentUpdateData(
  context,
  data = {}
) {
  requireEnvironmentContext(
    context
  );

  return organizationUpdateData(
    context,
    data
  );
}

module.exports = {
  organizationQuery,
  environmentQuery,

  organizationCreateData,
  environmentCreateData,

  organizationUpdateData,
  environmentUpdateData,
};