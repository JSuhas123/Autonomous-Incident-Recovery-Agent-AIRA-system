"use strict";

const inventoryService =
  require(
    "./inventoryService"
  );

const resourceRelationshipService =
  require(
    "./resourceRelationshipService"
  );

const serviceDependencyService =
  require(
    "./serviceDependencyService"
  );

const topologyService =
  require(
    "./topologyService"
  );

const kubernetesInventoryAdapter =
  require(
    "./kubernetesInventoryAdapter"
  );

module.exports = {
  inventoryService,
  resourceRelationshipService,
  serviceDependencyService,
  topologyService,
  kubernetesInventoryAdapter,
};