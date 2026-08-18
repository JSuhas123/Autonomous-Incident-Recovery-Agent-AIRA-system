"use strict";

/**
 * Parameter Resolution Agent
 *
 * Phase 12.9
 *
 * AI proposes candidate parameter values.
 *
 * FINAL AUTHORITY:
 * RunbookParameterResolver / deterministic parameter resolver.
 *
 * SAFETY INVARIANTS:
 *
 * - AI never makes a parameter execution-ready.
 * - actual parameter definitions must be deterministically validated.
 * - secret parameters accept reference identifiers only.
 * - plaintext secrets never enter the execution parameter set.
 * - unresolved required parameter => readyForExecution=false.
 * - ambiguous parameter => MANUAL_REQUIRED.
 * - deterministic validation failure => readyForExecution=false.
 * - executionAuthorized is always false.
 */

const {
  BaseAgent,
} =
  require(
    "../runtime/baseAgent"
  );

const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  createParameterRecommendation,
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

const {
  MANUAL_REASON,
} =
  require(
    "../../../constants/executionOutcomes"
  );

const AGENT_NAME =
  "ParameterResolutionAgent";

const AGENT_VERSION =
  "2.0.0";

const OUTPUT_SCHEMA = {
  required: [
    "candidates",
    "readyForExecution",
  ],

  properties: {
    candidates: {
      type:
        "array",
    },

    unresolved: {
      type:
        "array",
    },

    ambiguous: {
      type:
        "array",
    },

    readyForExecution: {
      type:
        "boolean",
    },
  },
};

