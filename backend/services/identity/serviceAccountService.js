"use strict";

const crypto =
  require(
    "crypto"
  );

  const {
  isKnownPermission,
  normalizePermissions,
} =
  require(
    "../../constants/permissions"
  );
const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );

  
const {
  record:
    auditRecord,
} =
  require(
    "./identityAuditService"
  );


// ============================================================================
// CONSTANTS
// ============================================================================

const SERVICE_ACCOUNT_STATUS = {
  ACTIVE:
    "active",

  SUSPENDED:
    "suspended",

  REVOKED:
    "revoked",
};


const API_KEY_PREFIX =
  "aira_live";


// ============================================================================
// ERRORS
// ============================================================================

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


// ============================================================================
// BASIC HELPERS
// ============================================================================

function asId(
  value
) {
  if (
    value == null
  ) {
    return null;
  }

  return (
    value
      ?.toString?.() ??
    value
  );
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


function normalizeStringArray(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          (item) =>
            String(
              item ||
              ""
            ).trim()
        )
        .filter(
          Boolean
        )
    ),
  ];
}

// ============================================================================
// CANONICAL PERMISSION VALIDATION
// ============================================================================

function normalizeAndValidatePermissions(
  permissions
) {
  if (
    permissions == null
  ) {
    return [];
  }

  if (
    !Array.isArray(
      permissions
    )
  ) {
    throw createError(
      "Permissions must be an array",
      422,
      "SERVICE_ACCOUNT_PERMISSIONS_INVALID"
    );
  }

  const requested =
    [
      ...new Set(
        permissions
          .map(
            (permission) =>
              String(
                permission ||
                ""
              ).trim()
          )
          .filter(
            Boolean
          )
      ),
    ];

  const unknown =
    requested.filter(
      (permission) =>
        !isKnownPermission(
          permission
        )
    );

  if (
    unknown.length >
    0
  ) {
    throw createError(
      `Unknown permission(s): ${unknown.join(
        ", "
      )}`,
      422,
      "SERVICE_ACCOUNT_PERMISSION_UNKNOWN"
    );
  }

  return normalizePermissions(
    requested
  );
}

function normalizeExpiry(
  value
) {
  if (
    value == null ||
    value ===
      ""
  ) {
    return null;
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw createError(
      "Invalid expiration date",
      422,
      "EXPIRATION_INVALID"
    );
  }

  if (
    date.getTime() <=
    Date.now()
  ) {
    throw createError(
      "Expiration must be in the future",
      422,
      "EXPIRATION_MUST_BE_FUTURE"
    );
  }

  return date;
}


function sha256(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      value,
      "utf8"
    )
    .digest(
      "hex"
    );
}


// ============================================================================
// SERIALIZATION
// ============================================================================

function serializeServiceAccount(
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

    internalId:
      row.id,

    organizationId:
      row.organization_id,

    name:
      row.name,

    description:
      row.description,

    status:
      row.status,

    permissions:
      row.permissions ||
      [],

    environmentIds:
      row.environment_ids ||
      [],

    createdByUserId:
      row.created_by_user_id,

    expiresAt:
      row.expires_at,

    lastAuthenticatedAt:
      row.last_authenticated_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    revokedAt:
      row.revoked_at,

    revocationReason:
      row.revocation_reason,

    metadata:
      row.metadata ||
      {},
  };
}


function serializeApiKey(
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

    serviceAccountId:
      row.service_account_public_id ||
      row.service_account_id,

    organizationId:
      row.organization_id,

    name:
      row.name,

    keyPrefix:
      row.key_prefix,

    expiresAt:
      row.expires_at,

    lastUsedAt:
      row.last_used_at,

    usageCount:
      Number(
        row.usage_count ||
        0
      ),

    createdByUserId:
      row.created_by_user_id,

    createdAt:
      row.created_at,

    revokedAt:
      row.revoked_at,

    revocationReason:
      row.revocation_reason,

    metadata:
      row.metadata ||
      {},
  };
}


// ============================================================================
// LOOKUP
// ============================================================================

