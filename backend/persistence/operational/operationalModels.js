"use strict";

/**
 * Transitional Phase 13 operational document compatibility layer.
 *
 * Existing route/business logic can retain familiar:
 *
 *   find()
 *   findOne()
 *   create()
 *   save()
 *   findOneAndUpdate()
 *   deleteOne()
 *
 * behavior while persistence ownership moves out of Mongoose models.
 *
 * Mongo and PostgreSQL implementations live behind repository boundaries.
 */

const MongoOperationalDocumentRepository =
  require(
    "../mongo/MongoOperationalDocumentRepository"
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
    : new MongoOperationalDocumentRepository();


const SERVICE_TYPES = [
  "website",
  "api",
  "backend",
  "microservice",
  "kubernetes",
  "docker",
  "cloud",
  "database",
  "other",
];

const SERVICE_ENVS = [
  "production",
  "staging",
  "development",
  "testing",
];

const SERVICE_STATUSES = [
  "active",
  "paused",
  "archived",
];

const VERIFICATION_STATUSES = [
  "unverified",
  "pending",
  "verified",
  "failed",
];

const MONITORING_STATUSES = [
  "not_configured",
  "configuring",
  "active",
  "paused",
  "error",
];

const MONITOR_TYPES = [
  "http",
  "https",
  "ssl",
];

const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
];

const MONITOR_STATUSES = [
  "healthy",
  "degraded",
  "down",
  "unknown",
];

const BLOCKED_HEADER_NAMES =
  new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
  ]);


function sanitizeHeaders(
  raw
) {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return {};
  }

  const output = {};

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      raw
    )
  ) {
    if (
      !BLOCKED_HEADER_NAMES
        .has(
          key.toLowerCase()
        )
    ) {
      output[
        key
      ] =
        String(
          value
        )
          .slice(
            0,
            512
          );
    }
  }

  return output;
}


class OperationalQuery {
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

  lean() {
    this.returnLean =
      true;

    return this.exec();
  }

  session(
    _value
  ) {
    return this;
  }

  async exec() {
    if (
      this.mode ===
      "one"
    ) {
      const value =
        await repository
          .findOne(
            this.model
              .domain,

            this.filter,

            this.options
          );

      return this
        .returnLean
        ? value
        : this.model
            .hydrate(
              value
            );
    }

    const values =
      await repository
        .findMany(
          this.model
            .domain,

          this.filter,

          this.options
        );

    return this
      .returnLean
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


class OperationalModel {
  constructor(
    domain
  ) {
    this.domain =
      domain;
  }

  find(
    filter = {}
  ) {
    return new OperationalQuery(
      this,
      "many",
      filter
    );
  }

  findOne(
    filter = {}
  ) {
    return new OperationalQuery(
      this,
      "one",
      filter
    );
  }

  async create(
    data
  ) {
    if (
      Array.isArray(
        data
      )
    ) {
      const created =
        [];

      for (
        const item
        of data
      ) {
        created.push(
          this.hydrate(
            await repository
              .create(
                this.domain,
                item
              )
          )
        );
      }

      return created;
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

    if (
      !existing &&
      !options.upsert
    ) {
      return {
        acknowledged:
          true,

        matchedCount:
          0,

        modifiedCount:
          0,
      };
    }

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
        saved
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
            const plain = {};

            for (
              const [
                key,
                nested,
              ]
              of Object.entries(
                document
              )
            ) {
              plain[
                key
              ] =
                nested;
            }

            return plain;
          },
      }
    );

    return document;
  }
}


const Service =
  new OperationalModel(
    "service"
  );

const Monitor =
  new OperationalModel(
    "monitor"
  );

const MonitorCheck =
  new OperationalModel(
    "monitorCheck"
  );

const IntegrationConnection =
  new OperationalModel(
    "integrationConnection"
  );

const KubernetesResource =
  new OperationalModel(
    "kubernetesResource"
  );

const KubernetesResourceRelation =
  new OperationalModel(
    "kubernetesResourceRelation"
  );


module.exports = {
  repository,

  Service,

  Monitor,

  MonitorCheck,

  IntegrationConnection,

  KubernetesResource,

  KubernetesResourceRelation,

  SERVICE_TYPES,

  SERVICE_ENVS,

  SERVICE_STATUSES,

  VERIFICATION_STATUSES,

  MONITORING_STATUSES,

  MONITOR_TYPES,

  HTTP_METHODS,

  MONITOR_STATUSES,

  sanitizeHeaders,
};