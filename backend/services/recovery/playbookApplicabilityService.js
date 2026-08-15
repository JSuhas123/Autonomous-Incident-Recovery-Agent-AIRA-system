"use strict";

/**
 * AIRA Playbook Applicability Service
 *
 * Phase 7.3
 *
 * Evaluates whether a discovered recovery candidate is actually applicable
 * to the current incident, diagnosis and environment.
 *
 * Responsibilities:
 *
 * - evaluate playbook preconditions
 * - validate required context
 * - validate required integrations
 * - validate target/service/resource compatibility
 * - validate environment restrictions
 * - reject inapplicable candidates safely
 *
 * DOES NOT:
 *
 * - execute playbooks
 * - authorize execution
 * - perform policy approval
 * - perform final ranking
 * - invent commands
 */

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
} =
  require(
    "./recoveryDecisionContracts"
  );

class PlaybookApplicabilityService {
  constructor(
    options = {}
  ) {
    this.options =
      options;
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async evaluateCandidates(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const candidates =
      Array.isArray(
        input.candidates
      )
        ? input.candidates
        : [];

    const context =
      input.context ||
      {};

    const diagnosis =
      input.diagnosis ||
      {};

    const playbookRepository =
      dependencies.playbookRepository ||
      input.playbookRepository ||
      null;

    if (
      !playbookRepository
    ) {
      throw Object.assign(
        new Error(
          "Playbook repository is required for applicability evaluation"
        ),
        {
          code:
            "PLAYBOOK_APPLICABILITY_REPOSITORY_REQUIRED",
        }
      );
    }

    const evaluated =
      [];

    for (
      const candidate
      of candidates
    ) {
      const playbook =
        await this.loadPlaybook(
          playbookRepository,
          candidate.playbookId
        );

      if (
        !playbook
      ) {
        evaluated.push(
          this.buildRejectedCandidate(
            candidate,
            {
              code:
                "PLAYBOOK_NOT_FOUND",

              reason:
                "Playbook definition could not be loaded.",
            }
          )
        );

        continue;
      }

      const result =
        await this.evaluatePlaybook({
          candidate,
          playbook,
          diagnosis,
          context,
          dependencies,
        });

      evaluated.push(
        result
      );
    }

    const applicable =
      evaluated.filter(
        (
          candidate
        ) =>
          candidate.status ===
          CANDIDATE_STATUS
            .APPLICABLE
      );

    const inapplicable =
      evaluated.filter(
        (
          candidate
        ) =>
          candidate.status !==
          CANDIDATE_STATUS
            .APPLICABLE
      );

    return {
      candidates:
        evaluated,

      applicableCandidates:
        applicable,

      rejectedCandidates:
        inapplicable,

      applicableCount:
        applicable.length,

      rejectedCount:
        inapplicable.length,

      noApplicableCandidates:
        applicable.length ===
        0,

      evaluationVersion:
        "phase7.3-v1",

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SINGLE PLAYBOOK
  // ==========================================================================

  async evaluatePlaybook({
    candidate,
    playbook,
    diagnosis,
    context,
    dependencies,
  }) {
    const reasons =
      [];

    const failedPreconditions =
      [];

    let score =
      1;

    // ------------------------------------------------------------------------
    // 1. ENABLED / APPROVED
    // ------------------------------------------------------------------------

    if (
      playbook.enabled ===
      false
    ) {
      failedPreconditions.push(
        "playbook_disabled"
      );

      reasons.push(
        "Playbook is disabled."
      );

      score -=
        0.4;
    }

    const status =
      String(
        playbook.status ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      ![
        "approved",
        "active",
        "published",
      ].includes(
        status
      )
    ) {
      failedPreconditions.push(
        "playbook_not_approved"
      );

      reasons.push(
        "Playbook is not approved for recovery evaluation."
      );

      score -=
        0.4;
    }

    // ------------------------------------------------------------------------
    // 2. ENVIRONMENT
    // ------------------------------------------------------------------------

    const environmentResult =
      this.evaluateEnvironment(
        playbook,
        context
      );

    reasons.push(
      ...environmentResult.reasons
    );

    failedPreconditions.push(
      ...environmentResult
        .failedPreconditions
    );

    score -=
      environmentResult.penalty;

    // ------------------------------------------------------------------------
    // 3. SERVICE COMPATIBILITY
    // ------------------------------------------------------------------------

    const serviceResult =
      this.evaluateService(
        playbook,
        context
      );

    reasons.push(
      ...serviceResult.reasons
    );

    failedPreconditions.push(
      ...serviceResult
        .failedPreconditions
    );

    score -=
      serviceResult.penalty;

    // ------------------------------------------------------------------------
    // 4. RESOURCE COMPATIBILITY
    // ------------------------------------------------------------------------

    const resourceResult =
      this.evaluateResources(
        playbook,
        context
      );

    reasons.push(
      ...resourceResult.reasons
    );

    failedPreconditions.push(
      ...resourceResult
        .failedPreconditions
    );

    score -=
      resourceResult.penalty;

    // ------------------------------------------------------------------------
    // 5. REQUIRED INTEGRATIONS
    // ------------------------------------------------------------------------

    const integrationResult =
      this.evaluateIntegrations(
        playbook,
        context,
        dependencies
      );

    reasons.push(
      ...integrationResult.reasons
    );

    failedPreconditions.push(
      ...integrationResult
        .failedPreconditions
    );

    score -=
      integrationResult.penalty;

    // ------------------------------------------------------------------------
    // 6. REQUIRED PARAMETERS
    // ------------------------------------------------------------------------

    const parameterResult =
      this.evaluateRequiredParameters(
        playbook,
        diagnosis,
        context
      );

    reasons.push(
      ...parameterResult.reasons
    );

    failedPreconditions.push(
      ...parameterResult
        .failedPreconditions
    );

    score -=
      parameterResult.penalty;

    // ------------------------------------------------------------------------
    // 7. CUSTOM DECLARED PRECONDITIONS
    // ------------------------------------------------------------------------

    const declaredResult =
      await this.evaluateDeclaredPreconditions(
        playbook,
        diagnosis,
        context,
        dependencies
      );

    reasons.push(
      ...declaredResult.reasons
    );

    failedPreconditions.push(
      ...declaredResult
        .failedPreconditions
    );

    score -=
      declaredResult.penalty;

    score =
      clamp01(
        score
      );

    const applicable =
      failedPreconditions.length ===
      0;

    return createRecoveryCandidate({
      ...candidate,

      status:
        applicable
          ? CANDIDATE_STATUS
              .APPLICABLE
          : CANDIDATE_STATUS
              .PRECONDITION_FAILED,

      applicability: {
        applicable,

        score,

        reasons:
          uniqueStrings(
            reasons
          ),

        failedPreconditions:
          uniqueStrings(
            failedPreconditions
          ),
      },

      metadata: {
        ...(
          candidate.metadata ||
          {}
        ),

        applicabilityVersion:
          "phase7.3-v1",
      },

      executionAuthorized:
        false,
    });
  }

  // ==========================================================================
  // ENVIRONMENT
  // ==========================================================================

  evaluateEnvironment(
    playbook,
    context
  ) {
    const allowed =
      normalizeStrings(
        playbook.environments ||
        playbook
          .constraints
          ?.environments
      );

    if (
      allowed.length ===
      0
    ) {
      return pass();
    }

    const current =
      normalizeText(
        context.environment ||
        context.environmentName ||
        context
          .incident
          ?.environment
      );

    if (
      current &&
      allowed.includes(
        current
      )
    ) {
      return pass(
        "Environment is supported."
      );
    }

    return fail(
      "environment_not_supported",
      "Current environment is not supported by this playbook.",
      0.3
    );
  }

  // ==========================================================================
  // SERVICE
  // ==========================================================================

  evaluateService(
    playbook,
    context
  ) {
    const supported =
      normalizeStrings(
        playbook.serviceTypes ||
        playbook
          .constraints
          ?.serviceTypes
      );

    if (
      supported.length ===
      0
    ) {
      return pass();
    }

    const current =
      normalizeText(
        context
          .service
          ?.type ||
        context
          .service
          ?.serviceType
      );

    if (
      current &&
      supported.includes(
        current
      )
    ) {
      return pass(
        "Service type is supported."
      );
    }

    return fail(
      "service_type_not_supported",
      "Current service type is not supported by this playbook.",
      0.25
    );
  }

  // ==========================================================================
  // RESOURCES
  // ==========================================================================

  evaluateResources(
    playbook,
    context
  ) {
    const required =
      normalizeStrings(
        playbook.resourceTypes ||
        playbook
          .constraints
          ?.resourceTypes
      );

    if (
      required.length ===
      0
    ) {
      return pass();
    }

    const available =
      this.extractResourceTypes(
        context
      );

    const match =
      required.some(
        (
          type
        ) =>
          available.includes(
            type
          )
      );

    if (
      match
    ) {
      return pass(
        "Required resource type is present."
      );
    }

    return fail(
      "resource_type_not_available",
      "Required resource type is not present in the incident context.",
      0.25
    );
  }

  // ==========================================================================
  // INTEGRATIONS
  // ==========================================================================

  evaluateIntegrations(
    playbook,
    context,
    dependencies
  ) {
    const required =
      normalizeStrings(
        playbook.requiredIntegrations ||
        playbook
          .preconditions
          ?.requiredIntegrations
      );

    if (
      required.length ===
      0
    ) {
      return pass();
    }

    const available =
      normalizeStrings([
        ...normalizeArray(
          context.integrations
        ),

        ...normalizeArray(
          dependencies.availableIntegrations
        ),

        ...normalizeArray(
          context
            .evidence
            ?.providerCoverage
        ),
      ]);

    const missing =
      required.filter(
        (
          integration
        ) =>
          !available.includes(
            integration
          )
      );

    if (
      missing.length ===
      0
    ) {
      return pass(
        "Required integrations are available."
      );
    }

    return {
      reasons: [
        `Missing required integrations: ${missing.join(", ")}.`,
      ],

      failedPreconditions:
        missing.map(
          (
            integration
          ) =>
            `integration_missing:${integration}`
        ),

      penalty:
        Math.min(
          0.5,
          missing.length *
          0.15
        ),
    };
  }

  // ==========================================================================
  // PARAMETERS
  // ==========================================================================

  evaluateRequiredParameters(
    playbook,
    diagnosis,
    context
  ) {
    const required =
      normalizeStrings(
        playbook.requiredParameters ||
        playbook
          .preconditions
          ?.requiredParameters
      );

    if (
      required.length ===
      0
    ) {
      return pass();
    }

    const available =
      this.buildParameterMap(
        diagnosis,
        context
      );

    const missing =
      required.filter(
        (
          parameter
        ) =>
          available[
            parameter
          ] ===
            null ||
          available[
            parameter
          ] ===
            undefined ||
          available[
            parameter
          ] ===
            ""
      );

    if (
      missing.length ===
      0
    ) {
      return pass(
        "Required playbook parameters are available."
      );
    }

    return {
      reasons: [
        `Missing required parameters: ${missing.join(", ")}.`,
      ],

      failedPreconditions:
        missing.map(
          (
            parameter
          ) =>
            `parameter_missing:${parameter}`
        ),

      penalty:
        Math.min(
          0.5,
          missing.length *
          0.15
        ),
    };
  }

  // ==========================================================================
  // DECLARED PRECONDITIONS
  // ==========================================================================

  async evaluateDeclaredPreconditions(
    playbook,
    diagnosis,
    context,
    dependencies
  ) {
    const preconditions =
      normalizeArray(
        playbook.preconditions
          ?.checks ||
        playbook.preconditions
      )
        .filter(
          (
            item
          ) =>
            item &&
            typeof item ===
            "object"
        );

    if (
      preconditions.length ===
      0
    ) {
      return pass();
    }

    const reasons =
      [];

    const failed =
      [];

    let penalty =
      0;

    for (
      const precondition
      of preconditions
    ) {
      const result =
        await this.evaluatePrecondition(
          precondition,
          diagnosis,
          context,
          dependencies
        );

      if (
        result.passed
      ) {
        if (
          result.reason
        ) {
          reasons.push(
            result.reason
          );
        }

        continue;
      }

      failed.push(
        precondition.id ||
        precondition.type ||
        "precondition_failed"
      );

      reasons.push(
        result.reason ||
        "Declared playbook precondition failed."
      );

      penalty +=
        0.2;
    }

    return {
      reasons,

      failedPreconditions:
        failed,

      penalty:
        Math.min(
          0.6,
          penalty
        ),
    };
  }

  // ==========================================================================
  // PRECONDITION TYPES
  // ==========================================================================

  async evaluatePrecondition(
    precondition,
    diagnosis,
    context,
    dependencies
  ) {
    const type =
      normalizeText(
        precondition.type
      );

    switch (
      type
    ) {
      case "incident_status":
        return this.checkAllowedValue(
          context
            .incident
            ?.status,
          precondition.allowed,
          "Incident status satisfies playbook precondition.",
          "Incident status does not satisfy playbook precondition."
        );

      case "severity":
        return this.checkAllowedValue(
          context
            .incident
            ?.severity,
          precondition.allowed,
          "Incident severity satisfies playbook precondition.",
          "Incident severity does not satisfy playbook precondition."
        );

      case "diagnosis_confidence": {
        const current =
          Number(
            diagnosis
              .diagnosisConfidence ||
            context
              .confidence
              ?.confidence ||
            0
          );

        const minimum =
          Number(
            precondition.minimum ||
            0
          );

        return current >=
          minimum
          ? {
              passed:
                true,

              reason:
                "Diagnosis confidence satisfies minimum threshold.",
            }
          : {
              passed:
                false,

              reason:
                `Diagnosis confidence ${current} is below required minimum ${minimum}.`,
            };
      }

      case "custom": {
        const evaluator =
          dependencies
            .preconditionEvaluator;

        if (
          typeof evaluator !==
          "function"
        ) {
          return {
            passed:
              false,

            reason:
              "Custom precondition evaluator is unavailable.",
          };
        }

        const result =
          await evaluator({
            precondition,
            diagnosis,
            context,
            playbookContext:
              dependencies,
          });

        return {
          passed:
            result?.passed ===
            true,

          reason:
            result?.reason ||
            null,
        };
      }

      default:
        return {
          passed:
            false,

          reason:
            `Unsupported precondition type: ${type || "unknown"}.`,
        };
    }
  }

  // ==========================================================================
  // ALLOWED VALUE CHECK
  // ==========================================================================

  checkAllowedValue(
    current,
    allowed,
    successReason,
    failureReason
  ) {
    const allowedValues =
      normalizeStrings(
        allowed
      );

    const normalizedCurrent =
      normalizeText(
        current
      );

    if (
      normalizedCurrent &&
      allowedValues.includes(
        normalizedCurrent
      )
    ) {
      return {
        passed:
          true,

        reason:
          successReason,
      };
    }

    return {
      passed:
        false,

      reason:
        failureReason,
    };
  }

  // ==========================================================================
  // PARAMETER MAP
  // ==========================================================================

  buildParameterMap(
    diagnosis,
    context
  ) {
    const service =
      context.service ||
      {};

    const incident =
      context.incident ||
      {};

    const primary =
      diagnosis
        .primaryHypothesis ||
      {};

    return {
      organizationid:
        context.organizationId ||
        null,

      environmentid:
        context.environmentId ||
        null,

      incidentid:
        context.incidentId ||
        incident._id ||
        null,

      serviceid:
        service.id ||
        service._id ||
        incident.serviceId ||
        null,

      servicename:
        service.name ||
        null,

      namespace:
        service.namespace ||
        context.namespace ||
        null,

      deployment:
        service.deployment ||
        context.deployment ||
        null,

      cluster:
        service.cluster ||
        context.cluster ||
        null,

      rootcause:
        primary.rootCause ||
        null,

      rootcausecategory:
        primary.category ||
        null,
    };
  }

  // ==========================================================================
  // RESOURCE TYPES
  // ==========================================================================

  extractResourceTypes(
    context
  ) {
    const topology =
      context
        .topologyAnalysis ||
      {};

    const resources = [
      ...normalizeArray(
        topology
          .affectedResources
      ),

      ...normalizeArray(
        topology
          .suspiciousResources
      ),

      ...normalizeArray(
        context.resources
      ),
    ];

    const values =
      [];

    for (
      const resource
      of resources
    ) {
      if (
        typeof resource ===
        "string"
      ) {
        values.push(
          resource
        );

        continue;
      }

      values.push(
        resource?.type,
        resource?.resourceType,
        resource?.kind,
        resource?.category
      );
    }

    return normalizeStrings(
      values
    );
  }

  // ==========================================================================
  // LOAD PLAYBOOK
  // ==========================================================================

  async loadPlaybook(
    repository,
    playbookId
  ) {
    if (
      typeof repository
        .findByPlaybookId ===
      "function"
    ) {
      return repository
        .findByPlaybookId(
          playbookId
        );
    }

    if (
      typeof repository
        .getById ===
      "function"
    ) {
      return repository
        .getById(
          playbookId
        );
    }

    if (
      typeof repository
        .findOne ===
      "function"
    ) {
      return repository
        .findOne({
          playbookId,
        });
    }

    throw Object.assign(
      new Error(
        "Playbook repository does not expose a supported lookup method"
      ),
      {
        code:
          "PLAYBOOK_APPLICABILITY_REPOSITORY_INVALID",
      }
    );
  }

  // ==========================================================================
  // REJECT CANDIDATE
  // ==========================================================================

  buildRejectedCandidate(
    candidate,
    {
      code,
      reason,
    }
  ) {
    return createRecoveryCandidate({
      ...candidate,

      status:
        CANDIDATE_STATUS
          .PRECONDITION_FAILED,

      applicability: {
        applicable:
          false,

        score:
          0,

        reasons: [
          reason,
        ],

        failedPreconditions: [
          code,
        ],
      },

      executionAuthorized:
        false,
    });
  }

  // ==========================================================================
  // INPUT VALIDATION
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Applicability input is required"
        ),
        {
          code:
            "PLAYBOOK_APPLICABILITY_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.diagnosis
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis is required"
        ),
        {
          code:
            "PLAYBOOK_APPLICABILITY_DIAGNOSIS_REQUIRED",
        }
      );
    }

