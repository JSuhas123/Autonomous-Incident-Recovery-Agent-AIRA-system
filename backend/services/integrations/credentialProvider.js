"use strict";

const {
  encryptSecret,

  decryptSecret,

  isEncryptedSecret,
} =
  require(
    "./secretStorage"
  );


const LOCAL_PROVIDER =
  "local_encrypted";


class IntegrationCredentialProvider {
  constructor(
    options = {}
  ) {
    this.providerType =
      options.providerType ||
      LOCAL_PROVIDER;
  }


  async createReference(
    secret
  ) {
    if (
      secret ===
        undefined ||
      secret ===
        null ||
      secret ===
        ""
    ) {
      throw Object.assign(
        new Error(
          "integration secret is required"
        ),
        {
          code:
            "INTEGRATION_SECRET_REQUIRED",
        }
      );
    }


    if (
      this.providerType !==
      LOCAL_PROVIDER
    ) {
      throw unsupportedProvider(
        this.providerType
      );
    }


    const referenceValue =
      encryptSecret(
        secret
      );


    return {
      providerType:
        LOCAL_PROVIDER,

      referenceValue,

      secretVersion:
        "v1",

      executionAuthorized:
        false,
    };
  }


  async resolveReference(
    credentialReference
  ) {
    if (
      !credentialReference
    ) {
      return null;
    }


    if (
      credentialReference
        .providerType !==
      LOCAL_PROVIDER
    ) {
      throw unsupportedProvider(
        credentialReference
          .providerType
      );
    }


    if (
      !credentialReference
        .referenceValue
    ) {
      throw Object.assign(
        new Error(
          "credential reference value is required"
        ),
        {
          code:
            "INTEGRATION_CREDENTIAL_REFERENCE_REQUIRED",
        }
      );
    }


    return decryptSecret(
      credentialReference
        .referenceValue
    );
  }


  async rotateReference(
    secret
  ) {
    return this.createReference(
      secret
    );
  }


  async revokeReference(
    credentialReference
  ) {
    return {
      providerType:
        credentialReference
          ?.providerType ||
        this.providerType,

      revoked:
        true,

      executionAuthorized:
        false,
    };
  }


  isManagedReference(
    value
  ) {
    return isEncryptedSecret(
      value
    );
  }
}


function unsupportedProvider(
  providerType
) {
  return Object.assign(
    new Error(
      `credential provider "${providerType}" is not configured`
    ),
    {
      code:
        "INTEGRATION_CREDENTIAL_PROVIDER_UNSUPPORTED",

      providerType,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationCredentialProvider,

  LOCAL_PROVIDER,
};