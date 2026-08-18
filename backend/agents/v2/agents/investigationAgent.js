"use strict";

/**
 * AIRA Investigation / Evidence Collector Agent
 *
 * Phase 6 responsibility:
 *
 * 1. Consume trusted InvestigationContext built by
 *    investigationContextService.
 *
 * 2. Reuse canonical AIRA evidence first.
 *
 * 3. Collect additional READ-ONLY evidence only when useful.
 *
 * 4. Evaluate:
 *      - completeness
 *      - missing evidence
 *      - stale evidence
 *      - conflicts
 *
 * 5. Never mutate infrastructure.
 *
 * SAFETY INVARIANTS:
 *
 * - NO playbook execution
 * - NO runbook execution
 * - NO infrastructure mutation
 * - NO arbitrary shell commands
 * - NO Kubernetes mutation APIs
 * - NO execution authorization
 */

const {
  BaseAgent,
} =
  require(
    "../runtime/baseAgent"
  );

const {
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  createEvidenceItem,
  createEvidencePackage,
  verifyEvidenceIntegrity,
} =
  require(
    "../contracts/agentContracts"
  );

const {
  getReasoningProvider,
} =
  require(
    "../runtime/reasoningProvider"
  );

const AGENT_NAME =
  "InvestigationAgent";

const AGENT_VERSION =
  "3.0.0";

// ============================================================================
// AGENT
// ============================================================================

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
      config
        .reasoningProvider ||
      null;
  }

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  async execute(
    context,
    dependencies = {}
  ) {
    const startedAt =
      new Date();

    try {
      this.assertContext(
        context
      );

      const {
        incidentId,
        correlationId,
        tenantId,
        incident,
        service,
      } =
        context;

      // ======================================================================
      // 1. START WITH CANONICAL PHASE-6 EVIDENCE
      // ======================================================================

      const evidenceItems =
        this.cloneCanonicalEvidence(
          context
        );

      const missing =
        new Set(
          context
            .evidence
            ?.missingEvidence ||
          []
        );

      // ======================================================================
      // 2. COLLECT MISSING KUBERNETES EVIDENCE
      // ======================================================================

      await this.collectKubernetesEvidence(
        context,
        dependencies,
        evidenceItems,
        missing
      );

      // ======================================================================
      // 3. COLLECT MISSING METRICS
      // ======================================================================

      await this.collectMonitoringEvidence(
        context,
        dependencies,
        evidenceItems,
        missing
      );

      // ======================================================================
      // 4. COLLECT HISTORICAL MEMORY
      // ======================================================================

      await this.collectHistoricalEvidence(
        context,
        dependencies,
        evidenceItems
      );

      // ======================================================================
      // 5. COLLECT CHANGE / DEPLOYMENT EVIDENCE
      // ======================================================================

      await this.collectDeploymentEvidence(
        context,
        dependencies,
        evidenceItems,
        missing
      );

      // ======================================================================
      // 6. REMOVE DUPLICATE EVIDENCE
      // ======================================================================

      const uniqueEvidence =
        deduplicateEvidence(
          evidenceItems
        );

      // ======================================================================
      // 7. REDUCE EVIDENCE BEFORE REASONING
      // ======================================================================

      const budgets =
        resolveEvidenceBudgets(
          this._config
        );

      const reducedEvidence =
        reduceEvidencePackage(
          uniqueEvidence,
          budgets
        );

      // ======================================================================
      // 8. DETERMINISTIC COMPLETENESS
      // ======================================================================

      const deterministicCompleteness =
        estimateCompleteness(
          reducedEvidence,
          Array.from(
            missing
          ),
          context
        );

      // ======================================================================
      // 9. AI EVIDENCE ASSESSMENT
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "investigation",

            systemInstructions:
              INVESTIGATION_SYSTEM_PROMPT,

            structuredInput: {
              incident: {
                id:
                  incidentId,

                title:
                  incident
                    ?.title,

                description:
                  incident
                    ?.description,

                severity:
                  incident
                    ?.severity,

                status:
                  incident
                    ?.status,

                source:
                  incident
                    ?.source,
              },

              service,

              blastRadius:
                context
                  .blastRadius ||
                {},

              topology:
                context
                  .topology ||
                {},

              evidence: reducedEvidence
                .map(
                  (
                    evidence
                  ) => ({
                    id:
                      evidence.id,

                    type:
                      evidence.type,

                    source:
                      evidence.source,

                    summary:
                      evidence.summary,

                    confidence:
                      evidence
                        .confidence,

                    observedAt:
                      evidence
                        .observedAt,

                    structuredData:
                      evidence
                        .structuredData,
                  })
                ),

              currentlyMissingEvidence:
                Array.from(
                  missing
                ),

              currentCompleteness:
                deterministicCompleteness,

              providerCoverage:
                context
                  .evidence
                  ?.providerCoverage ||
                [],

              signalCount:
                context
                  .signals
                  ?.length ||
                0,

              metricCount:
                context
                  .metrics
                  ?.length ||
                0,

              logCount:
                context
                  .logs
                  ?.length ||
                0,

              traceCount:
                context
                  .traces
                  ?.length ||
                0,

              alertCount:
                context
                  .alerts
                  ?.length ||
                0,
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

              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,
            },
          });

      const aiOutput =
        reasoning
          .output ||
        {};

      // ======================================================================
      // 10. FINAL COMPLETENESS
      // ======================================================================

      const aiCompleteness =
        typeof aiOutput
          .completeness ===
        "number"
          ? clamp01(
              aiOutput
                .completeness
            )
          : null;

      /*
       * Never allow an LLM to magically claim perfect evidence when
       * deterministic evidence coverage is poor.
       *
       * AI can refine the score, but deterministic evidence remains the
       * dominant safety signal.
       */
      const hasCanonicalPhase6Context =
  Boolean(
    context.organizationId &&
    context.environmentId &&
    context.evidence &&
    Array.isArray(
      context.evidence.items
    )
  );

