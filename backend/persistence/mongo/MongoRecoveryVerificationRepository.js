"use strict";

const RecoveryVerificationRepository =
  require(
    "../repositories/RecoveryVerificationRepository"
  );

const RecoveryVerification =
  require(
    "../../models/RecoveryVerification"
  );

const RecoveryVerificationRun =
  require(
    "../../models/RecoveryVerificationRun"
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


class MongoRecoveryVerificationRepository
  extends RecoveryVerificationRepository {
  async findCurrent(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    transaction = null
  ) {
    let query =
      RecoveryVerification
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
    },
    identifier,
    transaction = null
  ) {
    const clauses =
      identifierClauses(
        identifier,
        "verificationId"
      );

    if (
      clauses.length ===
      0
    ) {
      return null;
    }

    let query =
      RecoveryVerification
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
      RecoveryVerification
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


  async findRuns(
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
            100
          )
        )
      );

    let query =
      RecoveryVerificationRun
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


  async createRun(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return RecoveryVerificationRun
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await RecoveryVerificationRun
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
          "MongoRecoveryVerificationRepository.saveRun() requires a Mongoose document"
        ),
        {
          code:
            "INVALID_RECOVERY_VERIFICATION_RUN_DOCUMENT",
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


  async createVerification(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return RecoveryVerification
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await RecoveryVerification
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


  async saveVerification(
    verification,
    transaction = null
  ) {
    if (
      !verification ||
      typeof verification.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoRecoveryVerificationRepository.saveVerification() requires a Mongoose document"
        ),
        {
          code:
            "INVALID_RECOVERY_VERIFICATION_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return verification.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }


  async markRunFailed(
    verificationRunId,
    error,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    const options = {
      new:
        true,
    };

    if (
      session
    ) {
      options.session =
        session;
    }

    return RecoveryVerificationRun
      .findOneAndUpdate(
        {
          verificationRunId,
        },
        {
          $set: {
            state:
              "FAILED",

            completedAt:
              new Date(),

            failure: {
              code:
                error?.code ||
                "VERIFICATION_RUN_FAILED",

              message:
                String(
                  error?.message ||
                  "Verification run failed"
                )
                  .slice(
                    0,
                    2048
                  ),
            },
          },
        },
        options
      );
  }
}


module.exports =
  MongoRecoveryVerificationRepository;