"use strict";

const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  Service,
} =
  require(
    "../../persistence/operational/operationalModels"
  );

const {
  ServiceDependency,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );

class ServiceDependencyService {
  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _scope(context) {
    if (
      !context ||
      !context.organizationId ||
      !context.environmentId ||
      !context.tenantId
    ) {
      throw Object.assign(
        new Error(
          "Complete service dependency context is required"
        ),
        {
          code:
            "SERVICE_DEPENDENCY_CONTEXT_REQUIRED",
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

  _validObjectId(value) {
    return Boolean(
      value &&
      isDatabaseIdentifier(
          value
        )
    );
  }

  async _requireService(
    scope,
    serviceId
  ) {
    if (
      !this._validObjectId(
        serviceId
      )
    ) {
      return null;
    }

    return Service
      .findOne({
        _id:
          serviceId,

        ...scope,

        status: {
          $ne:
            "archived",
        },
      })
      .lean();
  }

  // ==========================================================================
  // CREATE / UPDATE DEPENDENCY
  // ==========================================================================

  async upsertDependency(
    context,
    {
      sourceServiceId,
      targetServiceId,
      dependencyType =
        "critical",
      criticality = 5,
      userFacing = false,
      sla = {},
      latencyMs = 0,
      failureRate = 0,
      discoveryMethod =
        "manual",
      confidence = 1,
      evidence = {},
    }
  ) {
    const scope =
      this._scope(
        context
      );

    if (
      !this._validObjectId(
        sourceServiceId
      ) ||
      !this._validObjectId(
        targetServiceId
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid service dependency identifier"
        ),
        {
          code:
            "INVALID_SERVICE_DEPENDENCY_ID",
        }
      );
    }

    if (
      String(
        sourceServiceId
      ) ===
      String(
        targetServiceId
      )
    ) {
      throw Object.assign(
        new Error(
          "A service cannot depend on itself"
        ),
        {
          code:
            "SELF_DEPENDENCY_NOT_ALLOWED",
        }
      );
    }

    const [
      source,
      target,
    ] =
      await Promise.all([
        this._requireService(
          scope,
          sourceServiceId
        ),

        this._requireService(
          scope,
          targetServiceId
        ),
      ]);

    if (
      !source ||
      !target
    ) {
      throw Object.assign(
        new Error(
          "Service dependency endpoint not found in current environment"
        ),
        {
          code:
            "SERVICE_DEPENDENCY_SERVICE_NOT_FOUND",
        }
      );
    }

    const now =
      new Date();

    return ServiceDependency
      .findOneAndUpdate(
        {
          ...scope,

          sourceServiceId,

          targetServiceId,
        },
        {
          $set: {
            tenantId:
              String(
                context.tenantId
              ),

            dependencyType,

            criticality,

            userFacing:
              Boolean(
                userFacing
              ),

            sla: {
              availabilityTarget:
                sla
                  .availabilityTarget ??
                99.9,

              maxErrorBudgetPercent:
                sla
                  .maxErrorBudgetPercent ??
                0.1,
            },

            latencyMs,

            failureRate,

            discoveryMethod,

            confidence,

            evidence:
              evidence ||
              {},

            active:
              true,

            lastSeenAt:
              now,
          },

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
  // REMOVE
  // ==========================================================================

  async removeDependency(
    context,
    dependencyId
  ) {
    const scope =
      this._scope(
        context
      );

    if (
      !this._validObjectId(
        dependencyId
      )
    ) {
      return null;
    }

    return ServiceDependency
      .findOneAndUpdate(
        {
          _id:
            dependencyId,

          ...scope,

          active:
            true,
        },
        {
          $set: {
            active:
              false,

            lastSeenAt:
              new Date(),
          },
        },
        {
          new:
            true,

          runValidators:
            true,
        }
      );
  }

  // ==========================================================================
  // OUTBOUND DEPENDENCIES
  // ==========================================================================

  async getDependencies(
    context,
    serviceId
  ) {
    const scope =
      this._scope(
        context
      );

    const service =
      await this._requireService(
        scope,
        serviceId
      );

    if (!service) {
      return null;
    }

    const dependencies =
      await ServiceDependency
        .find({
          ...scope,

          sourceServiceId:
            serviceId,

          active:
            true,
        })
        .sort({
          criticality:
            -1,

          createdAt:
            1,
        })
        .lean();

    if (
      dependencies.length ===
      0
    ) {
      return [];
    }

    const targetIds =
      dependencies.map(
        (dependency) =>
          dependency
            .targetServiceId
      );

    const services =
      await Service
        .find({
          _id: {
            $in:
              targetIds,
          },

          ...scope,

          status: {
            $ne:
              "archived",
          },
        })
        .lean();

    const byId =
      new Map(
        services.map(
          (targetService) => [
            String(
              targetService._id
            ),

            targetService,
          ]
        )
      );

    return dependencies.map(
      (dependency) => ({
        ...dependency,

        targetService:
          byId.get(
            String(
              dependency
                .targetServiceId
            )
          ) ||
          null,
      })
    );
  }

  // ==========================================================================
  // REVERSE DEPENDENCIES
  // ==========================================================================

  async getDependents(
    context,
    serviceId
  ) {
    const scope =
      this._scope(
        context
      );

    const service =
      await this._requireService(
        scope,
        serviceId
      );

    if (!service) {
      return null;
    }

    const dependencies =
      await ServiceDependency
        .find({
          ...scope,

          targetServiceId:
            serviceId,

          active:
            true,
        })
        .sort({
          criticality:
            -1,

          createdAt:
            1,
        })
        .lean();

    if (
      dependencies.length ===
      0
    ) {
      return [];
    }

    const sourceIds =
      dependencies.map(
        (dependency) =>
          dependency
            .sourceServiceId
      );

    const services =
      await Service
        .find({
          _id: {
            $in:
              sourceIds,
          },

          ...scope,

          status: {
            $ne:
              "archived",
          },
        })
        .lean();

    const byId =
      new Map(
        services.map(
          (sourceService) => [
            String(
              sourceService._id
            ),

            sourceService,
          ]
        )
      );

    return dependencies.map(
      (dependency) => ({
        ...dependency,

        sourceService:
          byId.get(
            String(
              dependency
                .sourceServiceId
            )
          ) ||
          null,
      })
    );
  }

  // ==========================================================================
  // SERVICE GRAPH
  // ==========================================================================

  async getServiceGraph(
    context
  ) {
    const scope =
      this._scope(
        context
      );

    const [
      services,
      dependencies,
    ] =
      await Promise.all([
        Service
          .find({
            ...scope,

            status: {
              $ne:
                "archived",
            },
          })
          .sort({
            name:
              1,
          })
          .lean(),

        ServiceDependency
          .find({
            ...scope,

            active:
              true,
          })
          .lean(),
      ]);

    const validServiceIds =
      new Set(
        services.map(
          (service) =>
            String(
              service._id
            )
        )
      );

    const validDependencies =
      dependencies.filter(
        (dependency) =>
          validServiceIds.has(
            String(
              dependency
                .sourceServiceId
            )
          ) &&
          validServiceIds.has(
            String(
              dependency
                .targetServiceId
            )
          )
      );

    return {
      nodes:
        services.map(
          (service) => ({
            id:
              service._id,

            nodeType:
              "service",

            name:
              service.name,

            serviceType:
              service.type,

            status:
              service.status,

            monitoringStatus:
              service
                .monitoringStatus,

            verificationStatus:
              service
                .verificationStatus,
          })
        ),

      edges:
        validDependencies.map(
          (dependency) => ({
            id:
              dependency._id,

            edgeSource:
              "service_dependency",

            sourceType:
              "service",

            sourceId:
              dependency
                .sourceServiceId,

            targetType:
              "service",

            targetId:
              dependency
                .targetServiceId,

            relationshipType:
              "depends_on",

            dependencyType:
              dependency
                .dependencyType,

            criticality:
              dependency
                .criticality,

            confidence:
              dependency
                .confidence,

            userFacing:
              dependency
                .userFacing,

            latencyMs:
              dependency
                .latencyMs,

            failureRate:
              dependency
                .failureRate,
          })
        ),

      summary: {
        services:
          services.length,

        dependencies:
          validDependencies
            .length,

        criticalDependencies:
          validDependencies
            .filter(
              (dependency) =>
                dependency
                  .dependencyType ===
                "critical"
            )
            .length,

        userFacingDependencies:
          validDependencies
            .filter(
              (dependency) =>
                dependency
                  .userFacing ===
                true
            )
            .length,
      },
    };
  }
}

module.exports =
  new ServiceDependencyService();

module.exports
  .ServiceDependencyService =
  ServiceDependencyService;