let completeness;

if (
  aiCompleteness ===
  null
) {
  completeness =
    deterministicCompleteness;
} else if (
  !hasCanonicalPhase6Context
) {
  /*
   * Backwards compatibility for the existing V2 agent runtime/tests.
   *
   * Legacy AgentContext does not contain the canonical Phase 5/6
   * evidence package required for deterministic completeness scoring.
   *
   * In that case preserve the original InvestigationAgent behaviour
   * and use the reasoning provider's completeness assessment directly.
   */
  completeness =
    aiCompleteness;
} else {
  /*
   * Canonical Phase 6 production path.
   *
   * Deterministic evidence coverage remains dominant so an LLM cannot
   * claim strong completeness without actual telemetry/evidence.
   */
  completeness =
    Number(
      (
        deterministicCompleteness *
          0.7 +
        aiCompleteness *
          0.3
      )
        .toFixed(
          4
        )
    );
}

      // ======================================================================
      // 11. FINAL MISSING EVIDENCE
      // ======================================================================

      const finalMissing =
        Array.from(
          new Set([
            ...Array.from(
              missing
            ),

            ...(
              Array.isArray(
                aiOutput
                  .missingEvidence
              )
                ? aiOutput
                    .missingEvidence
                : []
            ),
          ])
        );

      // ======================================================================
      // 12. CREATE CANONICAL EVIDENCE PACKAGE
      // ======================================================================

      const evidencePackage =
        createEvidencePackage({
          incidentId,

          correlationId,

          correlationGroupId:
            context
              .correlationGroupId ||
            null,

          items:
            reducedEvidence,

          completeness,

          missingEvidence:
            finalMissing,

          staleEvidence:
            Array.isArray(
              aiOutput
                .staleEvidence
            )
              ? aiOutput
                  .staleEvidence
              : [],

          conflicts:
            Array.isArray(
              aiOutput
                .conflicts
            )
              ? aiOutput
                  .conflicts
              : [],

          recommendedNextEvidence:
            Array.isArray(
              aiOutput
                .recommendedNextEvidence
            )
              ? aiOutput
                  .recommendedNextEvidence
              : [],

          providerCoverage:
            Array.from(
              new Set([
                ...(
                  context
                    .evidence
                    ?.providerCoverage ||
                  []
                ),

                ...reducedEvidence
                  .map(
                    (
                      evidence
                    ) =>
                      evidence.source
                  )
                  .filter(
                    Boolean
                  ),
              ])
            ),

          signalCount:
            context
              .signals
              ?.length ||
            0,

          collectedAt:
            new Date()
              .toISOString(),
        });

      // ======================================================================
      // 13. SUCCESS
      // ======================================================================

      return this._success(
        startedAt,

        {
          evidencePackage,

          evidenceSummary: {
            totalEvidenceCount:
              reducedEvidence
                .length,

            completeness,

            missingEvidenceCount:
              finalMissing
                .length,

            conflictCount:
              evidencePackage
                .conflicts
                .length,

            staleEvidenceCount:
              evidencePackage
                .staleEvidence
                .length,

            providerCount:
              evidencePackage
                .providerCoverage
                .length,
          },

          executionAuthorized:
            false,
        },

        {
  confidence:
    completeness,

  evidenceUsed:
    reducedEvidence
      .map(
        (
          evidence
        ) =>
          evidence.id
      ),

  evidenceMissing:
    finalMissing,

  assumptions:
    [],

  nextRecommendedStage:
    finalMissing.length >
      0
      ? "COLLECT_MORE_EVIDENCE"
      : "SYMPTOM_ANALYSIS",

  modelMetadata:
    reasoning
      .modelMetadata ||
    null,

  model:
    reasoning
      .modelMetadata
      ?.model,

  provider:
    reasoning
      .modelMetadata
      ?.provider,

  fallbackUsed:
    Boolean(
      reasoning
        .fallbackUsed
    ),

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

  // ==========================================================================
  // CONTEXT VALIDATION
  // ==========================================================================

  assertContext(
    context
  ) {
    if (
      !context
        ?.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Investigation context incidentId is required"
        ),
        {
          code:
            "INVESTIGATION_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    /*
     * Canonical Phase 6 contexts require these fields.
     *
     * Legacy V2 tests may not supply them, so only enforce them when
     * either one is present. This preserves migration compatibility.
     */
    if (
      (
        context
          .organizationId ||
        context
          .environmentId
      ) &&
      (
        !context
          .organizationId ||
        !context
          .environmentId
      )
    ) {
      throw Object.assign(
        new Error(
          "Complete organization and environment context is required"
        ),
        {
          code:
            "INVESTIGATION_CONTEXT_SCOPE_INCOMPLETE",
        }
      );
    }
  }

  // ==========================================================================
  // CANONICAL EVIDENCE
  // ==========================================================================

  cloneCanonicalEvidence(
    context
  ) {
    const items =
      context
        .evidence
        ?.items;

    if (
      !Array.isArray(
        items
      )
    ) {
      return [];
    }

    /*
     * Evidence contracts are frozen objects.
     *
     * Spread into new objects before reduction so downstream mutation does
     * not touch canonical context.
     */
    return items.map(
      (
        evidence
      ) => ({
        ...evidence,

        resource: {
          ...(
            evidence
              .resource ||
            {}
          ),
        },

        structuredData:
          cloneStructuredData(
            evidence
              .structuredData
          ),
      })
    );
  }

  // ==========================================================================
  // KUBERNETES EVIDENCE
  // ==========================================================================

  async collectKubernetesEvidence(
    context,
    dependencies,
    items,
    missing
  ) {
    /*
     * If canonical Kubernetes signals already exist, avoid querying the
     * cluster again unless explicitly requested.
     */
    const canonicalKubernetesEvidence =
      items.some(
        (
          item
        ) =>
          item.type ===
            EVIDENCE_TYPE
              .KUBERNETES_EVENT ||
          item.sourceType ===
            EVIDENCE_SOURCE_TYPE
              .KUBERNETES_API
      );

    if (
      canonicalKubernetesEvidence &&
      this._config
        .refreshKubernetesEvidence !==
        true
    ) {
      missing.delete(
        "kubernetes_inventory"
      );

      missing.delete(
        "kubernetes_pod_status"
      );

      return;
    }

    const resource =
      this.resolveKubernetesResource(
        context
      );

    const namespace =
      resource
        .namespace ||
      null;

    const podName =
      resource
        .pod ||
      null;

    const deploymentName =
      resource
        .deployment ||
      null;

    const provider =
      String(
        context
          .incident
          ?.provider ||
        context
          .incident
          ?.source ||
        ""
      )
        .toLowerCase();

    const hasKubernetesContext =
      provider ===
        "kubernetes" ||
      Boolean(
        namespace ||
        podName ||
        deploymentName ||
        context
          .kubernetes
          ?.signals
          ?.length
      );

    if (
      !hasKubernetesContext
    ) {
      return;
    }

    // ------------------------------------------------------------------------
    // PHASE 2 INVENTORY TOOLS
    // ------------------------------------------------------------------------

    const tools =
      dependencies
        .kubernetesInvestigationTools ||
      null;

    if (
      tools
    ) {
      try {
        if (
          podName
        ) {
          const evidence =
            await tools
              .getPodEvidence({
                tenantId:
                  context
                    .tenantId,

                organizationId:
                  context
                    .organizationId,

                environmentId:
                  context
                    .environmentId,

                integrationId:
                  context
                    .integrationId ||
                  null,

                namespace,

                podName,
              });

          if (
            evidence
              ?.found
          ) {
            appendPodInventoryEvidence({
              context,

              namespace,

              podName,

              evidence,

              items,
            });

            missing.delete(
              "kubernetes_inventory"
            );

            missing.delete(
              "kubernetes_pod_status"
            );

            return;
          }
        }

        const [
          unhealthyPods,
          unhealthyNodes,
        ] =
          await Promise.all([
            tools
              .listUnhealthyPods({
                tenantId:
                  context
                    .tenantId,

                organizationId:
                  context
                    .organizationId,

                environmentId:
                  context
                    .environmentId,

                integrationId:
                  context
                    .integrationId ||
                  null,

                namespace,

                limit:
                  25,
              })
              .catch(
                () => []
              ),

            tools
              .listUnhealthyNodes({
                tenantId:
                  context
                    .tenantId,

                organizationId:
                  context
                    .organizationId,

                environmentId:
                  context
                    .environmentId,

                integrationId:
                  context
                    .integrationId ||
                  null,

                limit:
                  25,
              })
              .catch(
                () => []
              ),
          ]);

        if (
          unhealthyPods
            .length >
            0 ||
          unhealthyNodes
            .length >
            0
        ) {
          items.push(
            createEvidenceItem({
              id:
                `k8s-cluster:${context.incidentId}`,

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

              serviceId:
                context
                  .service
                  ?.id ||
                null,

              summary:
                `${unhealthyPods.length} unhealthy pod(s) and ${unhealthyNodes.length} unhealthy node(s) found.`,

              structuredData: {
                unhealthyPods,

                unhealthyNodes,
              },

              confidence:
                0.95,

              correlationId:
                context
                  .correlationId,
            })
          );

          missing.delete(
            "kubernetes_inventory"
          );

          return;
        }
      } catch {
        missing.add(
          "kubernetes_inventory"
        );
      }
    }

    // ------------------------------------------------------------------------
    // LEGACY READ-ONLY FALLBACK
    // ------------------------------------------------------------------------

    const k8sService =
      dependencies
        .k8sService ||
      null;

    if (
      !k8sService
    ) {
      missing.add(
        "kubernetes_inventory"
      );

      return;
    }

    if (
      !namespace ||
      !podName
    ) {
      missing.add(
        "kubernetes_target_resource"
      );

      return;
    }

    try {
      const podData =
        await k8sService
          .getPodStatus(
            namespace,
            podName,
            context
              .tenantId
          );

      if (
        !podData
      ) {
        missing.add(
          "kubernetes_pod_status"
        );

        return;
      }

      items.push(
        createEvidenceItem({
          id:
            `k8s-pod:${context.incidentId}:${podName}`,

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

          serviceId:
            context
              .service
              ?.id ||
            null,

          summary:
            `Pod ${podName} status: ${podData.phase || "unknown"}`,

          structuredData: {
            phase:
              podData.phase,

            restartCount:
              podData
                .restartCount,

            conditions:
              podData
                .conditions ||
              [],
          },

          confidence:
            0.9,

          correlationId:
            context
              .correlationId,
        })
      );

      missing.delete(
        "kubernetes_pod_status"
      );
    } catch {
      missing.add(
        "kubernetes_pod_status"
      );
    }
  }

  // ==========================================================================
  // MONITORING
  // ==========================================================================

  async collectMonitoringEvidence(
    context,
    dependencies,
    items,
    missing
  ) {
    const alreadyHasMetrics =
      items.some(
        (
          item
        ) =>
          item.type ===
          EVIDENCE_TYPE
            .METRIC
      );

    if (
      alreadyHasMetrics &&
      this._config
        .refreshMetrics !==
        true
    ) {
      missing.delete(
        "metrics"
      );

      missing.delete(
        "service_metrics"
      );

      return;
    }

    const monitoringService =
      dependencies
        .monitoringService ||
      null;

    if (
      !monitoringService
    ) {
      missing.add(
        "metrics"
      );

      return;
    }

    try {
      const metrics =
        await monitoringService
          .getServiceMetrics(
            context
              .service
              ?.id,

            {
              window:
                this._config
                  .metricsWindow ||
                "5m",

              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,
            }
          );

      if (
        !metrics
      ) {
        missing.add(
          "metrics"
        );

        return;
      }

      items.push(
        createEvidenceItem({
          id:
            `metrics:${context.incidentId}`,

          type:
            EVIDENCE_TYPE
              .METRIC,

          source:
            "monitoring-service",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .PROMETHEUS,

          serviceId:
            context
              .service
              ?.id ||
            null,

          resource:
            this.resolvePrimaryResource(
              context
            ),

          summary:
            buildMetricSummary(
              metrics
            ),

          structuredData:
            metrics,

          confidence:
            0.9,

          correlationId:
            context
              .correlationId,
        })
      );

      missing.delete(
        "metrics"
      );

      missing.delete(
        "service_metrics"
      );
    } catch {
      missing.add(
        "metrics"
      );
    }
  }

  // ==========================================================================
  // HISTORICAL EVIDENCE
  // ==========================================================================

  async collectHistoricalEvidence(
    context,
    dependencies,
    items
  ) {
    /*
     * InvestigationContext already includes canonical historical incidents.
     */
    if (
      Array.isArray(
        context
          .historicalIncidents
      ) &&
      context
        .historicalIncidents
        .length >
        0
    ) {
      items.push(
        createEvidenceItem({
          id:
            `history:${context.incidentId}`,

          type:
            EVIDENCE_TYPE
              .HISTORICAL_INCIDENT,

          source:
            "aira-incident-history",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .AIRA_INCIDENT_STORE,

          summary:
            `${context.historicalIncidents.length} related historical incident(s) found.`,

          structuredData: {
            incidents:
              context
                .historicalIncidents
                .slice(
                  0,
                  20
                ),
          },

          confidence:
            0.95,

          correlationId:
            context
              .correlationId,
        })
      );

      return;
    }

    /*
     * Backward-compatible IncidentMemory fallback.
     */
    const memoryService =
      dependencies
        .memoryService ||
      null;

    if (
      !memoryService
    ) {
      return;
    }

    const patternType =
      context
        .incident
        ?.type ||
      context
        .incident
        ?.patternType;

    if (
      !patternType
    ) {
      return;
    }

    try {
      const memory =
        await memoryService
          .find(
            context
              .tenantId,

            `pattern-${patternType}`
          );

      if (
        !memory ||
        !(
          memory.stats
            ?.totalOccurrences >
          0
        )
      ) {
        return;
      }

      items.push(
        createEvidenceItem({
          id:
            `memory:${context.incidentId}`,

          type:
            EVIDENCE_TYPE
              .HISTORICAL_INCIDENT,

          source:
            "incident-memory",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .INCIDENT_MEMORY,

          summary:
            `${memory.stats.totalOccurrences} historical occurrence(s) of ${patternType}.`,

          structuredData: {
            totalOccurrences:
              memory
                .stats
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

          correlationId:
            context
              .correlationId,
        })
      );
    } catch {
      // Historical memory is optional.
    }
  }

  // ==========================================================================
  // DEPLOYMENT / CHANGE EVIDENCE
  // ==========================================================================

  async collectDeploymentEvidence(
    context,
    dependencies,
    items,
    missing
  ) {
    /*
     * Phase 6 context may already contain normalized changes.
     */
    if (
      Array.isArray(
        context.changes
      ) &&
      context
        .changes
        .length >
        0
    ) {
      items.push(
        createEvidenceItem({
          id:
            `changes:${context.incidentId}`,

          type:
            EVIDENCE_TYPE
              .DEPLOYMENT_CHANGE,

          source:
            "aira-change-context",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .DEPLOYMENT_API,

          serviceId:
            context
              .service
              ?.id ||
            null,

          summary:
            `${context.changes.length} recent operational change(s) identified.`,

          structuredData: {
            changes:
              context
                .changes
                .slice(
                  0,
                  50
                ),
          },

          confidence:
            0.95,

          correlationId:
            context
              .correlationId,
        })
      );

      missing.delete(
        "deployment_history"
      );

      return;
    }

    const deploymentService =
      dependencies
        .deploymentService ||
      null;

    if (
      !deploymentService
    ) {
      /*
       * Change evidence is useful but not always available.
       */
      missing.add(
        "deployment_history"
      );

      return;
    }

    try {
      const recent =
        await deploymentService
          .getRecentDeployments(
            context
              .service
              ?.id,

            {
              hours:
                this._config
                  .deploymentWindowHours ||
                4,

              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,
            }
          );

      if (
        !Array.isArray(
          recent
        ) ||
        recent.length ===
          0
      ) {
        missing.add(
          "deployment_history"
        );

        return;
      }

      items.push(
        createEvidenceItem({
          id:
            `deployments:${context.incidentId}`,

          type:
            EVIDENCE_TYPE
              .DEPLOYMENT_CHANGE,

          source:
            "deployment-api",

          sourceType:
            EVIDENCE_SOURCE_TYPE
              .DEPLOYMENT_API,

          serviceId:
            context
              .service
              ?.id ||
            null,

          resource:
            this.resolvePrimaryResource(
              context
            ),

          summary:
            `${recent.length} deployment(s) observed in the configured investigation window.`,

          structuredData: {
            deployments:
              recent
                .slice(
                  0,
                  50
                )
                .map(
                  (
                    deployment
                  ) => ({
                    id:
                      deployment.id ||
                      deployment._id,

                    at:
                      deployment
                        .deployedAt ||
                      deployment
                        .createdAt,

                    image:
                      deployment.image,

                    version:
                      deployment.version,

                    actor:
                      deployment.actor,
                  })
                ),
          },

          confidence:
            0.85,

          correlationId:
            context
              .correlationId,
        })
      );

      missing.delete(
        "deployment_history"
      );
    } catch {
      missing.add(
        "deployment_history"
      );
    }
  }

  // ==========================================================================
  // RESOURCE RESOLUTION
  // ==========================================================================

  resolvePrimaryResource(
    context
  ) {
    if (
      context
        .resources
        ?.length
    ) {
      return (
        context
          .resources[0] ||
        {}
      );
    }

    if (
      context.resource
    ) {
      return context
        .resource;
    }

    return {};
  }

  resolveKubernetesResource(
    context
  ) {
    const resources = [
      ...(
        context
          .resources ||
        []
      ),

      ...(
        context
          .blastRadius
          ?.affectedResources ||
        []
      ),
    ];

    const kubernetesResource =
      resources.find(
        (
          resource
        ) =>
          resource
            ?.provider ===
            "kubernetes" ||
          resource
            ?.cluster ||
          resource
            ?.namespace
      );

    if (
      kubernetesResource
    ) {
      return {
        namespace:
          kubernetesResource
            .namespace ||
          null,

        pod:
          kubernetesResource
            .pod ||
          kubernetesResource
            .name ||
          null,

        deployment:
          kubernetesResource
            .deployment ||
          null,

        cluster:
          kubernetesResource
            .cluster ||
          null,
      };
    }

    /*
     * Legacy V2 context fallback.
     */
    return {
      namespace:
        context
          .resource
          ?.namespace ||
        context
          .incident
          ?.evidence
          ?.namespace ||
        null,

      pod:
        context
          .resource
          ?.pod ||
        context
          .incident
          ?.evidence
          ?.pod ||
        null,

      deployment:
        context
          .resource
          ?.deployment ||
        context
          .incident
          ?.evidence
          ?.deployment ||
        null,
    };
  }

  // ==========================================================================
  // OUTPUT VALIDATION
  // ==========================================================================

  validateOutput(
    record
  ) {
    const base =
      super
        .validateOutput(
          record
        );

    if (
      !base.valid
    ) {
      return base;
    }

    if (
      record
        .result
        ?.executionAuthorized ===
        true
    ) {
      return {
        valid:
          false,

        errors: [
          "InvestigationAgent cannot authorize execution",
        ],
      };
    }

    if (
      !record
        .result
        ?.evidencePackage
    ) {
      return {
        valid:
          false,

        errors: [
          "Evidence package is required",
        ],
      };
    }

    return {
      valid:
        true,

      errors:
        [],
    };
  }

  // ==========================================================================
  // CAPABILITIES
  // ==========================================================================

  getCapabilities() {
    return {
      ...super
        .getCapabilities(),

      reads: [
        "canonical.incident",
        "canonical.signals",
        "canonical.incidentEvents",
        "canonical.topology",
        "canonical.blastRadius",
        "canonical.history",
        "kubernetes.inventory",
        "kubernetes.topology",
        "monitoring.metrics",
        "deployment.history",
        "incidentMemory",
      ],

      writes: [
        "context.evidence",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,

      executionAuthorization:
        false,
    };
  }
}

// ============================================================================
// KUBERNETES INVENTORY EVIDENCE
// ============================================================================

function appendPodInventoryEvidence({
  context,
  namespace,
  podName,
  evidence,
  items,
}) {
  const pod =
    evidence.pod ||
    {};

  items.push(
    createEvidenceItem({
      id:
        `k8s-pod:${context.incidentId}:${podName}`,

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

      serviceId:
        context
          .service
          ?.id ||
        null,

      summary:
        buildPodSummary(
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

      correlationId:
        context
          .correlationId,
    })
  );

  // --------------------------------------------------------------------------
  // OWNERSHIP
  // --------------------------------------------------------------------------

  if (
    evidence.replicaSet ||
    evidence.deployment
  ) {
    items.push(
      createEvidenceItem({
        id:
          `k8s-ownership:${context.incidentId}:${podName}`,

        type:
          EVIDENCE_TYPE
            .TOPOLOGY,

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

        serviceId:
          context
            .service
            ?.id ||
          null,

        summary:
          buildOwnershipSummary(
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

        correlationId:
          context
            .correlationId,
      })
    );
  }

  // --------------------------------------------------------------------------
  // NODE
  // --------------------------------------------------------------------------

  if (
    evidence.node
  ) {
    items.push(
      createEvidenceItem({
        id:
          `k8s-node:${context.incidentId}:${evidence.node.name}`,

        type:
          EVIDENCE_TYPE
            .RESOURCE_STATE,

        source:
          "aira-kubernetes-topology",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .KUBERNETES_API,

        resource: {
          node:
            evidence
              .node
              .name,
        },

        serviceId:
          context
            .service
            ?.id ||
          null,

        summary:
          `Pod ${podName} is running on node ${evidence.node.name}.`,

        structuredData: {
          node:
            evidence.node,
        },

        confidence:
          1,

        correlationId:
          context
            .correlationId,
      })
    );
  }

  // --------------------------------------------------------------------------
  // SIBLINGS
  // --------------------------------------------------------------------------

  if (
    evidence
      .siblingHealth
  ) {
    items.push(
      createEvidenceItem({
        id:
          `k8s-siblings:${context.incidentId}:${podName}`,

        type:
          EVIDENCE_TYPE
            .DEPENDENCY_STATE,

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

        serviceId:
          context
            .service
            ?.id ||
          null,

        summary:
          buildSiblingSummary(
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

        correlationId:
          context
            .correlationId,
      })
    );
  }
}

// ============================================================================
// EVIDENCE REDUCTION
// ============================================================================

function truncateLine(
  line,
  maxChars
) {
  const value =
    typeof line ===
    "string"
      ? line
      : String(
          line ??
          ""
        );

  return value.length >
    maxChars
    ? (
        value.slice(
          0,
          maxChars
        ) +
        "…"
      )
    : value;
}

function resolveEvidenceBudgets(
  config
) {
  return (
    config
      ?.budgets ||
    config
      ?.evidenceBudgets ||
    {
      maxEvidenceItems:
        75,

      maxEvidenceItemBytes:
        4096,

      maxLogLines:
        100,

      maxLogLineChars:
        512,
    }
  );
}

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
    !item
      .structuredData ||
    typeof item
      .structuredData !==
      "object"
  ) {
    return item;
  }

  const data =
    cloneStructuredData(
      item
        .structuredData
    );

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
          (
            line
          ) =>
            truncateLine(
              typeof line ===
                "string"
                ? line
                : (
                    line
                      ?.message ||
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
      "incidents",
      "changes",
      "deployments",
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
        data[key]
          .slice(
            0,
            maxLines
          );

      data[
        `_${key}Reduced`
      ] =
        true;
    }
  }

  let serialized;

  try {
    serialized =
      JSON.stringify(
        data
      );
  } catch {
    return {
      ...item,

      structuredData: {
        _truncated:
          true,

        summary:
          item.summary,
      },
    };
  }

  if (
    serialized.length <=
    maxBytes
  ) {
    return {
      ...item,

      structuredData:
        data,
    };
  }

  const scalarData =
    Object.fromEntries(
      Object.entries(
        data
      )
        .filter(
          ([
            ,
            value,
          ]) =>
            value ===
              null ||
            typeof value !==
              "object"
        )
    );

  return {
    ...item,

    structuredData: {
      _truncated:
        true,

      _originalBytes:
        serialized
          .length,

      summary:
        item.summary,

      ...scalarData,
    },
  };
}

function reduceEvidencePackage(
  items,
  budgets
) {
  const maxItems =
    budgets
      ?.maxEvidenceItems ||
    75;

  /*
   * Prefer higher-confidence evidence before trimming.
   */
  return [
    ...items,
  ]
    .sort(
      (
        first,
        second
      ) =>
        (
          second
            .confidence ??
          0
        ) -
        (
          first
            .confidence ??
          0
        )
    )
    .slice(
      0,
      maxItems
    )
    .map(
      (
        item
      ) =>
        reduceEvidenceItem(
          item,
          budgets
        )
    );
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

function deduplicateEvidence(
  items
) {
  const map =
    new Map();

  for (
    const item
    of items
  ) {
    if (
      !item
        ?.id
    ) {
      continue;
    }

    /*
     * Phase 12.4:
     *
     * Canonical evidence whose fingerprint no longer matches must not
     * participate in diagnosis.
     *
     * Legacy evidence without a fingerprint remains accepted as UNVERIFIED
     * during migration.
     */
    const integrity =
      verifyEvidenceIntegrity(
        item
      );

    if (
      integrity.valid ===
      false
    ) {
      continue;
    }

    const id =
      String(
        item.id
      );

    const existing =
      map.get(
        id
      );

    if (
      !existing
    ) {
      map.set(
        id,
        item
      );

      continue;
    }

    const candidateConfidence =
      item.confidence ??
      0;

    const existingConfidence =
      existing.confidence ??
      0;

    if (
      candidateConfidence >
      existingConfidence
    ) {
      map.set(
        id,
        item
      );

      continue;
    }

    if (
      candidateConfidence <
      existingConfidence
    ) {
      continue;
    }

    /*
     * Confidence tie:
     * prefer the most recently collected canonical observation.
     */
    const candidateCollectedAt =
      item.collectedAt
        ? new Date(
            item.collectedAt
          )
            .getTime()
        : 0;

    const existingCollectedAt =
      existing.collectedAt
        ? new Date(
            existing.collectedAt
          )
            .getTime()
        : 0;

    if (
      candidateCollectedAt >
      existingCollectedAt
    ) {
      map.set(
        id,
        item
      );
    }
  }

  return [
    ...map.values(),
  ];
}

// ============================================================================
// COMPLETENESS
// ============================================================================

function estimateCompleteness(
  items,
  missing,
  context
) {
  /*
   * Use evidence categories rather than raw item count.
   *
   * Hundreds of duplicate logs should not produce "100% evidence".
   */
  const presentTypes =
    new Set(
      items
        .map(
          (
            item
          ) =>
            item.type
        )
        .filter(
          Boolean
        )
    );

  let score =
    0;

  let weight =
    0;

  const component =
    (
      available,
      value
    ) => {
      weight +=
        value;

      if (
        available
      ) {
        score +=
          value;
      }
    };

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .ALERT
    ) ||
    presentTypes.has(
      EVIDENCE_TYPE
        .SIGNAL
    ),
    0.15
  );

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .METRIC
    ),
    0.15
  );

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .LOG
    ),
    0.15
  );

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .TRACE
    ),
    0.15
  );

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .TOPOLOGY
    ) ||
    context
      .topology
      ?.rootService,
    0.15
  );

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .INCIDENT_EVENT
    ),
    0.1
  );

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .HISTORICAL_INCIDENT
    ),
    0.075
  );

  component(
    presentTypes.has(
      EVIDENCE_TYPE
        .DEPLOYMENT_CHANGE
    ),
    0.075
  );

  const base =
    weight >
      0
      ? score /
        weight
      : 0;

  /*
   * Missing evidence penalty is deliberately small because some incidents
   * legitimately have no traces/history/deployments.
   */
  const penalty =
    Math.min(
      0.25,
      (
        missing
          .length ||
        0
      ) *
        0.025
    );

  return Number(
    Math.max(
      0,
      Math.min(
        1,
        base -
          penalty
      )
    )
      .toFixed(
        4
      )
  );
}

