"use strict";

const mongoose = require("mongoose");

const { environmentRepository, organizationRepository } = require("../../persistence/repositories");

const EntitlementService = require(
  "./entitlementService"
);

const {
  ENTITLEMENTS,
} = require("../../constants/entitlements");

/**
 * Canonical environment-domain service.
 *
 * Responsibilities:
 *
 * - tenant-safe environment lookup
 * - creation
 * - updates
 * - maintenance lifecycle
 * - archival
 * - default-environment management
 * - plan entitlement enforcement
 * - production safety defaults
 *
 * Routes/controllers should delegate environment
 * business rules to this service.
 */
class EnvironmentService {
  /**
   * ---------------------------------------------------------------
   * ERROR HELPER
   * ---------------------------------------------------------------
   */
  static createError(
    message,
    code,
    status = 400,
    metadata = {}
  ) {
    const error =
      new Error(message);

    error.code = code;
    error.status = status;

    Object.assign(
      error,
      metadata
    );

    return error;
  }

  /**
   * ---------------------------------------------------------------
   * SAFE SERIALIZATION
   * ---------------------------------------------------------------
   *
   * Never return raw mongoose Environment documents
   * directly to the frontend.
   */
  static safeEnvironment(
    environment
  ) {
    if (!environment) {
      return null;
    }

    return {
      id:
        environment._id
          .toString(),

      organizationId:
        environment.organizationId
          ?.toString?.() ||
        null,

      name:
        environment.name,

      slug:
        environment.slug,

      type:
        environment.type,

      criticality:
        environment.criticality,

      status:
        environment.status,

      description:
        environment.description ||
        "",

      settings: {
        allowAutonomousExecution:
          environment.settings
            ?.allowAutonomousExecution ??
          false,

        requireApprovalForDestructiveActions:
          environment.settings
            ?.requireApprovalForDestructiveActions ??
          true,

        timezone:
          environment.settings
            ?.timezone ??
          null,
      },

      maintenance: {
        reason:
          environment
            .maintenanceReason ||
          null,

        startedAt:
          environment
            .maintenanceStartedAt ||
          null,
      },

      archive: {
        archivedAt:
          environment
            .archivedAt ||
          null,

        archivedByUserId:
          environment
            .archivedByUserId
            ?.toString?.() ||
          null,

        reason:
          environment
            .archiveReason ||
          null,
      },

      createdByUserId:
        environment
          .createdByUserId
          ?.toString?.() ||
        null,

      createdAt:
        environment.createdAt,

      updatedAt:
        environment.updatedAt,
    };
  }

