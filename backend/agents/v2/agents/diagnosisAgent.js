"use strict";

/**
 * Diagnosis Agent
 *
 * Ranks probable root causes from collected evidence.
 * Produces structured hypotheses with mandatory evidence citations.
 *
 * Phase 3:
 * - deterministic Kubernetes diagnosis first
 * - LLM reasoning second
 * - deterministic findings are converted into evidence-backed hypotheses
 *
 * SAFETY INVARIANTS:
 * - Every hypothesis MUST cite evidence IDs
 * - Never proposes raw shell commands
 * - Never executes anything
 * - Never creates Playbooks
 * - Never modifies IncidentMemory directly
 * - Distinguishes FACT vs INFERENCE clearly
 */

const {
  BaseAgent,
} = require("../runtime/baseAgent");

const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  createHypothesis,
  createDiagnosisResult,
} = require("../contracts/agentContracts");

const {
  getReasoningProvider,
} = require("../runtime/reasoningProvider");

const kubernetesDiagnosisService =
  require("../../../services/diagnosis/kubernetesDiagnosisService");

const AGENT_NAME =
  "DiagnosisAgent";

const AGENT_VERSION =
  "2.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Well-known root cause codes
// ─────────────────────────────────────────────────────────────────────────────

const ROOT_CAUSE =
  Object.freeze({
    APPLICATION_STARTUP_FAILURE:
      "APPLICATION_STARTUP_FAILURE",

    MISSING_SECRET:
      "MISSING_SECRET",

    BAD_CONFIGURATION:
      "BAD_CONFIGURATION",

    DEPENDENCY_UNAVAILABLE:
      "DEPENDENCY_UNAVAILABLE",

    OOM:
      "OOM",

    FAILED_DEPLOYMENT:
      "FAILED_DEPLOYMENT",

    HIGH_ERROR_RATE:
      "HIGH_ERROR_RATE",

    RESOURCE_EXHAUSTION:
      "RESOURCE_EXHAUSTION",

    CASCADING_FAILURE:
      "CASCADING_FAILURE",

    NETWORK_PARTITION:
      "NETWORK_PARTITION",

    DATABASE_OVERLOAD:
      "DATABASE_OVERLOAD",

    NODE_FAILURE:
      "NODE_FAILURE",

    IMAGE_PULL_FAILURE:
      "IMAGE_PULL_FAILURE",

    UNKNOWN:
      "UNKNOWN",
  });

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning output schema
// ─────────────────────────────────────────────────────────────────────────────

