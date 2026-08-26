"use strict";

const crypto =
  require(
    "crypto"
  );

const dns =
  require(
    "dns"
  ).promises;

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );

const {
  encryptSecret,
} =
  require(
    "./enterpriseIdentityCrypto"
  );

const {
  isKnownRole,
} =
  require(
    "../../constants/roles"
  );

const {
  record:
    auditRecord,
} =
  require(
    "./identityAuditService"
  );


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


function createPublicId(
  prefix
) {
  return (
    prefix +
    "_" +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
}


function hash(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        value
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}


function normalizeDomain(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /^\.+|\.+$/g,
      ""
    );
}


function serializeProvider(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.public_id,

    organizationId:
      row.organization_id,

    providerType:
      row.provider_type,

    name:
      row.name,

    status:
      row.status,

    issuerUrl:
      row.issuer_url,

    clientId:
      row.client_id,

    hasClientSecret:
      Boolean(
        row.client_secret_encrypted
      ),

    authorizationEndpoint:
      row.authorization_endpoint,

    tokenEndpoint:
      row.token_endpoint,

    userinfoEndpoint:
      row.userinfo_endpoint,

    jwksUri:
      row.jwks_uri,

    scopes:
      row.scopes ||
      [],

    samlEntityId:
      row.saml_entity_id,

    samlSsoUrl:
      row.saml_sso_url,

    samlMetadataUrl:
      row.saml_metadata_url,

    hasSamlCertificate:
      Boolean(
        row.saml_certificate
      ),

    emailClaim:
      row.email_claim,

    nameClaim:
      row.name_claim,

    subjectClaim:
      row.subject_claim,

    attributeMapping:
      row.attribute_mapping ||
      {},

    allowAccountLinking:
      row.allow_account_linking,

    allowJustInTimeProvisioning:
      row.allow_just_in_time_provisioning,

    defaultRole:
      row.default_role,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    activatedAt:
      row.activated_at,

    disabledAt:
      row.disabled_at,
  };
}


async function requireProvider(
  organizationId,
  providerId,
  {
    includeDisabled =
      true,
  } = {}
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM identity.identity_providers
          WHERE
            organization_id = $1
            AND (
              public_id = $2
              OR id::text = $2
            )
            ${
              includeDisabled
                ? ""
                : "AND status <> 'disabled'"
            }
          LIMIT 1
        `,
        [
          organizationId,
          providerId,
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Identity provider not found",
      404,
      "IDENTITY_PROVIDER_NOT_FOUND"
    );
  }

  return result.rows[0];
}


// ============================================================================
// PROVIDERS
// ============================================================================

async function listProviders(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM identity.identity_providers
          WHERE organization_id = $1
          ORDER BY created_at DESC
        `,
        [
          organizationId,
        ]
      );

  return result.rows.map(
    serializeProvider
  );
}


async function getProvider({
  organizationId,
  providerId,
}) {
  return serializeProvider(
    await requireProvider(
      organizationId,
      providerId
    )
  );
}


