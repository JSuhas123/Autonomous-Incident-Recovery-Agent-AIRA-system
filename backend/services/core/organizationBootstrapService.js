"use strict";

const Subscription = require("../../models/Subscription");
const { environmentRepository, organizationRepository } = require("../../persistence/repositories");

class OrganizationBootstrapService {
  static async bootstrapOrganization(
    organization,
    userId
  ) {
    if (!organization?._id) {
      throw new Error(
        "Organization is required for bootstrap"
      );
    }

    let developmentEnvironment =
      await environmentRepository.findOne({
        organizationId: organization._id,
        slug: "development",
      });

    if (!developmentEnvironment) {
      developmentEnvironment =
        await environmentRepository.create({
          organizationId: organization._id,
          name: "Development",
          slug: "development",
          type: "development",
          criticality: "low",
          status: "active",
          createdByUserId: userId || null,
        });
    }

    await Subscription.findOneAndUpdate(
      {
        organizationId: organization._id,
      },
      {
        $setOnInsert: {
          organizationId: organization._id,
          plan: "developer",
          status: "active",
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    if (
      !organization.settings?.defaultEnvironmentId
    ) {
      await organizationRepository.updateOne(
        {
          _id: organization._id,
        },
        {
          $set: {
            "settings.defaultEnvironmentId":
              developmentEnvironment._id,
          },
        }
      );
    }

    return {
      developmentEnvironment,
    };
  }
}

module.exports =
  OrganizationBootstrapService;