const OUTPUT_SCHEMA = {
  required: [
    "hypotheses",
    "diagnosisConfidence",
    "recommendedIncidentType",
  ],

  properties: {
    hypotheses: {
      type:
        "array",
    },

    primaryHypothesis: {
      type:
        "string",
    },

    diagnosisConfidence: {
      type:
        "number",
    },

    evidenceCompleteness: {
      type:
        "number",
    },

    unresolvedQuestions: {
      type:
        "array",
    },

    recommendedIncidentType: {
      type:
        "string",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis Agent
// ─────────────────────────────────────────────────────────────────────────────

class DiagnosisAgent
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

  validateInput(
    context
  ) {
    const base =
      super.validateInput(
        context
      );

    if (!base.valid) {
      return base;
    }

    const errors = [];

    if (
      !context.evidence
    ) {
      errors.push(
        "context.evidence is required for diagnosis"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  }

  async execute(
    context,
    dependencies = {}
  ) {
    const startedAt =
      new Date();

    const provider =
      this._reasoning ||
      getReasoningProvider();

    try {
      const {
        incidentId,
        correlationId,
        tenantId,
        incident,
        evidence,
        service,
        resource,
      } = context;

      const evidenceItems =
        evidence?.items ||
        [];

      const evidenceIds =
        evidenceItems.map(
          (item) =>
            item.id
        );

      // ───────────────────────────────────────────────────────────────────────
      // 1. Deterministic Kubernetes diagnosis
      //
      // This is based on structured evidence already collected by the
      // Investigation Agent.
      //
      // It does NOT execute infrastructure and does NOT select a playbook.
      // ───────────────────────────────────────────────────────────────────────

      const kubernetesDiagnosis =
        kubernetesDiagnosisService
          .diagnose({
            incident,

            evidencePackage:
              evidence,
          });

      const deterministicHypotheses =
        _buildDeterministicHypotheses({
          incidentId,

          kubernetesDiagnosis,

          evidenceItems,
        });

      // ───────────────────────────────────────────────────────────────────────
      // 2. AI diagnosis
      //
      // LLM receives deterministic diagnosis context, but must still cite
      // evidence IDs and remain inside the root-cause enum.
      // ───────────────────────────────────────────────────────────────────────

      const reasoning =
        await provider.reason({
          task:
            "diagnosis",

          systemInstructions:
            DIAGNOSIS_SYSTEM_PROMPT,

          structuredInput: {
            incident,

            service:
              service ||
              {},

            resource:
              resource ||
              {},

            deterministicDiagnosis: {
              primary:
                kubernetesDiagnosis
                  ?.primary ||
                null,

              candidates:
                kubernetesDiagnosis
                  ?.candidates ||
                [],
            },

            evidence:
              evidenceItems.map(
                (item) => ({
                  id:
                    item.id,

                  type:
                    item.type,

                  summary:
                    item.summary,

                  confidence:
                    item.confidence,

                  safeData:
                    _extractSafeData(
                      item
                    ),
                })
              ),

            correlationId,
          },

          outputSchema:
            OUTPUT_SCHEMA,

          metadata: {
            incidentId,
            correlationId,
            tenantId,
          },
        });

      if (
        reasoning.manualRequired
      ) {
        /**
         * If deterministic Kubernetes diagnosis already produced
         * strong evidence, we do NOT lose that diagnosis merely because
         * the LLM provider failed.
         */
        if (
          deterministicHypotheses.length >
          0
        ) {
          const diagnosisResult =
            _buildDiagnosisResultFromDeterministic({
              incident,
              evidence,
              deterministicHypotheses,
              kubernetesDiagnosis,
            });

          return this._success(
            startedAt,

            {
              diagnosisResult,
            },

            {
              confidence:
                diagnosisResult
                  .diagnosisConfidence,

              evidenceUsed:
                evidenceIds,

              model:
                null,

              provider:
                "deterministic-kubernetes",

              fallbackUsed:
                true,

              warnings: [
                "LLM diagnosis unavailable; deterministic Kubernetes diagnosis used",
              ],
            }
          );
        }

        return this._manual(
          startedAt,

          reasoning.manualReason ||
            AGENT_MANUAL_REASON
              .REASONING_FAILED,

          {
            evidenceUsed:
              evidenceIds,
          }
        );
      }

      const output =
        reasoning.output ||
        {};

      // ───────────────────────────────────────────────────────────────────────
      // 3. Validate AI hypotheses
      // ───────────────────────────────────────────────────────────────────────

      const rawHypotheses =
        Array.isArray(
          output.hypotheses
        )
          ? output.hypotheses
          : [];

      const aiHypotheses =
        rawHypotheses.map(
          (
            hypothesis,
            index
          ) => {
            const supporting =
              Array.isArray(
                hypothesis
                  .evidenceSupporting
              )
                ? hypothesis
                    .evidenceSupporting
                : [];

            const against =
              Array.isArray(
                hypothesis
                  .evidenceAgainst
              )
                ? hypothesis
                    .evidenceAgainst
                : [];

            /**
             * Hallucination guard:
             * evidence IDs not present in the actual package are discarded.
             */
            const validSupporting =
              supporting.filter(
                (id) =>
                  evidenceIds.includes(
                    id
                  )
              );

            const validAgainst =
              against.filter(
                (id) =>
                  evidenceIds.includes(
                    id
                  )
              );

            /**
             * A diagnosis without real supporting evidence gets
             * deliberately weakened.
             */
            let confidence =
              typeof hypothesis
                .confidence ===
              "number"
                ? _clamp01(
                    hypothesis
                      .confidence
                  )
                : 0;

            if (
              validSupporting.length ===
              0
            ) {
              confidence =
                Math.min(
                  confidence,
                  0.35
                );
            }

            return createHypothesis({
              id:
                `hyp-ai-${incidentId}-${index}`,

              rootCause:
                _sanitizeRootCause(
                  hypothesis
                    .rootCause
                ),

              confidence,

              evidenceSupporting:
                validSupporting,

              evidenceAgainst:
                validAgainst,

              affectedResources:
                Array.isArray(
                  hypothesis
                    .affectedResources
                )
                  ? hypothesis
                      .affectedResources
                  : [],

              explanation:
                typeof hypothesis
                  .explanation ===
                "string"
                  ? hypothesis
                      .explanation
                  : "",
            });
          }
        );

      // ───────────────────────────────────────────────────────────────────────
      // 4. Merge deterministic + AI hypotheses
      // ───────────────────────────────────────────────────────────────────────

      const hypotheses =
        _mergeHypotheses(
          deterministicHypotheses,
          aiHypotheses
        );

      hypotheses.sort(
        (a, b) =>
          b.confidence -
          a.confidence
      );

      const primaryHypothesis =
        hypotheses.length >
        0
          ? hypotheses[0].id
          : null;

      const strongest =
        hypotheses[0]
          ?.confidence ||
        0;

      const aiConfidence =
        typeof output
          .diagnosisConfidence ===
        "number"
          ? _clamp01(
              output
                .diagnosisConfidence
            )
          : 0;

      /**
       * Diagnostic confidence should not become lower simply because
       * the LLM is less confident than a strong deterministic fact.
       */
      const diagnosisConfidence =
        Math.max(
          strongest,
          aiConfidence
        );

      const recommendedIncidentType =
        _resolveIncidentType({
          outputType:
            output
              .recommendedIncidentType,

          deterministicPrimary:
            kubernetesDiagnosis
              ?.primary,

          incident,
        });

      const diagnosisResult =
        createDiagnosisResult({
          hypotheses,

          primaryHypothesis,

          diagnosisConfidence,

          evidenceCompleteness:
            typeof output
              .evidenceCompleteness ===
            "number"
              ? _clamp01(
                  output
                    .evidenceCompleteness
                )
              : (
                  evidence
                    ?.completeness ||
                  0
                ),

          unresolvedQuestions:
            Array.isArray(
              output
                .unresolvedQuestions
            )
              ? output
                  .unresolvedQuestions
              : [],

          recommendedIncidentType,
        });

      return this._success(
        startedAt,

        {
          diagnosisResult,

          /**
           * Keep deterministic diagnostic metadata available
           * for audit/debugging without changing DiagnosisResult's
           * stable contract.
           */
          deterministicDiagnosis:
            kubernetesDiagnosis,
        },

        {
          confidence:
            diagnosisConfidence,

          evidenceUsed:
            evidenceIds,

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

    if (
      record.status ===
      AGENT_STATUS.SUCCESS
    ) {
      if (
        !record.result
          ?.diagnosisResult
      ) {
        return {
          valid:
            false,

          errors: [
            "diagnosisResult missing from output",
          ],
        };
      }
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
        "context.evidence",
        "kubernetes.deterministicDiagnosis",
      ],

      writes: [
        "context.diagnosis",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic hypothesis conversion
// ─────────────────────────────────────────────────────────────────────────────

function _buildDeterministicHypotheses({
  incidentId,
  kubernetesDiagnosis,
  evidenceItems,
}) {
  const candidates =
    kubernetesDiagnosis
      ?.candidates ||
    [];

  if (
    candidates.length ===
    0
  ) {
    return [];
  }

  return candidates.map(
    (
      candidate,
      index
    ) => {
      const evidenceSupporting =
        _findEvidenceIdsForCandidate(
          candidate,
          evidenceItems
        );

      return createHypothesis({
        id:
          `hyp-k8s-${incidentId}-${index}`,

        rootCause:
          _mapKubernetesRootCause(
            candidate.code
          ),

        confidence:
          _clamp01(
            candidate.confidence
          ),

        evidenceSupporting,

        evidenceAgainst:
          [],

        affectedResources:
          _extractAffectedResources(
            candidate
          ),

        explanation:
          `[FACT + deterministic inference] ${candidate.rootCause}`,
      });
    }
  );
}

function _findEvidenceIdsForCandidate(
  candidate,
  evidenceItems
) {
  const ids =
    new Set();

  const code =
    candidate?.code;

  for (
    const item
    of evidenceItems
  ) {
    const data =
      item.structuredData ||
      {};

    const signals =
      data.failureSignals ||
      [];

    if (
      code ===
      "K8S_CRASH_LOOP_BACKOFF" &&
      signals.some(
        (signal) =>
          signal.reason ===
          "CrashLoopBackOff"
      )
    ) {
      ids.add(
        item.id
      );
    }

    if (
      code ===
      "K8S_OOM_KILLED" &&
      signals.some(
        (signal) =>
          signal.reason ===
          "OOMKilled"
      )
    ) {
      ids.add(
        item.id
      );
    }

    if (
      code ===
      "K8S_IMAGE_PULL_FAILURE" &&
      signals.some(
        (signal) =>
          [
            "ImagePullBackOff",
            "ErrImagePull",
          ].includes(
            signal.reason
          )
      )
    ) {
      ids.add(
        item.id
      );
    }

    if (
      code ===
      "K8S_FAILED_ROLLOUT" &&
      (
        item.id?.startsWith(
          "ev-k8s-ownership-"
        ) ||
        item.id?.startsWith(
          "ev-k8s-siblings-"
        )
      )
    ) {
      ids.add(
        item.id
      );
    }

    if (
      code ===
      "K8S_NODE_NOT_READY" &&
      item.id?.startsWith(
        "ev-k8s-node-"
      )
    ) {
      ids.add(
        item.id
      );
    }
  }

  return Array.from(
    ids
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root-cause mapping
// ─────────────────────────────────────────────────────────────────────────────

function _mapKubernetesRootCause(
  code
) {
  switch (
    code
  ) {
    case "K8S_CRASH_LOOP_BACKOFF":
      return ROOT_CAUSE
        .APPLICATION_STARTUP_FAILURE;

    case "K8S_OOM_KILLED":
      return ROOT_CAUSE
        .OOM;

    case "K8S_IMAGE_PULL_FAILURE":
      return ROOT_CAUSE
        .IMAGE_PULL_FAILURE;

    case "K8S_FAILED_ROLLOUT":
      return ROOT_CAUSE
        .FAILED_DEPLOYMENT;

    case "K8S_NODE_NOT_READY":
      return ROOT_CAUSE
        .NODE_FAILURE;

    default:
      return ROOT_CAUSE
        .UNKNOWN;
  }
}

function _resolveIncidentType({
  outputType,
  deterministicPrimary,
  incident,
}) {
  if (
    deterministicPrimary
      ?.code
  ) {
    return deterministicPrimary
      .code;
  }

  if (
    outputType &&
    typeof outputType ===
      "string"
  ) {
    return outputType;
  }

  return (
    incident?.type ||
    "unknown"
  );
}

function _extractAffectedResources(
  candidate
) {
  const resources =
    [];

  const evidence =
    candidate
      ?.evidence ||
    {};

  if (
    evidence.deployment
  ) {
    resources.push({
      kind:
        "deployment",

      name:
        evidence.deployment,
    });
  }

  if (
    evidence.node
  ) {
    resources.push({
      kind:
        "node",

      name:
        evidence.node,
    });
  }

  return resources;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hypothesis merging
// ─────────────────────────────────────────────────────────────────────────────

function _mergeHypotheses(
  deterministic,
  ai
) {
  const merged =
    [];

  const deterministicByCause =
    new Map();

  for (
    const hypothesis
    of deterministic
  ) {
    deterministicByCause.set(
      hypothesis.rootCause,
      hypothesis
    );

    merged.push(
      hypothesis
    );
  }

  for (
    const hypothesis
    of ai
  ) {
    const existing =
      deterministicByCause.get(
        hypothesis.rootCause
      );

    if (!existing) {
      merged.push(
        hypothesis
      );

      continue;
    }

    /**
     * If AI agrees with a deterministic hypothesis,
     * enrich the deterministic item rather than creating a duplicate.
     */
    existing.evidenceSupporting =
      Array.from(
        new Set([
          ...(
            existing
              .evidenceSupporting ||
            []
          ),

          ...(
            hypothesis
              .evidenceSupporting ||
            []
          ),
        ])
      );

    existing.evidenceAgainst =
      Array.from(
        new Set([
          ...(
            existing
              .evidenceAgainst ||
            []
          ),

          ...(
            hypothesis
              .evidenceAgainst ||
            []
          ),
        ])
      );

    existing.confidence =
      Math.max(
        existing.confidence,
        hypothesis.confidence
      );

    if (
      hypothesis.explanation
    ) {
      existing.explanation =
        `${existing.explanation} AI assessment: ${hypothesis.explanation}`;
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitization
// ─────────────────────────────────────────────────────────────────────────────

function _sanitizeRootCause(
  value
) {
  if (!value) {
    return ROOT_CAUSE
      .UNKNOWN;
  }

  const upper =
    String(value)
      .toUpperCase()
      .trim()
      .replace(
        /[\s-]+/g,
        "_"
      );

  return (
    ROOT_CAUSE[upper] ||
    ROOT_CAUSE.UNKNOWN
  );
}

function _extractSafeData(
  evidenceItem
) {
  const structuredData =
    evidenceItem
      .structuredData;

  if (
    !structuredData ||
    typeof structuredData !==
      "object" ||
    evidenceItem.sensitive
  ) {
    return {};
  }

  return _deepStripSensitive(
    structuredData
  );
}

function _deepStripSensitive(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      _deepStripSensitive
    );
  }

  if (
    typeof value !==
      "object"
  ) {
    return value;
  }

  const safe =
    {};

  const secretPatterns =
    /password|secret|token|api[_-]?key|private[_-]?key|credential|authorization|auth[_-]?header|certificate|cert/i;

  for (
    const [
      key,
      nestedValue,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      secretPatterns.test(
        key
      )
    ) {
      safe[key] =
        "[REDACTED]";

      continue;
    }

    safe[key] =
      _deepStripSensitive(
        nestedValue
      );
  }

  return safe;
}

function _clamp01(
  value
) {
  const number =
    Number(value);

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

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic-only fallback
// ─────────────────────────────────────────────────────────────────────────────

function _buildDiagnosisResultFromDeterministic({
  incident,
  evidence,
  deterministicHypotheses,
  kubernetesDiagnosis,
}) {
  const hypotheses =
    [...deterministicHypotheses]
      .sort(
        (a, b) =>
          b.confidence -
          a.confidence
      );

  const primaryHypothesis =
    hypotheses[0]
      ?.id ||
    null;

  const diagnosisConfidence =
    hypotheses[0]
      ?.confidence ||
    0;

  return createDiagnosisResult({
    hypotheses,

    primaryHypothesis,

    diagnosisConfidence,

    evidenceCompleteness:
      evidence
        ?.completeness ||
      0,

    unresolvedQuestions:
      [],

    recommendedIncidentType:
      kubernetesDiagnosis
        ?.primary
        ?.code ||
      incident?.type ||
      "unknown",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis prompt
// ─────────────────────────────────────────────────────────────────────────────

const DIAGNOSIS_SYSTEM_PROMPT =
  `
You are the AIRA Diagnosis Agent.

You rank probable root causes using collected evidence.

The input may contain a deterministic Kubernetes diagnosis produced from
structured Kubernetes evidence.

Rules:

1. Produce multiple hypotheses where ambiguity exists.
2. Every hypothesis MUST cite real evidence IDs.
3. Distinguish FACT from INFERENCE.
4. Never claim certainty without evidence.
5. Deterministic Kubernetes evidence based on container state and ownerReferences
   should be treated as stronger than unsupported speculation.
6. Never invent Kubernetes state that is not present in the evidence.
7. Never propose shell commands, kubectl commands, SQL, or executable instructions.
8. Never execute anything.
9. Never create Playbooks.
10. Use only these rootCause values:
    APPLICATION_STARTUP_FAILURE,
    MISSING_SECRET,
    BAD_CONFIGURATION,
    DEPENDENCY_UNAVAILABLE,
    OOM,
    FAILED_DEPLOYMENT,
    HIGH_ERROR_RATE,
    RESOURCE_EXHAUSTION,
    CASCADING_FAILURE,
    NETWORK_PARTITION,
    DATABASE_OVERLOAD,
    NODE_FAILURE,
    IMAGE_PULL_FAILURE,
    UNKNOWN.
11. diagnosisConfidence measures diagnostic confidence only.
12. Playbook selection is handled by another agent.
13. Return ONLY valid JSON.
`.trim();

module.exports = {
  DiagnosisAgent,
  ROOT_CAUSE,
};