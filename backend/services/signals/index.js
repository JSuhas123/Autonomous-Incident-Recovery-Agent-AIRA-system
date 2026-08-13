"use strict";

const signalNormalizationService =
  require(
    "./signalNormalizationService"
  );

const signalDeduplicationService =
  require(
    "./signalDeduplicationService"
  );

const signalEnrichmentService =
  require(
    "./signalEnrichmentService"
  );

const signalCorrelationService =
  require(
    "./signalCorrelationService"
  );

const signalCorrelationGroupService =
  require(
    "./signalCorrelationGroupService"
  );

const signalRouterService =
  require(
    "./signalRouterService"
  );

const signalIngestionService =
  require(
    "./signalIngestionService"
  );

module.exports = {
  signalNormalizationService,

  signalDeduplicationService,

  signalEnrichmentService,

  signalCorrelationService,

  signalCorrelationGroupService,

  signalRouterService,

  signalIngestionService,
};