    if (
      !Array.isArray(
        input.candidates
      )
    ) {
      throw Object.assign(
        new Error(
          "Recovery candidates are required"
        ),
        {
          code:
            "PLAYBOOK_APPLICABILITY_CANDIDATES_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Applicability evaluation cannot receive execution authorization"
        ),
        {
          code:
            "PLAYBOOK_APPLICABILITY_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function pass(
  reason = null
) {
  return {
    reasons:
      reason
        ? [
            reason,
          ]
        : [],

    failedPreconditions:
      [],

    penalty:
      0,
  };
}

function fail(
  code,
  reason,
  penalty
) {
  return {
    reasons: [
      reason,
    ],

    failedPreconditions: [
      code,
    ],

    penalty,
  };
}

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function normalizeText(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();

  return normalized ||
    null;
}

function normalizeStrings(
  values
) {
  const input =
    Array.isArray(
      values
    )
      ? values
      : [
          values,
        ];

  return [
    ...new Set(
      input
        .filter(
          (
            value
          ) =>
            value !==
              null &&
            value !==
              undefined
        )
        .map(
          (
            value
          ) =>
            String(
              value
            )
              .trim()
              .toLowerCase()
        )
        .filter(
          Boolean
        )
    ),
  ];
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      normalizeArray(
        values
      )
        .filter(
          Boolean
        )
        .map(
          String
        )
    ),
  ];
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

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new PlaybookApplicabilityService();

module.exports
  .PlaybookApplicabilityService =
  PlaybookApplicabilityService;