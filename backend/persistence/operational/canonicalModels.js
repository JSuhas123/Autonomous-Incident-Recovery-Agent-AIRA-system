"use strict";

/**
 * Phase 13 Canonical Model Compatibility Boundary
 *
 * Transitional adapter for legacy runtime code that still expects
 * Mongoose-shaped Incident / AgentIntelligenceRun objects.
 *
 * Persistence ownership is canonical:
 *
 *   Incident              -> IncidentRepository
 *   AgentIntelligenceRun  -> AgentIntelligenceRunRepository
 *
 * No direct Mongoose model access exists here.
 */

const {
  incidentRepository,
  agentIntelligenceRunRepository,
} =
  require(
    "../repositories"
  );


class Query {
  constructor(
    executor,
    options = {}
  ) {
    this.executor =
      executor;

    this.options =
      options;

    this.shouldLean =
      false;
  }


  sort(
    value
  ) {
    this.options.sort =
      value;

    return this;
  }


  limit(
    value
  ) {
    this.options.limit =
      Number(
        value
      );

    return this;
  }


  select(
    value
  ) {
    this.options.select =
      value;

    return this;
  }


  session(
    _session
  ) {
    return this;
  }


  lean() {
    this.shouldLean =
      true;

    return this.exec();
  }


  async exec() {
    return this.executor(
      this.options,
      this.shouldLean
    );
  }


  then(
    resolve,
    reject
  ) {
    return this
      .exec()
      .then(
        resolve,
        reject
      );
  }


  catch(
    reject
  ) {
    return this
      .exec()
      .catch(
        reject
      );
  }


  finally(
    handler
  ) {
    return this
      .exec()
      .finally(
        handler
      );
  }
}


// ============================================================================
// INCIDENT
// ============================================================================

class Incident {
  constructor(
    data = {}
  ) {
    Object.assign(
      this,
      data
    );
  }


  async save(
    transaction = null
  ) {
    if (
      this._id
    ) {
      const saved =
        await incidentRepository
          .save(
            this,
            transaction
          );

      if (
        saved
      ) {
        Object.assign(
          this,
          saved
        );
      }

      return this;
    }

    const created =
      await incidentRepository
        .create(
          this,
          transaction
        );

    if (
      created
    ) {
      Object.assign(
        this,
        created
      );
    }

    return this;
  }


  toObject() {
    return {
      ...this,
    };
  }


  static findOne(
    filter = {}
  ) {
    return new Query(
      async () => {
        const result =
          await incidentRepository
            .findOne(
              filter
            );

        return result
          ? new Incident(
              result
            )
          : null;
      }
    );
  }


  static find(
    filter = {}
  ) {
    return new Query(
      async (
        options
      ) => {
        const result =
          await incidentRepository
            .findMany(
              filter,
              options
            );

        return Array.isArray(
          result
        )
          ? result.map(
              (
                item
              ) =>
                new Incident(
                  item
                )
            )
          : [];
      }
    );
  }


  static async create(
    data
  ) {
    const result =
      await incidentRepository
        .create(
          data
        );

    return result
      ? new Incident(
          result
        )
      : null;
  }


  static findById(
    id
  ) {
    return this.findOne({
      _id:
        id,
    });
  }
}


// ============================================================================
// AGENT INTELLIGENCE RUN
// ============================================================================

class AgentIntelligenceRun {
  constructor(
    data = {}
  ) {
    Object.assign(
      this,
      data
    );
  }


  async save(
    transaction = null
  ) {
    if (
      this._id
    ) {
      const saved =
        await agentIntelligenceRunRepository
          .save(
            this,
            transaction
          );

      if (
        saved
      ) {
        Object.assign(
          this,
          saved
        );
      }

      return this;
    }

    const created =
      await agentIntelligenceRunRepository
        .create(
          this,
          transaction
        );

    if (
      created
    ) {
      Object.assign(
        this,
        created
      );
    }

    return this;
  }


  toObject() {
    return {
      ...this,
    };
  }


  static async create(
    data
  ) {
    const result =
      await agentIntelligenceRunRepository
        .create(
          data
        );

    return result
      ? new AgentIntelligenceRun(
          result
        )
      : null;
  }


  static findOne(
    filter = {}
  ) {
    return new Query(
      async () => {
        if (
          !filter.organizationId ||
          !filter.environmentId ||
          !filter.incidentId
        ) {
          return null;
        }

        const result =
          await agentIntelligenceRunRepository
            .findLatestForIncident({
              organizationId:
                filter.organizationId,

              environmentId:
                filter.environmentId,

              incidentId:
                filter.incidentId,
            });

        return result
          ? new AgentIntelligenceRun(
              result
            )
          : null;
      }
    );
  }
}


module.exports = {
  Incident,
  AgentIntelligenceRun,
};