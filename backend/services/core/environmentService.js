"use strict";

const Environment = require("../../models/Environment");

class EnvironmentService {
  static safeEnvironment(environment) {
    if (!environment) {
      return null;
    }

    return {
      id: environment._id.toString(),
      name: environment.name,
      slug: environment.slug,
      type: environment.type,
      criticality: environment.criticality,
      status: environment.status,
      description: environment.description || "",
      createdAt: environment.createdAt,
      updatedAt: environment.updatedAt,
    };
  }

  static async getByIdForOrganization(
    environmentId,
    organizationId
  ) {
    return Environment.findOne({
      _id: environmentId,
      organizationId,
      status: {
        $ne: "archived",
      },
    });
  }

  static async getDefaultForOrganization(
    organization
  ) {
    if (!organization?._id) {
      return null;
    }

    const defaultEnvironmentId =
      organization.settings?.defaultEnvironmentId;

    if (defaultEnvironmentId) {
      const environment =
        await Environment.findOne({
          _id: defaultEnvironmentId,
          organizationId: organization._id,
          status: {
            $ne: "archived",
          },
        });

      if (environment) {
        return environment;
      }
    }

    return Environment.findOne({
      organizationId: organization._id,
      status: "active",
    }).sort({
      createdAt: 1,
    });
  }

  static async listForOrganization(
    organizationId
  ) {
    return Environment.find({
      organizationId,
      status: {
        $ne: "archived",
      },
    }).sort({
      createdAt: 1,
    });
  }
}

module.exports = EnvironmentService;