"use strict";

const crypto =
  require(
    "node:crypto"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


class PostgresIntegrationCredentialRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async upsertCredentialReference(
    input,
    transaction = null
  ) {
    validateInput(
      input
    );


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const connection =
          await resolveConnection(
            client,
            input.connectionId
          );


        if (
          !connection
        ) {
          throw Object.assign(
            new Error(
              "integration connection not found"
            ),
            {
              code:
                "INTEGRATION_CONNECTION_NOT_FOUND",
            }
          );
        }


        const publicId =
          input.publicId ||
          generatePublicId();


        const result =
          await client.query(
            `
              INSERT INTO
                integrations.credential_references (
                  public_id,

                  organization_id,
                  environment_id,

                  connection_id,

                  provider_type,

                  reference_value,

                  secret_version,

                  status,

                  rotated_at,

                  metadata,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,

                $5,

                $6,

                $7,

                'active',

                COALESCE(
                  $8,
                  NOW()
                ),

                $9::jsonb,

                false
              )

              ON CONFLICT (
                organization_id,
                environment_id,
                connection_id
              )

              DO UPDATE SET
                provider_type =
                  EXCLUDED.provider_type,

                reference_value =
                  EXCLUDED.reference_value,

                secret_version =
                  EXCLUDED.secret_version,

                status =
                  'active',

                rotated_at =
                  EXCLUDED.rotated_at,

                revoked_at =
                  NULL,

                metadata =
                  EXCLUDED.metadata,

                execution_authorized =
                  false

              RETURNING
                id,
                public_id,
                organization_id,
                environment_id,
                connection_id,
                provider_type,
                secret_version,
                status,
                rotated_at,
                revoked_at,
                metadata,
                execution_authorized,
                created_at,
                updated_at
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              connection.id,

              normalizeProviderType(
                input.providerType
              ),

              String(
                input.referenceValue
              ),

              input.secretVersion ||
              null,

              input.rotatedAt ||
              null,

              JSON.stringify(
                normalizeObject(
                  input.metadata
                )
              ),
            ]
          );


        return mapSafeCredential(
          result.rows[0]
        );
      },

      transaction
    );
  }


  async getCredentialMetadata(
    {
      organizationId,

      environmentId,

      connectionId,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    if (
      !connectionId
    ) {
      throw requiredError(
        "connectionId"
      );
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT
                id,
                public_id,
                organization_id,
                environment_id,
                connection_id,
                provider_type,
                secret_version,
                status,
                rotated_at,
                revoked_at,
                metadata,
                execution_authorized,
                created_at,
                updated_at
              FROM
                integrations.credential_references
              WHERE
                connection_id = $1
              LIMIT 1
            `,
            [
              connectionId,
            ]
          );


        return result
          .rows[0]
          ? mapSafeCredential(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  /*
   * Internal secret-resolution boundary.
   *
   * Do not expose this method through ordinary API serializers/controllers.
   */
  async resolveCredentialReference(
    {
      organizationId,

      environmentId,

      connectionId,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    if (
      !connectionId
    ) {
      throw requiredError(
        "connectionId"
      );
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT
                id,
                public_id,
                connection_id,
                provider_type,
                reference_value,
                secret_version,
                status,
                rotated_at,
                revoked_at,
                metadata
              FROM
                integrations.credential_references
              WHERE
                connection_id = $1

                AND

                status = 'active'

              LIMIT 1
            `,
            [
              connectionId,
            ]
          );


        if (
          !result.rows[0]
        ) {
          return null;
        }


        return {
          id:
            result.rows[0]
              .id,

          publicId:
            result.rows[0]
              .public_id,

          connectionId:
            result.rows[0]
              .connection_id,

          providerType:
            result.rows[0]
              .provider_type,

          referenceValue:
            result.rows[0]
              .reference_value,

          secretVersion:
            result.rows[0]
              .secret_version,

          status:
            result.rows[0]
              .status,

          rotatedAt:
            result.rows[0]
              .rotated_at,

          revokedAt:
            result.rows[0]
              .revoked_at,

          metadata:
            result.rows[0]
              .metadata ||
            {},

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async revokeCredentialReference(
    {
      organizationId,

      environmentId,

      connectionId,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    if (
      !connectionId
    ) {
      throw requiredError(
        "connectionId"
      );
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              UPDATE
                integrations.credential_references
              SET
                status =
                  'revoked',

                revoked_at =
                  NOW(),

                execution_authorized =
                  false
              WHERE
                connection_id = $1

              RETURNING
                id,
                public_id,
                organization_id,
                environment_id,
                connection_id,
                provider_type,
                secret_version,
                status,
                rotated_at,
                revoked_at,
                metadata,
                execution_authorized,
                created_at,
                updated_at
            `,
            [
              connectionId,
            ]
          );


        return result
          .rows[0]
          ? mapSafeCredential(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }
}


async function resolveConnection(
  client,
  connectionId
) {
  const result =
    await client.query(
      `
        SELECT
          id,
          organization_id,
          environment_id
        FROM
          integrations.connections
        WHERE
          id = $1
        LIMIT 1
      `,
      [
        connectionId,
      ]
    );


  return (
    result.rows[0] ||
    null
  );
}


function validateInput(
  input
) {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw Object.assign(
      new Error(
        "credential reference input is required"
      ),
      {
        code:
          "INTEGRATION_CREDENTIAL_INPUT_REQUIRED",
      }
    );
  }


  requireScope(
    input.organizationId,
    input.environmentId
  );


  if (
    !input.connectionId
  ) {
    throw requiredError(
      "connectionId"
    );
  }


  if (
    !input.referenceValue
  ) {
    throw requiredError(
      "referenceValue"
    );
  }
}


function requireScope(
  organizationId,
  environmentId
) {
  if (
    !organizationId
  ) {
    throw requiredError(
      "organizationId"
    );
  }


  if (
    !environmentId
  ) {
    throw requiredError(
      "environmentId"
    );
  }
}


function requiredError(
  field
) {
  return Object.assign(
    new Error(
      `${field} is required`
    ),
    {
      code:
        "INTEGRATION_CREDENTIAL_FIELD_REQUIRED",

      field,
    }
  );
}


function normalizeProviderType(
  value
) {
  const normalized =
    String(
      value ||
      "local_encrypted"
    )
      .trim()
      .toLowerCase();


  if (
    ![
      "local_encrypted",
      "external_secret_manager",
    ].includes(
      normalized
    )
  ) {
    throw Object.assign(
      new Error(
        `invalid credential provider type: ${value}`
      ),
      {
        code:
          "INTEGRATION_CREDENTIAL_PROVIDER_INVALID",
      }
    );
  }


  return normalized;
}


function normalizeObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }


  return {
    ...value,
  };
}


function generatePublicId() {
  return (
    "int_cred_" +
    crypto
      .randomUUID()
  );
}


function mapSafeCredential(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    connectionId:
      row.connection_id,

    providerType:
      row.provider_type,

    secretVersion:
      row.secret_version,

    status:
      row.status,

    rotatedAt:
      row.rotated_at,

    revokedAt:
      row.revoked_at,

    metadata:
      row.metadata ||
      {},

    /*
     * reference_value intentionally omitted.
     */
    hasCredential:
      true,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


module.exports =
  PostgresIntegrationCredentialRepository;