async function requireServiceAccount(
  organizationId,
  serviceAccountId,
  {
    includeRevoked =
      false,
  } = {}
) {
  const pool =
    getPostgresPool();

  const result =
    await pool.query(
      `
        SELECT
          *
        FROM
          identity.service_accounts
        WHERE
          organization_id = $1
          AND (
            public_id = $2
            OR id::text = $2
          )
          ${
            includeRevoked
              ? ""
              : "AND status <> 'revoked'"
          }
        LIMIT 1
      `,
      [
        organizationId,
        serviceAccountId,
      ]
    );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Service account not found",
      404,
      "SERVICE_ACCOUNT_NOT_FOUND"
    );
  }

  return result.rows[0];
}


// ============================================================================
// LIST SERVICE ACCOUNTS
// ============================================================================

async function listServiceAccounts(
  organizationId
) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT
            *
          FROM
            identity.service_accounts
          WHERE
            organization_id = $1
          ORDER BY
            created_at DESC
        `,
        [
          organizationId,
        ]
      );

  return result.rows.map(
    serializeServiceAccount
  );
}


// ============================================================================
// CREATE SERVICE ACCOUNT
// ============================================================================

async function createServiceAccount({
  organizationId,
  actorUserId,
  name,
  description =
    null,
  permissions =
    [],
  environmentIds =
    [],
  expiresAt =
    null,
  metadata =
    {},
}) {
  const normalizedName =
    String(
      name ||
      ""
    ).trim();

  if (
    !normalizedName
  ) {
    throw createError(
      "Service account name is required",
      422,
      "SERVICE_ACCOUNT_NAME_REQUIRED"
    );
  }

  const normalizedPermissions =
    normalizeAndValidatePermissions(
      permissions
    );

  const normalizedEnvironments =
    normalizeStringArray(
      environmentIds
    );

  const expiry =
    normalizeExpiry(
      expiresAt
    );

  const pool =
    getPostgresPool();

  let result;

  try {
    result =
      await pool.query(
        `
          INSERT INTO
            identity.service_accounts (
              public_id,
              organization_id,
              name,
              description,
              permissions,
              environment_ids,
              created_by_user_id,
              expires_at,
              metadata
            )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5::jsonb,
            $6::jsonb,
            $7,
            $8,
            $9::jsonb
          )
          RETURNING *
        `,
        [
          createPublicId(
            "svc"
          ),

          organizationId,

          normalizedName,

          description
            ? String(
                description
              ).trim()
            : null,

          JSON.stringify(
            normalizedPermissions
          ),

          JSON.stringify(
            normalizedEnvironments
          ),

          actorUserId,

          expiry,

          JSON.stringify(
            metadata ||
            {}
          ),
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
        "A service account with this name already exists",
        409,
        "SERVICE_ACCOUNT_ALREADY_EXISTS"
      );
    }

    throw error;
  }

  const account =
    result.rows[0];

  await auditRecord(
    "service_account_created",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        serviceAccountId:
          account.public_id,

        permissions:
          normalizedPermissions,

        environmentIds:
          normalizedEnvironments,
      },
    }
  ).catch(
    () => {}
  );

  return serializeServiceAccount(
    account
  );
}


// ============================================================================
// UPDATE SERVICE ACCOUNT
// ============================================================================

async function updateServiceAccount({
  organizationId,
  serviceAccountId,
  actorUserId,
  name,
  description,
  permissions,
  environmentIds,
  expiresAt,
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId
    );

  const updates =
    [];

  const values = [
    organizationId,
    account.id,
  ];

  let parameter =
    3;

  if (
    name !==
    undefined
  ) {
    const normalized =
      String(
        name
      ).trim();

    if (
      !normalized
    ) {
      throw createError(
        "Service account name cannot be empty",
        422,
        "SERVICE_ACCOUNT_NAME_INVALID"
      );
    }

    updates.push(
      `name = $${parameter++}`
    );

    values.push(
      normalized
    );
  }

  if (
    description !==
    undefined
  ) {
    updates.push(
      `description = $${parameter++}`
    );

    values.push(
      description
        ? String(
            description
          ).trim()
        : null
    );
  }

  if (
    permissions !==
    undefined
  ) {
   const normalizedPermissions =
  normalizeAndValidatePermissions(
    permissions
  );

updates.push(
  `permissions = $${parameter++}::jsonb`
);

values.push(
  JSON.stringify(
    normalizedPermissions
  )
);
  }

  if (
    environmentIds !==
    undefined
  ) {
    updates.push(
      `environment_ids = $${parameter++}::jsonb`
    );

    values.push(
      JSON.stringify(
        normalizeStringArray(
          environmentIds
        )
      )
    );
  }

  if (
    expiresAt !==
    undefined
  ) {
    updates.push(
      `expires_at = $${parameter++}`
    );

    values.push(
      normalizeExpiry(
        expiresAt
      )
    );
  }

  if (
    updates.length ===
    0
  ) {
    return serializeServiceAccount(
      account
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE
            identity.service_accounts
          SET
            ${updates.join(
              ", "
            )}
          WHERE
            organization_id = $1
            AND
            id = $2
            AND
            status <> 'revoked'
          RETURNING *
        `,
        values
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Service account not found",
      404,
      "SERVICE_ACCOUNT_NOT_FOUND"
    );
  }

  await auditRecord(
    "service_account_updated",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        serviceAccountId:
          account.public_id,
      },
    }
  ).catch(
    () => {}
  );

  return serializeServiceAccount(
    result.rows[0]
  );
}


