"use strict";

const {
  isDatabaseIdentifier,
} = require(
  "../../utils/identifier"
);

const {
  environmentRepository,
  organizationRepository,
} = require(
  "../../persistence/repositories"
);

const EntitlementService = require(
  "./entitlementService"
);

const {
  ENTITLEMENTS,
} = require(
  "../../constants/entitlements"
);

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

    error.code =
      code;

    error.status =
      status;

    Object.assign(
      error,
      metadata
    );

    return error;
  }

  /**
   * ---------------------------------------------------------------
   * IDENTIFIER NORMALIZATION
   * ---------------------------------------------------------------
   */
  static identifierString(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    return String(
      value
    ).trim();
  }

  /**
   * ---------------------------------------------------------------
   * IDENTIFIER COMPARISON
   * ---------------------------------------------------------------
   *
   * Repository results may originate from MongoDB or PostgreSQL.
   * Never depend on ObjectId-specific equality semantics here.
   */
  static sameIdentifier(
    left,
    right
  ) {
    const leftValue =
      this.identifierString(
        left
      );

    const rightValue =
      this.identifierString(
        right
      );

    if (
      leftValue === null ||
      rightValue === null
    ) {
      return false;
    }

    return (
      leftValue ===
      rightValue
    );
  }

  /**
   * ---------------------------------------------------------------
   * SAFE SERIALIZATION
   * ---------------------------------------------------------------
   *
   * Never expose provider-specific persistence objects directly.
   */
  static safeEnvironment(
    environment
  ) {
    if (!environment) {
      return null;
    }

    return {
      id:
        this.identifierString(
          environment._id
        ),

      organizationId:
        this.identifierString(
          environment.organizationId
        ),

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
          this.identifierString(
            environment
              .archivedByUserId
          ),

        reason:
          environment
            .archiveReason ||
          null,
      },

      createdByUserId:
        this.identifierString(
          environment
            .createdByUserId
        ),

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
    const normalized =
      value === null ||
      value === undefined
        ? ""
        : String(
            value
          ).trim();

    if (
      !isDatabaseIdentifier(
        normalized
      )
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

    return normalized;
  }

  /**
   * ---------------------------------------------------------------
   * CREATED-AT SORT
   * ---------------------------------------------------------------
   */
  static sortByCreatedAt(
    items
  ) {
    return (
      Array.isArray(
        items
      )
        ? items.slice()
        : []
    ).sort(
      (
        left,
        right
      ) =>
        new Date(
          left?.createdAt ||
          0
        ) -
        new Date(
          right?.createdAt ||
          0
        )
    );
  }

  /**
   * ---------------------------------------------------------------
   * ORGANIZATION VALIDATION
   * ---------------------------------------------------------------
   */
  static async getActiveOrganization(
    organizationId
  ) {
    const normalizedOrganizationId =
      this.assertValidId(
        organizationId,
        "organizationId"
      );

    const organization =
      await organizationRepository.findOne({
        _id:
          normalizedOrganizationId,

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
    const normalizedEnvironmentId =
      this.assertValidId(
        environmentId,
        "environmentId"
      );

    const normalizedOrganizationId =
      this.assertValidId(
        organizationId,
        "organizationId"
      );

    const query = {
      _id:
        normalizedEnvironmentId,

      organizationId:
        normalizedOrganizationId,
    };

    if (
      !options.includeArchived
    ) {
      query.status = {
        $ne:
          "archived",
      };
    }

    return environmentRepository
      .findOne(
        query
      );
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
    const normalizedOrganizationId =
      this.assertValidId(
        organizationId,
        "organizationId"
      );

    const query = {
      organizationId:
        normalizedOrganizationId,
    };

    if (
      !options.includeArchived
    ) {
      query.status = {
        $ne:
          "archived",
      };
    }

    if (
      options.type
    ) {
      query.type =
        options.type;
    }

    if (
      options.status
    ) {
      query.status =
        options.status;
    }

    const environments =
      await environmentRepository
        .findMany(
          query
        );

    return environments
      .slice()
      .sort(
        (
          left,
          right
        ) =>
          String(
            left.type ||
            ""
          ).localeCompare(
            String(
              right.type ||
              ""
            )
          ) ||
          (
            new Date(
              left.createdAt ||
              0
            ) -
            new Date(
              right.createdAt ||
              0
            )
          )
      );
  }

  /**
   * ---------------------------------------------------------------
   * DEFAULT ENVIRONMENT
   * ---------------------------------------------------------------
   */
  static async getDefaultForOrganization(
    organization
  ) {
    if (
      !organization?._id
    ) {
      return null;
    }

    const organizationId =
      this.assertValidId(
        organization._id,
        "organizationId"
      );

    const defaultEnvironmentId =
      organization
        .settings
        ?.defaultEnvironmentId;

    if (
      defaultEnvironmentId
    ) {
      const environment =
        await environmentRepository
          .findOne({
            _id:
              defaultEnvironmentId,

            organizationId,

            status: {
              $ne:
                "archived",
            },
          });

      if (
        environment
      ) {
        return environment;
      }
    }

    /*
     * Compatibility fallback:
     *
     * Organizations created before Environment support
     * may not yet have defaultEnvironmentId populated.
     */
    const environments =
      await environmentRepository
        .findMany({
          organizationId,

          status:
            "active",
        });

    return (
      this.sortByCreatedAt(
        environments
      )[0] ||
      null
    );
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
    const normalizedOrganizationId =
      this.assertValidId(
        organizationId,
        "organizationId"
      );

    const organization =
      await this.getActiveOrganization(
        normalizedOrganizationId
      );

    const currentEnvironments =
      await environmentRepository
        .findMany({
          organizationId:
            normalizedOrganizationId,

          status: {
            $ne:
              "archived",
          },
        });

    const currentCount =
      currentEnvironments.length;

    /*
     * Enforce plan environment count.
     */
    await EntitlementService
      .assertWithinLimit(
        normalizedOrganizationId,
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
          normalizedOrganizationId,
          ENTITLEMENTS
            .PRODUCTION_ENVIRONMENT
        );

      const existingProduction =
        await environmentRepository
          .findOne({
            organizationId:
              normalizedOrganizationId,

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
        data.name ||
        ""
      ).trim();

    if (
      !name
    ) {
      throw this.createError(
        "Environment name is required",
        "ENVIRONMENT_NAME_REQUIRED",
        400
      );
    }

    const slug =
      this.normalizeSlug(
        data.slug ||
        name
      );

    if (
      !slug
    ) {
      throw this.createError(
        "Environment slug is invalid",
        "INVALID_ENVIRONMENT_SLUG",
        400
      );
    }

    const duplicateSlug =
      await environmentRepository
        .findOne({
          organizationId:
            normalizedOrganizationId,

          slug,
        });

    if (
      duplicateSlug
    ) {
      throw this.createError(
        "An environment with this slug already exists",
        "ENVIRONMENT_SLUG_EXISTS",
        409
      );
    }

    /*
     * Production defaults must remain conservative.
     */
    const isProduction =
      type ===
      "production";

    const environment =
      await environmentRepository
        .create({
          organizationId:
            normalizedOrganizationId,

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
     * If the organization has no default environment,
     * the newly created environment becomes the default.
     */
    if (
      !organization
        .settings
        ?.defaultEnvironmentId
    ) {
      await organizationRepository
        .updateOne(
          {
            _id:
              normalizedOrganizationId,
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

      if (
        !name
      ) {
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
        data.settings ||
        {};

      /*
       * Production autonomous execution remains locked here.
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

      environment.settings =
        environment.settings ||
        {};

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
         * Production destructive-action approval
         * may not be disabled here.
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

    await environmentRepository
      .save(
        environment
      );

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

    await environmentRepository
      .save(
        environment
      );

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

    await environmentRepository
      .save(
        environment
      );

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
    const normalizedOrganizationId =
      this.assertValidId(
        organizationId,
        "organizationId"
      );

    const environment =
      await this.requireEnvironment(
        environmentId,
        normalizedOrganizationId
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

    const result =
      await organizationRepository
        .updateOne(
          {
            _id:
              normalizedOrganizationId,

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

    if (
      result &&
      typeof result.matchedCount ===
        "number" &&
      result.matchedCount ===
        0
    ) {
      throw this.createError(
        "Organization not found",
        "ORGANIZATION_NOT_FOUND",
        404
      );
    }

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
   *
   * Important:
   *
   * We deliberately do not use:
   *
   *   _id: { $ne: environment._id }
   *
   * because repository identifier filters must remain
   * provider-neutral. The tenant/status candidates are fetched
   * first and the current environment is excluded through
   * normalized identifier comparison.
   */
  static async archiveEnvironment(
    environmentId,
    organizationId,
    actorUserId = null,
    reason = null
  ) {
    const normalizedOrganizationId =
      this.assertValidId(
        organizationId,
        "organizationId"
      );

    const environment =
      await this.requireEnvironment(
        environmentId,
        normalizedOrganizationId
      );

    const organization =
      await this.getActiveOrganization(
        normalizedOrganizationId
      );

    /*
     * Prevent archiving the organization's last
     * active/maintenance environment.
     */
    const remainingCandidates =
      await environmentRepository
        .findMany({
          organizationId:
            normalizedOrganizationId,

          status: {
            $in: [
              "active",
              "maintenance",
            ],
          },
        });

    const remainingEnvironments =
      remainingCandidates
        .filter(
          (candidate) =>
            !this.sameIdentifier(
              candidate._id,
              environment._id
            )
        );

    if (
      remainingEnvironments.length ===
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

    await environmentRepository
      .save(
        environment
      );

    /*
     * If the archived environment was the organization's
     * default, select another valid environment.
     */
    const currentDefaultId =
      organization
        .settings
        ?.defaultEnvironmentId;

    if (
      this.sameIdentifier(
        currentDefaultId,
        environment._id
      )
    ) {
      const activeCandidates =
        (
          await environmentRepository
            .findMany({
              organizationId:
                normalizedOrganizationId,

              status:
                "active",
            })
        ).filter(
          (candidate) =>
            !this.sameIdentifier(
              candidate._id,
              environment._id
            )
        );

      const activeReplacement =
        this.sortByCreatedAt(
          activeCandidates
        )[0] ||
        null;

      if (
        activeReplacement
      ) {
        await organizationRepository
          .updateOne(
            {
              _id:
                normalizedOrganizationId,
            },
            {
              $set: {
                "settings.defaultEnvironmentId":
                  activeReplacement._id,
              },
            }
          );
      } else {
        const maintenanceCandidates =
          (
            await environmentRepository
              .findMany({
                organizationId:
                  normalizedOrganizationId,

                status:
                  "maintenance",
              })
          ).filter(
            (candidate) =>
              !this.sameIdentifier(
                candidate._id,
                environment._id
              )
          );

        const maintenanceReplacement =
          this.sortByCreatedAt(
            maintenanceCandidates
          )[0] ||
          null;

        if (
          maintenanceReplacement
        ) {
          await organizationRepository
            .updateOne(
              {
                _id:
                  normalizedOrganizationId,
              },
              {
                $set: {
                  "settings.defaultEnvironmentId":
                    maintenanceReplacement._id,
                },
              }
            );
        }
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
    const normalizedOrganizationId =
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
        environmentRepository
          .findMany({
            organizationId:
              normalizedOrganizationId,

            status: {
              $ne:
                "archived",
            },
          }),

        environmentRepository
          .findMany({
            organizationId:
              normalizedOrganizationId,

            status:
              "active",
          }),

        environmentRepository
          .findMany({
            organizationId:
              normalizedOrganizationId,

            status:
              "maintenance",
          }),

        environmentRepository
          .findMany({
            organizationId:
              normalizedOrganizationId,

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
          normalizedOrganizationId
        );

    const environmentLimit =
      await EntitlementService
        .getEntitlement(
          normalizedOrganizationId,
          ENTITLEMENTS
            .ENVIRONMENTS_MAX
        );

    return {
      total:
        total.length,

      active:
        active.length,

      maintenance:
        maintenance.length,

      hasProduction:
        production.length >
        0,

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