class ParameterResolutionAgent
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

    if (
      !base.valid
    ) {
      return base;
    }

    const errors =
      [];

    if (
      !context
        .selectedPlaybook
    ) {
      errors.push(
        "context.selectedPlaybook is required"
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
        diagnosis,
        selectedPlaybook,
        playbookCandidates,
        resource,
        service,
      } =
        context;

      const evidenceItems =
        evidence
          ?.items ||
        [];

      // ======================================================================
      // 1. RESOLVE AUTHORITATIVE SELECTED PLAYBOOK SNAPSHOT
      // ======================================================================

      const selectedCandidate =
        (
          playbookCandidates ||
          []
        )
          .find(
            (candidate) =>
              candidate
                ?.playbookId ===
              selectedPlaybook
                ?.playbookId
          ) ||
        selectedPlaybook;

      const parameterDefinitions =
        _extractParameterDefinitions(
          selectedCandidate
        );

      // ======================================================================
      // 2. AI CANDIDATE PROPOSAL
      // ======================================================================

      const reasoning =
        await provider
          .reason({
            task:
              "parameterResolution",

            systemInstructions:
              PARAMETER_RESOLUTION_SYSTEM_PROMPT,

            structuredInput: {
              selectedPlaybook: {
                playbookId:
                  selectedPlaybook
                    ?.playbookId,

                semver:
                  selectedPlaybook
                    ?.semver,

                parameterDefinitions:
                  parameterDefinitions
                    .map(
                      _safeParameterDefinitionForModel
                    ),
              },

              incident,

              service:
                service ||
                {},

              resource:
                resource ||
                {},

              evidence:
                evidenceItems
                  .map(
                    (item) => ({
                      id:
                        item.id,

                      type:
                        item.type,

                      summary:
                        item.summary,

                      safeData:
                        _extractSafeData(
                          item
                        ),
                    })
                  ),

              diagnosis: {
                primaryHypothesisId:
                  diagnosis
                    ?.primaryHypothesisId ||
                  diagnosis
                    ?.primaryHypothesis ||
                  null,

                recommendedIncidentType:
                  diagnosis
                    ?.recommendedIncidentType ||
                  null,
              },
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
        return this._manual(
          startedAt,

          reasoning.manualReason ||
            AGENT_MANUAL_REASON
              .REASONING_FAILED,

          {
            evidenceUsed:
              evidenceItems
                .map(
                  (item) =>
                    item.id
                ),
          }
        );
      }

      const output =
        reasoning.output ||
        {};

      // ======================================================================
      // 3. NORMALIZE AI CANDIDATES
      // ======================================================================

      const validEvidenceIds =
        new Set(
          evidenceItems
            .map(
              (item) =>
                item.id
            )
        );

      const knownParameterNames =
        new Set(
          parameterDefinitions
            .map(
              _parameterName
            )
            .filter(
              Boolean
            )
        );

      const rawCandidates =
        Array.isArray(
          output.candidates
        )
          ? output.candidates
          : [];

      const safeCandidates =
        rawCandidates
          .filter(
            (candidate) =>
              candidate &&
              candidate.parameter
          )
          .filter(
            (candidate) =>
              parameterDefinitions.length ===
                0 ||
              knownParameterNames.has(
                String(
                  candidate.parameter
                )
              )
          )
          .map(
            (candidate) => {
              const parameter =
                String(
                  candidate.parameter
                );

              const secret =
                _isSecretParam(
                  parameter
                ) ||
                _definitionIsSecret(
                  parameterDefinitions,
                  parameter
                );

              const secretReferenceId =
                secret
                  ? _extractSecretReferenceId(
                      candidate
                    )
                  : null;

              return {
                parameter,

                /*
                 * Secret values are NEVER copied.
                 */
                proposedValue:
                  secret
                    ? null
                    : candidate
                        .proposedValue,

                secretReferenceId,

                confidence:
                  typeof candidate
                    .confidence ===
                    "number"
                    ? _clamp01(
                        candidate
                          .confidence
                      )
                    : 0.5,

                evidenceIds:
                  (
                    Array.isArray(
                      candidate.evidenceIds
                    )
                      ? candidate.evidenceIds
                      : []
                  )
                    .filter(
                      (id) =>
                        validEvidenceIds.has(
                          id
                        )
                    ),

                source:
                  candidate.source ||
                  "agent-inference",

                isSecretRef:
                  secret,
              };
            });

      const unresolved =
        _normalizeNames(
          output.unresolved
        );

      const ambiguous =
        _normalizeNames(
          output.ambiguous
        );

      // ======================================================================
      // 4. SECRET REQUIREMENTS
      // ======================================================================

      for (
        const definition
        of parameterDefinitions
      ) {
        const name =
          _parameterName(
            definition
          );

        if (
          !name ||
          !_parameterRequired(
            definition
          )
        ) {
          continue;
        }

        const secret =
          _definitionIsSecret(
            parameterDefinitions,
            name
          ) ||
          _isSecretParam(
            name
          );

        if (
          !secret
        ) {
          continue;
        }

        const candidate =
          safeCandidates
            .find(
              (entry) =>
                entry.parameter ===
                name
            );

        if (
          !candidate
            ?.secretReferenceId
        ) {
          _pushUnique(
            unresolved,
            name
          );
        }
      }

      // ======================================================================
      // 5. DETERMINISTIC PARAMETER RESOLUTION
      // ======================================================================

      const paramResolver =
        dependencies
          .runbookParameterResolver ||
        null;

      let deterministicResult =
        null;

      let deterministicValidated =
        false;

      const validationErrors =
        [];

      /*
       * No parameter definitions means there is nothing authoritative for the
       * resolver to validate.
       *
       * Do NOT trust the model's readyForExecution flag in that situation.
       */
      if (
        parameterDefinitions.length ===
        0
      ) {
        validationErrors.push(
          "Selected playbook does not expose deterministic parameter definitions"
        );
      } else if (
        !paramResolver ||
        typeof paramResolver
          .resolve !==
          "function"
      ) {
        validationErrors.push(
          "Deterministic RunbookParameterResolver is unavailable"
        );
      } else {
        const explicitInputs =
          {};

        for (
          const candidate
          of safeCandidates
        ) {
          if (
            candidate.confidence <
            0.7
          ) {
            continue;
          }

          if (
            candidate.isSecretRef
          ) {
            if (
              candidate
                .secretReferenceId
            ) {
              /*
               * Reference ID only — never secret material.
               */
              explicitInputs[
                candidate.parameter
              ] =
                candidate
                  .secretReferenceId;
            }

            continue;
          }

          if (
            candidate
              .proposedValue !==
              undefined &&
            candidate
              .proposedValue !==
              null
          ) {
            explicitInputs[
              candidate.parameter
            ] =
              candidate
                .proposedValue;
          }
        }

        try {
          const resolution =
            paramResolver
              .resolve(
                parameterDefinitions,

                {
                  explicitInputs,

                  incidentEvidence:
                    incident
                      ?.evidence ||
                    {},

                  alertLabels:
                    {},

                  humanInput:
                    {},
                }
              );

          const resolvedResult =
            (
              resolution &&
              typeof resolution.then ===
                "function"
            )
              ? await resolution
              : resolution;

          const resolved =
            resolvedResult
              ?.resolved ||
            {};

          const errors =
            resolvedResult
              ?.errors ||
            [];

          deterministicResult = {
            resolved,

            errors,
          };

          for (
            const error
            of errors
          ) {
            const normalized =
              _resolutionErrorToString(
                error
              );

            if (
              normalized
            ) {
              _pushUnique(
                validationErrors,
                normalized
              );
            }

            const parameter =
              _resolutionErrorParameter(
                error
              );

            if (
              parameter
            ) {
              _pushUnique(
                unresolved,
                parameter
              );
            }
          }

          deterministicValidated =
            errors.length ===
              0;
        } catch (
          error
        ) {
          deterministicValidated =
            false;

          validationErrors.push(
            `Deterministic parameter resolution failed: ${error.message}`
          );
        }
      }

      // ======================================================================
      // 6. VERIFY REQUIRED PARAMETERS
      // ======================================================================

      const resolvedParameters =
        deterministicResult
          ?.resolved ||
        {};

      for (
        const definition
        of parameterDefinitions
      ) {
        const name =
          _parameterName(
            definition
          );

        if (
          !name ||
          !_parameterRequired(
            definition
          )
        ) {
          continue;
        }

        const value =
          resolvedParameters[
            name
          ];

        if (
          value ===
            undefined ||
          value ===
            null ||
          value ===
            ""
        ) {
          _pushUnique(
            unresolved,
            name
          );
        }
      }

      // ======================================================================
      // 7. CANONICAL RESOLUTION RESULT
      // ======================================================================

      const readyForExecution =
        deterministicValidated &&
        unresolved.length ===
          0 &&
        ambiguous.length ===
          0 &&
        validationErrors.length ===
          0;

      const recommendation =
        createParameterRecommendation({
          candidates:
            safeCandidates,

          parameterDefinitions,

          deterministicResolutionResult:
            deterministicResult,

          resolvedParameters,

          unresolved,

          ambiguous,

          validationErrors,

          deterministicValidated,

          /*
           * AI output.readyForExecution is intentionally ignored.
           */
          readyForExecution,
        });

      // ======================================================================
      // 8. AMBIGUITY FAILS CLOSED
      // ======================================================================

      if (
        recommendation
          .ambiguous
          .length >
        0
      ) {
        return this._manual(
          startedAt,

          MANUAL_REASON
            .RESOURCE_AMBIGUOUS,

          {
            result:
              recommendation,

            evidenceUsed:
              evidenceItems
                .map(
                  (item) =>
                    item.id
                ),

            warnings: [
              `Ambiguous parameters: ${recommendation.ambiguous.join(", ")}`,
            ],

            nextRecommendedStage:
              "HUMAN_PARAMETER_RESOLUTION",
          }
        );
      }

      const parameterConfidence =
        safeCandidates.length >
          0
          ? safeCandidates
              .reduce(
                (
                  total,
                  candidate
                ) =>
                  total +
                  candidate.confidence,
                0
              ) /
              safeCandidates.length
          : 0;

      return this._success(
        startedAt,

        recommendation,

        {
          confidence:
            parameterConfidence,

          evidenceUsed:
            evidenceItems
              .map(
                (item) =>
                  item.id
              ),

          evidenceMissing:
            recommendation
              .unresolved,

          nextRecommendedStage:
            recommendation
              .readyForExecution
              ? "POLICY_EVALUATION"
              : "HUMAN_PARAMETER_RESOLUTION",

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

          warnings: [
            ...(
              reasoning
                .warnings ||
              []
            ),

            ...recommendation
              .validationErrors,
          ],
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

    if (
      !base.valid
    ) {
      return base;
    }

    if (
      record.status ===
        AGENT_STATUS.SUCCESS &&
      !record.result
    ) {
      return {
        valid:
          false,

        errors: [
          "parameter resolution result missing",
        ],
      };
    }

    if (
      record
        .result
        ?.readyForExecution ===
        true &&
      record
        .result
        ?.deterministicValidated !==
        true
    ) {
      return {
        valid:
          false,

        errors: [
          "readyForExecution requires deterministic validation",
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

  getCapabilities() {
    return {
      ...super.getCapabilities(),

      reads: [
        "context.selectedPlaybook",
        "context.playbookCandidates",
        "context.evidence",
        "context.incident",
        "runbookParameterResolver",
      ],

      writes: [
        "context.resolvedParameters",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,
    };
  }
}

const SECRET_PATTERNS =
  /password|secret|token|key|credential|auth|cert/i;

function _isSecretParam(
  name
) {
  return SECRET_PATTERNS
    .test(
      String(
        name ||
        ""
      )
    );
}

function _extractSecretReferenceId(
  candidate
) {
  const possible = [
    candidate
      ?.secretReferenceId,

    candidate
      ?.referenceId,

    candidate
      ?.secretRef,

    candidate
      ?.credentialReferenceId,
  ];

  for (
    const value
    of possible
  ) {
    if (
      typeof value ===
        "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

function _extractParameterDefinitions(
  candidate
) {
  if (
    !candidate ||
    typeof candidate !==
      "object"
  ) {
    return [];
  }

  const possibilities = [
    candidate
      .parameterDefinitions,

    candidate
      .parameters,

    candidate
      .runbookParameters,

    candidate
      .requiredParameters,
  ];

  for (
    const value
    of possibilities
  ) {
    if (
      Array.isArray(
        value
      ) &&
      value.length >
        0
    ) {
      return value;
    }
  }

  return [];
}

function _parameterName(
  definition
) {
  if (
    typeof definition ===
    "string"
  ) {
    return definition;
  }

  return (
    definition
      ?.name ||
    definition
      ?.parameter ||
    definition
      ?.key ||
    definition
      ?.id ||
    null
  );
}

function _parameterRequired(
  definition
) {
  if (
    typeof definition ===
    "string"
  ) {
    return true;
  }

  if (
    definition
      ?.required ===
    false
  ) {
    return false;
  }

  return true;
}

function _definitionIsSecret(
  definitions,
  name
) {
  const definition =
    definitions
      .find(
        (entry) =>
          String(
            _parameterName(
              entry
            )
          ) ===
          String(
            name
          )
      );

  if (
    !definition ||
    typeof definition ===
      "string"
  ) {
    return _isSecretParam(
      name
    );
  }

  return Boolean(
    definition.secret ||
    definition.sensitive ||
    definition.isSecret ||
    String(
      definition.type ||
      ""
    )
      .toLowerCase() ===
      "secret"
  );
}

function _safeParameterDefinitionForModel(
  definition
) {
  if (
    typeof definition ===
    "string"
  ) {
    return {
      name:
        definition,

      required:
        true,

      secret:
        _isSecretParam(
          definition
        ),
    };
  }

  const name =
    _parameterName(
      definition
    );

  return {
    name,

    required:
      _parameterRequired(
        definition
      ),

    type:
      definition
        ?.type ||
      null,

    description:
      definition
        ?.description ||
      null,

    secret:
      _definitionIsSecret(
        [
          definition,
        ],
        name
      ),
  };
}

function _extractSafeData(
  evidenceItem
) {
  const structuredData =
    evidenceItem
      ?.structuredData;

  if (
    !structuredData ||
    typeof structuredData !==
      "object" ||
    evidenceItem
      ?.sensitive ||
    evidenceItem
      ?.redacted
  ) {
    return {};
  }

  const safe =
    {};

  for (
    const [
      key,
      value,
    ] of Object.entries(
      structuredData
    )
  ) {
    if (
      !SECRET_PATTERNS.test(
        key
      )
    ) {
      safe[
        key
      ] =
        value;
    }
  }

  return safe;
}

function _normalizeNames(
  values
) {
  return Array.from(
    new Set(
      (
        Array.isArray(
          values
        )
          ? values
          : []
      )
        .map(
          (value) =>
            typeof value ===
              "string"
              ? value
              : (
                  value
                    ?.parameter ||
                  value
                    ?.name ||
                  value
                    ?.key ||
                  null
                )
        )
        .filter(
          Boolean
        )
        .map(
          String
        )
    )
  );
}

function _resolutionErrorToString(
  error
) {
  if (
    typeof error ===
    "string"
  ) {
    return error;
  }

  if (
    error &&
    typeof error ===
      "object"
  ) {
    return (
      error.message ||
      error.reason ||
      error.code ||
      JSON.stringify(
        error
      )
    );
  }

  return String(
    error ||
    ""
  );
}

function _resolutionErrorParameter(
  error
) {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return null;
  }

  return (
    error.parameter ||
    error.name ||
    error.key ||
    null
  );
}

function _pushUnique(
  array,
  value
) {
  if (
    value &&
    !array.includes(
      String(
        value
      )
    )
  ) {
    array.push(
      String(
        value
      )
    );
  }
}

function _clamp01(
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

const PARAMETER_RESOLUTION_SYSTEM_PROMPT =
  `
You are the AIRA Parameter Resolution Agent.

Your job is ONLY to propose evidence-backed candidate values for parameters
defined by the selected approved Playbook/Runbook.

Rules:

1. You may propose values ONLY for parameterDefinitions supplied in the input.
2. Cite canonical evidence IDs for every inferred candidate.
3. Never create new parameter names.
4. Never return plaintext passwords, API keys, tokens, certificates, private
   keys, credentials or other secrets.
5. For secret parameters, return only a secretReferenceId/referenceId if one
   is already present in trusted context. Never invent a secret reference.
6. If multiple resources are equally plausible, place the parameter name in
   ambiguous.
7. If evidence is insufficient, place the parameter name in unresolved.
8. readyForExecution is advisory only. AIRA's deterministic resolver is the
   final authority and may override you.
9. Never invent Playbook IDs, Runbook steps, shell commands or kubectl
   commands.
10. Never mutate infrastructure.
11. Return ONLY valid JSON.
`
    .trim();

module.exports = {
  ParameterResolutionAgent,
};