"use strict";

/**
 * Phase 13 Identity Compatibility Models
 *
 * Provides a Mongoose-shaped compatibility API for older runtime/test
 * consumers while all persistence is delegated through provider-neutral
 * identity repositories.
 *
 * No direct Mongo model imports exist here.
 */

const {
  tenantConfigRepository,
} =
  require(
    "../repositories"
  );


// ============================================================================
// QUERY COMPATIBILITY
// ============================================================================

class IdentityQuery {
  constructor(
    executor
  ) {
    this.executor =
      executor;

    this.options = {};

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
    /*
     * Mongo session compatibility only.
     *
     * PostgreSQL transaction ownership lives in repositories /
     * persistenceTransactionManager.
     */
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
// UPDATE HELPERS
// ============================================================================

function applySetUpdate(
  document,
  update
) {
  if (
    !update ||
    typeof update !==
      "object"
  ) {
    return;
  }


  if (
    update.$set &&
    typeof update.$set ===
      "object"
  ) {
    Object.assign(
      document,
      update.$set
    );
  }


  if (
    update.$unset &&
    typeof update.$unset ===
      "object"
  ) {
    for (
      const key
      of Object.keys(
        update.$unset
      )
    ) {
      delete document[
        key
      ];
    }
  }


  if (
    update.$inc &&
    typeof update.$inc ===
      "object"
  ) {
    for (
      const [
        key,
        amount,
      ]
      of Object.entries(
        update.$inc
      )
    ) {
      document[
        key
      ] =
        Number(
          document[
            key
          ] ||
          0
        ) +
        Number(
          amount ||
          0
        );
    }
  }


  /*
   * Plain-object update compatibility.
   */
  const operatorKeys =
    Object.keys(
      update
    )
      .filter(
        (
          key
        ) =>
          key.startsWith(
            "$"
          )
      );


  if (
    operatorKeys.length ===
    0
  ) {
    Object.assign(
      document,
      update
    );
  }
}


// ============================================================================
// TENANT CONFIG DOCUMENT
// ============================================================================

class TenantConfig {
  constructor(
    data = {}
  ) {
    Object.assign(
      this,
      data
    );


    this.__isNew =
      !data._id;
  }


  // ==========================================================================
  // DOCUMENT METHODS
  // ==========================================================================

  async save(
    transaction = null
  ) {
    let result;


    if (
      this.__isNew ||
      !this._id
    ) {
      result =
        await tenantConfigRepository
          .create(
            this.toObject(),
            transaction
          );

      this.__isNew =
        false;
    } else {
      /*
       * Repository save is the preferred path because identity repositories
       * understand field mapping between Mongo-era document names and
       * PostgreSQL identity tables.
       */
      result =
        await tenantConfigRepository
          .save(
            this,
            transaction
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
    const output = {};


    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        this
      )
    ) {
      if (
        key ===
        "__isNew"
      ) {
        continue;
      }

      output[
        key
      ] =
        value;
    }


    return output;
  }


  toJSON() {
    return this.toObject();
  }


  // ==========================================================================
  // STATIC READ API
  // ==========================================================================

  static find(
    filter = {}
  ) {
    return new IdentityQuery(
      async (
        options,
        lean
      ) => {
        const rows =
          await tenantConfigRepository
            .findMany(
              filter,
              options
            );


        if (
          !Array.isArray(
            rows
          )
        ) {
          return [];
        }


        return lean
          ? rows
          : rows.map(
              (
                row
              ) =>
                new TenantConfig({
                  ...row,

                  _id:
                    row._id,
                })
            );
      }
    );
  }


  static findOne(
    filter = {}
  ) {
    return new IdentityQuery(
      async (
        options,
        lean
      ) => {
        const row =
          await tenantConfigRepository
            .findOne(
              filter,
              options
            );


        if (
          !row
        ) {
          return null;
        }


        if (
          lean
        ) {
          return row;
        }


        return new TenantConfig({
          ...row,

          _id:
            row._id,
        });
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


  // ==========================================================================
  // STATIC CREATE API
  // ==========================================================================

  static async create(
    data,
    transaction = null
  ) {
    if (
      Array.isArray(
        data
      )
    ) {
      const output = [];


      for (
        const entry
        of data
      ) {
        const created =
          await tenantConfigRepository
            .create(
              entry,
              transaction
            );


        output.push(
          new TenantConfig({
            ...created,

            _id:
              created?._id,

            __isNew:
              false,
          })
        );
      }


      return output;
    }


    const created =
      await tenantConfigRepository
        .create(
          data,
          transaction
        );


    if (
      !created
    ) {
      return null;
    }


    const document =
      new TenantConfig(
        created
      );


    document.__isNew =
      false;


    return document;
  }


  // ==========================================================================
  // STATIC UPDATE API
  // ==========================================================================

  static async updateOne(
    filter,
    update,
    options = {},
    transaction = null
  ) {
    return tenantConfigRepository
      .updateOne(
        filter,
        update,
        options,
        transaction
      );
  }


  static findOneAndUpdate(
    filter,
    update,
    options = {},
    transaction = null
  ) {
    return new IdentityQuery(
      async (
        queryOptions,
        lean
      ) => {
        const before =
          await tenantConfigRepository
            .findOne(
              filter,
              queryOptions,
              transaction
            );


        if (
          !before &&
          !options.upsert
        ) {
          return null;
        }


        await tenantConfigRepository
          .updateOne(
            filter,
            update,
            {
              ...options,
              ...queryOptions,
            },
            transaction
          );


        const row =
          await tenantConfigRepository
            .findOne(
              filter,
              queryOptions,
              transaction
            );


        if (
          !row
        ) {
          /*
           * Compatibility fallback for repositories whose updateOne()
           * returns the resulting entity but where a second lookup cannot
           * resolve an upserted document by the original filter.
           */
          if (
            before
          ) {
            const fallback = {
              ...before,
            };


            applySetUpdate(
              fallback,
              update
            );


            return lean
              ? fallback
              : new TenantConfig(
                  fallback
                );
          }


          return null;
        }


        return lean
          ? row
          : new TenantConfig(
              row
            );
      }
    );
  }


  static findByIdAndUpdate(
    identifier,
    update,
    options = {}
  ) {
    return this.findOneAndUpdate(
      {
        _id:
          identifier,
      },
      update,
      options
    );
  }


  // ==========================================================================
  // COUNT
  // ==========================================================================

  static async countDocuments(
    filter = {}
  ) {
    /*
     * Identity repository interface may not expose countDocuments directly.
     * findMany keeps this compatibility boundary provider-neutral.
     */
    const rows =
      await tenantConfigRepository
        .findMany(
          filter
        );


    return Array.isArray(
      rows
    )
      ? rows.length
      : 0;
  }


  // ==========================================================================
  // EXISTENCE
  // ==========================================================================

  static async exists(
    filter = {}
  ) {
    const row =
      await tenantConfigRepository
        .findOne(
          filter
        );


    if (
      !row
    ) {
      return null;
    }


    return {
      _id:
        row._id,
    };
  }
}


module.exports = {
  TenantConfig,
};