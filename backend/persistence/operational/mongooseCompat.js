"use strict";

/**
 * Phase 13 — Mongoose Compatibility Boundary
 *
 * Purpose:
 *
 * Several older AIRA services define private Mongoose schemas/models inside
 * the service file itself. Rewriting every service's business logic is
 * unnecessary during Mongo retirement.
 *
 * This compatibility boundary exposes the small Mongoose-shaped API those
 * services rely on while persistence is owned by PostgreSQL
 * operational.documents.
 *
 * IMPORTANT:
 *
 * - no mongoose import
 * - no Mongo connection
 * - no infrastructure execution authority
 * - organization/environment scope still required by PostgreSQL repository
 */

const crypto =
  require(
    "node:crypto"
  );

const PostgresOperationalDocumentRepository =
  require(
    "../postgres/PostgresOperationalDocumentRepository"
  );


const repository =
  new PostgresOperationalDocumentRepository();


const modelRegistry =
  Object.create(
    null
  );


class CompatObjectId {
  constructor(
    value = null
  ) {
    const normalized =
      value ===
        null ||
      value ===
        undefined
        ? null
        : String(
            value
          );

    if (
      normalized &&
      CompatObjectId.isValid(
        normalized
      )
    ) {
      this.value =
        normalized;
    } else {
      this.value =
        crypto
          .randomBytes(
            12
          )
          .toString(
            "hex"
          );
    }
  }


  toString() {
    return this.value;
  }


  valueOf() {
    return this.value;
  }


  toJSON() {
    return this.value;
  }


  static isValid(
    value
  ) {
    return /^[0-9a-f]{24}$/i
      .test(
        String(
          value ||
          ""
        )
      );
  }
}


class CompatSchema {
  constructor(
    definition = {},
    options = {}
  ) {
    this.definition =
      definition;

    this.options =
      options;

    this.indexes =
      [];

    this.methods =
      {};

    this.statics =
      {};

    this.virtuals =
      {};
  }


  index(
    definition,
    options = {}
  ) {
    this.indexes.push({
      definition,
      options,
    });

    return this;
  }


  pre(
    _event,
    _handler
  ) {
    /*
     * Transitional compatibility.
     *
     * Inline service schemas primarily use hooks for timestamps or small
     * normalization. operational.documents owns updated_at itself.
     */
    return this;
  }


  post(
    _event,
    _handler
  ) {
    return this;
  }


  virtual(
    name
  ) {
    const descriptor = {
      get:
        (
          handler
        ) => {
          this.virtuals[
            name
          ] = {
            ...(
              this.virtuals[
                name
              ] ||
              {}
            ),

            get:
              handler,
          };

          return descriptor;
        },

      set:
        (
          handler
        ) => {
          this.virtuals[
            name
          ] = {
            ...(
              this.virtuals[
                name
              ] ||
              {}
            ),

            set:
              handler,
          };

          return descriptor;
        },
    };

    return descriptor;
  }
}


CompatSchema.Types = {
  ObjectId:
    CompatObjectId,

  Mixed:
    class Mixed {},
};


