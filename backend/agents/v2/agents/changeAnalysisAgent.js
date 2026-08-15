"use strict";

/**
 * AIRA Change Analysis Agent
 *
 * Phase 6 responsibility:
 *
 * Analyze operational changes that occurred near the incident:
 *
 * - deployments
 * - image/version changes
 * - configuration changes
 * - Kubernetes rollouts
 * - infrastructure changes
 *
 * This agent identifies temporal relationships only.
 *
 * It MUST NOT assume:
 *
 * "deployment happened before outage"
 * =
 * "deployment caused outage"
 *
 * SAFETY:
 *
 * - read-only
 * - no rollback
 * - no deployment mutation
 * - no execution authorization
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
  "ChangeAnalysisAgent";

const AGENT_VERSION =
  "1.0.0";

class ChangeAnalysisAgent
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

    this.defaultWindowMinutes =
      Number(
        config
          .changeWindowMinutes ||
        process.env
          .DIAGNOSIS_CHANGE_WINDOW_MINUTES
      ) ||
      240;
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
      // 1. NORMALIZE CHANGES
      // ======================================================================

      const normalizedChanges =
        this.normalizeChanges(
          context
        );

      // ======================================================================
      // 2. ANALYZE TEMPORAL RELATIONSHIP
      // ======================================================================

      const analysis =
        this.analyzeChanges(
          context,
          normalizedChanges
        );

      // ======================================================================
      // 3. DETERMINISTIC FINDINGS
      // ======================================================================

      const deterministicFindings =
        this.buildFindings(
          context,
          analysis
        );

      // ======================================================================
      // 4. AI REFINEMENT
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "change_analysis",

            systemInstructions:
              CHANGE_ANALYSIS_SYSTEM_PROMPT,

            structuredInput: {
              incident:
                context.incident,

              service:
                context.service,

              symptoms:
                context.symptoms ||
                [],

              incidentTiming:
                context.timing ||
                {},

              changes:
                analysis.changes,

              temporallyRelevantChanges:
                analysis
                  .temporallyRelevantChanges,

              deterministicAssessment: {
                changeCount:
                  analysis.changeCount,

                relevantChangeCount:
                  analysis
                    .relevantChangeCount,

                closestChange:
                  analysis
                    .closestChange,

                changeCategories:
                  analysis
                    .changeCategories,

                changeConfidence:
                  analysis
                    .changeConfidence,
              },
            },

            outputSchema: {
              required: [
                "relevantChanges",
                "changeConfidence",
              ],

              properties: {
                relevantChanges: {
                  type:
                    "array",
                },

                observations: {
                  type:
                    "array",
                },

                suspiciousChanges: {
                  type:
                    "array",
                },

                contradictions: {
                  type:
                    "array",
                },

                unknowns: {
                  type:
                    "array",
                },

                changeConfidence: {
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
      // 5. CONFIDENCE
      // ======================================================================

      const aiConfidence =
        clamp01OrNull(
          aiOutput
            .changeConfidence
        );

      let changeConfidence;

      const canonical =
        Boolean(
          context.organizationId &&
          context.environmentId
        );

      if (
        aiConfidence ===
        null
      ) {
        changeConfidence =
          analysis
            .changeConfidence;
      } else if (
        !canonical
      ) {
        changeConfidence =
          aiConfidence;
      } else {
        changeConfidence =
          Number(
            (
              analysis
                .changeConfidence *
                0.8 +
              aiConfidence *
                0.2
            )
              .toFixed(
                4
              )
          );
      }

      // ======================================================================
      // 6. MERGE RELEVANT CHANGES
      // ======================================================================

      const relevantChanges =
        mergeChanges(
          analysis
            .temporallyRelevantChanges,

          normalizeArray(
            aiOutput
              .relevantChanges
          )
        );

      const suspiciousChanges =
        mergeChanges(
          analysis
            .suspiciousChanges,

          normalizeArray(
            aiOutput
              .suspiciousChanges
          )
        );

      // ======================================================================
      // 7. AI FINDINGS
      // ======================================================================

      const aiFindings =
        this.buildAiFindings(
          context,
          aiOutput,
          changeConfidence
        );

      // ======================================================================
      // 8. RESULT
      // ======================================================================

      return this._success(
        startedAt,

        {
          changes:
            analysis.changes,

          relevantChanges,

          suspiciousChanges,

          closestChange:
            analysis
              .closestChange,

          changeCategories:
            analysis
              .changeCategories,

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

          contradictions:
            normalizeArray(
              aiOutput
                .contradictions
            ),

          unknowns:
            normalizeArray(
              aiOutput
                .unknowns
            ),

          changeConfidence,

          executionAuthorized:
            false,
        },

        {
          confidence:
            changeConfidence,

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
  // CONTEXT
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
          "Change analysis requires incidentId"
        ),
        {
          code:
            "CHANGE_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.incident
    ) {
      throw Object.assign(
        new Error(
          "Change analysis requires incident context"
        ),
        {
          code:
            "CHANGE_CONTEXT_INCIDENT_DATA_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // NORMALIZE CHANGES
  // ==========================================================================

  normalizeChanges(
    context
  ) {
    const values =
      normalizeArray(
        context.changes
      );

    return values
      .map(
        (
          change,
          index
        ) =>
          this.normalizeChange(
            change,
            index
          )
      )
      .filter(
        Boolean
      )
      .sort(
        (
          first,
          second
        ) =>
          new Date(
            first.occurredAt ||
            0
          ) -
          new Date(
            second.occurredAt ||
            0
          )
      );
  }

  normalizeChange(
    change,
    index
  ) {
    if (
      !change ||
      typeof change !==
        "object"
    ) {
      return null;
    }

    const occurredAt =
      change.occurredAt ||
      change.deployedAt ||
      change.timestamp ||
      change.createdAt ||
      change.updatedAt ||
      null;

    return {
      id:
        String(
          change.id ||
          change._id ||
          `change-${index}`
        ),

      type:
        normalizeChangeType(
          change.type ||
          change.changeType ||
          change.eventType
        ),

      title:
        change.title ||
        change.name ||
        change.description ||
        "Operational change",

      description:
        change.description ||
        null,

      occurredAt,

      serviceId:
        change.serviceId
          ? String(
              change.serviceId
            )
          : null,

      resourceId:
        change.resourceId
          ? String(
              change.resourceId
            )
          : null,

      provider:
        change.provider ||
        null,

      actor:
        change.actor ||
        change.user ||
        null,

      version:
        change.version ||
        null,

      previousVersion:
        change.previousVersion ||
        null,

      image:
        change.image ||
        null,

      previousImage:
        change.previousImage ||
        null,

      configurationKey:
        change.configurationKey ||
        change.configKey ||
        null,

      source:
        change.source ||
        null,

      metadata:
        change.metadata ||
        {},
    };
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  analyzeChanges(
    context,
    changes
  ) {
    const incidentTime =
      parseDate(
        context
          .incident
          ?.detectedAt ||
        context
          .incident
          ?.startedAt ||
        context
          .timing
          ?.detectedAt ||
        context
          .timing
          ?.incidentStartedAt
      );

    const windowMs =
      this.defaultWindowMinutes *
      60 *
      1000;

    const relevant =
      [];

    const suspicious =
      [];

    for (
      const change
      of changes
    ) {
      const changeTime =
        parseDate(
          change
            .occurredAt
        );

      if (
        !incidentTime ||
        !changeTime
      ) {
        continue;
      }

      const deltaMs =
        incidentTime -
        changeTime;

      const happenedBeforeIncident =
        deltaMs >=
        0;

      const withinWindow =
        happenedBeforeIncident &&
        deltaMs <=
          windowMs;

      change.minutesBeforeIncident =
        happenedBeforeIncident
          ? Number(
              (
                deltaMs /
                60000
              )
                .toFixed(
                  2
                )
            )
          : null;

      change.temporallyRelevant =
        withinWindow;

      if (
        withinWindow
      ) {
        relevant.push(
          change
        );
      }

      if (
        withinWindow &&
        this.isPotentiallyRiskyChange(
          change
        )
      ) {
        suspicious.push({
          ...change,

          suspicionReason:
            this.suspicionReason(
              change
            ),
        });
      }
    }

    const closestChange =
      relevant
        .slice()
        .sort(
          (
            first,
            second
          ) =>
            (
              first
                .minutesBeforeIncident ??
              Infinity
            ) -
            (
              second
                .minutesBeforeIncident ??
              Infinity
            )
        )[0] ||
      null;

    const categories =
      Array.from(
        new Set(
          changes
            .map(
              (
                change
              ) =>
                change.type
            )
            .filter(
              Boolean
            )
        )
      );

    return {
      changes,

      changeCount:
        changes.length,

      relevantChangeCount:
        relevant.length,

      temporallyRelevantChanges:
        relevant,

      suspiciousChanges:
        suspicious,

      closestChange,

      changeCategories:
        categories,

      changeConfidence:
        this.calculateChangeConfidence({
          context,

          changes,

          relevant,

          incidentTime,
        }),
    };
  }

  // ==========================================================================
  // RISKY CHANGES
  // ==========================================================================

  isPotentiallyRiskyChange(
    change
  ) {
    return [
      "deployment",
      "image_change",
      "configuration_change",
      "infrastructure_change",
      "dependency_change",
      "scaling_change",
      "rollout",
    ].includes(
      change.type
    );
  }

  suspicionReason(
    change
  ) {
    switch (
      change.type
    ) {
      case "deployment":
        return (
          "Deployment occurred shortly before incident detection."
        );

      case "image_change":
        return (
          "Container/image version changed shortly before incident detection."
        );

      case "configuration_change":
        return (
          "Configuration changed shortly before incident detection."
        );

      case "dependency_change":
        return (
          "Dependency configuration/version changed near incident onset."
        );

      case "scaling_change":
        return (
          "Capacity or replica configuration changed near incident onset."
        );

      case "rollout":
        return (
          "Rollout activity occurred shortly before incident detection."
        );

      case "infrastructure_change":
        return (
          "Infrastructure state changed near incident onset."
        );

      default:
        return (
          "Operational change occurred near incident onset."
        );
    }
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  calculateChangeConfidence({
    context,
    changes,
    relevant,
    incidentTime,
  }) {
    if (
      changes.length ===
      0
    ) {
      return 0;
    }

    let score =
      0;

    let weight =
      0;

    const component =
      (
        condition,
        value
      ) => {
        weight +=
          value;

        if (
          condition
        ) {
          score +=
            value;
        }
      };

    component(
      Boolean(
        incidentTime
      ),
      0.25
    );

    component(
      relevant.length >
      0,
      0.3
    );

    component(
      changes.some(
        (
          change
        ) =>
          Boolean(
            change
              .serviceId
          )
      ),
      0.15
    );

    component(
      changes.some(
        (
          change
        ) =>
          Boolean(
            change
              .version ||
            change
              .image ||
            change
              .configurationKey
          )
      ),
      0.15
    );

    component(
      Boolean(
        context
          .service
          ?.id
      ),
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

    if (
      analysis
        .changes
        .length ===
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:no-change-data:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "missing_change_evidence",

          title:
            "No operational change evidence available",

          summary:
            "AIRA has no deployment/configuration change evidence for the configured investigation window.",

          confidence:
            1,

          evidenceIds:
            [],
        })
      );

      return findings;
    }

    findings.push(
      createAgentFinding({
        id:
          `finding:change-window:${context.incidentId}`,

        agent:
          AGENT_NAME,

        findingType:
          "change_timeline",

        title:
          `${analysis.relevantChangeCount} change(s) occurred near incident onset`,

        summary:
          `${analysis.changeCount} total change(s) were analyzed; ${analysis.relevantChangeCount} occurred within the configured ${this.defaultWindowMinutes}-minute pre-incident window.`,

        confidence:
          analysis
            .changeConfidence,

        evidenceIds:
          this.collectEvidenceIds(
            context
          ),

        metadata: {
          closestChange:
            analysis
              .closestChange,

          windowMinutes:
            this.defaultWindowMinutes,
        },
      })
    );

    if (
      analysis
        .suspiciousChanges
        .length >
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:temporally-relevant-change:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "temporally_relevant_change",

          title:
            "Potentially relevant recent operational change detected",

          summary:
            `${analysis.suspiciousChanges.length} potentially impactful change(s) occurred before the incident. Temporal proximity alone does not establish causation.`,

          confidence:
            analysis
              .changeConfidence,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),

          metadata: {
            changes:
              analysis
                .suspiciousChanges,
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
    return normalizeArray(
      output
        ?.observations
    )
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

          if (!text) {
            return null;
          }

          return createAgentFinding({
            id:
              `finding:change-ai:${crypto
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
              "change_observation",

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
              normalizeArray(
                observation
                  ?.evidenceIds
              ),
          });
        }
      )
      .filter(
        Boolean
      );
  }

  // ==========================================================================
  // EVIDENCE
  // ==========================================================================

  collectEvidenceIds(
    context
  ) {
    return (
      context
        .evidence
        ?.items ||
      []
    )
      .filter(
        (
          evidence
        ) =>
          [
            "DEPLOYMENT_CHANGE",
            "CONFIGURATION_CHANGE",
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
          "ChangeAnalysisAgent cannot authorize execution",
        ],
      };
    }

    if (
      !Array.isArray(
        record
          .result
          ?.changes
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "ChangeAnalysisAgent must return changes",
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
        "context.changes",
        "context.incident",
        "context.service",
        "context.symptoms",
        "context.timing",
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

function normalizeChangeType(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    normalized.includes(
      "deploy"
    )
  ) {
    return "deployment";
  }

  if (
    normalized.includes(
      "rollout"
    )
  ) {
    return "rollout";
  }

  if (
    normalized.includes(
      "config"
    )
  ) {
    return "configuration_change";
  }

  if (
    normalized.includes(
      "image"
    )
  ) {
    return "image_change";
  }

  if (
    normalized.includes(
      "scale"
    )
  ) {
    return "scaling_change";
  }

  if (
    normalized.includes(
      "depend"
    )
  ) {
    return "dependency_change";
  }

  if (
    normalized.includes(
      "infra"
    )
  ) {
    return "infrastructure_change";
  }

  return normalized ||
    "unknown_change";
}

function parseDate(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
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

  return Math.max(
    0,
    Math.min(
      1,
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

function mergeChanges(
  first,
  second
) {
  const map =
    new Map();

  for (
    const change
    of [
      ...normalizeArray(
        first
      ),
      ...normalizeArray(
        second
      ),
    ]
  ) {
    if (!change) {
      continue;
    }

    const key =
      String(
        change.id ||
        change.changeId ||
        JSON.stringify(
          change
        )
      );

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        change
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

    const previous =
      map.get(
        finding.id
      );

    if (
      !previous ||
      (
        finding
          .confidence ||
        0
      ) >
      (
        previous
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

const CHANGE_ANALYSIS_SYSTEM_PROMPT =
  `
You are the AIRA Change Analysis Agent.

Your task is to analyze changes that occurred near an incident.

Changes may include:
- deployments
- releases
- image changes
- configuration changes
- scaling events
- dependency changes
- Kubernetes rollouts
- infrastructure changes

Rules:

1. Temporal proximity does NOT prove causality.
2. Identify changes that occurred before incident onset.
3. Prefer changes affecting the incident service or its dependencies.
4. Identify version/image/config transitions when available.
5. Distinguish relevant changes from unrelated changes.
6. Flag suspicious changes only when there is operational reason to investigate them.
7. Do not declare a deployment to be the root cause.
8. Do not invent deployments or configuration changes.
9. Surface missing change history when unavailable.
10. Consider contradictions, such as a change occurring after symptoms began.
11. Never perform rollback.
12. Never execute infrastructure operations.
13. Never authorize execution.
14. Return ONLY valid JSON.

Return:
{
  "relevantChanges": [],
  "suspiciousChanges": [],
  "observations": [],
  "contradictions": [],
  "unknowns": [],
  "changeConfidence": 0.0
}
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  ChangeAnalysisAgent,
};