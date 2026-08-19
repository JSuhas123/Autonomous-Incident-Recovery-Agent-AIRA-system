'use strict';

/**
 * Phase 13 — Kubernetes Catalogue Expansion Pack
 *
 * This file contains DATA ONLY.
 *
 * It does not:
 * - write files
 * - execute infrastructure
 * - activate runbooks
 * - modify existing catalogue definitions
 *
 * The generator consumes these definitions and renders canonical AIRA YAML.
 *
 * Phase 13.8:
 * - Kubernetes pod investigation
 * - Deployment investigation/recovery orchestration
 * - Node investigation
 * - PersistentVolumeClaim investigation
 * - Cluster DNS investigation
 * - Service endpoint investigation
 * - Ingress investigation
 */

const KUBERNETES_RUNBOOKS = Object.freeze([
  // ==========================================================================
  // POD INVESTIGATION / VERIFICATION
  // ==========================================================================

  {
    file:
      'kubernetes/rb-k8s-investigate-crashloop.yaml',

    runbookId:
      'RB-K8S-INVESTIGATE-CRASHLOOP',

    name:
      'Kubernetes CrashLoop Investigation',

    description:
      'Read-only investigation of a pod repeatedly restarting or entering CrashLoopBackOff.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'pod',

        type:
          'string',

        required:
          true,

        description:
          'Name of the affected Kubernetes pod.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the affected pod.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Get pod detail',

        order:
          1,

        type:
          'kubernetes',

        action:
          'get_pod',

        params: {
          pod:
            '${pod}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Collect recent Kubernetes events',

        order:
          2,

        type:
          'kubernetes',

        action:
          'get_events',

        params: {
          pod:
            '${pod}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },

      {
        id:
          'step-03',

        name:
          'Collect current container logs',

        order:
          3,

        type:
          'kubernetes',

        action:
          'get_logs',

        params: {
          pod:
            '${pod}',

          namespace:
            '${namespace}',

          tailLines:
            100,
        },

        failurePolicy:
          'CONTINUE',
      },

      {
        id:
          'step-04',

        name:
          'Collect previous container logs',

        order:
          4,

        type:
          'kubernetes',

        action:
          'get_logs',

        params: {
          pod:
            '${pod}',

          namespace:
            '${namespace}',

          tailLines:
            100,

          previous:
            true,
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ANY',

      timeoutSeconds:
        30,

      checks: [
        {
          id:
            'check-01',

          type:
            'pod_ready',

          description:
            'Capture current pod readiness state.',

          params: {
            pod:
              '${pod}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            30,

          optional:
            true,
        },
      ],
    },
  },

  {
    file:
      'kubernetes/rb-k8s-verify-pod-recovery.yaml',

    runbookId:
      'RB-K8S-VERIFY-POD-RECOVERY',

    name:
      'Kubernetes Pod Recovery Verification',

    description:
      'Read-only verification that a Kubernetes pod is Running and Ready after recovery.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'pod',

        type:
          'string',

        required:
          true,

        description:
          'Name of the pod to verify.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the pod.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Check pod readiness',

        order:
          1,

        type:
          'kubernetes',

        action:
          'check_pod_ready',

        params: {
          pod:
            '${pod}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Collect pod detail after recovery',

        order:
          2,

        type:
          'kubernetes',

        action:
          'get_pod',

        params: {
          pod:
            '${pod}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ALL',

      timeoutSeconds:
        120,

      checks: [
        {
          id:
            'check-01',

          type:
            'pod_ready',

          description:
            'Pod must be Running and Ready.',

          params: {
            pod:
              '${pod}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            120,
        },
      ],
    },
  },

  // ==========================================================================
  // DEPLOYMENT INVESTIGATION
  // ==========================================================================

  {
    file:
      'kubernetes/rb-k8s-investigate-deployment.yaml',

    runbookId:
      'RB-K8S-INVESTIGATE-DEPLOYMENT',

    name:
      'Kubernetes Deployment Investigation',

    description:
      'Read-only investigation of deployment health, replica availability and rollout state.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'deployment',

        type:
          'string',

        required:
          true,

        description:
          'Name of the Kubernetes Deployment.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the deployment.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Get deployment detail',

        order:
          1,

        type:
          'kubernetes',

        action:
          'get_deployment',

        params: {
          resource:
            '${deployment}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Get deployment status',

        order:
          2,

        type:
          'kubernetes',

        action:
          'get_deployment_status',

        params: {
          resource:
            '${deployment}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ANY',

      timeoutSeconds:
        30,

      checks: [
        {
          id:
            'check-01',

          type:
            'deployment_available',

          description:
            'Capture current deployment availability.',

          params: {
            deployment:
              '${deployment}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            30,

          optional:
            true,
        },
      ],
    },
  },

  // ==========================================================================
  // NODE
  // ==========================================================================

  {
    file:
      'kubernetes/rb-k8s-verify-node.yaml',

    runbookId:
      'RB-K8S-VERIFY-NODE',

    name:
      'Kubernetes Node State Verification',

    description:
      'Read-only verification of Kubernetes node readiness after investigation or remediation.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'node',

        type:
          'string',

        required:
          true,

        description:
          'Kubernetes node to verify.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Get node state',

        order:
          1,

        type:
          'kubernetes',

        action:
          'get_node',

        params: {
          node:
            '${node}',
        },

        failurePolicy:
          'STOP',
      },
    ],

    verification: {
      strategy:
        'ALL',

      timeoutSeconds:
        60,

      checks: [
        {
          id:
            'check-01',

          type:
            'node_ready',

          description:
            'Evaluate current node readiness.',

          params: {
            node:
              '${node}',
          },

          timeoutSeconds:
            60,
        },
      ],
    },
  },

  // ==========================================================================
  // PERSISTENT VOLUME CLAIM
  // ==========================================================================

  {
    file:
      'kubernetes/rb-k8s-investigate-pvc.yaml',

    runbookId:
      'RB-K8S-INVESTIGATE-PVC',

    name:
      'Kubernetes PersistentVolumeClaim Investigation',

    description:
      'Read-only investigation of a Kubernetes PersistentVolumeClaim that is Pending, Lost, unbound, or otherwise unhealthy.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'pvc',

        type:
          'string',

        required:
          true,

        description:
          'Name of the affected PersistentVolumeClaim.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the PersistentVolumeClaim.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Get PersistentVolumeClaim state',

        order:
          1,

        type:
          'kubernetes',

        action:
          'get_pvc',

        params: {
          resource:
            '${pvc}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Check PersistentVolumeClaim binding',

        order:
          2,

        type:
          'kubernetes',

        action:
          'check_pvc_bound',

        params: {
          resource:
            '${pvc}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ANY',

      timeoutSeconds:
        30,

      checks: [
        {
          id:
            'check-01',

          type:
            'pvc_bound',

          description:
            'Capture whether the PersistentVolumeClaim is currently Bound.',

          params: {
            pvc:
              '${pvc}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            30,

          optional:
            true,
        },
      ],
    },
  },

  {
    file:
      'kubernetes/rb-k8s-verify-pvc.yaml',

    runbookId:
      'RB-K8S-VERIFY-PVC',

    name:
      'Kubernetes PersistentVolumeClaim Recovery Verification',

    description:
      'Read-only verification that a Kubernetes PersistentVolumeClaim has reached the Bound state.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'pvc',

        type:
          'string',

        required:
          true,

        description:
          'PersistentVolumeClaim to verify.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the PersistentVolumeClaim.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Check PersistentVolumeClaim binding',

        order:
          1,

        type:
          'kubernetes',

        action:
          'check_pvc_bound',

        params: {
          resource:
            '${pvc}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Collect final PersistentVolumeClaim state',

        order:
          2,

        type:
          'kubernetes',

        action:
          'get_pvc',

        params: {
          resource:
            '${pvc}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ALL',

      timeoutSeconds:
        60,

      checks: [
        {
          id:
            'check-01',

          type:
            'pvc_bound',

          description:
            'PersistentVolumeClaim must be Bound.',

          params: {
            pvc:
              '${pvc}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            60,
        },
      ],
    },
  },

  // ==========================================================================
  // CLUSTER DNS
  // ==========================================================================

  {
    file:
      'kubernetes/rb-k8s-investigate-dns.yaml',

    runbookId:
      'RB-K8S-INVESTIGATE-DNS',

    name:
      'Kubernetes Cluster DNS Investigation',

    description:
      'Read-only investigation of Kubernetes cluster DNS health using DNS Service and endpoint evidence.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'namespace',

        type:
          'string',

        required:
          false,

        description:
          'Namespace containing the cluster DNS Service. Defaults to kube-system.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Check Kubernetes DNS health',

        order:
          1,

        type:
          'kubernetes',

        action:
          'check_dns',

        params: {
          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },
    ],

    verification: {
      strategy:
        'ALL',

      timeoutSeconds:
        30,

      checks: [
        {
          id:
            'check-01',

          type:
            'dns_healthy',

          description:
            'Cluster DNS Service must expose the DNS port and have ready backing endpoints.',

          params: {
            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            30,
        },
      ],
    },
  },

  // ==========================================================================
  // SERVICE / ENDPOINTS
  // ==========================================================================

  {
    file:
      'kubernetes/rb-k8s-investigate-service.yaml',

    runbookId:
      'RB-K8S-INVESTIGATE-SERVICE',

    name:
      'Kubernetes Service Endpoint Investigation',

    description:
      'Read-only investigation of Kubernetes Service configuration and its ready or not-ready backing endpoints.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'service',

        type:
          'string',

        required:
          true,

        description:
          'Name of the affected Kubernetes Service.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the Service.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Get Service configuration',

        order:
          1,

        type:
          'kubernetes',

        action:
          'get_service',

        params: {
          resource:
            '${service}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Get Service endpoints',

        order:
          2,

        type:
          'kubernetes',

        action:
          'get_endpoints',

        params: {
          resource:
            '${service}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },

      {
        id:
          'step-03',

        name:
          'Evaluate ready Service endpoints',

        order:
          3,

        type:
          'kubernetes',

        action:
          'check_service_endpoints',

        params: {
          resource:
            '${service}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ANY',

      timeoutSeconds:
        30,

      checks: [
        {
          id:
            'check-01',

          type:
            'service_endpoints_ready',

          description:
            'Capture whether the Service currently has usable ready endpoints.',

          params: {
            service:
              '${service}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            30,

          optional:
            true,
        },
      ],
    },
  },

  {
    file:
      'kubernetes/rb-k8s-verify-service-endpoints.yaml',

    runbookId:
      'RB-K8S-VERIFY-SERVICE-ENDPOINTS',

    name:
      'Kubernetes Service Endpoint Verification',

    description:
      'Read-only verification that a Kubernetes Service has usable ready endpoints.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'service',

        type:
          'string',

        required:
          true,

        description:
          'Kubernetes Service to verify.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the Service.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Check ready Service endpoints',

        order:
          1,

        type:
          'kubernetes',

        action:
          'check_service_endpoints',

        params: {
          resource:
            '${service}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Collect final endpoint state',

        order:
          2,

        type:
          'kubernetes',

        action:
          'get_endpoints',

        params: {
          resource:
            '${service}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ALL',

      timeoutSeconds:
        60,

      checks: [
        {
          id:
            'check-01',

          type:
            'service_endpoints_ready',

          description:
            'Service must expose usable ready endpoints.',

          params: {
            service:
              '${service}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            60,
        },
      ],
    },
  },

  // ==========================================================================
  // INGRESS
  // ==========================================================================

  {
    file:
      'kubernetes/rb-k8s-investigate-ingress.yaml',

    runbookId:
      'RB-K8S-INVESTIGATE-INGRESS',

    name:
      'Kubernetes Ingress Investigation',

    description:
      'Read-only investigation of Kubernetes Ingress routing, TLS configuration, backend Services, and observed load-balancer state.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'ingress',

        type:
          'string',

        required:
          true,

        description:
          'Name of the affected Kubernetes Ingress.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the Ingress.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Get Ingress configuration',

        order:
          1,

        type:
          'kubernetes',

        action:
          'get_ingress',

        params: {
          resource:
            '${ingress}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Evaluate Ingress routing configuration',

        order:
          2,

        type:
          'kubernetes',

        action:
          'check_ingress',

        params: {
          resource:
            '${ingress}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ANY',

      timeoutSeconds:
        30,

      checks: [
        {
          id:
            'check-01',

          type:
            'ingress_configured',

          description:
            'Capture whether the Ingress currently contains usable routing configuration.',

          params: {
            ingress:
              '${ingress}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            30,

          optional:
            true,
        },
      ],
    },
  },

  {
    file:
      'kubernetes/rb-k8s-verify-ingress.yaml',

    runbookId:
      'RB-K8S-VERIFY-INGRESS',

    name:
      'Kubernetes Ingress Configuration Verification',

    description:
      'Read-only verification that a Kubernetes Ingress retains usable routing configuration after investigation or recovery.',

    lifecycle:
      'ACTIVE',

    risk: {
      level:
        'LOW',

      blastRadius:
        'none',

      reversible:
        true,
    },

    parameters: [
      {
        name:
          'ingress',

        type:
          'string',

        required:
          true,

        description:
          'Kubernetes Ingress to verify.',
      },

      {
        name:
          'namespace',

        type:
          'string',

        required:
          true,

        description:
          'Namespace containing the Ingress.',
      },
    ],

    steps: [
      {
        id:
          'step-01',

        name:
          'Check Ingress routing configuration',

        order:
          1,

        type:
          'kubernetes',

        action:
          'check_ingress',

        params: {
          resource:
            '${ingress}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'STOP',
      },

      {
        id:
          'step-02',

        name:
          'Collect final Ingress state',

        order:
          2,

        type:
          'kubernetes',

        action:
          'get_ingress',

        params: {
          resource:
            '${ingress}',

          namespace:
            '${namespace}',
        },

        failurePolicy:
          'CONTINUE',
      },
    ],

    verification: {
      strategy:
        'ALL',

      timeoutSeconds:
        60,

      checks: [
        {
          id:
            'check-01',

          type:
            'ingress_configured',

          description:
            'Ingress must retain usable routing configuration.',

          params: {
            ingress:
              '${ingress}',

            namespace:
              '${namespace}',
          },

          timeoutSeconds:
            60,
        },
      ],
    },
  },
]);


// ============================================================================
// PLAYBOOK DEFINITIONS
// ============================================================================

const KUBERNETES_PLAYBOOKS = Object.freeze([
  // ==========================================================================
  // DEPLOYMENT
  // ==========================================================================

  {
    file:
      'kubernetes/pb-k8s-deployment-restart-001.yaml',

    playbookId:
      'PB-K8S-DEPLOYMENT-RESTART-001',

    semver:
      '1.0.0',

    name:
      'Kubernetes Unhealthy Deployment Restart',

    description:
      'Investigates an unhealthy Kubernetes Deployment, performs a controlled restart when approved, and verifies recovery.',

    lifecycle:
      'DRAFT',

    incident: {
      types: [
        'DeploymentUnhealthy',
        'kubernetes.deployment.unhealthy',
        'DeploymentUnavailable',
      ],

      severities: [
        'P1',
        'P2',
        'critical',
        'high',
      ],

      providers: [
        'kubernetes',
        'k8s',
      ],

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence: [
      'resource.deployment',
      'resource.namespace',
    ],

    minimumConfidence:
      0.75,

    risk: {
      level:
        'HIGH',

      blastRadius:
        'deployment',
    },

    approvalMode:
      'CONDITIONAL',

    stages: [
      {
        id:
          'investigate-deployment',

        order:
          1,

        name:
          'Investigate Deployment',

        type:
          'INVESTIGATION',

        failurePolicy:
          'STOP',

        runbooks: [
          {
            runbookId:
              'RB-K8S-INVESTIGATE-DEPLOYMENT',

            required:
              true,

            parameterMappings: {
              deployment:
                '${incident.resource.deployment}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },

      {
        id:
          'restart-deployment',

        order:
          2,

        name:
          'Restart Unhealthy Deployment',

        type:
          'RECOVERY',

        failurePolicy:
          'ESCALATE',

        requiresApproval:
          true,

        runbooks: [
          {
            runbookId:
              'RB-K8S-RESTART-DEPLOYMENT',

            required:
              true,

            parameterMappings: {
              deployment:
                '${incident.resource.deployment}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },

      {
        id:
          'verify-deployment',

        order:
          3,

        name:
          'Verify Deployment Recovery',

        type:
          'VERIFICATION',

        failurePolicy:
          'ESCALATE',

        runbooks: [
          {
            runbookId:
              'RB-K8S-VERIFY-DEPLOYMENT',

            required:
              true,

            parameterMappings: {
              deployment:
                '${incident.resource.deployment}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // NODE
  // ==========================================================================

  {
    file:
      'kubernetes/pb-k8s-node-degraded-001.yaml',

    playbookId:
      'PB-K8S-NODE-DEGRADED-001',

    semver:
      '1.0.0',

    name:
      'Kubernetes Node Degradation Investigation',

    description:
      'Investigates degraded Kubernetes nodes and verifies current node state without automatically performing cluster-wide mutation.',

    lifecycle:
      'DRAFT',

    incident: {
      types: [
        'NodeDegraded',
        'NodePressure',
        'kubernetes.node.degraded',
      ],

      severities: [
        'P1',
        'P2',
        'critical',
        'high',
      ],

      providers: [
        'kubernetes',
        'k8s',
      ],

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence: [
      'resource.node',
    ],

    minimumConfidence:
      0.75,

    risk: {
      level:
        'HIGH',

      blastRadius:
        'node',
    },

    approvalMode:
      'MANUAL',

    stages: [
      {
        id:
          'investigate-node',

        order:
          1,

        name:
          'Investigate Node',

        type:
          'INVESTIGATION',

        failurePolicy:
          'STOP',

        runbooks: [
          {
            runbookId:
              'RB-K8S-INVESTIGATE-NODE',

            required:
              true,

            parameterMappings: {
              node:
                '${incident.resource.node}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },

      {
        id:
          'verify-node',

        order:
          2,

        name:
          'Verify Node State',

        type:
          'VERIFICATION',

        failurePolicy:
          'ESCALATE',

        runbooks: [
          {
            runbookId:
              'RB-K8S-VERIFY-NODE',

            required:
              true,

            parameterMappings: {
              node:
                '${incident.resource.node}',
            },
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // PERSISTENT VOLUME CLAIM
  // ==========================================================================

  {
    file:
      'kubernetes/pb-k8s-pvc-pending-001.yaml',

    playbookId:
      'PB-K8S-PVC-PENDING-001',

    semver:
      '1.0.0',

    name:
      'Kubernetes PersistentVolumeClaim Pending Investigation',

    description:
      'Investigates an unbound or unhealthy PersistentVolumeClaim and verifies whether storage binding becomes healthy.',

    lifecycle:
      'DRAFT',

    incident: {
      types: [
        'PersistentVolumeClaimPending',
        'PVCPending',
        'PVCUnbound',
        'kubernetes.pvc.pending',
        'kubernetes.storage.pvc.unbound',
      ],

      severities: [
        'P1',
        'P2',
        'P3',
        'critical',
        'high',
        'medium',
      ],

      providers: [
        'kubernetes',
        'k8s',
      ],

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence: [
      'resource.pvc',
      'resource.namespace',
    ],

    minimumConfidence:
      0.7,

    risk: {
      level:
        'LOW',

      blastRadius:
        'persistent-volume-claim',
    },

    approvalMode:
      'NONE',

    stages: [
      {
        id:
          'investigate-pvc',

        order:
          1,

        name:
          'Investigate PersistentVolumeClaim',

        type:
          'INVESTIGATION',

        failurePolicy:
          'STOP',

        runbooks: [
          {
            runbookId:
              'RB-K8S-INVESTIGATE-PVC',

            required:
              true,

            parameterMappings: {
              pvc:
                '${incident.resource.pvc}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },

      {
        id:
          'verify-pvc',

        order:
          2,

        name:
          'Verify PersistentVolumeClaim State',

        type:
          'VERIFICATION',

        failurePolicy:
          'ESCALATE',

        runbooks: [
          {
            runbookId:
              'RB-K8S-VERIFY-PVC',

            required:
              true,

            parameterMappings: {
              pvc:
                '${incident.resource.pvc}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // CLUSTER DNS
  // ==========================================================================

  {
    file:
      'kubernetes/pb-k8s-dns-failure-001.yaml',

    playbookId:
      'PB-K8S-DNS-FAILURE-001',

    semver:
      '1.0.0',

    name:
      'Kubernetes Cluster DNS Failure Investigation',

    description:
      'Investigates Kubernetes cluster DNS health through DNS Service and endpoint evidence without executing commands inside application workloads.',

    lifecycle:
      'DRAFT',

    incident: {
      types: [
        'ClusterDNSFailure',
        'KubernetesDNSFailure',
        'DNSResolutionFailure',
        'kubernetes.dns.failure',
        'kubernetes.coredns.unhealthy',
      ],

      severities: [
        'P1',
        'P2',
        'critical',
        'high',
      ],

      providers: [
        'kubernetes',
        'k8s',
      ],

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence: [
      'provider.kubernetes',
    ],

    minimumConfidence:
      0.7,

    risk: {
      level:
        'LOW',

      blastRadius:
        'cluster-dns',
    },

    approvalMode:
      'NONE',

    stages: [
      {
        id:
          'investigate-dns',

        order:
          1,

        name:
          'Investigate Cluster DNS',

        type:
          'INVESTIGATION',

        failurePolicy:
          'STOP',

        runbooks: [
          {
            runbookId:
              'RB-K8S-INVESTIGATE-DNS',

            required:
              true,

            parameterMappings: {
              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // SERVICE / ENDPOINTS
  // ==========================================================================

  {
    file:
      'kubernetes/pb-k8s-service-endpoint-failure-001.yaml',

    playbookId:
      'PB-K8S-SERVICE-ENDPOINT-FAILURE-001',

    semver:
      '1.0.0',

    name:
      'Kubernetes Service Endpoint Failure Investigation',

    description:
      'Investigates Kubernetes Service configuration and backing endpoint availability, then verifies whether usable endpoints are present.',

    lifecycle:
      'DRAFT',

    incident: {
      types: [
        'ServiceUnavailable',
        'ServiceEndpointFailure',
        'ServiceHasNoEndpoints',
        'kubernetes.service.unavailable',
        'kubernetes.service.no_endpoints',
      ],

      severities: [
        'P1',
        'P2',
        'P3',
        'critical',
        'high',
        'medium',
      ],

      providers: [
        'kubernetes',
        'k8s',
      ],

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence: [
      'resource.service',
      'resource.namespace',
    ],

    minimumConfidence:
      0.7,

    risk: {
      level:
        'LOW',

      blastRadius:
        'service',
    },

    approvalMode:
      'NONE',

    stages: [
      {
        id:
          'investigate-service',

        order:
          1,

        name:
          'Investigate Service and Endpoints',

        type:
          'INVESTIGATION',

        failurePolicy:
          'STOP',

        runbooks: [
          {
            runbookId:
              'RB-K8S-INVESTIGATE-SERVICE',

            required:
              true,

            parameterMappings: {
              service:
                '${incident.resource.service}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },

      {
        id:
          'verify-service-endpoints',

        order:
          2,

        name:
          'Verify Service Endpoints',

        type:
          'VERIFICATION',

        failurePolicy:
          'ESCALATE',

        runbooks: [
          {
            runbookId:
              'RB-K8S-VERIFY-SERVICE-ENDPOINTS',

            required:
              true,

            parameterMappings: {
              service:
                '${incident.resource.service}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },
    ],
  },

  // ==========================================================================
  // INGRESS
  // ==========================================================================

  {
    file:
      'kubernetes/pb-k8s-ingress-failure-001.yaml',

    playbookId:
      'PB-K8S-INGRESS-FAILURE-001',

    semver:
      '1.0.0',

    name:
      'Kubernetes Ingress Routing Failure Investigation',

    description:
      'Investigates Kubernetes Ingress routing and load-balancer configuration and verifies that usable routing remains configured.',

    lifecycle:
      'DRAFT',

    incident: {
      types: [
        'IngressUnavailable',
        'IngressRoutingFailure',
        'IngressConfigurationFailure',
        'kubernetes.ingress.unavailable',
        'kubernetes.ingress.routing_failure',
      ],

      severities: [
        'P1',
        'P2',
        'P3',
        'critical',
        'high',
        'medium',
      ],

      providers: [
        'kubernetes',
        'k8s',
      ],

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence: [
      'resource.ingress',
      'resource.namespace',
    ],

    minimumConfidence:
      0.7,

    risk: {
      level:
        'LOW',

      blastRadius:
        'ingress',
    },

    approvalMode:
      'NONE',

    stages: [
      {
        id:
          'investigate-ingress',

        order:
          1,

        name:
          'Investigate Ingress',

        type:
          'INVESTIGATION',

        failurePolicy:
          'STOP',

        runbooks: [
          {
            runbookId:
              'RB-K8S-INVESTIGATE-INGRESS',

            required:
              true,

            parameterMappings: {
              ingress:
                '${incident.resource.ingress}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },

      {
        id:
          'verify-ingress',

        order:
          2,

        name:
          'Verify Ingress Configuration',

        type:
          'VERIFICATION',

        failurePolicy:
          'ESCALATE',

        runbooks: [
          {
            runbookId:
              'RB-K8S-VERIFY-INGRESS',

            required:
              true,

            parameterMappings: {
              ingress:
                '${incident.resource.ingress}',

              namespace:
                '${incident.resource.namespace}',
            },
          },
        ],
      },
    ],
  },
]);


module.exports = {
  KUBERNETES_RUNBOOKS,
  KUBERNETES_PLAYBOOKS,
};