class CompatQuery {
  constructor(
    executor
  ) {
    this.executor =
      executor;

    this.options = {};

    this.populateValues =
      [];

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


  skip(
    value
  ) {
    this.options.skip =
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
    value
  ) {
    this.populateValues.push(
      value
    );

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
    return this.executor({
      ...this.options,

      lean:
        this.asLean,
    });
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


function normalizeDomain(
  modelName,
  collectionName
) {
  const source =
    String(
      collectionName ||
      modelName ||
      "operationalDocument"
    )
      .trim();

  return source
    .replace(
      /[^a-zA-Z0-9]+(.)/g,
      (
        _match,
        letter
      ) =>
        letter
          ? letter.toUpperCase()
          : ""
    )
    .replace(
      /^[A-Z]/,
      (
        value
      ) =>
        value.toLowerCase()
    );
}


function plainDocument(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }

  const output = {};

  for (
    const [
      key,
      nested
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      typeof nested ===
      "function"
    ) {
      continue;
    }

    output[
      key
    ] =
      nested;
  }

  return output;
}


function createModelClass(
  modelName,
  schema,
  collectionName
) {
  const domain =
    normalizeDomain(
      modelName,
      collectionName
    );


  class CompatModel {
    constructor(
      data = {}
    ) {
      Object.assign(
        this,
        data
      );
    }


    async save() {
      let result;

      if (
        this._id
      ) {
        result =
          await repository
            .replace(
              domain,
              {
                organizationId:
                  this.organizationId,

                environmentId:
                  this.environmentId,

                _id:
                  this._id,
              },
              plainDocument(
                this
              )
            );
      } else {
        result =
          await repository
            .create(
              domain,
              plainDocument(
                this
              )
            );
      }

      if (
        result
      ) {
        Object.assign(
          this,
          result
        );
      }

      return this;
    }


    toObject() {
      return plainDocument(
        this
      );
    }


    toJSON() {
      return plainDocument(
        this
      );
    }


    static find(
      filter = {}
    ) {
      return new CompatQuery(
        async (
          options
        ) => {
          let values =
            await repository
              .findMany(
                domain,
                filter,
                options
              );

          if (
            Number(
              options.skip
            ) >
            0
          ) {
            values =
              values.slice(
                Number(
                  options.skip
                )
              );
          }

          return options.lean
            ? values
            : values.map(
                (
                  value
                ) =>
                  new CompatModel(
                    value
                  )
              );
        }
      );
    }


    static findOne(
      filter = {}
    ) {
      return new CompatQuery(
        async (
          options
        ) => {
          const value =
            await repository
              .findOne(
                domain,
                filter,
                options
              );

          if (
            !value
          ) {
            return null;
          }

          return options.lean
            ? value
            : new CompatModel(
                value
              );
        }
      );
    }


    static findById(
      identifier
    ) {
      return this.findOne({
        _id:
          identifier,
      });
    }


    static async create(
      data
    ) {
      if (
        Array.isArray(
          data
        )
      ) {
        const result = [];

        for (
          const item
          of data
        ) {
          result.push(
            new CompatModel(
              await repository
                .create(
                  domain,
                  item
                )
            )
          );
        }

        return result;
      }

      return new CompatModel(
        await repository
          .create(
            domain,
            data
          )
      );
    }


    static async insertMany(
      documents = []
    ) {
      const result = [];

      for (
        const document
        of documents
      ) {
        result.push(
          await this.create(
            document
          )
        );
      }

      return result;
    }


    static findOneAndUpdate(
      filter,
      update,
      options = {}
    ) {
      return new CompatQuery(
        async (
          queryOptions
        ) => {
          const value =
            await repository
              .updateOne(
                domain,
                filter,
                update,
                {
                  ...options,
                  ...queryOptions,
                }
              );

          if (
            !value
          ) {
            return null;
          }

          return queryOptions.lean
            ? value
            : new CompatModel(
                value
              );
        }
      );
    }


    static findByIdAndUpdate(
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


    static async updateOne(
      filter,
      update,
      options = {}
    ) {
      const before =
        await repository
          .findOne(
            domain,
            filter
          );

      const value =
        await repository
          .updateOne(
            domain,
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
          value
            ? 1
            : 0,

        upsertedId:
          !before &&
          value
            ? value._id
            : null,
      };
    }


    static async updateMany(
      filter,
      update,
      options = {}
    ) {
      return repository
        .updateMany(
          domain,
          filter,
          update,
          options
        );
    }


    static async deleteOne(
      filter
    ) {
      return repository
        .deleteOne(
          domain,
          filter
        );
    }


    static async deleteMany(
      filter
    ) {
      return repository
        .deleteMany(
          domain,
          filter
        );
    }


    static async countDocuments(
      filter = {}
    ) {
      return repository
        .countDocuments(
          domain,
          filter
        );
    }


    static async exists(
      filter = {}
    ) {
      const value =
        await repository
          .findOne(
            domain,
            filter,
            {
              select:
                "_id",
            }
          );

      return value
        ? {
            _id:
              value._id,
          }
        : null;
    }


    static findOneAndDelete(
      filter
    ) {
      return new CompatQuery(
        async () => {
          const value =
            await repository
              .findOne(
                domain,
                filter
              );

          if (
            !value
          ) {
            return null;
          }

          await repository
            .deleteOne(
              domain,
              {
                organizationId:
                  value.organizationId,

                environmentId:
                  value.environmentId,

                _id:
                  value._id,
              }
            );

          return new CompatModel(
            value
          );
        }
      );
    }


    static findByIdAndDelete(
      id
    ) {
      return this.findOneAndDelete({
        _id:
          id,
      });
    }


    static async aggregate(
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
        throw Object.assign(
          new Error(
            `${modelName} aggregate requires organizationId and environmentId`
          ),
          {
            code:
              "OPERATIONAL_AGGREGATE_SCOPE_REQUIRED",
          }
        );
      }

      let rows =
        await repository
          .findMany(
            domain,
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
  }


  /*
   * Preserve simple schema instance methods/statics.
   */
  Object.assign(
    CompatModel.prototype,
    schema?.methods ||
    {}
  );

  Object.assign(
    CompatModel,
    schema?.statics ||
    {}
  );

  CompatModel.modelName =
    modelName;

  CompatModel.collectionName =
    collectionName ||
    null;

  CompatModel.domain =
    domain;

  return CompatModel;
}


function model(
  name,
  schema = null,
  collectionName = null
) {
  if (
    modelRegistry[
      name
    ]
  ) {
    return modelRegistry[
      name
    ];
  }

  if (
    !schema
  ) {
    throw Object.assign(
      new Error(
        `Operational model is not registered: ${name}`
      ),
      {
        code:
          "OPERATIONAL_MODEL_NOT_REGISTERED",
      }
    );
  }

  const created =
    createModelClass(
      name,
      schema,
      collectionName
    );

  modelRegistry[
    name
  ] =
    created;

  return created;
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
        value,
        key
      ) =>
        value ==
        null
          ? undefined
          : value[
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
          path,
          direction
        ]
        of entries
      ) {
        const left =
          getPath(
            first,
            path
          );

        const right =
          getPath(
            second,
            path
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
  if (
    typeof group._id !==
      "string" ||
    !group._id.startsWith(
      "$"
    )
  ) {
    return rows;
  }

  const keyPath =
    group._id.slice(
      1
    );

  const groups =
    new Map();

  for (
    const row
    of rows
  ) {
    const key =
      getPath(
        row,
        keyPath
      );

    const mapKey =
      JSON.stringify(
        key
      );

    let current =
      groups.get(
        mapKey
      );

    if (
      !current
    ) {
      current = {
        _id:
          key,
      };

      groups.set(
        mapKey,
        current
      );
    }

    for (
      const [
        field,
        expression
      ]
      of Object.entries(
        group
      )
    ) {
      if (
        field ===
        "_id"
      ) {
        continue;
      }

      if (
        expression
          ?.$sum ===
        1
      ) {
        current[
          field
        ] =
          Number(
            current[
              field
            ] ||
            0
          ) +
          1;
      }
    }
  }

  return [
    ...groups.values(),
  ];
}


const compat = {
  Schema:
    CompatSchema,

  model,

  models:
    modelRegistry,

  Types: {
    ObjectId:
      CompatObjectId,
  },

  /*
   * Explicitly unavailable.
   *
   * Files relying on Mongo connection administration must be migrated
   * separately instead of silently pretending a connection exists.
   */
  connection:
    null,
};


module.exports =
  compat;