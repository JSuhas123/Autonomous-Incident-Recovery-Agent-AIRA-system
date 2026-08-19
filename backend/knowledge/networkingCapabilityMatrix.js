'use strict';

const NETWORKING_CAPABILITIES =
  Object.freeze([
    {
      capability:
        'CONNECTIVITY_INSPECTION',
      handlerKey:
        'networking/check_connectivity',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-SERVICE-UNREACHABLE-001',
        'PB-NET-CONNECTION-REFUSED-001',
        'PB-NET-CONNECTION-TIMEOUT-001',
      ],
    },

    {
      capability:
        'DNS_RESOLUTION',
      handlerKey:
        'networking/check_dns',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-DNS-FAILURE-001',
      ],
    },

    {
      capability:
        'LATENCY_MEASUREMENT',
      handlerKey:
        'networking/check_latency',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-HIGH-LATENCY-001',
      ],
    },

    {
      capability:
        'PACKET_LOSS_MEASUREMENT',
      handlerKey:
        'networking/check_packet_loss',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-PACKET-LOSS-001',
      ],
    },

    {
      capability:
        'PORT_CONNECTIVITY',
      handlerKey:
        'networking/check_port',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-PORT-UNREACHABLE-001',
      ],
    },

    {
      capability:
        'ROUTE_INSPECTION',
      handlerKey:
        'networking/check_route',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-ROUTE-FAILURE-001',
      ],
    },

    {
      capability:
        'TLS_INSPECTION',
      handlerKey:
        'networking/check_tls',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-TLS-EXPIRY-001',
        'PB-NET-CERTIFICATE-CHAIN-FAILURE-001',
      ],
    },

    {
      capability:
        'UPSTREAM_HEALTH',
      handlerKey:
        'networking/check_upstream',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-UPSTREAM-UNAVAILABLE-001',
      ],
    },

    {
      capability:
        'LOAD_BALANCER_HEALTH',
      handlerKey:
        'networking/check_load_balancer',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-LOAD-BALANCER-UNHEALTHY-001',
      ],
    },

    {
      capability:
        'EGRESS_CONNECTIVITY',
      handlerKey:
        'networking/check_egress',
      mode:
        'OBSERVE',
      required:
        true,
      affectedPlaybooks: [
        'PB-NET-NAT-EGRESS-FAILURE-001',
      ],
    },
  ]);


function buildNetworkingCapabilityMatrix(
  registeredActions = []
) {
  const registered =
    new Set(
      registeredActions
    );

  const capabilities =
    NETWORKING_CAPABILITIES.map(
      capability => ({
        ...capability,
        available:
          registered.has(
            capability.handlerKey
          ),
      })
    );

  const available =
    capabilities.filter(
      capability =>
        capability.available
    );

  const missing =
    capabilities.filter(
      capability =>
        !capability.available
    );

  const requiredMissing =
    missing.filter(
      capability =>
        capability.required
    );

  return {
    domain:
      'NETWORKING',

    capabilities,
    available,
    missing,
    requiredMissing,

    stats: {
      total:
        capabilities.length,
      available:
        available.length,
      missing:
        missing.length,
      requiredMissing:
        requiredMissing.length,
    },

    ready:
      requiredMissing.length ===
      0,
  };
}


module.exports = {
  NETWORKING_CAPABILITIES,
  buildNetworkingCapabilityMatrix,
};