// ============================================================================
// SUMMARIES
// ============================================================================

function buildMetricSummary(
  metrics
) {
  const parts =
    [];

  if (
    metrics
      .errorRate !==
    undefined
  ) {
    parts.push(
      `errorRate=${metrics.errorRate}`
    );
  }

  if (
    metrics
      .p99Latency !==
    undefined
  ) {
    parts.push(
      `p99Latency=${metrics.p99Latency}ms`
    );
  }

  if (
    metrics.cpu !==
    undefined
  ) {
    parts.push(
      `cpu=${metrics.cpu}`
    );
  }

  if (
    metrics.memory !==
    undefined
  ) {
    parts.push(
      `memory=${metrics.memory}`
    );
  }

  return (
    parts.join(
      ", "
    ) ||
    "Service metrics collected."
  );
}

function buildPodSummary(
  pod,
  failureSignals = []
) {
  const phase =
    pod.status
      ?.phase ||
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
            (
              signal
            ) =>
              signal.reason
          )
          .filter(
            Boolean
          )
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

function buildOwnershipSummary(
  podName,
  replicaSet,
  deployment
) {
  if (
    replicaSet &&
    deployment
  ) {
    return (
      `Pod ${podName} is owned by ReplicaSet ${replicaSet.name}, ` +
      `which is owned by Deployment ${deployment.name}.`
    );
  }

  if (
    deployment
  ) {
    return (
      `Pod ${podName} is associated with Deployment ${deployment.name}.`
    );
  }

  return (
    `Ownership information available for pod ${podName}.`
  );
}

