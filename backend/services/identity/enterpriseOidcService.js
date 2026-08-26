"use strict";

const crypto =
  require(
    "crypto"
  );

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );

const {
  requireProvider,
} =
  require(
    "./enterpriseIdentityService"
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

  return error;
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


async function discoverOidcProvider({
  organizationId,
  providerId,
  fetchImpl =
    global.fetch,
}) {
  const provider =
    await requireProvider(
      organizationId,
      providerId
    );

  if (
    provider.provider_type !==
      "oidc"
  ) {
    throw createError(
      "Provider is not OIDC",
      422,
      "IDENTITY_PROVIDER_NOT_OIDC"
    );
  }

  const issuer =
    String(
      provider.issuer_url
    ).replace(
      /\/+$/,
      ""
    );

  const response =
    await fetchImpl(
      `${issuer}/.well-known/openid-configuration`
    );

  if (
    !response.ok
  ) {
    throw createError(
      "OIDC discovery failed",
      502,
      "OIDC_DISCOVERY_FAILED"
    );
  }

  const metadata =
    await response.json();

  if (
    !metadata.authorization_endpoint ||
    !metadata.token_endpoint ||
    !metadata.jwks_uri
  ) {
    throw createError(
      "OIDC discovery document is incomplete",
      502,
      "OIDC_DISCOVERY_INVALID"
    );
  }

  const updated =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.identity_providers
          SET
            authorization_endpoint = $3,
            token_endpoint = $4,
            userinfo_endpoint = $5,
            jwks_uri = $6
          WHERE
            organization_id = $1
            AND id = $2
          RETURNING *
        `,
        [
          organizationId,
          provider.id,
          metadata
            .authorization_endpoint,
          metadata
            .token_endpoint,
          metadata
            .userinfo_endpoint ||
          null,
          metadata
            .jwks_uri,
        ]
      );

  return {
    provider:
      updated.rows[0],

    discovery:
      metadata,
  };
}


async function createOidcLogin({
  organizationId,
  providerId,
  redirectUri,
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
    provider.provider_type !==
      "oidc"
  ) {
    throw createError(
      "Provider is not OIDC",
      422,
      "IDENTITY_PROVIDER_NOT_OIDC"
    );
  }

  if (
    !provider
      .authorization_endpoint ||
    !provider
      .client_id
  ) {
    throw createError(
      "OIDC provider is not fully configured",
      409,
      "OIDC_PROVIDER_NOT_READY"
    );
  }

  const state =
    crypto
      .randomBytes(
        32
      )
      .toString(
        "base64url"
      );

  const nonce =
    crypto
      .randomBytes(
        32
      )
      .toString(
        "base64url"
      );

  await getPostgresPool()
    .query(
      `
        INSERT INTO identity.enterprise_login_states (
          organization_id,
          provider_id,
          state_hash,
          nonce_hash,
          redirect_uri,
          expires_at
        )
        VALUES (
          $1,$2,$3,$4,$5,
          NOW() + INTERVAL '10 minutes'
        )
      `,
      [
        organizationId,
        provider.id,
        sha256(
          state
        ),
        sha256(
          nonce
        ),
        redirectUri,
      ]
    );

  const url =
    new URL(
      provider
        .authorization_endpoint
    );

  url.searchParams.set(
    "response_type",
    "code"
  );

  url.searchParams.set(
    "client_id",
    provider.client_id
  );

  url.searchParams.set(
    "redirect_uri",
    redirectUri
  );

  url.searchParams.set(
    "scope",
    (
      provider.scopes ||
      [
        "openid",
        "profile",
        "email",
      ]
    ).join(
      " "
    )
  );

  url.searchParams.set(
    "state",
    state
  );

  url.searchParams.set(
    "nonce",
    nonce
  );

  return {
    authorizationUrl:
      url.toString(),

    state,

    expiresInSeconds:
      600,
  };
}


async function consumeOidcState({
  state,
}) {
  const stateHash =
    sha256(
      state
    );

  const result =
    await getPostgresPool()
      .query(
        `
          UPDATE identity.enterprise_login_states
          SET
            consumed_at = NOW()
          WHERE
            state_hash = $1
            AND consumed_at IS NULL
            AND expires_at > NOW()
          RETURNING *
        `,
        [
          stateHash,
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "OIDC state is invalid, expired, or already consumed",
      401,
      "OIDC_STATE_INVALID"
    );
  }

  return result.rows[0];
}


module.exports = {
  discoverOidcProvider,
  createOidcLogin,
  consumeOidcState,
};