"use strict";

const AgentIntelligenceRunRepository =
  require(
    "../repositories/AgentIntelligenceRunRepository"
  );

const AgentIntelligenceRun =
  require(
    "../../models/AgentIntelligenceRun"
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

class MongoAgentIntelligenceRunRepository
  extends AgentIntelligenceRunRepository {
  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return AgentIntelligenceRun
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await AgentIntelligenceRun
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
          "MongoAgentIntelligenceRunRepository.save() requires a Mongoose document"
        ),
        {
          code:
            "INVALID_AGENT_INTELLIGENCE_RUN_DOCUMENT",
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

  async findLatestForIncident({
    organizationId,
    environmentId,
    incidentId,
  }) {
    return AgentIntelligenceRun
      .findOne({
        organizationId,

        environmentId,

        incidentId,
      })
      .sort({
        createdAt:
          -1,
      })
      .select({
        createdAt:
          1,

        status:
          1,

        completedAt:
          1,
      })
      .lean();
  }
}

module.exports =
  MongoAgentIntelligenceRunRepository;