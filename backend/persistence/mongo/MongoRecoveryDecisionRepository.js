"use strict";

const RecoveryDecisionRepository =
  require(
    "../repositories/RecoveryDecisionRepository"
  );

const RecoveryDecision =
  require(
    "../../models/RecoveryDecision"
  );

const RecoveryDecisionRun =
  require(
    "../../models/RecoveryDecisionRun"
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

function identifierClauses(
  identifier,
  publicField
) {
  const normalized =
    String(
      identifier ||
      ""
    ).trim();

  if (!normalized) {
    return [];
  }

  const clauses = [
    {
      [publicField]:
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

  return clauses;
}

class MongoRecoveryDecisionRepository
  extends RecoveryDecisionRepository {
  async createRun(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return RecoveryDecisionRun
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await RecoveryDecisionRun
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

  async findCurrent(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    transaction = null
  ) {
    let query =
      RecoveryDecision
        .findOne({
          organizationId,

          environmentId,

          incidentId,

          isCurrent:
            true,
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

  async findByIdentifier(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    identifier,
    transaction = null
  ) {
    const clauses =
      identifierClauses(
        identifier,
        "decisionId"
      );

    if (
      clauses.length ===
      0
    ) {
      return null;
    }

    let query =
      RecoveryDecision
        .findOne({
          organizationId,

          environmentId,

          incidentId,

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

  async findHistory(
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
      RecoveryDecision
        .find({
          organizationId,

          environmentId,

          incidentId,
        })
        .sort({
          revision:
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

  async findRunByIdentifier(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    identifier,
    transaction = null
  ) {
    const clauses =
      identifierClauses(
        identifier,
        "runId"
      );

    if (
      clauses.length ===
      0
    ) {
      return null;
    }

    let query =
      RecoveryDecisionRun
        .findOne({
          organizationId,

          environmentId,

          incidentId,

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

  async saveDecision(
    decision,
    transaction = null
  ) {
    if (
      !decision ||
      typeof decision.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoRecoveryDecisionRepository.saveDecision() requires a Mongoose RecoveryDecision document"
        ),
        {
          code:
            "INVALID_RECOVERY_DECISION_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return decision.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }

  async createDecision(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return RecoveryDecision
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await RecoveryDecision
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

  async saveRun(
    run,
    transaction = null
  ) {
    if (
      !run ||
      typeof run.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoRecoveryDecisionRepository.saveRun() requires a Mongoose RecoveryDecisionRun document"
        ),
        {
          code:
            "INVALID_RECOVERY_DECISION_RUN_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return run.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }
}

module.exports =
  MongoRecoveryDecisionRepository;