  /**
   * ---------------------------------------------------------------
   * SLUG NORMALIZATION
   * ---------------------------------------------------------------
   */
  static normalizeSlug(
    value
  ) {
    if (
      !value ||
      typeof value !==
        "string"
    ) {
      return "";
    }

    return value
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^[-_]+|[-_]+$/g,
        ""
      )
      .slice(
        0,
        80
      );
  }

  /**
   * ---------------------------------------------------------------
   * ID VALIDATION
   * ---------------------------------------------------------------
   */
  static assertValidId(
    value,
    fieldName
  ) {
    if (
      !mongoose.Types
        .ObjectId
        .isValid(value)
    ) {
      throw this.createError(
        `Invalid ${fieldName}`,
        "INVALID_IDENTIFIER",
        400,
        {
          field:
            fieldName,
        }
      );
    }
  }

  /**
   * ---------------------------------------------------------------
   * ORGANIZATION VALIDATION
   * ---------------------------------------------------------------
   */
  static async getActiveOrganization(
    organizationId
  ) {
    this.assertValidId(
      organizationId,
      "organizationId"
    );

    const organization =
      await organizationRepository.findOne({
        _id:
          organizationId,

        status:
          "active",
      });

    if (!organization) {
      throw this.createError(
        "Organization not found",
        "ORGANIZATION_NOT_FOUND",
        404
      );
    }

    return organization;
  }

  /**
   * ---------------------------------------------------------------
   * GET ONE
   * ---------------------------------------------------------------
   *
   * Archived environments are excluded unless explicitly requested.
   */
  static async getByIdForOrganization(
    environmentId,
    organizationId,
    options = {}
  ) {
    this.assertValidId(
      environmentId,
      "environmentId"
    );

    this.assertValidId(
      organizationId,
      "organizationId"
    );

    const query = {
      _id:
        environmentId,

      organizationId,
    };

    if (
      !options.includeArchived
    ) {
      query.status = {
        $ne:
          "archived",
      };
    }

    return environmentRepository.findOne(query);
  }

  /**
   * Strict version used by business operations.
   */
  static async requireEnvironment(
    environmentId,
    organizationId,
    options = {}
  ) {
    const environment =
      await this.getByIdForOrganization(
        environmentId,
        organizationId,
        options
      );

    if (!environment) {
      /*
       * 404 intentionally avoids telling callers whether
       * the environment belongs to another organization.
       */
      throw this.createError(
        "Environment not found",
        "ENVIRONMENT_NOT_FOUND",
        404
      );
    }

    return environment;
  }

  /**
   * ---------------------------------------------------------------
   * LIST
   * ---------------------------------------------------------------
   */
  static async listForOrganization(
    organizationId,
    options = {}
  ) {
    this.assertValidId(
      organizationId,
      "organizationId"
    );

    const query = {
      organizationId,
    };

    if (
      !options.includeArchived
    ) {
      query.status = {
        $ne:
          "archived",
      };
    }

    if (options.type) {
      query.type =
        options.type;
    }

    if (options.status) {
      query.status =
        options.status;
    }

    const environments = await environmentRepository.findMany(query);
    return environments.sort((left, right) => String(left.type).localeCompare(String(right.type)) || new Date(left.createdAt) - new Date(right.createdAt));
  }

  /**
   * ---------------------------------------------------------------
   * DEFAULT ENVIRONMENT
   * ---------------------------------------------------------------
   */
  static async getDefaultForOrganization(
    organization
  ) {
    if (!organization?._id) {
      return null;
    }

    const defaultEnvironmentId =
      organization
        .settings
        ?.defaultEnvironmentId;

    if (
      defaultEnvironmentId
    ) {
      const environment =
        await environmentRepository.findOne({
          _id:
            defaultEnvironmentId,

          organizationId:
            organization._id,

          status: {
            $ne:
              "archived",
          },
        });

      if (environment) {
        return environment;
      }
    }

    /*
     * Compatibility fallback:
     *
     * organizations created before Environment support
     * may not yet have defaultEnvironmentId populated.
     */
    const environments = await environmentRepository.findMany({
      organizationId:
        organization._id,

      status:
        "active",
    });
    return environments.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))[0] || null;
  }

  /**
   * ---------------------------------------------------------------
   * CREATE
   * ---------------------------------------------------------------
   */
  static async createEnvironment(
    organizationId,
    data,
    actorUserId = null
  ) {
    const organization =
      await this.getActiveOrganization(
        organizationId
      );

    const currentCount =
      (await environmentRepository.findMany({
        organizationId,
        status: {
          $ne:
            "archived",
        },
      })).length;

    /*
     * Enforce plan environment count.
     */
    await EntitlementService
      .assertWithinLimit(
        organizationId,
        ENTITLEMENTS
          .ENVIRONMENTS_MAX,
        currentCount,
        1
      );

    const type =
      data.type ||
      "custom";

    /*
     * Production is separately gated because
     * it carries much higher operational risk.
     */
    if (
      type ===
      "production"
    ) {
      await EntitlementService
        .assertEnabled(
          organizationId,
          ENTITLEMENTS
            .PRODUCTION_ENVIRONMENT
        );

      const existingProduction =
        await environmentRepository.findOne({
          organizationId,

          type:
            "production",

          status: {
            $ne:
              "archived",
          },
        });

      if (
        existingProduction
      ) {
        throw this.createError(
          "A production environment already exists",
          "PRODUCTION_ENVIRONMENT_EXISTS",
          409
        );
      }
    }

    const name =
      String(
        data.name || ""
      ).trim();

    if (!name) {
      throw this.createError(
        "Environment name is required",
        "ENVIRONMENT_NAME_REQUIRED",
        400
      );
    }

    let slug =
      this.normalizeSlug(
        data.slug ||
        name
      );

    if (!slug) {
      throw this.createError(
        "Environment slug is invalid",
        "INVALID_ENVIRONMENT_SLUG",
        400
      );
    }

    const duplicateSlug =
      await environmentRepository.findOne({
        organizationId,
        slug,
      });

    if (duplicateSlug) {
      throw this.createError(
        "An environment with this slug already exists",
        "ENVIRONMENT_SLUG_EXISTS",
        409
      );
    }

    /*
     * Production defaults must remain conservative.
     *
     * Explicit policies will become more sophisticated
     * during the Policy/Autonomy phase.
     */
    const isProduction =
      type ===
      "production";

    const environment =
      await environmentRepository.create({
        organizationId,

        name,

        slug,

        type,

        criticality:
          isProduction
            ? "critical"
            : (
                data.criticality ||
                "medium"
              ),

        status:
          "active",

        description:
          data.description ||
          "",

        settings: {
          allowAutonomousExecution:
            isProduction
              ? false
              : (
                  data.settings
                    ?.allowAutonomousExecution ??
                  false
                ),

          requireApprovalForDestructiveActions:
            isProduction
              ? true
              : (
                  data.settings
                    ?.requireApprovalForDestructiveActions ??
                  true
                ),

          timezone:
            data.settings
              ?.timezone ??
            null,
        },

        createdByUserId:
          actorUserId ||
          null,
      });

    /*
     * If the organization somehow has no default environment,
     * the newly-created environment becomes the default.
     */
    if (
      !organization
        .settings
        ?.defaultEnvironmentId
    ) {
      await organizationRepository.updateOne(
        {
          _id:
            organizationId,
        },
        {
          $set: {
            "settings.defaultEnvironmentId":
              environment._id,
          },
        }
      );
    }

    return environment;
  }

  /**
   * ---------------------------------------------------------------
   * UPDATE
   * ---------------------------------------------------------------
   *
   * Mutable:
   *
   * name
   * description
   * criticality
   * selected environment-level safety defaults
   *
   * Immutable here:
   *
   * organizationId
   * type
   * slug
   *
   * Type/slug changes can have wide downstream effects, so
   * they should not be casual PATCH operations.
   */
  static async updateEnvironment(
    environmentId,
    organizationId,
    data
  ) {
    const environment =
      await this.requireEnvironment(
        environmentId,
        organizationId
      );

    if (
      data.name !==
      undefined
    ) {
      const name =
        String(
          data.name
        ).trim();

      if (!name) {
        throw this.createError(
          "Environment name cannot be empty",
          "ENVIRONMENT_NAME_REQUIRED",
          400
        );
      }

      environment.name =
        name;
    }

    if (
      data.description !==
      undefined
    ) {
      environment.description =
        String(
          data.description ||
          ""
        ).trim();
    }

    if (
      data.criticality !==
      undefined
    ) {
      /*
       * Production may never be downgraded below high
       * through this generic endpoint.
       */
      if (
        environment.type ===
          "production" &&
        ![
          "high",
          "critical",
        ].includes(
          data.criticality
        )
      ) {
        throw this.createError(
          "Production environment criticality cannot be lower than high",
          "PRODUCTION_CRITICALITY_PROTECTED",
          400
        );
      }

      environment.criticality =
        data.criticality;
    }

    if (
      data.settings !==
      undefined
    ) {
      const incomingSettings =
        data.settings || {};

      /*
       * Production autonomous execution remains locked
       * during Phase 1.
       *
       * The Policy/Autonomy phase will introduce controlled
       * production autonomy rather than enabling it here.
       */
      if (
        environment.type ===
          "production" &&
        incomingSettings
          .allowAutonomousExecution ===
          true
      ) {
        throw this.createError(
          "Production autonomous execution cannot be enabled from environment settings",
          "PRODUCTION_AUTONOMY_PROTECTED",
          403
        );
      }

      if (
        incomingSettings
          .allowAutonomousExecution !==
        undefined
      ) {
        environment.settings
          .allowAutonomousExecution =
          Boolean(
            incomingSettings
              .allowAutonomousExecution
          );
      }

      if (
        incomingSettings
          .requireApprovalForDestructiveActions !==
        undefined
      ) {
        /*
         * Production destructive-action approval cannot
         * be disabled during Phase 1.
         */
        if (
          environment.type ===
            "production" &&
          incomingSettings
            .requireApprovalForDestructiveActions ===
            false
        ) {
          throw this.createError(
            "Production destructive-action approval cannot be disabled",
            "PRODUCTION_APPROVAL_PROTECTED",
            403
          );
        }

        environment.settings
          .requireApprovalForDestructiveActions =
          Boolean(
            incomingSettings
              .requireApprovalForDestructiveActions
          );
      }

      if (
        incomingSettings
          .timezone !==
        undefined
      ) {
        environment.settings
          .timezone =
          incomingSettings
            .timezone ||
          null;
      }
    }

    await environmentRepository.save(environment);

    return environment;
  }

  /**
   * ---------------------------------------------------------------
   * ENTER MAINTENANCE
   * ---------------------------------------------------------------
   */
  static async enterMaintenance(
    environmentId,
    organizationId,
    reason
  ) {
    const environment =
      await this.requireEnvironment(
        environmentId,
        organizationId
      );

    if (
      environment.status ===
      "maintenance"
    ) {
      return environment;
    }

    environment.status =
      "maintenance";

    environment.maintenanceReason =
      String(
        reason ||
        "Maintenance"
      ).trim();

    environment.maintenanceStartedAt =
      new Date();

    await environmentRepository.save(environment);

    return environment;
  }

  /**
   * ---------------------------------------------------------------
   * EXIT MAINTENANCE
   * ---------------------------------------------------------------
   */
  static async exitMaintenance(
    environmentId,
    organizationId
  ) {
    const environment =
      await this.requireEnvironment(
        environmentId,
        organizationId
      );

    if (
      environment.status !==
      "maintenance"
    ) {
      return environment;
    }

    environment.status =
      "active";

    environment.maintenanceReason =
      null;

    environment.maintenanceStartedAt =
      null;

    await environmentRepository.save(environment);

    return environment;
  }

  /**
   * ---------------------------------------------------------------
   * SET DEFAULT
   * ---------------------------------------------------------------
   */
  static async setDefaultEnvironment(
    environmentId,
    organizationId
  ) {
    const environment =
      await this.requireEnvironment(
        environmentId,
        organizationId
      );

    if (
      environment.status ===
      "archived"
    ) {
      throw this.createError(
        "Archived environment cannot be default",
        "ARCHIVED_ENVIRONMENT_NOT_ALLOWED",
        409
      );
    }

    await organizationRepository.updateOne(
      {
        _id:
          organizationId,
        status:
          "active",
      },
      {
        $set: {
          "settings.defaultEnvironmentId":
            environment._id,
        },
      }
    );

    return environment;
  }

  /**
   * ---------------------------------------------------------------
   * ARCHIVE
   * ---------------------------------------------------------------
   *
   * We archive rather than delete.
   *
   * Operational history such as incidents/executions may
   * continue referencing this environment indefinitely.
   */
  static async archiveEnvironment(
    environmentId,
    organizationId,
    actorUserId = null,
    reason = null
  ) {
    const environment =
      await this.requireEnvironment(
        environmentId,
        organizationId
      );

    const organization =
      await this.getActiveOrganization(
        organizationId
      );

    /*
     * Prevent archiving the organization's last
     * active/maintenance environment.
     */
    const remainingCount =
      (await environmentRepository.findMany({
        organizationId,

        _id: {
          $ne:
            environment._id,
        },

        status: {
          $in: [
            "active",
            "maintenance",
          ],
        },
      })).length;

    if (
      remainingCount ===
      0
    ) {
      throw this.createError(
        "The organization's last environment cannot be archived",
        "LAST_ENVIRONMENT_PROTECTED",
        409
      );
    }

    environment.status =
      "archived";

    environment.archivedAt =
      new Date();

    environment.archivedByUserId =
      actorUserId ||
      null;

    environment.archiveReason =
      reason
        ? String(
            reason
          ).trim()
        : null;

    environment.maintenanceReason =
      null;

    environment.maintenanceStartedAt =
      null;

    await environmentRepository.save(environment);

    /*
     * If the archived environment was the organization's
     * default, select another valid environment.
     */
    const currentDefaultId =
      organization
        .settings
        ?.defaultEnvironmentId
        ?.toString?.() ||
      null;

    if (
      currentDefaultId ===
      environment._id
        .toString()
    ) {
      const replacement =
        await environmentRepository.findOne({
          organizationId,

          status:
            "active",

          _id: {
            $ne:
              environment._id,
          },
        }).sort({
          createdAt:
            1,
        });

      if (!replacement) {
        /*
         * Maintenance environment may be the only remaining
         * valid environment.
         */
        const maintenanceReplacement =
          await environmentRepository.findOne({
            organizationId,

            status:
              "maintenance",

            _id: {
              $ne:
                environment._id,
            },
          }).sort({
            createdAt:
              1,
          });

        if (
          maintenanceReplacement
        ) {
          await organizationRepository.updateOne(
            {
              _id:
                organizationId,
            },
            {
              $set: {
                "settings.defaultEnvironmentId":
                  maintenanceReplacement._id,
              },
            }
          );
        }
      } else {
        await organizationRepository.updateOne(
          {
            _id:
              organizationId,
          },
          {
            $set: {
              "settings.defaultEnvironmentId":
                replacement._id,
            },
          }
        );
      }
    }

    return environment;
  }

  /**
   * ---------------------------------------------------------------
   * SUMMARY
   * ---------------------------------------------------------------
   *
   * Useful for organization settings/dashboard.
   */
  static async getEnvironmentSummary(
    organizationId
  ) {
    this.assertValidId(
      organizationId,
      "organizationId"
    );

    const [
      total,
      active,
      maintenance,
      production,
    ] =
      await Promise.all([
        environmentRepository.findMany({
          organizationId,
          status: {
            $ne:
              "archived",
          },
        }),

        environmentRepository.findMany({
          organizationId,
          status:
            "active",
        }),

        environmentRepository.findMany({
          organizationId,
          status:
            "maintenance",
        }),

        environmentRepository.findMany({
          organizationId,
          type:
            "production",
          status: {
            $ne:
              "archived",
          },
        }),
      ]);

    const subscription =
      await EntitlementService
        .getSubscription(
          organizationId
        );

    const environmentLimit =
      await EntitlementService
        .getEntitlement(
          organizationId,
          ENTITLEMENTS
            .ENVIRONMENTS_MAX
        );

    return {
      total: total.length,
      active: active.length,
      maintenance: maintenance.length,
      hasProduction:
        production.length > 0,

      plan:
        subscription.plan,

      limit:
        environmentLimit,

      remaining:
        environmentLimit ===
          null
          ? null
          : Math.max(
              environmentLimit -
                total.length,
              0
            ),
    };
  }
}

module.exports =
  EnvironmentService;