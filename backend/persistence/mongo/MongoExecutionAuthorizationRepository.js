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

  async findAuthorizationByIdentifier(
    {
      organizationId,
      environmentId,
    },
    identifier,
    transaction = null
  ) {
    const normalized =
      String(
        identifier ||
        ""
      ).trim();

    if (!normalized) {
      return null;
    }

    const clauses = [
      {
        authorizationId:
          normalized,
      },
    ];

    if (
      /^[0-9a-f]{24}$/i.test(
        normalized
      )
    ) {
      clauses.unshift({
        _id:
          normalized,
      });
    }

    let query =
      ExecutionAuthorization
        .findOne({
          organizationId,

          environmentId,

          $or:
            clauses,
        });

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async findExecutionRequestByIdentifier(
    {
      organizationId,
      environmentId,
    },
    identifier,
    transaction = null
  ) {
    const normalized =
      String(
        identifier ||
        ""
      ).trim();

    if (!normalized) {
      return null;
    }

    const clauses = [
      {
        executionRequestId:
          normalized,
      },
    ];

    if (
      /^[0-9a-f]{24}$/i.test(
        normalized
      )
    ) {
      clauses.unshift({
        _id:
          normalized,
      });
    }

    let query =
      ExecutionRequest
        .findOne({
          organizationId,

          environmentId,

          $or:
            clauses,
        });

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async findIncidentExecutionHistory(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    options = {},
    transaction = null
  ) {
    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(
            options.limit ||
            20
          )
        )
      );

    let query =
      ExecutionRequest
        .find({
          organizationId,

          environmentId,

          incidentId,
        })
        .sort({
          createdAt:
            -1,
        })
        .limit(
          limit
        );

    const session =
      sessionFrom(
        transaction
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async saveExecutionRequest(
    request,
    transaction = null
  ) {
    if (
      !request ||
      typeof request.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoExecutionAuthorizationRepository.saveExecutionRequest() requires a Mongoose document"
        ),
        {
          code:
            "INVALID_EXECUTION_REQUEST_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return request.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }
}

module.exports =
  MongoExecutionAuthorizationRepository;