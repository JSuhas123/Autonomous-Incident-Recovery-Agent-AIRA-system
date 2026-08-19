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

    if (
      !session
    ) {
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

    if (
      session
    ) {
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

    return decision
      .save(
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

    if (
      !session
    ) {
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

    return run
      .save(
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