"use strict";


const {
  QdrantClient,
} =
  require(
    "@qdrant/js-client-rest"
  );


const {
  assertQdrantConfig,
} =
  require(
    "./qdrantConfig"
  );


class QdrantMemoryClient {

  constructor(
    options = {}
  ) {
    this.config =
      options.config ||
      assertQdrantConfig();


    this.client =
      options.client ||
      new QdrantClient({
        url:
          this.config.url,

        apiKey:
          this.config.apiKey ||
          undefined,

        timeout:
          this.config.timeoutMs,
      });
  }


  async health() {
    const collections =
      await this.client
        .getCollections();


    return {
      healthy:
        true,

      collectionCount:
        Array.isArray(
          collections
            ?.collections
        )
          ? collections
              .collections
              .length
          : 0,
    };
  }


  async collectionExists() {
    try {
      await this.client
        .getCollection(
          this.config
            .collection
        );


      return true;

    } catch (
      error
    ) {
      if (
        error
          ?.status ===
        404
      ) {
        return false;
      }


      throw error;
    }
  }


  async ensurePayloadIndexes() {
    const payloadIndexes = [
      {
        fieldName:
          "organization_id",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "organization_public_id",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "environment_id",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "service_id",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "resource_id",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "incident_id",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "memory_type",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "scope_type",

        fieldSchema:
          "keyword",
      },

      {
        fieldName:
          "status",

        fieldSchema:
          "keyword",
      },
    ];


    for (
      const index
      of payloadIndexes
    ) {
      try {
        await this.client
          .createPayloadIndex(
            this.config
              .collection,
            {
              field_name:
                index.fieldName,

              field_schema:
                index.fieldSchema,
            }
          );

      } catch (
        error
      ) {
        /**
         * Payload indexes may already exist.
         *
         * Qdrant can return a conflict/bad-request
         * depending on version when attempting to
         * recreate an existing index.
         *
         * Existing indexes are safe to retain.
         */
        const message =
          String(
            error
              ?.message ||
            ""
          )
            .toLowerCase();


        const alreadyExists =
          error
            ?.status ===
            409 ||
          message.includes(
            "already exists"
          ) ||
          message.includes(
            "already indexed"
          );


        if (
          !alreadyExists
        ) {
          throw error;
        }
      }
    }
  }


  async ensureCollection({
    dimensions,
  }) {
    const exists =
      await this
        .collectionExists();


    if (
      exists
    ) {
      const collection =
        await this.client
          .getCollection(
            this.config
              .collection
          );


      const existingSize =
        Number(
          collection
            ?.config
            ?.params
            ?.vectors
            ?.size ||
          0
        );


      if (
        existingSize &&
        existingSize !==
          dimensions
      ) {
        const error =
          new Error(
            "Qdrant collection vector dimension mismatch"
          );


        error.code =
          "QDRANT_VECTOR_DIMENSION_MISMATCH";

        error.status =
          500;

        error.expectedDimensions =
          dimensions;

        error.actualDimensions =
          existingSize;


        throw error;
      }


      /**
       * Important:
       *
       * Payload schema may evolve even when the
       * collection itself already exists.
       *
       * Therefore indexes must also be reconciled
       * for existing collections.
       */
      await this
        .ensurePayloadIndexes();


      return {
        created:
          false,

        collection:
          this.config
            .collection,
      };
    }


    await this.client
      .createCollection(
        this.config
          .collection,
        {
          vectors: {
            size:
              dimensions,

            distance:
              this.config
                .vectorDistance,
          },
        }
      );


    await this
      .ensurePayloadIndexes();


    return {
      created:
        true,

      collection:
        this.config
          .collection,
    };
  }


  async upsertMemoryPoint({
    pointId,

    vector,

    payload,
  }) {
    await this.client
      .upsert(
        this.config
          .collection,
        {
          wait:
            true,

          points: [
            {
              id:
                pointId,

              vector,

              payload,
            },
          ],
        }
      );


    return {
      indexed:
        true,

      collection:
        this.config
          .collection,

      pointId,
    };
  }


  async deleteMemoryPoint(
    pointId
  ) {
    await this.client
      .delete(
        this.config
          .collection,
        {
          wait:
            true,

          points: [
            pointId,
          ],
        }
      );


    return {
      deleted:
        true,

      pointId,
    };
  }


