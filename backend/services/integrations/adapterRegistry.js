"use strict";

const { UnsupportedOperationError } = require("./adapterInterface");

const ADAPTERS = {
  webhook_incoming:       require("./adapters/webhookIncomingAdapter"),
  webhook_outgoing:       require("./adapters/webhookOutgoingAdapter"),
  prometheus_alertmanager: require("./adapters/prometheusAlertmanagerAdapter"),
  grafana_alerting:       require("./adapters/grafanaAlertingAdapter"),
};

/**
 * Resolve an adapter for `provider`.
 * Throws 501 UnsupportedOperationError for unimplemented providers.
 */
function getAdapter(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new UnsupportedOperationError(provider, "getAdapter");
  }
  return adapter;
}

module.exports = { getAdapter, ADAPTERS };