async function createProvider({
  organizationId,
  actorUserId,
  providerType,
  name,

  issuerUrl =
    null,

  clientId =
    null,

  clientSecret =
    null,

  samlEntityId =
    null,

  samlSsoUrl =
    null,

  samlCertificate =
    null,

  samlMetadataUrl =
    null,

  scopes = [
    "openid",
    "profile",
    "email",
  ],

  emailClaim =
    "email",

  nameClaim =
    null,

  subjectClaim =
    "sub",

  attributeMapping =
    {},

  allowAccountLinking =
    true,

  allowJustInTimeProvisioning =
    false,

  defaultRole =
    null,

  metadata =
    {},
}) {
  const type =
    String(
      providerType ||
      ""
    ).toLowerCase();

  if (
    ![
      "oidc",
      "saml",
    ].includes(
      type
    )
  ) {
    throw createError(
      "Provider type must be oidc or saml",
      422,
      "IDENTITY_PROVIDER_TYPE_INVALID"
    );
  }

  const normalizedName =
    String(
      name ||
      ""
    ).trim();

  if (
    !normalizedName
  ) {
    throw createError(
      "Identity provider name is required",
      422,
      "IDENTITY_PROVIDER_NAME_REQUIRED"
    );
  }

  if (
    defaultRole &&
    typeof isKnownRole ===
      "function" &&
    !isKnownRole(
      defaultRole
    )
  ) {
    throw createError(
      "Unknown default organization role",
      422,
      "IDENTITY_PROVIDER_DEFAULT_ROLE_INVALID"
    );
  }

  if (
    type ===
      "oidc" &&
    !issuerUrl
  ) {
    throw createError(
      "OIDC issuer URL is required",
      422,
      "OIDC_ISSUER_REQUIRED"
    );
  }

  if (
    type ===
      "saml" &&
    !samlSsoUrl &&
    !samlMetadataUrl
  ) {
    throw createError(
      "SAML SSO URL or metadata URL is required",
      422,
      "SAML_CONFIGURATION_REQUIRED"
    );
  }

  let result;

  try {
    result =
      await getPostgresPool()
        .query(
          `
            INSERT INTO identity.identity_providers (
              public_id,
              organization_id,
              provider_type,
              name,
              issuer_url,
              client_id,
              client_secret_encrypted,
              saml_entity_id,
              saml_sso_url,
              saml_certificate,
              saml_metadata_url,
              scopes,
              email_claim,
              name_claim,
              subject_claim,
              attribute_mapping,
              allow_account_linking,
              allow_just_in_time_provisioning,
              default_role,
              metadata,
              created_by_user_id,
              updated_by_user_id
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
              $12::jsonb,$13,$14,$15,$16::jsonb,
              $17,$18,$19,$20::jsonb,$21,$21
            )
            RETURNING *
          `,
          [
            createPublicId(
              "idp"
            ),

            organizationId,
            type,
            normalizedName,
            issuerUrl,
            clientId,

            clientSecret
              ? encryptSecret(
                  clientSecret
                )
              : null,

            samlEntityId,
            samlSsoUrl,
            samlCertificate,
            samlMetadataUrl,

            JSON.stringify(
              scopes
            ),

            emailClaim,
            nameClaim,
            subjectClaim,

            JSON.stringify(
              attributeMapping ||
              {}
            ),

            Boolean(
              allowAccountLinking
            ),

            Boolean(
              allowJustInTimeProvisioning
            ),

            defaultRole,

            JSON.stringify(
              metadata ||
              {}
            ),

            actorUserId,
          ]
        );
  } catch (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw createError(
        "Identity provider name already exists",
        409,
        "IDENTITY_PROVIDER_EXISTS"
      );
    }

    throw error;
  }

  const provider =
    result.rows[0];

  await auditRecord(
    "identity_provider_created",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        providerId:
          provider.public_id,

        providerType:
          provider.provider_type,
      },
    }
  ).catch(
    () => {}
  );

  return serializeProvider(
    provider
  );
}


