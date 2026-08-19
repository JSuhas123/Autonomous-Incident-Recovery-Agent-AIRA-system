"use strict";

const ExecutionAuthorizationRepository =
  require(
    "../repositories/ExecutionAuthorizationRepository"
  );

const ExecutionAuthorization =
  require(
    "../../models/ExecutionAuthorization"
  );

const ExecutionRequest =
  require(
    "../../models/ExecutionRequest"
  );

function sessionFrom(
  transaction
) {
  return transaction
    ?.kind ===
    "mongo"
    ? transaction.session
    : null;
}

async function createDocument(
  Model,
  data,
  transaction
) {
  const session =
    sessionFrom(
      transaction
    );

  if (
    !session
  ) {
    return Model
      .create(
        data
      );
  }

  const [
    created,
  ] =
    await Model
      .create(
        [
          data,
        ],
        {
          session,
        }
      );

  return created;
}

class MongoExecutionAuthorizationRepository
  extends ExecutionAuthorizationRepository {
  async createAuthorization(
    data,
    transaction = null
  ) {
    return createDocument(
      ExecutionAuthorization,
      data,
      transaction
    );
  }

  async createExecutionRequest(
    data,
    transaction = null
  ) {
    return createDocument(
      ExecutionRequest,
      data,
      transaction
    );
  }
}

module.exports =
  MongoExecutionAuthorizationRepository;