// ============================================================================
// SUSPEND
// ============================================================================

async function suspendServiceAccount({
  organizationId,
  serviceAccountId,
  actorUserId,
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId
    );

  if (
    account.status ===
    SERVICE_ACCOUNT_STATUS.SUSPENDED
  ) {
    return serializeServiceAccount(
      account
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE
            identity.service_accounts
          SET
            status =
              'suspended'
          WHERE
            organization_id = $1
            AND
            id = $2
            AND
            status = 'active'
          RETURNING *
        `,
        [
          organizationId,
          account.id,
        ]
      );

  await auditRecord(
    "service_account_suspended",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        serviceAccountId:
          account.public_id,
      },
    }
  ).catch(
    () => {}
  );

  return serializeServiceAccount(
    result.rows[0] ||
    account
  );
}


// ============================================================================
// ACTIVATE
// ============================================================================

async function activateServiceAccount({
  organizationId,
  serviceAccountId,
  actorUserId,
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId
    );

  if (
    account.expires_at &&
    new Date(
      account.expires_at
    ).getTime() <=
      Date.now()
  ) {
    throw createError(
      "Expired service account cannot be activated",
      409,
      "SERVICE_ACCOUNT_EXPIRED"
    );
  }

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE
            identity.service_accounts
          SET
            status =
              'active'
          WHERE
            organization_id = $1
            AND
            id = $2
            AND
            status = 'suspended'
          RETURNING *
        `,
        [
          organizationId,
          account.id,
        ]
      );

  await auditRecord(
    "service_account_activated",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        serviceAccountId:
          account.public_id,
      },
    }
  ).catch(
    () => {}
  );

  return serializeServiceAccount(
    result.rows[0] ||
    account
  );
}


// ============================================================================
// REVOKE SERVICE ACCOUNT
// ============================================================================

async function revokeServiceAccount({
  organizationId,
  serviceAccountId,
  actorUserId,
  reason =
    null,
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId,
      {
        includeRevoked:
          true,
      }
    );

  if (
    account.status ===
    SERVICE_ACCOUNT_STATUS.REVOKED
  ) {
    return serializeServiceAccount(
      account
    );
  }

  const pool =
    getPostgresPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const result =
      await client.query(
        `
          UPDATE
            identity.service_accounts
          SET
            status =
              'revoked',

            revoked_at =
              NOW(),

            revoked_by_user_id =
              $3,

            revocation_reason =
              $4

          WHERE
            organization_id = $1
            AND
            id = $2

          RETURNING *
        `,
        [
          organizationId,
          account.id,
          actorUserId,
          reason
            ? String(
                reason
              ).trim()
            : null,
        ]
      );

    /**
     * Revoking the machine identity immediately invalidates all keys.
     */
    await client.query(
      `
        UPDATE
          identity.api_keys
        SET
          revoked_at =
            COALESCE(
              revoked_at,
              NOW()
            ),

          revoked_by_user_id =
            COALESCE(
              revoked_by_user_id,
              $3
            ),

          revocation_reason =
            COALESCE(
              revocation_reason,
              'service_account_revoked'
            )

        WHERE
          organization_id = $1
          AND
          service_account_id = $2
          AND
          revoked_at IS NULL
      `,
      [
        organizationId,
        account.id,
        actorUserId,
      ]
    );

    await client.query(
      "COMMIT"
    );

    await auditRecord(
      "service_account_revoked",
      "success",
      {
        userId:
          actorUserId,

        organizationId,

        metadata: {
          serviceAccountId:
            account.public_id,

          reason:
            reason ||
            null,
        },
      }
    ).catch(
      () => {}
    );

    return serializeServiceAccount(
      result.rows[0]
    );
  } catch (
    error
  ) {
    await client
      .query(
        "ROLLBACK"
      )
      .catch(
        () => {}
      );

    throw error;
  } finally {
    client.release();
  }
}