async function updateProvider({
  organizationId,
  providerId,
  actorUserId,
  updates =
    {},
}) {
  const existing =
    await requireProvider(
      organizationId,
      providerId
    );

  const fields =
    [];

  const values = [
    organizationId,
    existing.id,
  ];

  let parameter =
    3;

  const map = {
    name:
      "name",

    issuerUrl:
      "issuer_url",

    clientId:
      "client_id",

    authorizationEndpoint:
      "authorization_endpoint",

    tokenEndpoint:
      "token_endpoint",

    userinfoEndpoint:
      "userinfo_endpoint",

    jwksUri:
      "jwks_uri",

    samlEntityId:
      "saml_entity_id",

    samlSsoUrl:
      "saml_sso_url",

    samlCertificate:
      "saml_certificate",

    samlMetadataUrl:
      "saml_metadata_url",

    emailClaim:
      "email_claim",

    nameClaim:
      "name_claim",

    subjectClaim:
      "subject_claim",

    defaultRole:
      "default_role",
  };

  for (
    const [
      input,
      column,
    ]
    of Object.entries(
      map
    )
  ) {
    if (
      updates[input] !==
        undefined
    ) {
      fields.push(
        `${column} = $${parameter++}`
      );

      values.push(
        updates[input]
      );
    }
  }

  if (
    updates.clientSecret !==
      undefined
  ) {
    fields.push(
      `client_secret_encrypted = $${parameter++}`
    );

    values.push(
      updates.clientSecret
        ? encryptSecret(
            updates.clientSecret
          )
        : null
    );
  }

  const jsonFields = {
    scopes:
      "scopes",

    attributeMapping:
      "attribute_mapping",

    metadata:
      "metadata",
  };

  for (
    const [
      input,
      column,
    ]
    of Object.entries(
      jsonFields
    )
  ) {
    if (
      updates[input] !==
        undefined
    ) {
      fields.push(
        `${column} = $${parameter++}::jsonb`
      );

      values.push(
        JSON.stringify(
          updates[input] ||
          {}
        )
      );
    }
  }

  const booleanFields = {
    allowAccountLinking:
      "allow_account_linking",

    allowJustInTimeProvisioning:
      "allow_just_in_time_provisioning",
  };

  for (
    const [
      input,
      column,
    ]
    of Object.entries(
      booleanFields
    )
  ) {
    if (
      updates[input] !==
        undefined
    ) {
      fields.push(
        `${column} = $${parameter++}`
      );

      values.push(
        Boolean(
          updates[input]
        )
      );
    }
  }

  fields.push(
    `updated_by_user_id = $${parameter++}`
  );

  values.push(
    actorUserId
  );

  if (
    fields.length ===
    1
  ) {
    return serializeProvider(
      existing
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.identity_providers
          SET ${fields.join(
            ", "
          )}
          WHERE
            organization_id = $1
            AND id = $2
          RETURNING *
        `,
        values
      );

  await auditRecord(
    "identity_provider_updated",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        providerId:
          existing.public_id,
      },
    }
  ).catch(
    () => {}
  );

  return serializeProvider(
    result.rows[0]
  );
}


async function activateProvider({
  organizationId,
  providerId,
  actorUserId,
}) {
  const provider =
    await requireProvider(
      organizationId,
      providerId
    );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.identity_providers
          SET
            status = 'active',
            activated_at = COALESCE(
              activated_at,
              NOW()
            ),
            disabled_at = NULL,
            updated_by_user_id = $3
          WHERE
            organization_id = $1
            AND id = $2
          RETURNING *
        `,
        [
          organizationId,
          provider.id,
          actorUserId,
        ]
      );

  return serializeProvider(
    result.rows[0]
  );
}


async function disableProvider({
  organizationId,
  providerId,
  actorUserId,
}) {
  const provider =
    await requireProvider(
      organizationId,
      providerId
    );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.identity_providers
          SET
            status = 'disabled',
            disabled_at = NOW(),
            updated_by_user_id = $3
          WHERE
            organization_id = $1
            AND id = $2
          RETURNING *
        `,
        [
          organizationId,
          provider.id,
          actorUserId,
        ]
      );

  return serializeProvider(
    result.rows[0]
  );
}


// ============================================================================
// DOMAIN VERIFICATION
// ============================================================================

async function listDomains(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM identity.organization_domains
          WHERE organization_id = $1
          ORDER BY created_at DESC
        `,
        [
          organizationId,
        ]
      );

  return result.rows;
}


async function createDomain({
  organizationId,
  actorUserId,
  domain,
}) {
  const normalized =
    normalizeDomain(
      domain
    );

  if (
    !normalized ||
    !normalized.includes(
      "."
    )
  ) {
    throw createError(
      "Valid domain is required",
      422,
      "DOMAIN_INVALID"
    );
  }

  const token =
    crypto
      .randomBytes(
        32
      )
      .toString(
        "base64url"
      );

  try {
    const result =
      await getPostgresPool()
        .query(
          `
            INSERT INTO identity.organization_domains (
              organization_id,
              domain,
              verification_token_hash,
              created_by_user_id
            )
            VALUES ($1,$2,$3,$4)
            RETURNING *
          `,
          [
            organizationId,
            normalized,
            hash(
              token
            ),
            actorUserId,
          ]
        );

    return {
      domain:
        result.rows[0],

      verification: {
        method:
          "dns_txt",

        host:
          `_aira-verification.${normalized}`,

        value:
          `aira-verification=${token}`,
      },
    };
  } catch (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw createError(
        "Domain is already registered",
        409,
        "DOMAIN_ALREADY_REGISTERED"
      );
    }

    throw error;
  }
}


