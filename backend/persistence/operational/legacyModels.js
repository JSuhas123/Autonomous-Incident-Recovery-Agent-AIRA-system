"use strict";

const MongoLegacyOperationalRepository =
  require(
    "../mongo/MongoLegacyOperationalRepository"
  );

const PostgresOperationalDocumentRepository =
  require(
    "../postgres/PostgresOperationalDocumentRepository"
  );


const provider =
  String(
    process.env
      .PERSISTENCE_PROVIDER ||
    "mongo"
  )
    .trim()
    .toLowerCase();


const repository =
  provider ===
    "postgres"
    ? new PostgresOperationalDocumentRepository()
    : new MongoLegacyOperationalRepository();


class Query {
  constructor(
    model,
    mode,
    filter = {}
  ) {
    this.model =
      model;

    this.mode =
      mode;

    this.filter =
      filter;

    this.options =
      {};

    this.asLean =
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


  populate(
    _value
  ) {
    /*
     * Transitional compatibility.
     *
     * Operational PostgreSQL documents already contain the identifier
     * relationships needed by these services. Full relational expansion
     * belongs in the later stabilization/refinement pass.
     */
    return this;
  }


  session(
    _session
  ) {
    return this;
  }


  lean() {
    this.asLean =
      true;

    return this.exec();
  }


  async exec() {
    if (
      this.mode ===
      "one"
    ) {
      const result =
        await repository
          .findOne(
            this.model.domain,
            this.filter,
            this.options
          );

      return this.asLean
        ? result
        : this.model
            .hydrate(
              result
            );
    }

    const results =
      await repository
        .findMany(
          this.model.domain,
          this.filter,
          this.options
        );

    return this.asLean
      ? results
      : results.map(
          (
            value
          ) =>
            this.model
              .hydrate(
                value
              )
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
}


class LegacyModel {
  constructor(
    domain
  ) {
    this.domain =
      domain;
  }


  find(
    filter = {}
  ) {
    return new Query(
      this,
      "many",
      filter
    );
  }


  findOne(
    filter = {}
  ) {
    return new Query(
      this,
      "one",
      filter
    );
  }


  findById(
    id
  ) {
    return this.findOne({
      _id:
        id,
    });
  }


  async create(
    data
  ) {
    if (
      Array.isArray(
        data
      )
    ) {
      const output = [];

      for (
        const item
        of data
      ) {
        output.push(
          this.hydrate(
            await repository
              .create(
                this.domain,
                item
              )
          )
        );
      }

      return output;
    }

    return this.hydrate(
      await repository
        .create(
          this.domain,
          data
        )
    );
  }


  async findOneAndUpdate(
    filter,
    update,
    options = {}
  ) {
    return this.hydrate(
      await repository
        .updateOne(
          this.domain,
          filter,
          update,
          options
        )
    );
  }


  async findByIdAndUpdate(
    id,
    update,
    options = {}
  ) {
    return this.findOneAndUpdate(
      {
        _id:
          id,
      },
      update,
      options
    );
  }


  async updateOne(
    filter,
    update,
    options = {}
  ) {
    const before =
      await repository
        .findOne(
          this.domain,
          filter
        );

    const result =
      await repository
        .updateOne(
          this.domain,
          filter,
          update,
          options
        );

    return {
      acknowledged:
        true,

      matchedCount:
        before
          ? 1
          : 0,

      modifiedCount:
        result
          ? 1
          : 0,

      upsertedId:
        !before &&
        result
          ? result._id
          : null,
    };
  }


  async updateMany(
    filter,
    update,
    options = {}
  ) {
    return repository
      .updateMany(
        this.domain,
        filter,
        update,
        options
      );
  }


  async deleteOne(
    filter
  ) {
    return repository
      .deleteOne(
        this.domain,
        filter
      );
  }


  async deleteMany(
    filter
  ) {
    return repository
      .deleteMany(
        this.domain,
        filter
      );
  }


  async countDocuments(
    filter = {}
  ) {
    return repository
      .countDocuments(
        this.domain,
        filter
      );
  }


  async aggregate(
    pipeline = []
  ) {
    const match =
      pipeline.find(
        (
          stage
        ) =>
          stage.$match
      )
        ?.$match ||
      {};

    if (
      !match.organizationId ||
      !match.environmentId
    ) {
      /*
       * Some older runbook/learning aggregate calls are tenant-only.
       * PostgreSQL operational documents require canonical environment
       * ownership, so those calls will be refined during stabilization.
       */
      throw Object.assign(
        new Error(
          `Operational aggregate for ${this.domain} requires organizationId and environmentId`
        ),
        {
          code:
            "LEGACY_OPERATIONAL_AGGREGATE_SCOPE_REQUIRED",
        }
      );
    }

    let rows =
      await repository
        .findMany(
          this.domain,
          match
        );

    for (
      const stage
      of pipeline
    ) {
      if (
        stage.$sort
      ) {
        rows =
          sortRows(
            rows,
            stage.$sort
          );
      }

      if (
        stage.$limit
      ) {
        rows =
          rows.slice(
            0,
            Number(
              stage.$limit
            )
          );
      }

      if (
        stage.$group
      ) {
        rows =
          groupRows(
            rows,
            stage.$group
          );
      }
    }

    return rows;
  }


  hydrate(
    value
  ) {
    if (
      !value
    ) {
      return value;
    }

    const model =
      this;

    const document = {
      ...value,
    };

    Object.defineProperty(
      document,
      "save",
      {
        enumerable:
          false,

        value:
          async function save() {
            const result =
              await repository
                .replace(
                  model.domain,
                  {
                    organizationId:
                      document.organizationId,

                    environmentId:
                      document.environmentId,

                    _id:
                      document._id,
                  },
                  document
                );

            if (
              result
            ) {
              Object.assign(
                document,
                result
              );
            }

            return document;
          },
      }
    );

    Object.defineProperty(
      document,
      "toObject",
      {
        enumerable:
          false,

        value:
          () => ({
            ...document,
          }),
      }
    );

    return document;
  }
}


function getPath(
  object,
  path
) {
  return String(
    path
  )
    .split(
      "."
    )
    .reduce(
      (
        current,
        key
      ) =>
        current ==
        null
          ? undefined
          : current[
              key
            ],
      object
    );
}


function sortRows(
  rows,
  sort
) {
  const entries =
    Object.entries(
      sort
    );

  return [
    ...rows,
  ].sort(
    (
      first,
      second
    ) => {
      for (
        const [
          field,
          direction,
        ]
        of entries
      ) {
        const left =
          getPath(
            first,
            field
          );

        const right =
          getPath(
            second,
            field
          );

        if (
          left ===
          right
        ) {
          continue;
        }

        return (
          (
            left <
            right
              ? -1
              : 1
          ) *
          (
            Number(
              direction
            ) >=
              0
              ? 1
              : -1
          )
        );
      }

      return 0;
    }
  );
}


function groupRows(
  rows,
  group
) {
  const id =
    group._id;

  if (
    typeof id !==
      "string" ||
    !id.startsWith(
      "$"
    )
  ) {
    return rows;
  }

  const path =
    id.slice(
      1
    );

  const map =
    new Map();

  for (
    const row
    of rows
  ) {
    const key =
      getPath(
        row,
        path
      );

    const normalized =
      JSON.stringify(
        key
      );

    let output =
      map.get(
        normalized
      );

    if (
      !output
    ) {
      output = {
        _id:
          key,
      };

      map.set(
        normalized,
        output
      );
    }

    for (
      const [
        name,
        expression,
      ]
      of Object.entries(
        group
      )
    ) {
      if (
        name ===
        "_id"
      ) {
        continue;
      }

      if (
        expression
          ?.$sum ===
        1
      ) {
        output[
          name
        ] =
          Number(
            output[
              name
            ] ||
            0
          ) +
          1;
      }
    }
  }

  return [
    ...map.values(),
  ];
}


const Feedback =
  new LegacyModel(
    "feedback"
  );

const FeedbackOutcome =
  new LegacyModel(
    "feedbackOutcome"
  );

const IncidentMemory =
  new LegacyModel(
    "incidentMemory"
  );

const SimulationResult =
  new LegacyModel(
    "simulationResult"
  );

const RunbookExecution =
  new LegacyModel(
    "runbookExecution"
  );

const Monitor =
  new LegacyModel(
    "monitor"
  );

const MonitorCheck =
  new LegacyModel(
    "monitorCheck"
  );

const WorkflowReplayRecord =
  new LegacyModel(
    "workflowReplayRecord"
  );


module.exports = {
  repository,

  Feedback,

  FeedbackOutcome,

  IncidentMemory,

  SimulationResult,

  RunbookExecution,

  Monitor,

  MonitorCheck,

  WorkflowReplayRecord,
};
