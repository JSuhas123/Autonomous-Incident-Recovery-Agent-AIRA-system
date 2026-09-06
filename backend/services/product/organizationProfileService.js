"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.1A
 * ENTERPRISE ORGANIZATION PROFILE SERVICE
 * ============================================================================
 *
 * This service manages CUSTOMER PROFILE state.
 *
 * It does not own:
 *
 * - organization identity
 * - organization membership
 * - authentication
 * - permissions
 * - autonomy
 * - execution authorization
 *
 * tenancy.organizations remains authoritative for organization identity.
 * ============================================================================
 */

const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
  );


const COMPANY_SIZES =
  Object.freeze([
    "solo",
    "micro",
    "small",
    "medium",
    "large",
    "enterprise",
  ]);


const TECHNICAL_MATURITY_LEVELS =
  Object.freeze([
    "emerging",
    "developing",
    "established",
    "advanced",
  ]);


const PROFILE_STATUSES =
  Object.freeze([
    "incomplete",
    "complete",
    "verified",
  ]);


function createError(
  message,
  status,
  code
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  error.code =
    code;

  error.executionAuthorized =
    false;

  return error;
}


function normalizeOptionalText(
  value,
  maxLength
) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null
  ) {
    return null;
  }

  if (
    typeof value !==
      "string"
  ) {
    throw createError(
      "Expected text value",
      422,
      "ORGANIZATION_PROFILE_TEXT_INVALID"
    );
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.length >
      maxLength
  ) {
    throw createError(
      `Value exceeds maximum length of ${maxLength}`,
      422,
      "ORGANIZATION_PROFILE_TEXT_TOO_LONG"
    );
  }

  return normalized;
}


function normalizeWebsite(
  value
) {
  const normalized =
    normalizeOptionalText(
      value,
      500
    );

  if (
    normalized ===
      undefined ||
    normalized ===
      null
  ) {
    return normalized;
  }

  let parsed;

  try {
    parsed =
      new URL(
        normalized
      );
  } catch (_error) {
    throw createError(
      "Website URL is invalid",
      422,
      "ORGANIZATION_PROFILE_WEBSITE_INVALID"
    );
  }

  if (
    parsed.protocol !==
      "https:" &&
    parsed.protocol !==
      "http:"
  ) {
    throw createError(
      "Website URL must use HTTP or HTTPS",
      422,
      "ORGANIZATION_PROFILE_WEBSITE_PROTOCOL_INVALID"
    );
  }

  return parsed.toString();
}


function normalizeDomain(
  value
) {
  const normalized =
    normalizeOptionalText(
      value,
      253
    );

  if (
    normalized ===
      undefined ||
    normalized ===
      null
  ) {
    return normalized;
  }

  const lower =
    normalized
      .toLowerCase()
      .replace(
        /^https?:\/\//,
        ""
      )
      .replace(
        /^www\./,
        ""
      )
      .split("/")[0]
      .split(":")[0];

  if (
    lower.length < 3 ||
    lower.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/
      .test(
        lower
      ) ||
    !lower.includes(".")
  ) {
    throw createError(
      "Primary company domain is invalid",
      422,
      "ORGANIZATION_PROFILE_DOMAIN_INVALID"
    );
  }

  return lower;
}


function normalizeCountryCode(
  value
) {
  const normalized =
    normalizeOptionalText(
      value,
      2
    );

  if (
    normalized ===
      undefined ||
    normalized ===
      null
  ) {
    return normalized;
  }

  const upper =
    normalized.toUpperCase();

  if (
    !/^[A-Z]{2}$/
      .test(
        upper
      )
  ) {
    throw createError(
      "Country must use ISO-style two-letter country code",
      422,
      "ORGANIZATION_PROFILE_COUNTRY_INVALID"
    );
  }

  return upper;
}


function normalizeEmployeeCount(
  value
) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(
      value
    );

  if (
    !Number.isInteger(
      number
    ) ||
    number < 1 ||
    number >
      10000000
  ) {
    throw createError(
      "Employee count must be a positive integer",
      422,
      "ORGANIZATION_PROFILE_EMPLOYEE_COUNT_INVALID"
    );
  }

  return number;
}


function normalizeEnum(
  value,
  allowed,
  code,
  fieldName
) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();

  if (
    !allowed.includes(
      normalized
    )
  ) {
    throw createError(
      `Invalid ${fieldName}`,
      422,
      code
    );
  }

  return normalized;
}


