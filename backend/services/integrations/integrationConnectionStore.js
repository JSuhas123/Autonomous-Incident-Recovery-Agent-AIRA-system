"use strict";

const PostgresIntegrationConnectionRepository =
  require(
    "../../persistence/postgres/PostgresIntegrationConnectionRepository"
  );

const PostgresIntegrationCredentialRepository =
  require(
    "../../persistence/postgres/PostgresIntegrationCredentialRepository"
  );

const {
  IntegrationCredentialProvider,
} =
  require(
    "./credentialProvider"
  );


class IntegrationConnectionStore {
  constructor(
    options = {}
  ) {
    this.connectionRepository =
      options
        .connectionRepository ||
      new PostgresIntegrationConnectionRepository(
        options
      );


    this.credentialRepository =
      options
        .credentialRepository ||
      new PostgresIntegrationCredentialRepository(
        options
      );


    this.credentialProvider =
      options
        .credentialProvider ||
      new IntegrationCredentialProvider(
        options
      );
  }


  async createConnection(
    input,
    transaction = null
  ) {
    const connection =
      await this
        .connectionRepository
        .createConnection(
          input,
          transaction
        );


    if (
      input.secret ===
        undefined ||
      input.secret ===
        null ||
      input.secret ===
        ""
    ) {
      return {
        ...connection,

        credential:
          null,

        executionAuthorized:
          false,
      };
    }


    const reference =
      await this
        .credentialProvider
        .createReference(
          input.secret
        );


    const credential =
      await this
        .credentialRepository
        .upsertCredentialReference(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            connectionId:
              connection.id,

            providerType:
              reference
                .providerType,

            referenceValue:
              reference
                .referenceValue,

            secretVersion:
              reference
                .secretVersion,
          },

          transaction
        );


    return {
      ...connection,

      credential,

      executionAuthorized:
        false,
    };
  }


  async getConnection(
    scope,
    transaction = null
  ) {
    if (
      scope.publicId
    ) {
      return this
        .connectionRepository
        .getConnectionByPublicId(
          scope,
          transaction
        );
    }


    return this
      .connectionRepository
      .getConnectionById(
        {
          ...scope,

          connectionId:
            scope.connectionId,
        },

        transaction
      );
  }


  async listConnections(
    query,
    transaction = null
  ) {
    return this
      .connectionRepository
      .listConnections(
        query,
        transaction
      );
  }


  async updateConnection(
    input,
    transaction = null
  ) {
    return this
      .connectionRepository
      .updateConnection(
        input,
        transaction
      );
  }


  async rotateCredential(
    {
      organizationId,

      environmentId,

      connectionId,

      secret,
    },

    transaction = null
  ) {
    const reference =
      await this
        .credentialProvider
        .rotateReference(
          secret
        );


    return this
      .credentialRepository
      .upsertCredentialReference(
        {
          organizationId,

          environmentId,

          connectionId,

          providerType:
            reference
              .providerType,

          referenceValue:
            reference
              .referenceValue,

          secretVersion:
            reference
              .secretVersion,
        },

        transaction
      );
  }


  async getCredentialMetadata(
    scope,
    transaction = null
  ) {
    return this
      .credentialRepository
      .getCredentialMetadata(
        scope,
        transaction
      );
  }


  /*
   * Internal runtime only.
   *
   * Controllers/serializers must never return this result.
   */
  async resolveCredential(
    scope,
    transaction = null
  ) {
    const stored =
      await this
        .credentialRepository
        .resolveCredentialReference(
          scope,
          transaction
        );


    if (
      !stored
    ) {
      return null;
    }


    return this
      .credentialProvider
      .resolveReference(
        stored
      );
  }


  async revokeCredential(
    scope,
    transaction = null
  ) {
    const credential =
      await this
        .credentialRepository
        .revokeCredentialReference(
          scope,
          transaction
        );


    if (
      credential
    ) {
      await this
        .credentialProvider
        .revokeReference(
          credential
        );
    }


    return credential;
  }


  async deleteConnection(
    scope,
    transaction = null
  ) {
    return this
      .connectionRepository
      .deleteConnection(
        scope,
        transaction
      );
  }
}


module.exports =
  IntegrationConnectionStore;