"use strict";

const mongoose =
  require(
    "mongoose"
  );

const CorrelationTopologyRepository =
  require(
    "../repositories/CorrelationTopologyRepository"
  );

const ResourceRelationship =
  require(
    "../../models/ResourceRelationship"
  );

const ServiceDependency =
  require(
    "../../models/ServiceDependency"
  );

class MongoCorrelationTopologyRepository
  extends CorrelationTopologyRepository {
  async hasServiceDependency(
    {
      organizationId,
      environmentId,
    },
    firstServiceId,
    secondServiceId
  ) {
    if (
      !mongoose.Types.ObjectId
        .isValid(
          firstServiceId
        ) ||
      !mongoose.Types.ObjectId
        .isValid(
          secondServiceId
        )
    ) {
      return false;
    }

    const dependency =
      await ServiceDependency
        .exists({
          organizationId,

          environmentId,

          active:
            true,

          $or: [
            {
              sourceServiceId:
                firstServiceId,

              targetServiceId:
                secondServiceId,
            },

            {
              sourceServiceId:
                secondServiceId,

              targetServiceId:
                firstServiceId,
            },
          ],
        });

    return Boolean(
      dependency
    );
  }

  async hasResourceRelationship(
    {
      organizationId,
      environmentId,
    },
    firstNode,
    secondNode
  ) {
    if (
      !firstNode ||
      !secondNode
    ) {
      return false;
    }

    if (
      !mongoose.Types.ObjectId
        .isValid(
          firstNode.id
        ) ||
      !mongoose.Types.ObjectId
        .isValid(
          secondNode.id
        )
    ) {
      return false;
    }

    const relationship =
      await ResourceRelationship
        .exists({
          organizationId,

          environmentId,

          active:
            true,

          $or: [
            {
              sourceType:
                firstNode.type,

              sourceId:
                firstNode.id,

              targetType:
                secondNode.type,

              targetId:
                secondNode.id,
            },

            {
              sourceType:
                secondNode.type,

              sourceId:
                secondNode.id,

              targetType:
                firstNode.type,

              targetId:
                firstNode.id,
            },
          ],
        });

    return Boolean(
      relationship
    );
  }
}

module.exports =
  MongoCorrelationTopologyRepository;