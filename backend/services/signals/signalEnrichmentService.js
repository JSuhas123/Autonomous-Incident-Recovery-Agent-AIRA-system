"use strict";

const mongoose =
  require(
    "mongoose"
  );

const Service =
  require(
    "../../models/Service"
  );

const InfrastructureResource =
  require(
    "../../models/InfrastructureResource"
  );

class SignalEnrichmentService {
  async enrich(
    signal
  ) {
    if (
      !signal ||
      !signal.organizationId ||
      !signal.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Signal enrichment requires organization and environment context"
        ),
        {
          code:
            "SIGNAL_ENRICHMENT_CONTEXT_REQUIRED",
        }
      );
    }

    const enriched = {
      ...signal,
    };

    const service =
      await this
        .resolveService(
          enriched
        );

    if (service) {
      enriched.serviceId =
        service._id;

      enriched.resource =
        {
          ...enriched.resource,

          serviceName:
            enriched
              .resource
              ?.serviceName ||
            service.name,
        };

      enriched.attributes =
        {
          ...enriched.attributes,

          airaService: {
            id:
              String(
                service._id
              ),

            name:
              service.name,

            type:
              service.type,

            status:
              service.status,
          },
        };
    }

    const resource =
      await this
        .resolveInfrastructureResource(
          enriched
        );

    if (resource) {
      enriched.attributes =
        {
          ...enriched.attributes,

          airaInfrastructureResource: {
            id:
              String(
                resource._id
              ),

            provider:
              resource.provider,

            resourceType:
              resource
                .resourceType,

            resourceSubtype:
              resource
                .resourceSubtype,

            criticality:
              resource
                .criticality,

            healthStatus:
              resource
                .healthStatus,
          },
        };

      enriched.resource =
        {
          ...enriched.resource,

          resourceId:
            enriched
              .resource
              ?.resourceId ||
            resource.externalId ||
            String(
              resource._id
            ),

          resourceType:
            enriched
              .resource
              ?.resourceType ||
            resource
              .resourceType,

          namespace:
            enriched
              .resource
              ?.namespace ||
            resource.namespace ||
            null,

          cluster:
            enriched
              .resource
              ?.cluster ||
            resource.cluster ||
            null,

          region:
            enriched
              .resource
              ?.region ||
            resource.region ||
            null,

          cloudProvider:
            enriched
              .resource
              ?.cloudProvider ||
            resource.provider ||
            null,
        };
    }

    enriched.processingStatus =
      "enriched";

    enriched.enrichedAt =
      new Date();

    return enriched;
  }

  async resolveService(
    signal
  ) {
    const scope = {
      organizationId:
        signal.organizationId,

      environmentId:
        signal.environmentId,

      status: {
        $ne:
          "archived",
      },
    };

    /*
     * Already mapped service ID.
     */
    if (
      signal.serviceId &&
      mongoose.Types.ObjectId
        .isValid(
          signal.serviceId
        )
    ) {
      const direct =
        await Service
          .findOne({
            ...scope,

            _id:
              signal.serviceId,
          })
          .lean();

      if (direct) {
        return direct;
      }
    }

    const serviceName =
      signal.resource
        ?.serviceName;

    if (!serviceName) {
      return null;
    }

    /*
     * Prefer exact name / slug match.
     */
    let service =
      await Service
        .findOne({
          ...scope,

          $or: [
            {
              name:
                serviceName,
            },

            {
              slug:
                String(
                  serviceName
                )
                  .trim()
                  .toLowerCase(),
            },
          ],
        })
        .lean();

    if (service) {
      return service;
    }

    /*
     * Case-insensitive fallback.
     *
     * Escape regex input to avoid treating provider-supplied
     * service names as regular expressions.
     */
    const escaped =
      this.escapeRegex(
        String(
          serviceName
        ).trim()
      );

    service =
      await Service
        .findOne({
          ...scope,

          name: {
            $regex:
              `^${escaped}$`,

            $options:
              "i",
          },
        })
        .lean();

    return service ||
      null;
  }

  async resolveInfrastructureResource(
    signal
  ) {
    const scope = {
      organizationId:
        signal.organizationId,

      environmentId:
        signal.environmentId,

      lifecycleStatus: {
        $ne:
          "archived",
      },
    };

    const resource =
      signal.resource ||
      {};

    /*
     * External/provider resource identity is strongest.
     */
    if (
      resource.resourceId
    ) {
      const direct =
        await InfrastructureResource
          .findOne({
            ...scope,

            $or: [
              {
                externalId:
                  resource
                    .resourceId,
              },

              {
                inventoryKey:
                  resource
                    .resourceId,
              },
            ],
          })
          .lean();

      if (direct) {
        return direct;
      }
    }

    /*
     * Kubernetes/provider naming fallback.
     */
    const possibleNames =
      [
        resource.pod,
        resource.container,
        resource.node,
        resource.serviceName,
        resource.host,
      ]
        .filter(
          Boolean
        );

    if (
      possibleNames.length ===
      0
    ) {
      return null;
    }

    const filter = {
      ...scope,

      name: {
        $in:
          possibleNames,
      },
    };

    if (
      resource.namespace
    ) {
      filter.namespace =
        resource.namespace;
    }

    if (
      resource.cloudProvider
    ) {
      filter.provider =
        resource
          .cloudProvider;
    }

    return InfrastructureResource
      .findOne(
        filter
      )
      .lean();
  }

  escapeRegex(
    input
  ) {
    return input.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  }
}

module.exports =
  new SignalEnrichmentService();

module.exports
  .SignalEnrichmentService =
  SignalEnrichmentService;