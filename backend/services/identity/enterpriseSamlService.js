"use strict";

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


async function getSamlConfiguration({
  organizationId,
  providerId,
  baseUrl,
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
      "saml"
  ) {
    throw createError(
      "Provider is not SAML",
      422,
      "IDENTITY_PROVIDER_NOT_SAML"
    );
  }

  if (
    !provider.saml_sso_url &&
    !provider.saml_metadata_url
  ) {
    throw createError(
      "SAML provider configuration is incomplete",
      409,
      "SAML_PROVIDER_NOT_READY"
    );
  }

  const origin =
    String(
      baseUrl ||
      ""
    ).replace(
      /\/+$/,
      ""
    );

  return {
    providerId:
      provider.public_id,

    entityId:
      `${origin}/api/v1/enterprise-auth/saml/${provider.public_id}/metadata`,

    assertionConsumerServiceUrl:
      `${origin}/api/v1/enterprise-auth/saml/${provider.public_id}/acs`,

    identityProvider: {
      entityId:
        provider.saml_entity_id,

      ssoUrl:
        provider.saml_sso_url,

      metadataUrl:
        provider.saml_metadata_url,

      certificate:
        provider.saml_certificate,
    },

    attributeMapping:
      provider.attribute_mapping ||
      {},
  };
}


module.exports = {
  getSamlConfiguration,
};