// ============================================================================
// API KEY GENERATION
// ============================================================================

function generateApiKey() {
  const identifier =
    crypto
      .randomBytes(
        8
      )
      .toString(
        "hex"
      );

  const secret =
    crypto
      .randomBytes(
        32
      )
      .toString(
        "base64url"
      );

  const keyPrefix =
    `${API_KEY_PREFIX}_${identifier}`;

  const plaintext =
    `${keyPrefix}.${secret}`;

  return {
    keyPrefix,
    plaintext,
    keyHash:
      sha256(
        plaintext
      ),
  };
}


// ============================================================================
// CREATE API KEY
// ============================================================================

async function createApiKey({
  organizationId,
  serviceAccountId,
  actorUserId,
  name,
  expiresAt =
    null,
  metadata =
    {},
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId
    );

  if (
    account.status !==
    SERVICE_ACCOUNT_STATUS.ACTIVE
  ) {
    throw createError(
      "API keys can only be created for active service accounts",
      409,
      "SERVICE_ACCOUNT_NOT_ACTIVE"
    );
  }

  if (
    account.expires_at &&
    new Date(
      account.expires_at
    ).getTime() <=
      Date.now()
  ) {
    throw createError(
      "Service account has expired",
      409,
      "SERVICE_ACCOUNT_EXPIRED"
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
      "API key name is required",
      422,
      "API_KEY_NAME_REQUIRED"
    );
  }

  const expiry =
    normalizeExpiry(
      expiresAt
    );

  if (
    expiry &&
    account.expires_at &&
    expiry.getTime() >
      new Date(
        account.expires_at
      ).getTime()
  ) {
    throw createError(
      "API key cannot expire after its service account",
      422,
      "API_KEY_EXPIRY_EXCEEDS_SERVICE_ACCOUNT"
    );
  }

  const generated =
    generateApiKey();

  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO
            identity.api_keys (
              public_id,
              organization_id,
              service_account_id,
              name,
              key_prefix,
              key_hash,
              expires_at,
              created_by_user_id,
              metadata
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
            $9::jsonb
          )

          RETURNING *
        `,
        [
          createPublicId(
            "key"
          ),

          organizationId,

          account.id,

          normalizedName,

          generated.keyPrefix,

          generated.keyHash,

          expiry,

          actorUserId,

          JSON.stringify(
            metadata ||
            {}
          ),
        ]
      );

  await auditRecord(
    "api_key_created",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        apiKeyId:
          result.rows[0]
            .public_id,

        serviceAccountId:
          account.public_id,

        keyPrefix:
          generated.keyPrefix,
      },
    }
  ).catch(
    () => {}
  );

  return {
    apiKey:
      serializeApiKey({
        ...result.rows[0],

        service_account_public_id:
          account.public_id,
      }),

    /**
     * SECURITY:
     *
     * The secret is deliberately returned ONLY from this operation.
     * No read/list API can reproduce it later.
     */
    secret:
      generated.plaintext,
  };
}


// ============================================================================
// LIST API KEYS
// ============================================================================

async function listApiKeys({
  organizationId,
  serviceAccountId,
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId,
      {
        includeRevoked:
          true,
      }
    );

  const result =
    await getPostgresPool()
      .query(
        `
          SELECT
            k.*,

            s.public_id
              AS service_account_public_id

          FROM
            identity.api_keys k

          INNER JOIN
            identity.service_accounts s
          ON
            s.id =
              k.service_account_id

          WHERE
            k.organization_id = $1
            AND
            k.service_account_id = $2

          ORDER BY
            k.created_at DESC
        `,
        [
          organizationId,
          account.id,
        ]
      );

  return result.rows.map(
    serializeApiKey
  );
}


// ============================================================================
// REVOKE API KEY
// ============================================================================

async function revokeApiKey({
  organizationId,
  serviceAccountId,
  apiKeyId,
  actorUserId,
  reason =
    null,
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId,
      {
        includeRevoked:
          true,
      }
    );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE
            identity.api_keys

          SET
            revoked_at =
              COALESCE(
                revoked_at,
                NOW()
              ),

            revoked_by_user_id =
              COALESCE(
                revoked_by_user_id,
                $4
              ),

            revocation_reason =
              COALESCE(
                revocation_reason,
                $5
              )

          WHERE
            organization_id = $1
            AND
            service_account_id = $2
            AND (
              public_id = $3
              OR id::text = $3
            )

          RETURNING *
        `,
        [
          organizationId,
          account.id,
          apiKeyId,
          actorUserId,
          reason
            ? String(
                reason
              ).trim()
            : "revoked_by_user",
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "API key not found",
      404,
      "API_KEY_NOT_FOUND"
    );
  }

  await auditRecord(
    "api_key_revoked",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        apiKeyId:
          result.rows[0]
            .public_id,

        serviceAccountId:
          account.public_id,

        keyPrefix:
          result.rows[0]
            .key_prefix,
      },
    }
  ).catch(
    () => {}
  );

  return serializeApiKey({
    ...result.rows[0],

    service_account_public_id:
      account.public_id,
  });
}


