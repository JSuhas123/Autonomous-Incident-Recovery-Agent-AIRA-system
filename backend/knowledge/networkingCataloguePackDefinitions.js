'use strict';

/**
 * Phase 13.12 — Networking Catalogue Expansion Pack
 *
 * DATA ONLY.
 *
 * This pack intentionally contains diagnostic/read-only knowledge.
 *
 * It does NOT:
 * - execute shell commands
 * - modify routes
 * - modify DNS
 * - modify firewalls
 * - modify load-balancers
 * - replace certificates
 * - mutate proxy configuration
 * - expose credentials
 */

const NETWORK_PARAMETER =
  Object.freeze({
    TARGET: {
      name:
        'targetId',

      type:
        'string',

      required:
        true,

      description:
        'Identifier of an explicitly registered external network diagnostic target.',
    },
  });


function targetParameters() {
  return [
    {
      ...NETWORK_PARAMETER.TARGET,
    },
  ];
}


function risk(
  level = 'LOW'
) {
  return {
    level,

    blastRadius:
      'none',

    reversible:
      true,
  };
}


function step({
  id,
  name,
  order,
  action,
  extraParams = {},
  failurePolicy = 'STOP',
}) {
  return {
    id,

    name,

    order,

    type:
      'networking',

    action,

    params: {
      targetId:
        '${targetId}',

      ...extraParams,
    },

    failurePolicy,
  };
}


function verification(
  description
) {
  return {
    strategy:
      'ALL',

    timeoutSeconds:
      30,

    checks: [
      {
        id:
          'check-01',

        type:
          'diagnostic_completed',

        description,

        timeoutSeconds:
          30,

        optional:
          false,
      },
    ],
  };
}


function runbook({
  file,
  runbookId,
  name,
  description,
  actions,
}) {
  return {
    file,

    runbookId,

    name,

    description,

    lifecycle:
      'ACTIVE',

    risk:
      risk(),

    parameters:
      targetParameters(),

    steps:
      actions.map(
        (
          action,
          index
        ) =>
          step({
            id:
              `step-${String(
                index + 1
              ).padStart(
                2,
                '0'
              )}`,

            name:
              action.name,

            order:
              index + 1,

            action:
              action.action,

            extraParams:
              action.extraParams ||
              {},

            failurePolicy:
              action.failurePolicy ||
              (
                index === 0
                  ? 'STOP'
                  : 'CONTINUE'
              ),
          })
      ),

    verification:
      verification(
        `${name} completed and returned diagnostic evidence.`
      ),
  };
}


// ============================================================================
// RUNBOOKS — 20
// ============================================================================