async function verifyDomain({
  organizationId,
  domainId,
  actorUserId,
  resolver =
    dns.resolveTxt,
}) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM identity.organization_domains
          WHERE
            organization_id = $1
            AND id::text = $2
          LIMIT 1
        `,
        [
          organizationId,
          domainId,
        ]
      );

  const record =
    result.rows[0];

  if (
    !record
  ) {
    throw createError(
      "Domain not found",
      404,
      "DOMAIN_NOT_FOUND"
    );
  }

  let records;

  try {
    records =
      await resolver(
        `_aira-verification.${record.domain}`
      );
  } catch {
    throw createError(
      "DNS verification record not found",
      409,
      "DOMAIN_VERIFICATION_NOT_FOUND"
    );
  }

  const values =
    records
      .map(
        (parts) =>
          Array.isArray(
            parts
          )
            ? parts.join(
                ""
              )
            : String(
                parts
              )
      );

  const valid =
    values.some(
      (value) => {
        if (
          !value.startsWith(
            "aira-verification="
          )
        ) {
          return false;
        }

        const token =
          value.slice(
            "aira-verification="
              .length
          );

        return (
          hash(
            token
          ) ===
          record
            .verification_token_hash
        );
      }
    );

  if (
    !valid
  ) {
    throw createError(
      "DNS verification token does not match",
      409,
      "DOMAIN_VERIFICATION_FAILED"
    );
  }

  const updated =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.organization_domains
          SET
            status = 'verified',
            verified_at = NOW(),
            verified_by_user_id = $3
          WHERE
            organization_id = $1
            AND id = $2
          RETURNING *
        `,
        [
          organizationId,
          record.id,
          actorUserId,
        ]
      );

  return updated.rows[0];
}


async function revokeDomain({
  organizationId,
  domainId,
}) {
  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.organization_domains
          SET
            status = 'revoked'
          WHERE
            organization_id = $1
            AND id::text = $2
          RETURNING *
        `,
        [
          organizationId,
          domainId,
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Domain not found",
      404,
      "DOMAIN_NOT_FOUND"
    );
  }

  return result.rows[0];
}


// ============================================================================
// ORGANIZATION AUTH POLICY
// ============================================================================

async function getAuthenticationPolicy(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO identity.organization_authentication_policies (
            organization_id
          )
          VALUES ($1)
          ON CONFLICT (organization_id)
          DO UPDATE SET
            organization_id =
              EXCLUDED.organization_id
          RETURNING *
        `,
        [
          organizationId,
        ]
      );

  return result.rows[0];
}


