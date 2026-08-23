"use strict";

const IncidentRepository =
  require(
    "../repositories/IncidentRepository"
  );

const {
  Incident,
} =
  require(
    "../../models/Incident"
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

class MongoIncidentRepository
  extends IncidentRepository {
  async findOne(
    filter,
    transaction = null
  ) {
    let query =
      Incident.findOne(
        filter
      );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
      query =
        query.session(
          session
        );
    }

    return query;
  }

  async findMany(
    filter,
    transaction = null
  ) {
    let query =
      Incident.find(
        filter
      );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session &&
      typeof query.session ===
        "function"
    ) {
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
      return Incident.create(
        data
      );
    }

    const [
      created,
    ] =
      await Incident.create(
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
    incident,
    transaction = null
  ) {
    if (
      !incident ||
      typeof incident.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoIncidentRepository.save() requires a Mongoose Incident document"
        ),
        {
          code:
            "INVALID_INCIDENT_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return incident.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }
}

module.exports =
  MongoIncidentRepository;