const NETWORKING_RUNBOOKS =
  Object.freeze([

    runbook({
      file:
        'networking/rb-net-investigate-connectivity.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-CONNECTIVITY',

      name:
        'Network Connectivity Investigation',

      description:
        'Investigates end-to-end connectivity for a registered network target without changing network state.',

      actions: [
        {
          name:
            'Check network connectivity',

          action:
            'check_connectivity',
        },

        {
          name:
            'Check target port reachability',

          action:
            'check_port',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-connectivity.yaml',

      runbookId:
        'RB-NET-VERIFY-CONNECTIVITY',

      name:
        'Network Connectivity Verification',

      description:
        'Verifies whether end-to-end connectivity is currently healthy.',

      actions: [
        {
          name:
            'Verify network connectivity',

          action:
            'check_connectivity',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-dns.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-DNS',

      name:
        'DNS Resolution Investigation',

      description:
        'Investigates DNS resolution and supporting connectivity without modifying DNS records.',

      actions: [
        {
          name:
            'Check DNS resolution',

          action:
            'check_dns',
        },

        {
          name:
            'Check network connectivity',

          action:
            'check_connectivity',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-dns.yaml',

      runbookId:
        'RB-NET-VERIFY-DNS',

      name:
        'DNS Resolution Verification',

      description:
        'Verifies DNS resolution after an incident without modifying records or resolvers.',

      actions: [
        {
          name:
            'Verify DNS resolution',

          action:
            'check_dns',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-latency.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-LATENCY',

      name:
        'Network Latency Investigation',

      description:
        'Investigates elevated network latency and supporting path evidence.',

      actions: [
        {
          name:
            'Measure network latency',

          action:
            'check_latency',
        },

        {
          name:
            'Check packet loss',

          action:
            'check_packet_loss',

          failurePolicy:
            'CONTINUE',
        },

        {
          name:
            'Inspect network route',

          action:
            'check_route',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-latency.yaml',

      runbookId:
        'RB-NET-VERIFY-LATENCY',

      name:
        'Network Latency Verification',

      description:
        'Verifies whether network latency has returned to acceptable conditions.',

      actions: [
        {
          name:
            'Verify network latency',

          action:
            'check_latency',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-packet-loss.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-PACKET-LOSS',

      name:
        'Network Packet Loss Investigation',

      description:
        'Investigates packet-loss conditions without changing routes or network devices.',

      actions: [
        {
          name:
            'Measure packet loss',

          action:
            'check_packet_loss',
        },

        {
          name:
            'Inspect route state',

          action:
            'check_route',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-packet-loss.yaml',

      runbookId:
        'RB-NET-VERIFY-PACKET-LOSS',

      name:
        'Network Packet Loss Verification',

      description:
        'Verifies whether packet loss has returned to acceptable conditions.',

      actions: [
        {
          name:
            'Verify packet loss',

          action:
            'check_packet_loss',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-port.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-PORT',

      name:
        'Network Port Reachability Investigation',

      description:
        'Investigates target port reachability and supporting connectivity evidence.',

      actions: [
        {
          name:
            'Check target port',

          action:
            'check_port',
        },

        {
          name:
            'Check network connectivity',

          action:
            'check_connectivity',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-port.yaml',

      runbookId:
        'RB-NET-VERIFY-PORT',

      name:
        'Network Port Reachability Verification',

      description:
        'Verifies target port reachability after an incident.',

      actions: [
        {
          name:
            'Verify target port',

          action:
            'check_port',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-route.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-ROUTE',

      name:
        'Network Route Investigation',

      description:
        'Inspects network routing evidence without modifying routing tables.',

      actions: [
        {
          name:
            'Inspect network route',

          action:
            'check_route',
        },

        {
          name:
            'Check end-to-end connectivity',

          action:
            'check_connectivity',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-route.yaml',

      runbookId:
        'RB-NET-VERIFY-ROUTE',

      name:
        'Network Route Verification',

      description:
        'Verifies network route health without changing routing state.',

      actions: [
        {
          name:
            'Verify network route',

          action:
            'check_route',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-tls.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-TLS',

      name:
        'TLS Connectivity Investigation',

      description:
        'Inspects TLS handshake and certificate-chain state without replacing certificates.',

      actions: [
        {
          name:
            'Inspect TLS state',

          action:
            'check_tls',
        },

        {
          name:
            'Check connectivity',

          action:
            'check_connectivity',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-tls.yaml',

      runbookId:
        'RB-NET-VERIFY-TLS',

      name:
        'TLS Connectivity Verification',

      description:
        'Verifies TLS handshake and certificate-chain health after an incident.',

      actions: [
        {
          name:
            'Verify TLS state',

          action:
            'check_tls',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-upstream.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-UPSTREAM',

      name:
        'Network Upstream Investigation',

      description:
        'Investigates upstream dependency health and reachability without modifying proxy configuration.',

      actions: [
        {
          name:
            'Check upstream health',

          action:
            'check_upstream',
        },

        {
          name:
            'Check target port',

          action:
            'check_port',

          failurePolicy:
            'CONTINUE',
        },

        {
          name:
            'Check connectivity',

          action:
            'check_connectivity',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-upstream.yaml',

      runbookId:
        'RB-NET-VERIFY-UPSTREAM',

      name:
        'Network Upstream Verification',

      description:
        'Verifies upstream dependency health after an incident.',

      actions: [
        {
          name:
            'Verify upstream health',

          action:
            'check_upstream',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-load-balancer.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-LOAD-BALANCER',

      name:
        'Load Balancer Health Investigation',

      description:
        'Investigates load-balancer and upstream health without modifying backend membership.',

      actions: [
        {
          name:
            'Inspect load-balancer health',

          action:
            'check_load_balancer',
        },

        {
          name:
            'Inspect upstream health',

          action:
            'check_upstream',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-load-balancer.yaml',

      runbookId:
        'RB-NET-VERIFY-LOAD-BALANCER',

      name:
        'Load Balancer Health Verification',

      description:
        'Verifies load-balancer health after an incident.',

      actions: [
        {
          name:
            'Verify load-balancer health',

          action:
            'check_load_balancer',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-investigate-egress.yaml',

      runbookId:
        'RB-NET-INVESTIGATE-EGRESS',

      name:
        'Network Egress Investigation',

      description:
        'Investigates outbound connectivity, routing, and DNS without modifying NAT or firewall state.',

      actions: [
        {
          name:
            'Check network egress',

          action:
            'check_egress',
        },

        {
          name:
            'Check DNS resolution',

          action:
            'check_dns',

          failurePolicy:
            'CONTINUE',
        },

        {
          name:
            'Inspect route',

          action:
            'check_route',

          failurePolicy:
            'CONTINUE',
        },
      ],
    }),


    runbook({
      file:
        'networking/rb-net-verify-egress.yaml',

      runbookId:
        'RB-NET-VERIFY-EGRESS',

      name:
        'Network Egress Verification',

      description:
        'Verifies outbound network connectivity after an incident.',

      actions: [
        {
          name:
            'Verify network egress',

          action:
            'check_egress',
        },
      ],
    }),
  ]);


// ============================================================================
// PLAYBOOK HELPERS
// ============================================================================

function runbookRef(
  runbookId
) {
  return {
    runbookId,

    required:
      true,

    parameterMappings: {
      targetId:
        '${incident.resource.targetId}',
    },
  };
}


function stage({
  id,
  order,
  name,
  type,
  runbooks,
  failurePolicy = 'STOP',
}) {
  return {
    id,

    order,

    name,

    type,

    failurePolicy,

    runbooks:
      runbooks.map(
        runbookRef
      ),
  };
}


function playbook({
  file,
  playbookId,
  name,
  description,
  incidentTypes,
  providers,
  stages,
  minimumConfidence = 0.75,
}) {
  return {
    file,

    playbookId,

    semver:
      '1.0.0',

    name,

    description,

    lifecycle:
      'DRAFT',

    incident: {
      types:
        incidentTypes,

      severities: [
        'P1',
        'P2',
        'critical',
        'high',
      ],

      providers,

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence: [
      'resource.targetId',
    ],

    minimumConfidence,

    risk: {
      level:
        'LOW',

      blastRadius:
        'network-target',
    },

    approvalMode:
      'MANUAL',

    stages,
  };
}


// ============================================================================
// NEW PLAYBOOKS — 12
//
// Existing physical Networking playbooks are deliberately NOT duplicated:
// - PB-NET-DNS-FAILURE-001
// - PB-NET-INGRESS-FAILURE-001
// - PB-NET-TLS-EXPIRY-001
// ============================================================================

const NETWORKING_PLAYBOOKS =
  Object.freeze([

    playbook({
      file:
        'networking/pb-net-service-unreachable-001.yaml',

      playbookId:
        'PB-NET-SERVICE-UNREACHABLE-001',

      name:
        'Network Service Unreachable Investigation',

      description:
        'Investigates an unreachable service using connectivity, DNS, port and verification diagnostics.',

      incidentTypes: [
        'ServiceUnreachable',
        'NetworkServiceUnavailable',
        'network.service.unreachable',
      ],

      providers: [
        'networking',
        'network',
      ],

      stages: [
        stage({
          id:
            'investigate-connectivity',

          order:
            1,

          name:
            'Investigate Connectivity',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-CONNECTIVITY',
            'RB-NET-INVESTIGATE-DNS',
            'RB-NET-INVESTIGATE-PORT',
          ],
        }),

        stage({
          id:
            'verify-connectivity',

          order:
            2,

          name:
            'Verify Connectivity',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-CONNECTIVITY',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-connection-refused-001.yaml',

      playbookId:
        'PB-NET-CONNECTION-REFUSED-001',

      name:
        'Network Connection Refused Investigation',

      description:
        'Investigates connection-refused failures using connectivity, port and upstream diagnostics.',

      incidentTypes: [
        'ConnectionRefused',
        'NetworkConnectionRefused',
        'network.connection.refused',
      ],

      providers: [
        'networking',
      ],

      stages: [
        stage({
          id:
            'investigate-refusal',

          order:
            1,

          name:
            'Investigate Connection Refusal',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-CONNECTIVITY',
            'RB-NET-INVESTIGATE-PORT',
            'RB-NET-INVESTIGATE-UPSTREAM',
          ],
        }),

        stage({
          id:
            'verify-port',

          order:
            2,

          name:
            'Verify Port Reachability',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-PORT',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-connection-timeout-001.yaml',

      playbookId:
        'PB-NET-CONNECTION-TIMEOUT-001',

      name:
        'Network Connection Timeout Investigation',

      description:
        'Investigates network timeout conditions using connectivity, latency and packet-loss diagnostics.',

      incidentTypes: [
        'ConnectionTimeout',
        'NetworkTimeout',
        'network.connection.timeout',
      ],

      providers: [
        'networking',
      ],

      stages: [
        stage({
          id:
            'investigate-timeout',

          order:
            1,

          name:
            'Investigate Connection Timeout',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-CONNECTIVITY',
            'RB-NET-INVESTIGATE-LATENCY',
            'RB-NET-INVESTIGATE-PACKET-LOSS',
          ],
        }),

        stage({
          id:
            'verify-connectivity',

          order:
            2,

          name:
            'Verify Connectivity',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-CONNECTIVITY',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-high-latency-001.yaml',

      playbookId:
        'PB-NET-HIGH-LATENCY-001',

      name:
        'Network High Latency Investigation',

      description:
        'Investigates elevated latency using latency, packet-loss and route diagnostics.',

      incidentTypes: [
        'NetworkHighLatency',
        'NetworkLatencyDegraded',
        'network.high_latency',
      ],

      providers: [
        'networking',
      ],

      stages: [
        stage({
          id:
            'investigate-latency',

          order:
            1,

          name:
            'Investigate Network Latency',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-LATENCY',
            'RB-NET-INVESTIGATE-PACKET-LOSS',
            'RB-NET-INVESTIGATE-ROUTE',
          ],
        }),

        stage({
          id:
            'verify-latency',

          order:
            2,

          name:
            'Verify Network Latency',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-LATENCY',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-packet-loss-001.yaml',

      playbookId:
        'PB-NET-PACKET-LOSS-001',

      name:
        'Network Packet Loss Investigation',

      description:
        'Investigates packet loss and routing conditions without network mutation.',

      incidentTypes: [
        'NetworkPacketLoss',
        'PacketLossHigh',
        'network.packet_loss',
      ],

      providers: [
        'networking',
      ],

      stages: [
        stage({
          id:
            'investigate-packet-loss',

          order:
            1,

          name:
            'Investigate Packet Loss',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-PACKET-LOSS',
            'RB-NET-INVESTIGATE-ROUTE',
          ],
        }),

        stage({
          id:
            'verify-packet-loss',

          order:
            2,

          name:
            'Verify Packet Loss',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-PACKET-LOSS',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-load-balancer-unhealthy-001.yaml',

      playbookId:
        'PB-NET-LOAD-BALANCER-UNHEALTHY-001',

      name:
        'Load Balancer Unhealthy Investigation',

      description:
        'Investigates load-balancer health and upstream availability without changing backend membership.',

      incidentTypes: [
        'LoadBalancerUnhealthy',
        'LoadBalancerBackendFailure',
        'network.load_balancer.unhealthy',
      ],

      providers: [
        'networking',
        'load-balancer',
      ],

      stages: [
        stage({
          id:
            'investigate-load-balancer',

          order:
            1,

          name:
            'Investigate Load Balancer',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-LOAD-BALANCER',
            'RB-NET-INVESTIGATE-UPSTREAM',
          ],
        }),

        stage({
          id:
            'verify-load-balancer',

          order:
            2,

          name:
            'Verify Load Balancer',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-LOAD-BALANCER',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-upstream-unavailable-001.yaml',

      playbookId:
        'PB-NET-UPSTREAM-UNAVAILABLE-001',

      name:
        'Network Upstream Unavailable Investigation',

      description:
        'Investigates unavailable upstream dependencies using upstream and connectivity diagnostics.',

      incidentTypes: [
        'UpstreamUnavailable',
        'UpstreamDependencyFailure',
        'network.upstream.unavailable',
      ],

      providers: [
        'networking',
        'proxy',
      ],

      stages: [
        stage({
          id:
            'investigate-upstream',

          order:
            1,

          name:
            'Investigate Upstream',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-UPSTREAM',
            'RB-NET-INVESTIGATE-CONNECTIVITY',
          ],
        }),

        stage({
          id:
            'verify-upstream',

          order:
            2,

          name:
            'Verify Upstream',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-UPSTREAM',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-route-failure-001.yaml',

      playbookId:
        'PB-NET-ROUTE-FAILURE-001',

      name:
        'Network Route Failure Investigation',

      description:
        'Investigates routing failures without modifying routing tables.',

      incidentTypes: [
        'NetworkRouteFailure',
        'RouteUnavailable',
        'network.route.failure',
      ],

      providers: [
        'networking',
      ],

      stages: [
        stage({
          id:
            'investigate-route',

          order:
            1,

          name:
            'Investigate Network Route',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-ROUTE',
            'RB-NET-INVESTIGATE-CONNECTIVITY',
          ],
        }),

        stage({
          id:
            'verify-route',

          order:
            2,

          name:
            'Verify Network Route',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-ROUTE',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-port-unreachable-001.yaml',

      playbookId:
        'PB-NET-PORT-UNREACHABLE-001',

      name:
        'Network Port Unreachable Investigation',

      description:
        'Investigates inaccessible network ports without changing firewall or service configuration.',

      incidentTypes: [
        'PortUnreachable',
        'NetworkPortFailure',
        'network.port.unreachable',
      ],

      providers: [
        'networking',
      ],

      stages: [
        stage({
          id:
            'investigate-port',

          order:
            1,

          name:
            'Investigate Port Reachability',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-PORT',
            'RB-NET-INVESTIGATE-CONNECTIVITY',
          ],
        }),

        stage({
          id:
            'verify-port',

          order:
            2,

          name:
            'Verify Port Reachability',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-PORT',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-nat-egress-failure-001.yaml',

      playbookId:
        'PB-NET-NAT-EGRESS-FAILURE-001',

      name:
        'NAT and Network Egress Failure Investigation',

      description:
        'Investigates outbound connectivity failures using egress, DNS and routing diagnostics.',

      incidentTypes: [
        'NetworkEgressFailure',
        'NATGatewayFailure',
        'network.egress.failure',
      ],

      providers: [
        'networking',
        'cloud-networking',
      ],

      stages: [
        stage({
          id:
            'investigate-egress',

          order:
            1,

          name:
            'Investigate Network Egress',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-EGRESS',
            'RB-NET-INVESTIGATE-DNS',
            'RB-NET-INVESTIGATE-ROUTE',
          ],
        }),

        stage({
          id:
            'verify-egress',

          order:
            2,

          name:
            'Verify Network Egress',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-EGRESS',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-proxy-upstream-failure-001.yaml',

      playbookId:
        'PB-NET-PROXY-UPSTREAM-FAILURE-001',

      name:
        'Proxy Upstream Failure Investigation',

      description:
        'Investigates proxy-to-upstream failures using upstream, port and TLS diagnostics.',

      incidentTypes: [
        'ProxyUpstreamFailure',
        'ReverseProxyUpstreamUnavailable',
        'network.proxy.upstream_failure',
      ],

      providers: [
        'networking',
        'proxy',
      ],

      stages: [
        stage({
          id:
            'investigate-proxy-upstream',

          order:
            1,

          name:
            'Investigate Proxy Upstream',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-UPSTREAM',
            'RB-NET-INVESTIGATE-PORT',
            'RB-NET-INVESTIGATE-TLS',
          ],
        }),

        stage({
          id:
            'verify-upstream',

          order:
            2,

          name:
            'Verify Upstream',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-UPSTREAM',
          ],
        }),
      ],
    }),


    playbook({
      file:
        'networking/pb-net-certificate-chain-failure-001.yaml',

      playbookId:
        'PB-NET-CERTIFICATE-CHAIN-FAILURE-001',

      name:
        'TLS Certificate Chain Failure Investigation',

      description:
        'Investigates certificate-chain and TLS handshake failures without modifying certificates.',

      incidentTypes: [
        'TLSCertificateChainFailure',
        'CertificateValidationFailure',
        'network.tls.chain_failure',
      ],

      providers: [
        'networking',
        'tls',
      ],

      stages: [
        stage({
          id:
            'investigate-tls',

          order:
            1,

          name:
            'Investigate TLS',

          type:
            'INVESTIGATION',

          runbooks: [
            'RB-NET-INVESTIGATE-TLS',
          ],
        }),

        stage({
          id:
            'verify-tls',

          order:
            2,

          name:
            'Verify TLS',

          type:
            'VERIFICATION',

          failurePolicy:
            'ESCALATE',

          runbooks: [
            'RB-NET-VERIFY-TLS',
          ],
        }),
      ],
    }),
  ]);


module.exports = {
  NETWORKING_RUNBOOKS,
  NETWORKING_PLAYBOOKS,
};