async function updateAuthenticationPolicy({
  organizationId,
  actorUserId,
  loginMode,
  ssoRequired,
  requireVerifiedDomain,
  allowLocalOwnerBypass,
  allowPasswordLogin,
  allowOauthLogin,
  allowApiKeys,
  sessionMaxAgeSeconds,
}) {
  await getAuthenticationPolicy(
    organizationId
  );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.organization_authentication_policies
          SET
            login_mode =
              COALESCE($2, login_mode),

            sso_required =
              COALESCE($3, sso_required),

            require_verified_domain =
              COALESCE($4, require_verified_domain),

            allow_local_owner_bypass =
              COALESCE($5, allow_local_owner_bypass),

            allow_password_login =
              COALESCE($6, allow_password_login),

            allow_oauth_login =
              COALESCE($7, allow_oauth_login),

            allow_api_keys =
              COALESCE($8, allow_api_keys),

            session_max_age_seconds =
              COALESCE(
                $9,
                session_max_age_seconds
              ),

            updated_by_user_id =
              $10

          WHERE
            organization_id = $1

          RETURNING *
        `,
        [
          organizationId,
          loginMode ??
            null,
          ssoRequired ??
            null,
          requireVerifiedDomain ??
            null,
          allowLocalOwnerBypass ??
            null,
          allowPasswordLogin ??
            null,
          allowOauthLogin ??
            null,
          allowApiKeys ??
            null,
          sessionMaxAgeSeconds ??
            null,
          actorUserId,
        ]
      );

  return result.rows[0];
}


// ============================================================================
// LOGIN DISCOVERY
// ============================================================================

async function discoverEnterpriseLogin(
  email
) {
  const normalizedEmail =
    String(
      email ||
      ""
    )
      .trim()
      .toLowerCase();

  const at =
    normalizedEmail
      .lastIndexOf(
        "@"
      );

  if (
    at <= 0
  ) {
    return {
      enterprise:
        false,
    };
  }

  const domain =
    normalizedEmail.slice(
      at + 1
    );

  const result =
    await getPostgresPool()
      .query(
        `
          SELECT
            d.organization_id,

            p.login_mode,
            p.sso_required,

            ip.public_id
              AS provider_public_id,

            ip.provider_type,

            ip.name

          FROM
            identity.organization_domains d

          JOIN
            identity.organization_authentication_policies p
          ON
            p.organization_id =
              d.organization_id

          JOIN
            identity.identity_providers ip
          ON
            ip.organization_id =
              d.organization_id
            AND
            ip.status =
              'active'

          WHERE
            lower(d.domain) = $1
            AND
            d.status =
              'verified'

          ORDER BY
            ip.created_at ASC

          LIMIT 1
        `,
        [
          domain,
        ]
      );

  if (
    !result.rows[0]
  ) {
    return {
      enterprise:
        false,
    };
  }

  const row =
    result.rows[0];

  return {
    enterprise:
      true,

    organizationId:
      row.organization_id,

    providerId:
      row.provider_public_id,

    providerType:
      row.provider_type,

    providerName:
      row.name,

    loginMode:
      row.login_mode,

    ssoRequired:
      row.sso_required,
  };
}


// ============================================================================
// EXTERNAL IDENTITY LINKING
// ============================================================================

async function linkExternalIdentity({
  organizationId,
  providerId,
  userId,
  providerSubject,
  providerEmail =
    null,
  claims =
    {},
}) {
  const provider =
    await requireProvider(
      organizationId,
      providerId,
      {
        includeDisabled:
          false,
      }
    );

  if (
    !provider
      .allow_account_linking
  ) {
    throw createError(
      "Account linking is disabled for this identity provider",
      403,
      "ACCOUNT_LINKING_DISABLED"
    );
  }

  try {
    const result =
      await getPostgresPool()
        .query(
          `
            INSERT INTO identity.external_identities (
              organization_id,
              provider_id,
              user_id,
              provider_subject,
              provider_email,
              claims,
              last_authenticated_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6::jsonb,NOW()
            )
            ON CONFLICT (
              provider_id,
              provider_subject
            )
            DO UPDATE SET
              provider_email =
                EXCLUDED.provider_email,

              claims =
                EXCLUDED.claims,

              last_authenticated_at =
                NOW()

            RETURNING *
          `,
          [
            organizationId,
            provider.id,
            userId,
            providerSubject,
            providerEmail,
            JSON.stringify(
              claims ||
              {}
            ),
          ]
        );

    return result.rows[0];
  } catch (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw createError(
        "External identity is already linked",
        409,
        "EXTERNAL_IDENTITY_ALREADY_LINKED"
      );
    }

    throw error;
  }
}


async function findExternalIdentity({
  organizationId,
  providerId,
  providerSubject,
}) {
  const provider =
    await requireProvider(
      organizationId,
      providerId
    );

  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM identity.external_identities
          WHERE
            organization_id = $1
            AND provider_id = $2
            AND provider_subject = $3
          LIMIT 1
        `,
        [
          organizationId,
          provider.id,
          providerSubject,
        ]
      );

  return result.rows[0] ||
    null;
}


module.exports = {
  requireProvider,

  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  activateProvider,
  disableProvider,

  listDomains,
  createDomain,
  verifyDomain,
  revokeDomain,

  getAuthenticationPolicy,
  updateAuthenticationPolicy,

  discoverEnterpriseLogin,

  linkExternalIdentity,
  findExternalIdentity,

  normalizeDomain,
  hash,
};