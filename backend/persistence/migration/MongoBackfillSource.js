"use strict";

const mongoose =
  require(
    "mongoose"
  );

const MongoBackfillModelRegistry =
  require(
    "./MongoBackfillModelRegistry"
  );

const BackfillDocumentNormalizer =
  require(
    "./BackfillDocumentNormalizer"
  );

class MongoBackfillSource {
  constructor(
    options = {}
  ) {
    this.registry =
      options.registry ||
      new MongoBackfillModelRegistry();

    this.normalizer =
      options.normalizer ||
      new BackfillDocumentNormalizer();
  }

  async getHighWatermark(
    domain,
    scope
  ) {
    const definition =
      this.registry.get(
        domain
      );

    /*
     * Derived domains do not have a physical Mongo source collection
     * that is migrated directly during Phase 13.5B.
     */
    if (
      definition.migrationMode ===
        "derived" ||
      !definition.model
    ) {
      return null;
    }

    const model =
      definition.model;

    const filter =
      this.buildScopeFilter(
        definition,
        scope
      );

    const row =
      await model
        .findOne(
          filter
        )
        .sort({
          _id:
            -1,
        })
        .select({
          _id:
            1,
        })
        .lean();

    return row?._id
      ? String(
          row._id
        )
      : null;
  }

  async count(
    domain,
    scope,
    options = {}
  ) {
    const definition =
      this.registry.get(
        domain
      );

    /*
     * Derived domains have no independent Mongo collection
     * to count during the physical backfill phase.
     */
    if (
      definition.migrationMode ===
        "derived" ||
      !definition.model
    ) {
      return 0;
    }

    const filter =
      this.buildScopeFilter(
        definition,
        scope
      );

    if (
      options.highWatermark
    ) {
      filter._id = {
        $lte:
          this.toObjectId(
            options
              .highWatermark
          ),
      };
    }

    return definition
      .model
      .countDocuments(
        filter
      );
  }

  async readBatch({
    domain,
    scope,
    cursor = null,
    highWatermark = null,
    limit = 250,
  } = {}) {
    const definition =
      this.registry.get(
        domain
      );

    /*
     * Derived domains are intentionally skipped by the physical
     * Mongo -> PostgreSQL backfill.
     *
     * Phase 13.5C will verify derived topology relationships.
     */
    if (
      definition.migrationMode ===
        "derived" ||
      !definition.model
    ) {
      return {
        documents: [],

        cursor,

        exhausted:
          true,

        derived:
          true,
      };
    }

    const safeLimit =
      Math.min(
        Math.max(
          Number(
            limit
          ) ||
            250,
          1
        ),
        5000
      );

    const filter =
      this.buildScopeFilter(
        definition,
        scope
      );

    const idBounds =
      {};

    if (
      cursor
    ) {
      idBounds.$gt =
        this.toObjectId(
          cursor
        );
    }

    if (
      highWatermark
    ) {
      idBounds.$lte =
        this.toObjectId(
          highWatermark
        );
    }

    if (
      Object.keys(
        idBounds
      ).length >
      0
    ) {
      filter._id =
        idBounds;
    }

    const rows =
      await definition
        .model
        .find(
          filter
        )
        .sort({
          _id:
            1,
        })
        .limit(
          safeLimit
        )
        .lean();

    const documents =
      rows.map(
        (
          row
        ) =>
          this.normalizer
            .normalize(
              row
            )
      );

    return {
      documents,

      cursor:
        documents.length >
        0
          ? String(
              documents[
                documents.length -
                1
              ]
                ._id
            )
          : cursor,

      exhausted:
        documents.length <
        safeLimit,

      derived:
        false,
    };
  }

  buildScopeFilter(
    definition,
    scope = {}
  ) {
    /*
     * Derived domains should never require a Mongo ownership filter,
     * because they are not directly read from a Mongo collection.
     */
    if (
      definition.migrationMode ===
        "derived"
    ) {
      return {};
    }

    if (
      definition
        .ownership ===
      "tenant"
    ) {
      if (
        !scope.tenantId
      ) {
        throw Object.assign(
          new Error(
            `Mongo backfill domain ${definition.name} requires tenantId`
          ),
          {
            code:
              "MIGRATION_TENANT_REQUIRED",
          }
        );
      }

      return {
        tenantId:
          this.toObjectIdIfPossible(
            scope.tenantId
          ),
      };
    }

    if (
      !scope.organizationId ||
      !scope.environmentId
    ) {
      throw Object.assign(
        new Error(
          `Mongo backfill domain ${definition.name} requires organizationId and environmentId`
        ),
        {
          code:
            "MIGRATION_SCOPE_REQUIRED",
        }
      );
    }

    return {
      organizationId:
        this.toObjectIdIfPossible(
          scope.organizationId
        ),

      environmentId:
        this.toObjectIdIfPossible(
          scope.environmentId
        ),
    };
  }

  toObjectId(
    value
  ) {
    if (
      value instanceof
      mongoose.Types.ObjectId
    ) {
      return value;
    }

    if (
      !mongoose.Types.ObjectId
        .isValid(
          String(
            value
          )
        )
    ) {
      throw Object.assign(
        new Error(
          `Invalid Mongo ObjectId cursor: ${value}`
        ),
        {
          code:
            "MIGRATION_CURSOR_INVALID",
        }
      );
    }

    return new mongoose
      .Types
      .ObjectId(
        String(
          value
        )
      );
  }

  toObjectIdIfPossible(
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

    if (
      value instanceof
      mongoose.Types.ObjectId
    ) {
      return value;
    }

    const normalized =
      String(
        value
      );

    if (
      mongoose.Types.ObjectId
        .isValid(
          normalized
        )
    ) {
      return new mongoose
        .Types
        .ObjectId(
          normalized
        );
    }

    /*
     * Some newer AIRA models use string ownership identifiers.
     * Never force every ownership value into ObjectId.
     */
    return value;
  }
}

module.exports =
  MongoBackfillSource;