  buildTenantFilter({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    incidentId =
      null,

    memoryTypes =
      [],

    scopes =
      [],

    includeGlobal =
      false,
  }) {
    const must =
      [];


    /**
     * ------------------------------------------------------------
     * LIFECYCLE
     * ------------------------------------------------------------
     *
     * This is only a candidate optimization.
     *
     * PostgreSQL hydration validates lifecycle again
     * and remains authoritative.
     */
    must.push({
      key:
        "status",

      match: {
        value:
          "ACTIVE",
      },
    });


    /**
     * ------------------------------------------------------------
     * MEMORY TYPE
     * ------------------------------------------------------------
     */
    if (
      Array.isArray(
        memoryTypes
      ) &&
      memoryTypes.length >
        0
    ) {
      must.push({
        key:
          "memory_type",

        match: {
          any:
            memoryTypes,
        },
      });
    }


    /**
     * ------------------------------------------------------------
     * SCOPE TYPE
     * ------------------------------------------------------------
     */
    if (
      Array.isArray(
        scopes
      ) &&
      scopes.length >
        0
    ) {
      must.push({
        key:
          "scope_type",

        match: {
          any:
            scopes,
        },
      });
    }


    /**
     * ------------------------------------------------------------
     * SERVICE
     * ------------------------------------------------------------
     *
     * AIRA currently stores service_id in Qdrant using
     * the same stable/public identifier used by retrieval.
     *
     * Therefore service filtering is safe here.
     */
    if (
      serviceId
    ) {
      must.push({
        key:
          "service_id",

        match: {
          value:
            String(
              serviceId
            ),
        },
      });
    }


    /**
     * ------------------------------------------------------------
     * DO NOT FILTER THESE IN QDRANT YET
     * ------------------------------------------------------------
     *
     * environment_id
     * resource_id
     * incident_id
     *
     * Qdrant currently stores canonical PostgreSQL UUIDs
     * for these fields.
     *
     * The retrieval API commonly receives public IDs:
     *
     *   env_aira_development
     *   phase16_10_cert_inc_3
     *   etc.
     *
     * Filtering those public IDs against internal UUID
     * payloads causes false zero-candidate searches.
     *
     * PostgreSQL hydration receives these values and
     * remains responsible for precise authorization
     * and scope validation.
     *
     * Keep the parameters in this function signature
     * because they remain part of the retrieval contract.
     */
    void environmentId;
    void resourceId;
    void incidentId;


    /**
     * ------------------------------------------------------------
     * TENANT ISOLATION
     * ------------------------------------------------------------
     *
     * organization_public_id is the external/public tenant
     * identity used by AIRA APIs.
     *
     * organization_id remains the canonical PostgreSQL UUID
     * inside the Qdrant payload.
     */
    if (
      !includeGlobal
    ) {
      must.push({
        key:
          "organization_public_id",

        match: {
          value:
            String(
              organizationId
            ),
        },
      });


      return {
        must,
      };
    }


    /**
     * Tenant + GLOBAL candidate retrieval.
     *
     * PostgreSQL hydration performs the authoritative
     * tenant/global visibility validation.
     */
    return {
      must,

      should: [
        {
          key:
            "organization_public_id",

          match: {
            value:
              String(
                organizationId
              ),
          },
        },

        {
          key:
            "scope_type",

          match: {
            value:
              "GLOBAL",
          },
        },
      ],

      /**
       * At least one SHOULD condition must match.
       *
       * Without this, Qdrant may treat SHOULD clauses
       * as optional when MUST conditions already exist.
       */
      min_should: {
        conditions: [
          {
            key:
              "organization_public_id",

            match: {
              value:
                String(
                  organizationId
                ),
            },
          },

          {
            key:
              "scope_type",

            match: {
              value:
                "GLOBAL",
            },
          },
        ],

        min_count:
          1,
      },
    };
  }


  normalizeQueryPoints(
    result
  ) {
    if (
      Array.isArray(
        result
      )
    ) {
      return result;
    }


    if (
      Array.isArray(
        result
          ?.points
      )
    ) {
      return result
        .points;
    }


    if (
      Array.isArray(
        result
          ?.result
          ?.points
      )
    ) {
      return result
        .result
        .points;
    }


    return [];
  }


  async queryMemoryCandidates({
    vector,

    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    incidentId =
      null,

    memoryTypes =
      [],

    scopes =
      [],

    includeGlobal =
      false,

    limit =
      20,
  }) {
    if (
      !Array.isArray(
        vector
      ) ||
      vector.length ===
        0
    ) {
      const error =
        new Error(
          "Qdrant query vector is required"
        );


      error.code =
        "QDRANT_QUERY_VECTOR_REQUIRED";

      error.status =
        422;


      throw error;
    }


    if (
      !organizationId
    ) {
      const error =
        new Error(
          "Organization is required for Qdrant memory query"
        );


      error.code =
        "QDRANT_QUERY_ORGANIZATION_REQUIRED";

      error.status =
        422;


      throw error;
    }


    const filter =
      this
        .buildTenantFilter({
          organizationId,

          environmentId,

          serviceId,

          resourceId,

          incidentId,

          memoryTypes,

          scopes,

          includeGlobal,
        });


    /**
     * @qdrant/js-client-rest v1.19
     *
     * query() is the supported universal query API.
     */
    const result =
      await this.client
        .query(
          this.config
            .collection,
          {
            query:
              vector,

            filter,

            limit:
              Number(
                limit
              ),

            with_payload:
              true,

            with_vector:
              false,
          }
        );


    return this
      .normalizeQueryPoints(
        result
      )
      .map(
        (
          point
        ) => ({
          pointId:
            String(
              point.id
            ),

          memoryId:
            String(
              point
                ?.payload
                ?.memory_id ||
              point.id
            ),

          score:
            Number(
              point.score ??
              0
            ),

          payload:
            point.payload ||
            {},
        })
      );
  }
}


module.exports = {
  QdrantMemoryClient,
};