function buildSiblingSummary(
  health
) {
  return (
    "Deployment sibling health: " +
    `${health.total || 0} total, ` +
    `${health.running || 0} running, ` +
    `${health.failed || 0} failed, ` +
    `${health.pending || 0} pending, ` +
    `${health.restarting || 0} restarting, ` +
    `${health.unhealthy || 0} unhealthy.`
  );
}

// ============================================================================
// CLONE
// ============================================================================

function cloneStructuredData(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }

  try {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  } catch {
    return {};
  }
}

// ============================================================================
// CONFIDENCE
// ============================================================================

function clamp01(
  value
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      number
    )
  );
}

// ============================================================================
// PROMPT
// ============================================================================

const INVESTIGATION_SYSTEM_PROMPT =
  `
You are the AIRA Investigation Agent.

Your job is evidence assessment, not infrastructure recovery.

You receive server-generated operational evidence collected by AIRA.

Determine whether the evidence is sufficient for root-cause diagnosis.

Rules:

1. Evaluate evidence completeness from 0.0 to 1.0.
2. Identify important missing evidence.
3. Identify stale evidence.
4. Identify contradictions between evidence sources.
5. Recommend only additional READ-ONLY evidence collection.
6. Prefer direct telemetry evidence over assumptions.
7. Prefer canonical AIRA Signal and IncidentEvent evidence over user claims.
8. Prefer Kubernetes ownerReferences over inferred label relationships.
9. Distinguish isolated resource failure from service-wide failure.
10. Consider temporal ordering when evaluating evidence.
11. Do not infer causality merely from correlation.
12. Never execute infrastructure operations.
13. Never authorize infrastructure execution.
14. Never recommend arbitrary shell commands.
15. Never restart, scale, delete, patch, deploy, fail over, or mutate infrastructure.
16. Return ONLY valid JSON.
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  InvestigationAgent,

  reduceEvidenceItem,

  reduceEvidencePackage,

  deduplicateEvidence,

  estimateCompleteness,
};