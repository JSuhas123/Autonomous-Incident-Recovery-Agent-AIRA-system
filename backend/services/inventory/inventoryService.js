"use strict";

const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  InfrastructureResource,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );

class InventoryService {
  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _scope(context) {
    if (
      !context ||
      !context.organizationId ||
      !context.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete inventory context is required"
        ),
        {
          code:
            "INVENTORY_CONTEXT_REQUIRED",
        }
      );
    }

    return {
      organizationId:
        context.organizationId,

      environmentId:
        context.environmentId,
    };
  }

  _writeContext(context) {
    const scope =
      this._scope(
        context
      );

    if (!context.tenantId) {
      throw Object.assign(
        new Error(
          "tenantId is required for inventory writes"
        ),
        {
          code:
            "INVENTORY_TENANT_REQUIRED",
        }
      );
    }

    return {
      ...scope,

      tenantId:
        String(
          context.tenantId
        ),
    };
  }

  // ==========================================================================
  // UPSERT RESOURCE
  // ==========================================================================

  async upsertResource(
    context,
    resource,
    {
      syncId = null,
    } = {}
  ) {
    const ownership =
      this._writeContext(
        context
      );

    const scope = {
      organizationId:
        ownership.organizationId,

      environmentId:
        ownership.environmentId,
    };

    if (
      !resource ||
      !resource.inventoryKey ||
      !resource.provider ||
      !resource.resourceType ||
      !resource.resourceSubtype ||
      !resource.name
    ) {
      throw Object.assign(
        new Error(
          "Incomplete infrastructure resource"
        ),
        {
          code:
            "INVALID_INVENTORY_RESOURCE",
        }
      );
    }

    const now =
      new Date();

    /*
     * We intentionally read the previous state first.
     *
     * This lets AIRA distinguish:
     *
     * new resource
     * active resource
     * recovered resource
     */
    const existing =
      await InfrastructureResource
        .findOne({
          ...scope,

          inventoryKey:
            resource.inventoryKey,
        });

    const wasMissing =
      existing &&
      [
        "missing",
        "stale",
      ].includes(
        existing.lifecycleStatus
      );

    const observationCount =
      existing
        ? (
            existing
              .observationCount ||
            0
          ) + 1
        : 1;

    const setData = {
      tenantId:
        ownership.tenantId,

      provider:
        resource.provider,

      resourceType:
        resource.resourceType,

      resourceSubtype:
        resource.resourceSubtype,

      externalId:
        resource.externalId ||
        null,

      name:
        resource.name,

      region:
        resource.region ||
        null,

      zone:
        resource.zone ||
        null,

      namespace:
        resource.namespace ||
        null,

      cluster:
        resource.cluster ||
        null,

      integrationId:
        resource.integrationId ||
        null,

      discoverySource:
        resource.discoverySource ||
        "connector",

      sourceModel:
        resource.sourceModel ||
        null,

      sourceResourceId:
        resource.sourceResourceId ||
        null,

      lifecycleStatus:
        "active",

      healthStatus:
        resource.healthStatus ||
        "unknown",

      providerStatus:
        resource.providerStatus ||
        null,

      criticality:
        resource.criticality ||
        "medium",

      labels:
        resource.labels ||
        {},

      tags:
        Array.isArray(
          resource.tags
        )
          ? resource.tags
          : [],

      metadata:
        resource.metadata ||
        {},

      spec:
        resource.spec ||
        {},

      status:
        resource.status ||
        {},

      observationCount,

      lastSeenAt:
        now,

      missingSince:
        null,

      archivedAt:
        null,
    };

    /*
     * Only connector reconciliation writes sync IDs.
     *
     * Manual inventory entries can still use the same
     * service without pretending to belong to a sync.
     */
    if (syncId) {
      setData.lastSeenSyncId =
        String(syncId);
    }

    if (wasMissing) {
      setData.recoveredAt =
        now;
    }

    return InfrastructureResource
      .findOneAndUpdate(
        {
          ...scope,

          inventoryKey:
            resource.inventoryKey,
        },
        {
          $set:
            setData,

          $setOnInsert: {
            firstSeenAt:
              now,
          },
        },
        {
          upsert:
            true,

          new:
            true,

          setDefaultsOnInsert:
            true,

          runValidators:
            true,
        }
      );
  }

  // ==========================================================================
  // GET RESOURCE
  // ==========================================================================

  async getResource(
    context,
    resourceId
  ) {
    const scope =
      this._scope(
        context
      );

    if (
      !isDatabaseIdentifier(
          resourceId
        )
    ) {
      return null;
    }

    return InfrastructureResource
      .findOne({
        _id:
          resourceId,

        ...scope,

        lifecycleStatus: {
          $ne:
            "archived",
        },
      })
      .lean();
  }

  // ==========================================================================
  // LIST RESOURCES
  // ==========================================================================

  async listResources(
    context,
    {
      provider = null,
      resourceType = null,
      resourceSubtype = null,
      integrationId = null,
      namespace = null,
      healthStatus = null,
      lifecycleStatus = null,
      search = "",
      includeInactive = false,
      page = 1,
      limit = 50,
    } = {}
  ) {
    const scope =
      this._scope(
        context
      );

    const filter = {
      ...scope,
    };

    if (lifecycleStatus) {
      filter.lifecycleStatus =
        lifecycleStatus;
    } else if (
      !includeInactive
    ) {
      filter.lifecycleStatus =
        "active";
    }

    if (provider) {
      filter.provider =
        provider;
    }

    if (resourceType) {
      filter.resourceType =
        resourceType;
    }

    if (resourceSubtype) {
      filter.resourceSubtype =
        resourceSubtype;
    }

    if (integrationId) {
      if (
        !isDatabaseIdentifier(
            integrationId
          )
      ) {
        return {
          resources: [],

          pagination: {
            page: 1,
            limit:
              Number(limit) ||
              50,
            total: 0,
            pages: 0,
          },
        };
      }

      filter.integrationId =
        integrationId;
    }

    if (namespace) {
      filter.namespace =
        namespace;
    }

    if (healthStatus) {
      filter.healthStatus =
        healthStatus;
    }

    if (
      search &&
      search.trim()
    ) {
      const escaped =
        String(search)
          .trim()
          .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

      filter.name = {
        $regex:
          escaped,

        $options:
          "i",
      };
    }

    const safePage =
      Math.max(
        1,
        Number(page) || 1
      );

    const safeLimit =
      Math.min(
        100,
        Math.max(
          1,
          Number(limit) || 50
        )
      );

    const skip =
      (
        safePage -
        1
      ) *
      safeLimit;

    const [
      total,
      resources,
    ] =
      await Promise.all([
        InfrastructureResource
          .countDocuments(
            filter
          ),

        InfrastructureResource
          .find(
            filter
          )
          .sort({
            resourceType:
              1,

            name:
              1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .lean(),
      ]);

    return {
      resources,

      pagination: {
        page:
          safePage,

        limit:
          safeLimit,

        total,

        pages:
          total === 0
            ? 0
            : Math.ceil(
                total /
                safeLimit
              ),
      },
    };
  }

  // ==========================================================================
  // INVENTORY SUMMARY
  // ==========================================================================

  async getSummary(
    context
  ) {
    const scope =
      this._scope(
        context
      );

    const organizationId =
      new mongoose
        .Types
        .ObjectId(
          String(
            scope.organizationId
          )
        );

    const environmentId =
      new mongoose
        .Types
        .ObjectId(
          String(
            scope.environmentId
          )
        );

    const [
      total,
      active,
      missing,
      stale,
      unhealthy,
      byProvider,
      byType,
      byHealth,
    ] =
      await Promise.all([
        InfrastructureResource
          .countDocuments(
            scope
          ),

        InfrastructureResource
          .countDocuments({
            ...scope,

            lifecycleStatus:
              "active",
          }),

        InfrastructureResource
          .countDocuments({
            ...scope,

            lifecycleStatus:
              "missing",
          }),

        InfrastructureResource
          .countDocuments({
            ...scope,

            lifecycleStatus:
              "stale",
          }),

        InfrastructureResource
          .countDocuments({
            ...scope,

            lifecycleStatus:
              "active",

            healthStatus: {
              $in: [
                "degraded",
                "unhealthy",
              ],
            },
          }),

        InfrastructureResource
          .aggregate([
            {
              $match: {
                organizationId,
                environmentId,

                lifecycleStatus:
                  "active",
              },
            },

            {
              $group: {
                _id:
                  "$provider",

                count: {
                  $sum:
                    1,
                },
              },
            },

            {
              $sort: {
                count:
                  -1,
              },
            },
          ]),

        InfrastructureResource
          .aggregate([
            {
              $match: {
                organizationId,
                environmentId,

                lifecycleStatus:
                  "active",
              },
            },

            {
              $group: {
                _id:
                  "$resourceType",

                count: {
                  $sum:
                    1,
                },
              },
            },

            {
              $sort: {
                count:
                  -1,
              },
            },
          ]),

        InfrastructureResource
          .aggregate([
            {
              $match: {
                organizationId,
                environmentId,

                lifecycleStatus:
                  "active",
              },
            },

            {
              $group: {
                _id:
                  "$healthStatus",

                count: {
                  $sum:
                    1,
                },
              },
            },
          ]),
      ]);

    return {
      total,
      active,
      missing,
      stale,

      archived:
        Math.max(
          0,
          total -
            active -
            missing -
            stale
        ),

      unhealthy,

      byProvider:
        byProvider.map(
          (item) => ({
            provider:
              item._id,

            count:
              item.count,
          })
        ),

      byType:
        byType.map(
          (item) => ({
            resourceType:
              item._id,

            count:
              item.count,
          })
        ),

      byHealth:
        byHealth.map(
          (item) => ({
            healthStatus:
              item._id,

            count:
              item.count,
          })
        ),
    };
  }

  // ==========================================================================
  // RECONCILE COMPLETED CONNECTOR SYNC
  // ==========================================================================

  async reconcileCompletedSync(
    context,
    {
      integrationId,
      provider,
      syncId,
    }
  ) {
    const scope =
      this._scope(
        context
      );

    if (
      !integrationId ||
      !provider ||
      !syncId
    ) {
      throw Object.assign(
        new Error(
          "Complete reconciliation context is required"
        ),
        {
          code:
            "INVENTORY_RECONCILIATION_CONTEXT_REQUIRED",
        }
      );
    }

    const now =
      new Date();

    /*
     * IMPORTANT:
     *
     * This function must only be called after every resource
     * observed during the discovery has been successfully
     * written using this syncId.
     *
     * If an upsert fails, the caller throws before reaching
     * reconciliation and old resources remain active.
     */
    const result =
      await InfrastructureResource
        .updateMany(
          {
            ...scope,

            integrationId,

            provider,

            lifecycleStatus:
              "active",

            $or: [
              {
                lastSeenSyncId: {
                  $ne:
                    String(
                      syncId
                    ),
                },
              },

              {
                lastSeenSyncId:
                  null,
              },
            ],
          },
          {
            $set: {
              lifecycleStatus:
                "missing",

              missingSince:
                now,
            },
          }
        );

    return {
      syncId:
        String(syncId),

      matched:
        result.matchedCount ??
        result.n ??
        0,

      modified:
        result.modifiedCount ??
        result.nModified ??
        0,
    };
  }

  // ==========================================================================
  // MARK LONG-MISSING RESOURCES STALE
  // ==========================================================================

  async markStaleResources(
    context,
    {
      olderThanMs =
        24 *
        60 *
        60 *
        1000,
    } = {}
  ) {
    const scope =
      this._scope(
        context
      );

    const threshold =
      new Date(
        Date.now() -
        Math.max(
          0,
          Number(
            olderThanMs
          ) || 0
        )
      );

    const result =
      await InfrastructureResource
        .updateMany(
          {
            ...scope,

            lifecycleStatus:
              "missing",

            missingSince: {
              $lte:
                threshold,
            },
          },
          {
            $set: {
              lifecycleStatus:
                "stale",
            },
          }
        );

    return {
      modified:
        result.modifiedCount ??
        result.nModified ??
        0,

      threshold,
    };
  }
}

module.exports =
  new InventoryService();

module.exports.InventoryService =
  InventoryService;