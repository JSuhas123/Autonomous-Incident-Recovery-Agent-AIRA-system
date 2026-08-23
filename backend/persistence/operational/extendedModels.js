"use strict";

const MongoExtendedOperationalRepository =
  require(
    "../mongo/MongoExtendedOperationalRepository"
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
    : new MongoExtendedOperationalRepository();


class ExtendedQuery {
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
      const value =
        await repository
          .findOne(
            this.model.domain,
            this.filter,
            this.options
          );

      return this.asLean
        ? value
        : this.model.hydrate(
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

    return this.asLean
      ? values
      : values.map(
          (
            value
          ) =>
            this.model.hydrate(
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


class ExtendedModel {
  constructor(
    domain
  ) {
    this.domain =
      domain;
  }


  find(
    filter = {}
  ) {
    return new ExtendedQuery(
      this,
      "many",
      filter
    );
  }


  findOne(
    filter = {}
  ) {
    return new ExtendedQuery(
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
        result
          ? 1
          : 0,

      modifiedCount:
        result
          ? 1
          : 0,
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
                      document
                        .organizationId,

                    environmentId:
                      document
                        .environmentId,

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


const FailedMessage =
  new ExtendedModel(
    "failedMessage"
  );

const RetentionArchive =
  new ExtendedModel(
    "retentionArchive"
  );

const DecisionTrace =
  new ExtendedModel(
    "decisionTrace"
  );

const AuditEvent =
  new ExtendedModel(
    "auditEvent"
  );


module.exports = {
  repository,

  FailedMessage,

  RetentionArchive,

  DecisionTrace,

  AuditEvent,
};