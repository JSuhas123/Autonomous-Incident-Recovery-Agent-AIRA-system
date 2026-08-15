"use strict";

/**
 * AIRA Topology Analysis Agent
 *
 * Phase 6 responsibility:
 *
 * Analyze service/resource topology around an incident and determine:
 *
 * - isolated vs distributed failure
 * - upstream/downstream propagation
 * - shared dependencies
 * - potentially central failing resources
 * - blast radius
 *
 * This agent does NOT execute anything and does NOT make the final
 * root-cause decision.
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  BaseAgent,
} =
  require(
    "../runtime/baseAgent"
  );

const {
  createAgentFinding,
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
  "TopologyAnalysisAgent";

const AGENT_VERSION =
  "1.0.0";

class TopologyAnalysisAgent
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
    context
  ) {
    const startedAt =
      new Date();

    try {
      this.assertContext(
        context
      );

      // ======================================================================
      // 1. DETERMINISTIC TOPOLOGY ANALYSIS
      // ======================================================================

      const deterministic =
        this.analyzeTopology(
          context
        );

      // ======================================================================
      // 2. FINDINGS
      // ======================================================================

      const deterministicFindings =
        this.buildFindings(
          context,
          deterministic
        );

      // ======================================================================
      // 3. AI REFINEMENT
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "topology_analysis",

            systemInstructions:
              TOPOLOGY_SYSTEM_PROMPT,

            structuredInput: {
              incident:
                context.incident,

              service:
                context.service,

              symptoms:
                context.symptoms ||
                [],

              topology:
                context.topology ||
                {},

              blastRadius:
                context.blastRadius ||
                {},

              dependencies:
                context.dependencies ||
                [],

              resources:
                context.resources ||
                [],

              deterministicAnalysis:
                deterministic,
            },

            outputSchema: {
              required: [
                "scope",
                "topologyConfidence",
              ],

              properties: {
                scope: {
                  type:
                    "string",
                },

                likelySharedDependencies: {
                  type:
                    "array",
                },

                propagationPaths: {
                  type:
                    "array",
                },

                suspiciousResources: {
                  type:
                    "array",
                },

                observations: {
                  type:
                    "array",
                },

                unknowns: {
                  type:
                    "array",
                },

                topologyConfidence: {
                  type:
                    "number",
                },
              },
            },

            metadata: {
              incidentId:
                context.incidentId,

              correlationId:
                context.correlationId,

              organizationId:
                context.organizationId,

              environmentId:
                context.environmentId,
            },
          });

      const aiOutput =
        reasoning
          .output ||
        {};

      // ======================================================================
      // 4. MERGE ANALYSIS
      // ======================================================================

      const scope =
        normalizeScope(
          aiOutput.scope ||
          deterministic.scope
        );

      const sharedDependencies =
        mergeUniqueObjects(
          deterministic
            .likelySharedDependencies,

          normalizeArray(
            aiOutput
              .likelySharedDependencies
          )
        );

      const propagationPaths =
        mergeUniqueObjects(
          deterministic
            .propagationPaths,

          normalizeArray(
            aiOutput
              .propagationPaths
          )
        );

      const suspiciousResources =
        mergeUniqueObjects(
          deterministic
            .suspiciousResources,

          normalizeArray(
            aiOutput
              .suspiciousResources
          )
        );

      // ======================================================================
      // 5. CONFIDENCE
      // ======================================================================

      const deterministicConfidence =
        deterministic
          .topologyConfidence;

      const aiConfidence =
        clamp01OrNull(
          aiOutput
            .topologyConfidence
        );

      const canonical =
        Boolean(
          context.organizationId &&
          context.environmentId
        );

      let topologyConfidence;

      if (
        aiConfidence ===
        null
      ) {
        topologyConfidence =
          deterministicConfidence;
      } else if (
        !canonical
      ) {
        topologyConfidence =
          aiConfidence;
      } else {
        topologyConfidence =
          Number(
            (
              deterministicConfidence *
                0.75 +
              aiConfidence *
                0.25
            )
              .toFixed(
                4
              )
          );
      }

      // ======================================================================
      // 6. AI FINDINGS
      // ======================================================================

      const aiFindings =
        this.buildAiFindings(
          context,
          aiOutput,
          topologyConfidence
        );

      // ======================================================================
      // 7. RESULT
      // ======================================================================

      return this._success(
        startedAt,

        {
          scope,

          rootService:
            deterministic
              .rootService,

          affectedServices:
            deterministic
              .affectedServices,

          affectedResources:
            deterministic
              .affectedResources,

          likelySharedDependencies:
            sharedDependencies,

          propagationPaths,

          suspiciousResources,

          findings:
            deduplicateFindings([
              ...deterministicFindings,
              ...aiFindings,
            ]),

          observations:
            normalizeArray(
              aiOutput
                .observations
            ),

          unknowns:
            normalizeArray(
              aiOutput
                .unknowns
            ),

          topologyConfidence,

          executionAuthorized:
            false,
        },

        {
          confidence:
            topologyConfidence,

          evidenceUsed:
            this.collectEvidenceIds(
              context
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
  // VALIDATE CONTEXT
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
          "Topology analysis requires incidentId"
        ),
        {
          code:
            "TOPOLOGY_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.incident
    ) {
      throw Object.assign(
        new Error(
          "Topology analysis requires incident context"
        ),
        {
          code:
            "TOPOLOGY_CONTEXT_INCIDENT_DATA_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // DETERMINISTIC ANALYSIS
  // ==========================================================================

  analyzeTopology(
    context
  ) {
    const blastRadius =
      context
        .blastRadius ||
      {};

    const summary =
      blastRadius
        .summary ||
      {};

    const affectedServices =
      normalizeArray(
        blastRadius
          .affectedServices
      );

    const affectedResources =
      normalizeArray(
        blastRadius
          .affectedResources
      );

    const rootService =
      context
        .topology
        ?.rootService ||
      context
        .service ||
      null;

    const levels =
      normalizeArray(
        context
          .topology
          ?.levels
      );

    // ========================================================================
    // SCOPE
    // ========================================================================

    let scope =
      "isolated";

    if (
      Number(
        summary
          .affectedServiceCount ||
        affectedServices.length
      ) >
      1
    ) {
      scope =
        "multi_service";
    }

    if (
      Number(
        summary
          .affectedResourceCount ||
        affectedResources.length
      ) >
      3
    ) {
      scope =
        "infrastructure_wide";
    }

    if (
      affectedServices
        .length >
        5
    ) {
      scope =
        "broad_service_impact";
    }

    // ========================================================================
    // SHARED DEPENDENCIES
    // ========================================================================

    const likelySharedDependencies =
      this.findSharedDependencies(
        affectedServices
      );

    // ========================================================================
    // PROPAGATION PATHS
    // ========================================================================

    const propagationPaths =
      this.buildPropagationPaths(
        rootService,
        levels
      );

    // ========================================================================
    // SUSPICIOUS RESOURCES
    // ========================================================================

    const suspiciousResources =
      affectedResources
        .filter(
          (
            resource
          ) =>
            this.isSuspiciousResource(
              resource
            )
        )
        .map(
          (
            resource
          ) => ({
            id:
              resource.id ||
              resource._id ||
              null,

            name:
              resource.name ||
              null,

            provider:
              resource.provider ||
              null,

            resourceType:
              resource
                .resourceType ||
              null,

            healthStatus:
              resource
                .healthStatus ||
              null,

            criticality:
              resource
                .criticality ||
              null,

            reason:
              this.resourceSuspicionReason(
                resource
              ),
          })
        );

    // ========================================================================
    // CONFIDENCE
    // ========================================================================

    const topologyConfidence =
      this.calculateTopologyConfidence({
        rootService,

        affectedServices,

        affectedResources,

        levels,

        summary,
      });

    return {
      scope,

      rootService,

      affectedServices,

      affectedResources,

      likelySharedDependencies,

      propagationPaths,

      suspiciousResources,

      topologyConfidence,
    };
  }

  // ==========================================================================
  // SHARED DEPENDENCIES
  // ==========================================================================

  findSharedDependencies(
    services
  ) {
    const dependencies =
      new Map();

    for (
      const service
      of services
    ) {
      const dependencyType =
        service
          .dependencyType;

      if (
        !dependencyType
      ) {
        continue;
      }

      if (
        !dependencies.has(
          dependencyType
        )
      ) {
        dependencies.set(
          dependencyType,
          {
            dependencyType,

            serviceCount:
              0,

            services:
              [],

            maxCriticality:
              0,
          }
        );
      }

      const entry =
        dependencies.get(
          dependencyType
        );

      entry.serviceCount +=
        1;

      entry.services.push({
        id:
          service.id ||
          null,

        name:
          service.name ||
          null,
      });

      entry.maxCriticality =
        Math.max(
          entry.maxCriticality,
          Number(
            service
              .criticality ||
            0
          )
        );
    }

    return [
      ...dependencies
        .values(),
    ]
      .filter(
        (
          dependency
        ) =>
          dependency
            .serviceCount >
          1
      );
  }

  // ==========================================================================
  // PROPAGATION PATHS
  // ==========================================================================

  buildPropagationPaths(
    rootService,
    levels
  ) {
    if (
      !rootService
    ) {
      return [];
    }

    const paths =
      [];

    const root = {
      id:
        rootService.id ||
        rootService._id ||
        null,

      name:
        rootService.name ||
        rootService.slug ||
        "root-service",
    };

    for (
      const level
      of levels
    ) {
      for (
        const service
        of (
          level.services ||
          []
        )
      ) {
        paths.push({
          from:
            root,

          to: {
            id:
              service.id ||
              null,

            name:
              service.name ||
              null,
          },

          depth:
            level.depth,

          dependencyType:
            service
              .dependencyType ||
            null,

          confidence:
            clamp01(
              service
                .confidence ??
              1
            ),
        });
      }
    }

    return paths;
  }

  // ==========================================================================
  // SUSPICIOUS RESOURCE
  // ==========================================================================

  isSuspiciousResource(
    resource
  ) {
    const health =
      String(
        resource
          ?.healthStatus ||
        ""
      )
        .toLowerCase();

    const criticality =
      resource
        ?.criticality;

    return (
      [
        "unhealthy",
        "degraded",
        "failed",
        "critical",
      ].includes(
        health
      ) ||
      [
        "critical",
        "high",
      ].includes(
        String(
          criticality ||
          ""
        )
          .toLowerCase()
      )
    );
  }

  resourceSuspicionReason(
    resource
  ) {
    const reasons =
      [];

    if (
      resource
        .healthStatus
    ) {
      reasons.push(
        `health=${resource.healthStatus}`
      );
    }

    if (
      resource
        .criticality
    ) {
      reasons.push(
        `criticality=${resource.criticality}`
      );
    }

    return (
      reasons.join(
        ", "
      ) ||
      "Resource participates in incident blast radius"
    );
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  calculateTopologyConfidence({
    rootService,
    affectedServices,
    affectedResources,
    levels,
    summary,
  }) {
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
      Boolean(
        rootService
      ),
      0.3
    );

    component(
      Array.isArray(
        affectedServices
      ),
      0.2
    );

    component(
      Array.isArray(
        affectedResources
      ),
      0.2
    );

    component(
      levels.length >
      0,
      0.15
    );

    component(
      summary &&
      Object.keys(
        summary
      ).length >
      0,
      0.15
    );

    if (
      weight ===
      0
    ) {
      return 0;
    }

    return Number(
      (
        score /
        weight
      )
        .toFixed(
          4
        )
    );
  }

  // ==========================================================================
  // FINDINGS
  // ==========================================================================

  buildFindings(
    context,
    analysis
  ) {
    const findings =
      [];

    findings.push(
      createAgentFinding({
        id:
          `finding:topology-scope:${context.incidentId}`,

        agent:
          AGENT_NAME,

        findingType:
          "topology_scope",

        title:
          `Incident topology scope: ${analysis.scope}`,

        summary:
          `${analysis.affectedServices.length} affected service(s), ${analysis.affectedResources.length} affected resource(s).`,

        confidence:
          analysis
            .topologyConfidence,

        evidenceIds:
          this.collectEvidenceIds(
            context
          ),

        affectedServices:
          analysis
            .affectedServices
            .map(
              (
                service
              ) =>
                service.id
            )
            .filter(
              Boolean
            ),

        affectedResources:
          analysis
            .affectedResources
            .map(
              (
                resource
              ) =>
                resource.id
            )
            .filter(
              Boolean
            ),
      })
    );

    if (
      analysis
        .likelySharedDependencies
        .length >
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:shared-dependency:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "shared_dependency",

          title:
            "Shared dependency pattern detected",

          summary:
            `${analysis.likelySharedDependencies.length} shared dependency pattern(s) were identified across affected services.`,

          confidence:
            analysis
              .topologyConfidence,

          evidenceIds: [
            `topology:${context.incidentId}`,
          ],

          metadata: {
            sharedDependencies:
              analysis
                .likelySharedDependencies,
          },
        })
      );
    }

    if (
      analysis
        .suspiciousResources
        .length >
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:suspicious-resources:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "suspicious_resource",

          title:
            "Potentially relevant unhealthy resources identified",

          summary:
            `${analysis.suspiciousResources.length} resource(s) are unhealthy, degraded, or highly critical.`,

          confidence:
            analysis
              .topologyConfidence,

          evidenceIds: [
            `blast-radius:${context.incidentId}`,
          ],

          affectedResources:
            analysis
              .suspiciousResources
              .map(
                (
                  resource
                ) =>
                  resource.id
              )
              .filter(
                Boolean
              ),

          metadata: {
            resources:
              analysis
                .suspiciousResources,
          },
        })
      );
    }

    return findings;
  }

  // ==========================================================================
  // AI FINDINGS
  // ==========================================================================

  buildAiFindings(
    context,
    output,
    confidence
  ) {
    const observations =
      normalizeArray(
        output
          ?.observations
      );

    return observations
      .slice(
        0,
        25
      )
      .map(
        (
          observation,
          index
        ) => {
          const text =
            typeof observation ===
              "string"
              ? observation
              : (
                  observation
                    ?.summary ||
                  observation
                    ?.title ||
                  ""
                );

          if (
            !text
          ) {
            return null;
          }

          return createAgentFinding({
            id:
              `finding:topology-ai:${crypto
                .createHash(
                  "sha1"
                )
                .update(
                  `${index}:${text}`
                )
                .digest(
                  "hex"
                )
                .slice(
                  0,
                  12
                )}`,

            agent:
              AGENT_NAME,

            findingType:
              "topology_observation",

            title:
              text.slice(
                0,
                200
              ),

            summary:
              text,

            confidence:
              clamp01(
                observation
                  ?.confidence ??
                confidence
              ),

            evidenceIds:
              Array.isArray(
                observation
                  ?.evidenceIds
              )
                ? observation
                    .evidenceIds
                : [],
          });
        }
      )
      .filter(
        Boolean
      );
  }

  // ==========================================================================
  // EVIDENCE IDS
  // ==========================================================================

  collectEvidenceIds(
    context
  ) {
    const available =
      context
        .evidence
        ?.items ||
      [];

    return available
      .filter(
        (
          evidence
        ) =>
          [
            "TOPOLOGY",
            "BLAST_RADIUS",
            "DEPENDENCY_STATE",
            "RESOURCE_STATE",
            "KUBERNETES_EVENT",
          ].includes(
            evidence.type
          )
      )
      .map(
        (
          evidence
        ) =>
          evidence.id
      );
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
          "TopologyAnalysisAgent cannot authorize execution",
        ],
      };
    }

    if (
      !record
        .result
        ?.scope
    ) {
      return {
        valid:
          false,

        errors: [
          "TopologyAnalysisAgent must return scope",
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
        "context.topology",
        "context.blastRadius",
        "context.dependencies",
        "context.resources",
        "context.symptoms",
        "context.evidence",
      ],

      writes: [
        "context.findings",
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
// HELPERS
// ============================================================================

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function normalizeScope(
  scope
) {
  const normalized =
    String(
      scope ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    [
      "isolated",
      "multi_service",
      "infrastructure_wide",
      "broad_service_impact",
      "unknown",
    ].includes(
      normalized
    )
  ) {
    return normalized;
  }

  return "unknown";
}

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

function clamp01OrNull(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return null;
  }

  return clamp01(
    number
  );
}

function mergeUniqueObjects(
  first,
  second
) {
  const map =
    new Map();

  for (
    const value
    of [
      ...normalizeArray(
        first
      ),

      ...normalizeArray(
        second
      ),
    ]
  ) {
    if (
      !value
    ) {
      continue;
    }

    let key;

    try {
      key =
        JSON.stringify(
          value
        );
    } catch {
      continue;
    }

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        value
      );
    }
  }

  return [
    ...map.values(),
  ];
}

function deduplicateFindings(
  findings
) {
  const map =
    new Map();

  for (
    const finding
    of findings
  ) {
    if (
      !finding?.id
    ) {
      continue;
    }

    const existing =
      map.get(
        finding.id
      );

    if (
      !existing ||
      (
        finding
          .confidence ||
        0
      ) >
      (
        existing
          .confidence ||
        0
      )
    ) {
      map.set(
        finding.id,
        finding
      );
    }
  }

  return [
    ...map.values(),
  ];
}

// ============================================================================
// PROMPT
// ============================================================================

const TOPOLOGY_SYSTEM_PROMPT =
  `
You are the AIRA Topology Analysis Agent.

Your task is to understand WHERE an incident is propagating through
services and infrastructure.

You are NOT the final root-cause agent.

Rules:

1. Determine whether the failure appears isolated or distributed.
2. Identify propagation paths supported by topology evidence.
3. Identify shared dependencies across affected services.
4. Identify unhealthy or highly critical infrastructure resources.
5. Distinguish a failing dependency from an affected downstream service.
6. Do not infer causality merely because a dependency exists.
7. Prefer explicit AIRA topology and owner relationships over guesses.
8. Do not invent services, dependencies, clusters, nodes, databases,
   queues, caches, or resources.
9. Surface unknown topology when evidence is incomplete.
10. Do not recommend infrastructure mutation.
11. Do not execute playbooks or runbooks.
12. Never authorize execution.
13. Return ONLY valid JSON.

Return:
{
  "scope": "isolated|multi_service|infrastructure_wide|broad_service_impact|unknown",
  "likelySharedDependencies": [],
  "propagationPaths": [],
  "suspiciousResources": [],
  "observations": [],
  "unknowns": [],
  "topologyConfidence": 0.0
}
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  TopologyAnalysisAgent,
};