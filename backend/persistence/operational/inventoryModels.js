"use strict";

const MongoInventoryDocumentRepository =
  require(
    "../mongo/MongoInventoryDocumentRepository"
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
    : new MongoInventoryDocumentRepository();


class InventoryQuery {
  constructor(
    model,
    mode,
    filter
  ) {
    this.model =
      model;

    this.mode =
      mode;

    this.filter =
      filter ||
      {};

    this.options =
      {};

    this.returnLean =
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
    this.returnLean =
      true;

    return this.exec();
  }

  async exec() {
    if (
      this.mode ===
      "one"
    ) {
      const value =
        await repository
          .findOne(
            this.model.domain,
            this.filter,
            this.options
          );

      return this.returnLean
        ? value
        : this.model
            .hydrate(
              value
            );
    }

    const values =
      await repository
        .findMany(
          this.model.domain,
          this.filter,
          this.options
        );

    return this.returnLean
      ? values
      : values.map(
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


class InventoryModel {
  constructor(
    domain
  ) {
    this.domain =
      domain;
  }

  find(
    filter = {}
  ) {
    return new InventoryQuery(
      this,
      "many",
      filter
    );
  }

  findOne(
    filter = {}
  ) {
    return new InventoryQuery(
      this,
      "one",
      filter
    );
  }

  async exists(
    filter = {}
  ) {
    const document =
      await repository
        .findOne(
          this.domain,
          filter,
          {
            select:
              "_id",
          }
        );

    return document
      ? {
          _id:
            document._id,
        }
      : null;
  }

  async create(
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
          this.hydrate(
            await repository
              .create(
                this.domain,
                item
              )
          )
        );
      }

      return result;
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

  async updateOne(
    filter,
    update,
    options = {}
  ) {
    const existing =
      await repository
        .findOne(
          this.domain,
          filter
        );

    const saved =
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
        existing
          ? 1
          : 0,

      modifiedCount:
        saved
          ? 1
          : 0,

      upsertedId:
        !existing &&
        saved
          ? saved._id
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
    const matchStage =
      pipeline.find(
        (
          stage
        ) =>
          stage.$match
      );

    if (
      !matchStage
        ?.$match
        ?.organizationId ||
      !matchStage
        ?.$match
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Inventory aggregate requires organization and environment scope"
        ),
        {
          code:
            "INVENTORY_AGGREGATE_SCOPE_REQUIRED",
        }
      );
    }

    let rows =
      await repository
        .findMany(
          this.domain,
          matchStage.$match
        );

    for (
      const stage
      of pipeline
    ) {
      if (
        stage.$match
      ) {
        rows =
          rows.filter(
            (
              row
            ) =>
              matchesFilter(
                row,
                stage.$match
              )
          );

        continue;
      }

      if (
        stage.$group
      ) {
        rows =
          groupRows(
            rows,
            stage.$group
          );

        continue;
      }

      if (
        stage.$sort
      ) {
        rows =
          sortRows(
            rows,
            stage.$sort
          );

        continue;
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
    }

    return rows;
  }

  hydrate(
    value
  ) {
    if (!value) {
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
            const saved =
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

            if (saved) {
              Object.assign(
                document,
                saved
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
          function toObject() {
            return {
              ...document,
            };
          },
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


function valuesEqual(
  first,
  second
) {
  if (
    Array.isArray(
      first
    )
  ) {
    return first.some(
      (
        value
      ) =>
        valuesEqual(
          value,
          second
        )
    );
  }

  return (
    String(
      first
    ) ===
    String(
      second
    )
  );
}


function matchesCondition(
  actual,
  expected
) {
  if (
    !expected ||
    typeof expected !==
      "object" ||
    Array.isArray(
      expected
    )
  ) {
    return valuesEqual(
      actual,
      expected
    );
  }

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        expected,
        "$ne"
      ) &&
    valuesEqual(
      actual,
      expected.$ne
    )
  ) {
    return false;
  }

  if (
    Array.isArray(
      expected.$in
    ) &&
    !expected.$in.some(
      (
        candidate
      ) =>
        valuesEqual(
          actual,
          candidate
        )
    )
  ) {
    return false;
  }

  if (
    Array.isArray(
      expected.$nin
    ) &&
    expected.$nin.some(
      (
        candidate
      ) =>
        valuesEqual(
          actual,
          candidate
        )
    )
  ) {
    return false;
  }

  if (
    expected.$exists !==
      undefined &&
    Boolean(
      actual !==
      undefined
    ) !==
      Boolean(
        expected.$exists
      )
  ) {
    return false;
  }

  if (
    expected.$gte !==
      undefined &&
    !(
      comparable(
        actual
      ) >=
      comparable(
        expected.$gte
      )
    )
  ) {
    return false;
  }

  if (
    expected.$lte !==
      undefined &&
    !(
      comparable(
        actual
      ) <=
      comparable(
        expected.$lte
      )
    )
  ) {
    return false;
  }

  return true;
}


function matchesFilter(
  document,
  filter = {}
) {
  if (
    Array.isArray(
      filter.$or
    ) &&
    !filter.$or.some(
      (
        condition
      ) =>
        matchesFilter(
          document,
          condition
        )
    )
  ) {
    return false;
  }

  if (
    Array.isArray(
      filter.$and
    ) &&
    !filter.$and.every(
      (
        condition
      ) =>
        matchesFilter(
          document,
          condition
        )
    )
  ) {
    return false;
  }

  for (
    const [
      key,
      expected,
    ]
    of Object.entries(
      filter
    )
  ) {
    if (
      key ===
        "$or" ||
      key ===
        "$and"
    ) {
      continue;
    }

    if (
      !matchesCondition(
        getPath(
          document,
          key
        ),
        expected
      )
    ) {
      return false;
    }
  }

  return true;
}


function comparable(
  value
) {
  if (
    value instanceof
      Date
  ) {
    return value.getTime();
  }

  if (
    typeof value ===
      "string"
  ) {
    const time =
      Date.parse(
        value
      );

    if (
      !Number.isNaN(
        time
      )
    ) {
      return time;
    }
  }

  return value;
}


function groupRows(
  rows,
  group
) {
  const idExpression =
    group._id;

  if (
    typeof idExpression !==
      "string" ||
    !idExpression.startsWith(
      "$"
    )
  ) {
    throw Object.assign(
      new Error(
        "Unsupported inventory aggregate group"
      ),
      {
        code:
          "INVENTORY_AGGREGATE_GROUP_UNSUPPORTED",
      }
    );
  }

  const field =
    idExpression.slice(
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
        field
      );

    const mapKey =
      JSON.stringify(
        key
      );

    let current =
      groups.get(
        mapKey
      );

    if (!current) {
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
        outputField,
        expression,
      ]
      of Object.entries(
        group
      )
    ) {
      if (
        outputField ===
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
          outputField
        ] =
          Number(
            current[
              outputField
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


const InfrastructureResource =
  new InventoryModel(
    "infrastructureResource"
  );

const ServiceDependency =
  new InventoryModel(
    "serviceDependency"
  );

const ResourceRelationship =
  new InventoryModel(
    "resourceRelationship"
  );


module.exports = {
  repository,

  InfrastructureResource,

  ServiceDependency,

  ResourceRelationship,
};