function normalizeMetadata(
  value
) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null
  ) {
    return {};
  }

  if (
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw createError(
      "Organization profile metadata must be an object",
      422,
      "ORGANIZATION_PROFILE_METADATA_INVALID"
    );
  }

  return {
    ...value,
  };
}


function normalizeProfileInput(
  input = {}
) {
  if (
    !input ||
    typeof input !==
      "object" ||
    Array.isArray(
      input
    )
  ) {
    throw createError(
      "Organization profile payload must be an object",
      400,
      "ORGANIZATION_PROFILE_INPUT_INVALID"
    );
  }

  return {
    legalName:
      normalizeOptionalText(
        input.legalName,
        250
      ),

    websiteUrl:
      normalizeWebsite(
        input.websiteUrl
      ),

    industry:
      normalizeOptionalText(
        input.industry,
        120
      ),

    companySize:
      normalizeEnum(
        input.companySize,
        COMPANY_SIZES,
        "ORGANIZATION_PROFILE_COMPANY_SIZE_INVALID",
        "company size"
      ),

    employeeCount:
      normalizeEmployeeCount(
        input.employeeCount
      ),

    headquartersCountryCode:
      normalizeCountryCode(
        input
          .headquartersCountryCode
      ),

    operatingRegion:
      normalizeOptionalText(
        input.operatingRegion,
        120
      ),

    dataRegion:
      normalizeOptionalText(
        input.dataRegion,
        120
      ),

    primaryDomain:
      normalizeDomain(
        input.primaryDomain
      ),

    technicalMaturity:
      normalizeEnum(
        input.technicalMaturity,
        TECHNICAL_MATURITY_LEVELS,
        "ORGANIZATION_PROFILE_TECHNICAL_MATURITY_INVALID",
        "technical maturity"
      ),

    metadata:
      normalizeMetadata(
        input.metadata
      ),
  };
}


function calculateProfileStatus(
  profile
) {
  const required =
    [
      profile.legal_name,
      profile.industry,
      profile.company_size,
      profile.headquarters_country_code,
    ];

  return required.every(
    Boolean
  )
    ? "complete"
    : "incomplete";
}