// ============================================================================
// ROTATE API KEY
// ============================================================================

async function rotateApiKey({
  organizationId,
  serviceAccountId,
  apiKeyId,
  actorUserId,
  expiresAt =
    null,
}) {
  const account =
    await requireServiceAccount(
      organizationId,
      serviceAccountId
    );

  const pool =
    getPostgresPool();

  const existing =
    await pool.query(
      `
        SELECT
          *
        FROM
          identity.api_keys
        WHERE
          organization_id = $1
          AND
          service_account_id = $2
          AND (
            public_id = $3
            OR id::text = $3
          )
          AND
          revoked_at IS NULL
        LIMIT 1
      `,
      [
        organizationId,
        account.id,
        apiKeyId,
      ]
    );

  if (
    !existing.rows[0]
  ) {
    throw createError(
      "Active API key not found",
      404,
      "API_KEY_NOT_FOUND"
    );
  }

  const oldKey =
    existing.rows[0];

  const generated =
    generateApiKey();

  const expiry =
    expiresAt !==
      null
      ? normalizeExpiry(
          expiresAt
        )
      : oldKey
          .expires_at;

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    await client.query(
      `
        UPDATE
          identity.api_keys
        SET
          revoked_at =
            NOW(),

          revoked_by_user_id =
            $4,

          revocation_reason =
            'rotated'

        WHERE
          organization_id = $1
          AND
          service_account_id = $2
          AND
          id = $3
      `,
      [
        organizationId,
        account.id,
        oldKey.id,
        actorUserId,
      ]
    );

    const created =
      await client.query(
        `
          INSERT INTO
            identity.api_keys (
              public_id,
              organization_id,
              service_account_id,
              name,
              key_prefix,
              key_hash,
              expires_at,
              created_by_user_id,
              metadata
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
            $9::jsonb
          )

          RETURNING *
        `,
        [
          createPublicId(
            "key"
          ),

          organizationId,

          account.id,

          oldKey.name,

          generated.keyPrefix,

          generated.keyHash,

          expiry,

          actorUserId,

          JSON.stringify({
            ...(oldKey.metadata ||
              {}),

            rotatedFrom:
              oldKey.public_id,
          }),
        ]
      );

    await client.query(
      "COMMIT"
    );

    await auditRecord(
      "api_key_rotated",
      "success",
      {
        userId:
          actorUserId,

        organizationId,

        metadata: {
          oldApiKeyId:
            oldKey.public_id,

          newApiKeyId:
            created.rows[0]
              .public_id,

          serviceAccountId:
            account.public_id,
        },
      }
    ).catch(
      () => {}
    );

    return {
      apiKey:
        serializeApiKey({
          ...created.rows[0],

          service_account_public_id:
            account.public_id,
        }),

      secret:
        generated.plaintext,
    };
  } catch (
    error
  ) {
    await client
      .query(
        "ROLLBACK"
      )
      .catch(
        () => {}
      );

    throw error;
  } finally {
    client.release();
  }
}


// ============================================================================
// AUTHENTICATE API KEY
// ============================================================================

