"use strict";

const IncidentDiagnosisRepository =
  require(
    "../repositories/IncidentDiagnosisRepository"
  );

const IncidentDiagnosis =
  require(
    "../../models/IncidentDiagnosis"
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

class MongoIncidentDiagnosisRepository
  extends IncidentDiagnosisRepository {
  async findCurrent(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    transaction = null
  ) {
    let query =
      IncidentDiagnosis
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
    const normalized =
      String(
        identifier ||
        ""
      ).trim();

    if (!normalized) {
      return null;
    }

    /*
     * diagnosisId is a public/provider-neutral identifier.
     *
     * Mongo _id is included only when the incoming identifier
     * actually has ObjectId shape.
     */
    const clauses = [
      {
        diagnosisId:
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
      IncidentDiagnosis
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
      IncidentDiagnosis
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

  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return IncidentDiagnosis
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await IncidentDiagnosis
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

  async save(
    diagnosis,
    transaction = null
  ) {
    if (
      !diagnosis ||
      typeof diagnosis.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoIncidentDiagnosisRepository.save() requires a Mongoose document"
        ),
        {
          code:
            "INVALID_INCIDENT_DIAGNOSIS_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return diagnosis.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }
}

module.exports =
  MongoIncidentDiagnosisRepository;