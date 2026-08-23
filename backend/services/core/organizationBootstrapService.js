"use strict";

const {
  environmentRepository,
  organizationRepository,
  subscriptionRepository,
} =
  require(
    "../../persistence/repositories"
  );


class OrganizationBootstrapService {
  static async bootstrapOrganization(
    organization,
    userId
  ) {
    if (
      !organization?._id
    ) {
      throw Object.assign(
        new Error(
          "Organization is required for bootstrap"
        ),
        {
          code:
            "ORGANIZATION_BOOTSTRAP_REQUIRED",
        }
      );
    }

    let developmentEnvironment =
      await environmentRepository
        .findOne({
          organizationId:
            organization._id,

          slug:
            "development",
        });

    if (
      !developmentEnvironment
    ) {
      developmentEnvironment =
        await environmentRepository
          .create({
            organizationId:
              organization._id,

            name:
              "Development",

            slug:
              "development",

            type:
              "development",

            criticality:
              "low",

            status:
              "active",

            description:
              "Default AIRA development environment",

            settings: {
              allowAutonomousExecution:
                false,

              requireApprovalForDestructiveActions:
                true,

              timezone:
                organization
                  .settings
                  ?.timezone ||
                "UTC",
            },

            createdByUserId:
              userId ||
              null,
          });
    }

    let subscription =
      await subscriptionRepository
        .findOne({
          organizationId:
            organization._id,
        });

    if (
      !subscription
    ) {
      subscription =
        await subscriptionRepository
          .create({
            organizationId:
              organization._id,

            plan:
              "developer",

            status:
              "active",

            startedAt:
              new Date(),

            metadata:
              {},
          });
    }

    const currentDefault =
      organization
        .settings
        ?.defaultEnvironmentId;

    if (
      !currentDefault
    ) {
      await organizationRepository
        .updateOne(
          {
            _id:
              organization._id,
          },
          {
            $set: {
              "settings.defaultEnvironmentId":
                developmentEnvironment
                  ._id,
            },
          }
        );

      if (
        organization.settings
      ) {
        organization.settings
          .defaultEnvironmentId =
          developmentEnvironment
            ._id;
      }
    }

    return {
      developmentEnvironment,
      subscription,
    };
  }
}


module.exports =
  OrganizationBootstrapService;