function safeProfile(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id:
      row.public_id,

    organizationId:
      String(
        row.organization_id
      ),

    legalName:
      row.legal_name,

    websiteUrl:
      row.website_url,

    industry:
      row.industry,

    companySize:
      row.company_size,

    employeeCount:
      row.employee_count,

    headquartersCountryCode:
      row
        .headquarters_country_code,

    operatingRegion:
      row.operating_region,

    dataRegion:
      row.data_region,

    primaryDomain:
      row.primary_domain,

    technicalMaturity:
      row.technical_maturity,

    profileStatus:
      row.profile_status,

    metadata:
      row.metadata || {},

    completedAt:
      row.completed_at,

    verifiedAt:
      row.verified_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


class OrganizationProfileService {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }


  async getProfile(
    {
      organizationId,
      environmentId,
    }
  ) {
    if (
      !organizationId ||
      !environmentId
    ) {
      throw createError(
        "Organization and environment context are required",
        400,
        "ORGANIZATION_PROFILE_SCOPE_REQUIRED"
      );
    }

    return this.tenantScope
      .run(
        {
          organizationId,
          environmentId,
        },

        async (
          client,
          resolved
        ) => {
          const result =
            await client.query(
              `
                SELECT *
                FROM
                  product.organization_profiles
                WHERE
                  organization_id = $1
                LIMIT 1
              `,
              [
                resolved
                  .organizationUuid,
              ]
            );

          return safeProfile(
            result.rows[0] ||
            null
          );
        }
      );
  }


  async upsertProfile(
    {
      organizationId,
      environmentId,
      input,
    }
  ) {
    if (
      !organizationId ||
      !environmentId
    ) {
      throw createError(
        "Organization and environment context are required",
        400,
        "ORGANIZATION_PROFILE_SCOPE_REQUIRED"
      );
    }

    const normalized =
      normalizeProfileInput(
        input
      );

    return this.tenantScope
      .run(
        {
          organizationId,
          environmentId,
        },

        async (
          client,
          resolved
        ) => {
          const existingResult =
            await client.query(
              `
                SELECT *
                FROM
                  product.organization_profiles
                WHERE
                  organization_id = $1
                LIMIT 1
              `,
              [
                resolved
                  .organizationUuid,
              ]
            );

          const existing =
            existingResult
              .rows[0] ||
            {};

          const merged = {
            legal_name:
              normalized.legalName !==
                undefined
                ? normalized.legalName
                : existing
                    .legal_name ??
                  null,

            website_url:
              normalized.websiteUrl !==
                undefined
                ? normalized.websiteUrl
                : existing
                    .website_url ??
                  null,

            industry:
              normalized.industry !==
                undefined
                ? normalized.industry
                : existing
                    .industry ??
                  null,

            company_size:
              normalized.companySize !==
                undefined
                ? normalized.companySize
                : existing
                    .company_size ??
                  null,

            employee_count:
              normalized.employeeCount !==
                undefined
                ? normalized.employeeCount
                : existing
                    .employee_count ??
                  null,

            headquarters_country_code:
              normalized
                .headquartersCountryCode !==
                undefined
                ? normalized
                    .headquartersCountryCode
                : existing
                    .headquarters_country_code ??
                  null,

            operating_region:
              normalized.operatingRegion !==
                undefined
                ? normalized.operatingRegion
                : existing
                    .operating_region ??
                  null,

            data_region:
              normalized.dataRegion !==
                undefined
                ? normalized.dataRegion
                : existing
                    .data_region ??
                  null,

            primary_domain:
              normalized.primaryDomain !==
                undefined
                ? normalized.primaryDomain
                : existing
                    .primary_domain ??
                  null,

            technical_maturity:
              normalized.technicalMaturity !==
                undefined
                ? normalized.technicalMaturity
                : existing
                    .technical_maturity ??
                  null,

            metadata:
              normalized.metadata !==
                undefined
                ? normalized.metadata
                : existing
                    .metadata ??
                  {},
          };

          const profileStatus =
            calculateProfileStatus(
              merged
            );

          const completedAt =
            profileStatus ===
              "complete"
              ? existing
                  .completed_at ||
                new Date()
              : null;

          const result =
            await client.query(
              `
                INSERT INTO
                  product.organization_profiles (
                    organization_id,

                    legal_name,
                    website_url,
                    industry,
                    company_size,
                    employee_count,

                    headquarters_country_code,
                    operating_region,
                    data_region,

                    primary_domain,

                    technical_maturity,

                    profile_status,

                    metadata,

                    completed_at,

                    updated_at
                  )

                VALUES (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8,
                  $9,
                  $10,
                  $11,
                  $12,
                  $13::jsonb,
                  $14,
                  NOW()
                )

                ON CONFLICT (
                  organization_id
                )

                DO UPDATE SET
                  legal_name =
                    EXCLUDED.legal_name,

                  website_url =
                    EXCLUDED.website_url,

                  industry =
                    EXCLUDED.industry,

                  company_size =
                    EXCLUDED.company_size,

                  employee_count =
                    EXCLUDED.employee_count,

                  headquarters_country_code =
                    EXCLUDED.headquarters_country_code,

                  operating_region =
                    EXCLUDED.operating_region,

                  data_region =
                    EXCLUDED.data_region,

                  primary_domain =
                    EXCLUDED.primary_domain,

                  technical_maturity =
                    EXCLUDED.technical_maturity,

                  profile_status =
                    EXCLUDED.profile_status,

                  metadata =
                    EXCLUDED.metadata,

                  completed_at =
                    EXCLUDED.completed_at,

                  updated_at =
                    NOW()

                RETURNING *
              `,
              [
                resolved
                  .organizationUuid,

                merged.legal_name,

                merged.website_url,

                merged.industry,

                merged.company_size,

                merged.employee_count,

                merged
                  .headquarters_country_code,

                merged.operating_region,

                merged.data_region,

                merged.primary_domain,

                merged
                  .technical_maturity,

                profileStatus,

                JSON.stringify(
                  merged.metadata
                ),

                completedAt,
              ]
            );

          return safeProfile(
            result.rows[0]
          );
        }
      );
  }
}


module.exports = {
  COMPANY_SIZES,
  TECHNICAL_MATURITY_LEVELS,
  PROFILE_STATUSES,

  normalizeProfileInput,
  calculateProfileStatus,
  safeProfile,

  OrganizationProfileService,
};