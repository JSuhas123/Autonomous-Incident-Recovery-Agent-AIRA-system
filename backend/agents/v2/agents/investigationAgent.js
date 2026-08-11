"use strict";

/**
 * Investigation Agent
 *
 * Collects the evidence needed to diagnose an incident.
 * Uses READ-ONLY operations exclusively.
 *
 * SAFETY INVARIANTS:
 * - NO infrastructure mutation
 * - NO playbook/runbook execution
 * - NO direct Kubernetes mutation API access
 * - Kubernetes evidence comes from read-only inventory/topology tools
 * - Legacy k8sService is read-only fallback only
 * - Evidence is reduced before being exposed downstream
 */

const {
  BaseAgent,
} = require("../runtime/baseAgent");

const {
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  createEvidenceItem,
  createEvidencePackage,
} = require("../contracts/agentContracts");

const {
  getReasoningProvider,
} = require("../runtime/reasoningProvider");

const AGENT_NAME =
  "InvestigationAgent";

const AGENT_VERSION =
  "2.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Investigation Agent
// ─────────────────────────────────────────────────────────────────────────────

class InvestigationAgent
  extends BaseAgent {

  constructor(
    config = {}
  ) {
    super(
      AGENT_NAME,
      AGENT_VERSION
    );

    this._config =
      config;

    this._reasoning =
      config.reasoningProvider ||
      null;
  }

  async execute(
    context,
    dependencies = {}
  ) {
    const startedAt =
      new Date();

    try {
      const {
        incidentId,
        correlationId,
        tenantId,
        incident,
        service,
        resource,
        environment,
      } = context;

      const evidenceItems =
        [];

      const missing =
        [];

      // ───────────────────────────────────────────────────────────────────────
      // 1. Kubernetes evidence
      //
      // Preferred:
      // KubernetesInvestigationTools → persisted inventory/topology.
      //
      // Fallback:
      // legacy read-only k8sService.
      // ───────────────────────────────────────────────────────────────────────

      await _collectK8sEvidence(
        {
          incidentId,
          correlationId,
          tenantId,
          incident,
          resource,
          service,

          provider:
            context.provider,

          integrationId:
            context.integrationId,
        },

        dependencies,

        evidenceItems,

        missing
      );

      // ───────────────────────────────────────────────────────────────────────
      // 2. Monitoring / metrics
      // ───────────────────────────────────────────────────────────────────────

      await _collectMonitoringEvidence(
        {
          incidentId,
          correlationId,
          service,
          resource,
        },

        dependencies,

        evidenceItems,

        missing
      );

      // ───────────────────────────────────────────────────────────────────────
      // 3. Historical incidents / IncidentMemory
      // ───────────────────────────────────────────────────────────────────────

      await _collectHistoricalEvidence(
        {
          tenantId,
          incidentId,
          correlationId,
          incident,
        },

        dependencies,

        evidenceItems,

        missing
      );

      // ───────────────────────────────────────────────────────────────────────
      // 4. Deployment history
      // ───────────────────────────────────────────────────────────────────────

      await _collectDeploymentEvidence(
        {
          service,
          resource,
          incidentId,
          correlationId,
        },

        dependencies,

        evidenceItems,

        missing
      );

      // ───────────────────────────────────────────────────────────────────────
      // Evidence reduction
      //
      // Never send unrestricted topology/log/event payloads to reasoning.
      // ───────────────────────────────────────────────────────────────────────

      const reducedEvidenceItems =
        reduceEvidencePackage(
          evidenceItems,
          _resolveEvidenceBudgets(
            this._config
          )
        );

      // ───────────────────────────────────────────────────────────────────────
      // 5. AI reasoning
      //
      // AI assesses evidence completeness only.
      // It does NOT execute or recommend direct mutation here.
      // ───────────────────────────────────────────────────────────────────────

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider.reason({
          task:
            "investigation",

          systemInstructions:
            INVESTIGATION_SYSTEM_PROMPT,

          structuredInput: {
            incident,

            service,

            resource,

            environment,

            collectedEvidenceTypes:
              reducedEvidenceItems.map(
                (evidence) =>
                  evidence.type
              ),

            evidence:
              reducedEvidenceItems.map(
                (evidence) => ({
                  id:
                    evidence.id,

                  type:
                    evidence.type,

                  source:
                    evidence.source,

                  summary:
                    evidence.summary,

                  structuredData:
                    evidence
                      .structuredData,
                })
              ),

            missingEvidence:
              missing,

            signalCount:
              (
                context.signals ||
                []
              ).length +
              (
                context.alerts ||
                []
              ).length,
          },

          outputSchema: {
            required: [
              "completeness",
              "recommendedNextEvidence",
            ],

            properties: {
              completeness: {
                type:
                  "number",
              },

              missingEvidence: {
                type:
                  "array",
              },

              staleEvidence: {
                type:
                  "array",
              },

              conflicts: {
                type:
                  "array",
              },

              recommendedNextEvidence: {
                type:
                  "array",
              },
            },
          },

          metadata: {
            incidentId,
            correlationId,
          },
        });

      const aiOutput =
        reasoning.output ||
        {};

      const completeness =
        typeof aiOutput
          .completeness ===
        "number"
          ? aiOutput
              .completeness
          : _estimateCompleteness(
              reducedEvidenceItems,
              missing
            );

      const evidencePackage =
        createEvidencePackage({
          incidentId,

          correlationId,

          items:
            reducedEvidenceItems,

          completeness,

          missingEvidence:
            aiOutput
              .missingEvidence ||
            missing,

          staleEvidence:
            aiOutput
              .staleEvidence ||
            [],

          conflicts:
            aiOutput
              .conflicts ||
            [],

          recommendedNextEvidence:
            aiOutput
              .recommendedNextEvidence ||
            [],
        });

      return this._success(
        startedAt,

        {
          evidencePackage,
        },

        {
          confidence:
            completeness,

          evidenceUsed:
            reducedEvidenceItems.map(
              (evidence) =>
                evidence.id
            ),

          model:
            reasoning
              .modelMetadata
              ?.model,

          provider:
            reasoning
              .modelMetadata
              ?.provider,

          fallbackUsed:
            reasoning
              .fallbackUsed,

          warnings:
            reasoning
              .warnings ||
            [],
        }
      );
    } catch (
      error
    ) {
      return this._fail(
        startedAt,
        error
      );
    }
  }

  validateOutput(
    record
  ) {
    const base =
      super.validateOutput(
        record
      );

    if (!base.valid) {
      return base;
    }

    return {
      valid:
        true,

      errors:
        [],
    };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),

      reads: [
        "kubernetes.inventory",
        "kubernetes.topology",
        "kubernetes.pods",
        "kubernetes.replicasets",
        "kubernetes.deployments",
        "kubernetes.services",
        "kubernetes.nodes",
        "monitoring.metrics",
        "incidentMemory",
        "decisionTrace",
      ],

      writes: [
        "context.evidence",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kubernetes evidence collector
// ─────────────────────────────────────────────────────────────────────────────

async function _collectK8sEvidence(
  {
    incidentId,
    correlationId,
    tenantId,
    incident,
    resource,
    service,
    provider,
    integrationId,
  },

  dependencies,

  items,

  missing
) {
  const tools =
    dependencies
      .kubernetesInvestigationTools ||
    null;

  const namespace =
    resource?.namespace ||
    incident
      ?.evidence
      ?.namespace ||
    incident
      ?.signal
      ?.namespace ||
    null;

  const podName =
    resource?.pod ||
    incident
      ?.evidence
      ?.pod ||
    incident
      ?.signal
      ?.pod ||
    null;

  const deploymentName =
    resource
      ?.deployment ||
    incident
      ?.evidence
      ?.deployment ||
    incident
      ?.signal
      ?.deployment ||
    null;

  const resolvedIntegrationId =
    integrationId ||
    incident
      ?.integrationId ||
    incident
      ?.signal
      ?.integrationId ||
    null;

  const isKubernetes =
    provider ===
      "kubernetes" ||
    incident?.provider ===
      "kubernetes" ||
    Boolean(
      namespace ||
      podName ||
      deploymentName
    );

  if (!isKubernetes) {
    return;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Preferred Phase-2 inventory/topology path
  // ───────────────────────────────────────────────────────────────────────────

  if (tools) {
    try {
      if (podName) {
        const evidence =
          await tools
            .getPodEvidence({
              tenantId,

              integrationId:
                resolvedIntegrationId,

              namespace,

              podName,
            });

        if (
          evidence?.found
        ) {
          _appendPodInventoryEvidence({
            incidentId,
            correlationId,
            namespace,
            podName,
            service,
            evidence,
            items,
          });

          return;
        }

        missing.push(
          "kubernetes_inventory_pod"
        );
      } else {
        const [
          unhealthyPods,
          unhealthyNodes,
        ] =
          await Promise.all([
            tools
              .listUnhealthyPods({
                tenantId,

                integrationId:
                  resolvedIntegrationId,

                namespace,

                limit:
                  25,
              })
              .catch(
                () => []
              ),

            tools
              .listUnhealthyNodes({
                tenantId,

                integrationId:
                  resolvedIntegrationId,

                limit:
                  25,
              })
              .catch(
                () => []
              ),
          ]);

        if (
          unhealthyPods.length >
            0 ||
          unhealthyNodes.length >
            0
        ) {
          items.push(
            createEvidenceItem({
              id:
                `ev-k8s-cluster-${incidentId}`,

              type:
                EVIDENCE_TYPE
                  .KUBERNETES_EVENT,

              source:
                "aira-kubernetes-inventory",

              sourceType:
                EVIDENCE_SOURCE_TYPE
                  .KUBERNETES_API,

              resource: {
                namespace,
              },

              service:
                service?.id,

              summary:
                `${unhealthyPods.length} unhealthy pods and ` +
                `${unhealthyNodes.length} unhealthy nodes found in inventory`,

              structuredData: {
                unhealthyPods,

                unhealthyNodes,
              },

              confidence:
                0.95,

              correlationId,
            })
          );
        } else {
          missing.push(
            "kubernetes_target_resource"
          );
        }

        return;
      }
    } catch (
      error
    ) {
      missing.push(
        "kubernetes_inventory_evidence"
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Compatibility fallback
  //
  // Existing read-only k8sService remains supported during migration.
  // ───────────────────────────────────────────────────────────────────────────

  const k8sService =
    dependencies
      .k8sService ||
    null;

  if (!k8sService) {
    missing.push(
      "kubernetes_pod_status"
    );

    missing.push(
      "kubernetes_inventory"
    );

    return;
  }

  try {
    if (
      namespace &&
      podName
    ) {
      const podData =
        await k8sService
          .getPodStatus(
            namespace,
            podName,
            tenantId
          )
          .catch(
            () => null
          );

      if (podData) {
        items.push(
          createEvidenceItem({
            id:
              `ev-k8s-pod-${incidentId}`,

            type:
              EVIDENCE_TYPE
                .KUBERNETES_EVENT,

            source:
              "kubernetes-api",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .KUBERNETES_API,

            resource: {
              namespace,

              pod:
                podName,
            },

            service:
              service?.id,

            summary:
              `Pod ${podName} status: ${podData.phase}`,

            structuredData: {
              phase:
                podData.phase,

              restartCount:
                podData
                  .restartCount,

              conditions:
                podData
                  .conditions,
            },

            confidence:
              0.9,

            correlationId,
          })
        );
      } else {
        missing.push(
          "kubernetes_pod_status"
        );
      }
    } else {
      missing.push(
        "kubernetes_namespace_or_pod_name"
      );
    }
  } catch {
    missing.push(
      "kubernetes_pod_status"
    );
  }
}

/**
 * Convert Phase-2 Kubernetes topology data into bounded,
 * structured investigation evidence.
 */
function _appendPodInventoryEvidence({
  incidentId,
  correlationId,
  namespace,
  podName,
  service,
  evidence,
  items,
}) {
  const pod =
    evidence.pod ||
    {};

  // Pod state
  items.push(
    createEvidenceItem({
      id:
        `ev-k8s-pod-${incidentId}`,

      type:
        EVIDENCE_TYPE
          .KUBERNETES_EVENT,

      source:
        "aira-kubernetes-inventory",

      sourceType:
        EVIDENCE_SOURCE_TYPE
          .KUBERNETES_API,

      resource: {
        namespace,

        pod:
          podName,
      },

      service:
        service?.id,

      summary:
        _buildPodSummary(
          pod,
          evidence
            .failureSignals
        ),

      structuredData: {
        phase:
          pod.status
            ?.phase,

        reason:
          pod.status
            ?.reason,

        restartCount:
          pod.status
            ?.restartCount ??
          0,

        readyContainers:
          pod.status
            ?.readyContainers ??
          0,

        totalContainers:
          pod.status
            ?.totalContainers ??
          0,

        conditions:
          pod.status
            ?.conditions ||
          [],

        failureSignals:
          evidence
            .failureSignals ||
          [],

        containers:
          pod.spec
            ?.containers ||
          [],

        initContainers:
          pod.spec
            ?.initContainers ||
          [],
      },

      confidence:
        0.99,

      correlationId,
    })
  );

  // Ownership topology
  if (
    evidence.replicaSet ||
    evidence.deployment
  ) {
    items.push(
      createEvidenceItem({
        id:
          `ev-k8s-ownership-${incidentId}`,

        type:
          EVIDENCE_TYPE
            .KUBERNETES_EVENT,

        source:
          "aira-kubernetes-topology",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .KUBERNETES_API,

        resource: {
          namespace,

          pod:
            podName,

          replicaSet:
            evidence
              .replicaSet
              ?.name,

          deployment:
            evidence
              .deployment
              ?.name,
        },

        service:
          service?.id,

        summary:
          _buildOwnershipSummary(
            podName,
            evidence
              .replicaSet,
            evidence
              .deployment
          ),

        structuredData: {
          deployment:
            evidence
              .deployment,

          replicaSet:
            evidence
              .replicaSet,
        },

        confidence:
          evidence
            .replicaSet
            ? 1
            : 0.8,

        correlationId,
      })
    );
  }

  // Node evidence
  if (
    evidence.node
  ) {
    items.push(
      createEvidenceItem({
        id:
          `ev-k8s-node-${incidentId}`,

        type:
          EVIDENCE_TYPE
            .KUBERNETES_EVENT,

        source:
          "aira-kubernetes-topology",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .KUBERNETES_API,

        resource: {
          node:
            evidence.node
              .name,
        },

        service:
          service?.id,

        summary:
          `Pod ${podName} is running on node ${evidence.node.name}`,

        structuredData: {
          node:
            evidence.node,
        },

        confidence:
          1,

        correlationId,
      })
    );
  }

  // Service traffic relationships
  if (
    evidence.services
      ?.length
  ) {
    items.push(
      createEvidenceItem({
        id:
          `ev-k8s-services-${incidentId}`,

        type:
          EVIDENCE_TYPE
            .KUBERNETES_EVENT,

        source:
          "aira-kubernetes-topology",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .KUBERNETES_API,

        resource: {
          namespace,

          pod:
            podName,
        },

        service:
          service?.id,

        summary:
          `${evidence.services.length} Kubernetes service(s) select pod ${podName}`,

        structuredData: {
          services:
            evidence.services,
        },

        confidence:
          1,

        correlationId,
      })
    );
  }

  // Sibling health / blast-pattern evidence
  if (
    evidence.siblingHealth
  ) {
    items.push(
      createEvidenceItem({
        id:
          `ev-k8s-siblings-${incidentId}`,

        type:
          EVIDENCE_TYPE
            .KUBERNETES_EVENT,

        source:
          "aira-kubernetes-topology",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .KUBERNETES_API,

        resource: {
          namespace,

          deployment:
            evidence
              .deployment
              ?.name,
        },

        service:
          service?.id,

        summary:
          _buildSiblingSummary(
            evidence
              .siblingHealth
          ),

        structuredData: {
          health:
            evidence
              .siblingHealth,

          pods:
            evidence
              .siblingPods ||
            [],
        },

        confidence:
          0.98,

        correlationId,
      })
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Monitoring evidence
// ─────────────────────────────────────────────────────────────────────────────

async function _collectMonitoringEvidence(
  {
    incidentId,
    correlationId,
    service,
    resource,
  },

  dependencies,

  items,

  missing
) {
  const monitoringService =
    dependencies
      .monitoringService ||
    null;

  if (!monitoringService) {
    missing.push(
      "metrics_error_rate"
    );

    return;
  }

  try {
    const metrics =
      await monitoringService
        .getServiceMetrics(
          service?.id,

          {
            window:
              "5m",
          }
        )
        .catch(
          () => null
        );

    if (metrics) {
      items.push(
        createEvidenceItem({
          id:
            `ev-metrics-${incidentId}`,

          type:
            EVIDENCE_TYPE
              .METRIC,

          source:
            "prometheus",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .PROMETHEUS,

          resource:
            resource ||
            {},

          service:
            service?.id,

          summary:
            `Error rate: ${metrics.errorRate}, ` +
            `p99 latency: ${metrics.p99Latency}ms`,

          structuredData:
            metrics,

          confidence:
            0.9,

          correlationId,
        })
      );
    } else {
      missing.push(
        "service_metrics"
      );
    }
  } catch {
    missing.push(
      "service_metrics"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical evidence
// ─────────────────────────────────────────────────────────────────────────────

async function _collectHistoricalEvidence(
  {
    tenantId,
    incidentId,
    correlationId,
    incident,
  },

  dependencies,

  items
) {
  const memoryService =
    dependencies
      .memoryService ||
    null;

  if (!memoryService) {
    return;
  }

  try {
    const patternType =
      incident?.type ||
      incident?.patternType;

    if (!patternType) {
      return;
    }

    const memory =
      await memoryService
        .find(
          tenantId,
          `pattern-${patternType}`
        )
        .catch(
          () => null
        );

    if (
      memory &&
      memory.stats
        ?.totalOccurrences >
        0
    ) {
      items.push(
        createEvidenceItem({
          id:
            `ev-history-${incidentId}`,

          type:
            EVIDENCE_TYPE
              .HISTORICAL_INCIDENT,

          source:
            "incident-memory",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .INCIDENT_MEMORY,

          resource:
            {},

          service:
            null,

          summary:
            `${memory.stats.totalOccurrences} previous occurrences of ${patternType}`,

          structuredData: {
            totalOccurrences:
              memory.stats
                .totalOccurrences,

            recommendedAction:
              memory
                .recommendedAction
                ?.action,

            successRate:
              memory
                .recommendedAction
                ?.successRate,
          },

          confidence:
            0.85,

          correlationId,
        })
      );
    }
  } catch {
    // Historical memory is optional.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deployment evidence
// ─────────────────────────────────────────────────────────────────────────────

async function _collectDeploymentEvidence(
  {
    service,
    resource,
    incidentId,
    correlationId,
  },

  dependencies,

  items
) {
  const deploymentService =
    dependencies
      .deploymentService ||
    null;

  if (!deploymentService) {
    return;
  }

  try {
    const recent =
      await deploymentService
        .getRecentDeployments(
          service?.id,

          {
            hours:
              4,
          }
        )
        .catch(
          () => null
        );

    if (
      recent &&
      recent.length >
        0
    ) {
      items.push(
        createEvidenceItem({
          id:
            `ev-deploy-${incidentId}`,

          type:
            EVIDENCE_TYPE
              .DEPLOYMENT_CHANGE,

          source:
            "deployment-api",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .DEPLOYMENT_API,

          resource:
            resource ||
            {},

          service:
            service?.id,

          summary:
            `${recent.length} deployment(s) in last 4h`,

          structuredData: {
            deployments:
              recent.map(
                (deployment) => ({
                  id:
                    deployment.id,

                  at:
                    deployment
                      .deployedAt,

                  image:
                    deployment.image,
                })
              ),
          },

          confidence:
            0.8,

          correlationId,
        })
      );
    }
  } catch {
    // Deployment evidence is optional.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence summaries
// ─────────────────────────────────────────────────────────────────────────────

function _buildPodSummary(
  pod,
  failureSignals = []
) {
  const phase =
    pod.status?.phase ||
    "unknown";

  const restarts =
    pod.status
      ?.restartCount ??
    0;

  const reasons =
    [
      ...new Set(
        (
          failureSignals ||
          []
        )
          .map(
            (signal) =>
              signal.reason
          )
          .filter(Boolean)
      ),
    ];

  let summary =
    `Pod ${pod.name || "unknown"} phase=${phase}, restartCount=${restarts}`;

  if (
    reasons.length >
    0
  ) {
    summary +=
      `, failureReasons=${reasons.join(", ")}`;
  }

  return summary;
}

function _buildOwnershipSummary(
  podName,
  replicaSet,
  deployment
) {
  if (
    replicaSet &&
    deployment
  ) {
    return (
      `Pod ${podName} is owned by ReplicaSet ` +
      `${replicaSet.name}, which is owned by Deployment ${deployment.name}`
    );
  }

  if (deployment) {
    return (
      `Pod ${podName} is associated with Deployment ` +
      `${deployment.name} using inferred topology`
    );
  }

  return (
    `Ownership information available for pod ${podName}`
  );
}

function _buildSiblingSummary(
  health
) {
  return (
    `Deployment sibling health: ` +
    `${health.total || 0} total, ` +
    `${health.running || 0} running, ` +
    `${health.failed || 0} failed, ` +
    `${health.pending || 0} pending, ` +
    `${health.restarting || 0} restarting, ` +
    `${health.unhealthy || 0} unhealthy`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence completeness
// ─────────────────────────────────────────────────────────────────────────────

function _estimateCompleteness(
  items,
  missing
) {
  const total =
    items.length +
    missing.length;

  if (
    total ===
    0
  ) {
    return 0;
  }

  return (
    items.length /
    total
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Investigation reasoning prompt
// ─────────────────────────────────────────────────────────────────────────────

const INVESTIGATION_SYSTEM_PROMPT =
  `
You are the AIRA Investigation Agent.

Your responsibility is to assess whether the evidence collected for an
infrastructure incident is sufficient for downstream diagnosis.

Rules:

1. Identify evidence that is missing.
2. Flag stale evidence.
3. Identify conflicts between evidence sources.
4. Suggest additional READ-ONLY evidence that should be collected.
5. Estimate evidence completeness from 0.0 to 1.0.
6. Use Kubernetes ownership/topology evidence when available.
7. Distinguish a single unhealthy pod from deployment-wide or node-wide failure.
8. Treat ownerReferences as stronger evidence than inferred label relationships.
9. Never execute infrastructure operations.
10. Never request arbitrary shell commands.
11. Never suggest restarting, scaling, deleting, patching, deploying, or mutating infrastructure.
12. Return ONLY valid JSON.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// Evidence reduction
// ─────────────────────────────────────────────────────────────────────────────

function _truncateLine(
  line,
  maxChars
) {
  if (
    typeof line !==
    "string"
  ) {
    return String(
      line ??
      ""
    );
  }

  return line.length >
    maxChars
    ? (
        line.slice(
          0,
          maxChars
        ) +
        "…"
      )
    : line;
}

/**
 * Resolve evidence budget without coupling this agent to
 * the budget configuration implementation.
 */
function _resolveEvidenceBudgets(
  config
) {
  return (
    config?.budgets ||
    config?.evidenceBudgets ||
    {
      maxEvidenceItems:
        50,

      maxEvidenceItemBytes:
        4096,

      maxLogLines:
        100,

      maxLogLineChars:
        512,
    }
  );
}

/**
 * Reduce an evidence item's structured data to stay inside
 * the model budget.
 *
 * IDs/references remain available for auditability.
 */
function reduceEvidenceItem(
  item,
  budgets
) {
  const maxBytes =
    budgets
      ?.maxEvidenceItemBytes ||
    4096;

  const maxLines =
    budgets
      ?.maxLogLines ||
    100;

  const maxChars =
    budgets
      ?.maxLogLineChars ||
    512;

  if (
    !item.structuredData
  ) {
    return item;
  }

  const data = {
    ...item.structuredData,
  };

  // Limit common large arrays.
  if (
    Array.isArray(
      data.logs
    )
  ) {
    data.logs =
      data.logs
        .slice(
          -maxLines
        )
        .map(
          (line) =>
            _truncateLine(
              typeof line ===
                "string"
                ? line
                : (
                    line?.message ||
                    JSON.stringify(
                      line
                    )
                  ),

              maxChars
            )
        );

    data._logsReduced =
      true;
  }

  for (
    const key
    of [
      "events",
      "traces",
      "spans",
      "messages",
      "pods",
      "services",
      "unhealthyPods",
      "unhealthyNodes",
    ]
  ) {
    if (
      Array.isArray(
        data[key]
      )
    ) {
      data[key] =
        data[key].slice(
          0,
          maxLines
        );

      data[
        `_${key}Reduced`
      ] =
        true;
    }
  }

  const serialized =
    JSON.stringify(
      data
    );

  if (
    serialized.length >
    maxBytes
  ) {
    const scalars =
      Object.fromEntries(
        Object.entries(
          data
        ).filter(
          ([
            ,
            value,
          ]) =>
            typeof value !==
              "object" ||
            value ===
              null
        )
      );

    return {
      ...item,

      structuredData: {
        _truncated:
          true,

        _originalBytes:
          serialized.length,

        summary:
          item.summary,

        ...scalars,
      },
    };
  }

  return {
    ...item,

    structuredData:
      data,
  };
}

/**
 * Apply reduction to the entire evidence collection.
 */
function reduceEvidencePackage(
  items,
  budgets
) {
  const maxItems =
    budgets
      ?.maxEvidenceItems ||
    50;

  return items
    .slice(
      0,
      maxItems
    )
    .map(
      (item) =>
        reduceEvidenceItem(
          item,
          budgets
        )
    );
}

module.exports = {
  InvestigationAgent,

  reduceEvidenceItem,

  reduceEvidencePackage,
};