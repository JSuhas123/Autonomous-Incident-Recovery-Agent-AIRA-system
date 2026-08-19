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