async function authenticateApiKey(
  plaintextKey
) {
  const value =
    String(
      plaintextKey ||
      ""
    ).trim();

  if (
    !value.startsWith(
      `${API_KEY_PREFIX}_`
    ) ||
    !value.includes(
      "."
    )
  ) {
    throw createError(
      "Invalid API key",
      401,
      "API_KEY_INVALID"
    );
  }

  const separator =
    value.indexOf(
      "."
    );

  const keyPrefix =
    value.slice(
      0,
      separator
    );

  const hash =
    sha256(
      value
    );

  const pool =
    getPostgresPool();

  const result =
    await pool.query(
      `
        SELECT
          k.id
            AS api_key_internal_id,

          k.public_id
            AS api_key_public_id,

          k.organization_id,

          k.key_hash,

          k.key_prefix,

          k.expires_at
            AS api_key_expires_at,

          k.revoked_at
            AS api_key_revoked_at,

          s.id
            AS service_account_internal_id,

          s.public_id
            AS service_account_public_id,

          s.name
            AS service_account_name,

          s.status
            AS service_account_status,

          s.permissions,

          s.environment_ids,

          s.expires_at
            AS service_account_expires_at

        FROM
          identity.api_keys k

        INNER JOIN
          identity.service_accounts s
        ON
          s.id =
            k.service_account_id

        WHERE
          k.key_prefix = $1

        LIMIT 1
      `,
      [
        keyPrefix,
      ]
    );

  const record =
    result.rows[0];

  if (
    !record
  ) {
    throw createError(
      "Invalid API key",
      401,
      "API_KEY_INVALID"
    );
  }

  const supplied =
    Buffer.from(
      hash,
      "hex"
    );

  const stored =
    Buffer.from(
      record.key_hash,
      "hex"
    );

  if (
    supplied.length !==
      stored.length ||
    !crypto.timingSafeEqual(
      supplied,
      stored
    )
  ) {
    throw createError(
      "Invalid API key",
      401,
      "API_KEY_INVALID"
    );
  }

  if (
    record
      .api_key_revoked_at
  ) {
    throw createError(
      "API key has been revoked",
      401,
      "API_KEY_REVOKED"
    );
  }

  if (
    record
      .service_account_status !==
      SERVICE_ACCOUNT_STATUS.ACTIVE
  ) {
    throw createError(
      "Service account is not active",
      401,
      "SERVICE_ACCOUNT_NOT_ACTIVE"
    );
  }

  const now =
    Date.now();

  if (
    record
      .api_key_expires_at &&
    new Date(
      record
        .api_key_expires_at
    ).getTime() <=
      now
  ) {
    throw createError(
      "API key has expired",
      401,
      "API_KEY_EXPIRED"
    );
  }

  if (
    record
      .service_account_expires_at &&
    new Date(
      record
        .service_account_expires_at
    ).getTime() <=
      now
  ) {
    throw createError(
      "Service account has expired",
      401,
      "SERVICE_ACCOUNT_EXPIRED"
    );
  }

  /**
   * Authentication usage state is best-effort.
   *
   * Authentication should not fail merely because usage telemetry cannot
   * be persisted after the key has already been securely verified.
   */
  await Promise.all([
    pool.query(
      `
        UPDATE
          identity.api_keys
        SET
          last_used_at =
            NOW(),

          usage_count =
            usage_count + 1

        WHERE
          id = $1
      `,
      [
        record
          .api_key_internal_id,
      ]
    ),

    pool.query(
      `
        UPDATE
          identity.service_accounts
        SET
          last_authenticated_at =
            NOW()

        WHERE
          id = $1
      `,
      [
        record
          .service_account_internal_id,
      ]
    ),
  ]).catch(
    () => {}
  );

  return {
    actorType:
      "SERVICE_ACCOUNT",

    organizationId:
      record
        .organization_id,

    serviceAccountId:
      record
        .service_account_public_id,

    serviceAccountInternalId:
      record
        .service_account_internal_id,

    apiKeyId:
      record
        .api_key_public_id,

    name:
      record
        .service_account_name,

    permissions:
  normalizePermissions(
        record.permissions
      ),

    environmentIds:
      normalizeStringArray(
        record.environment_ids
      ),
  };
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  SERVICE_ACCOUNT_STATUS,

  listServiceAccounts,

  requireServiceAccount,

  createServiceAccount,

  updateServiceAccount,

  suspendServiceAccount,

  activateServiceAccount,

  revokeServiceAccount,

  createApiKey,

  listApiKeys,

  revokeApiKey,

  rotateApiKey,

  normalizeAndValidatePermissions,
  
  authenticateApiKey,

  generateApiKey,

  sha256,
};