"use strict";

/**
 * AIRA Playbook Discovery Service
 *
 * Phase 7.2
 *
 * Responsibilities:
 *
 * - accept a canonical Phase 6 diagnosis
 * - inspect the approved playbook catalog
 * - find potentially relevant playbooks
 * - calculate a deterministic discovery match score
 * - convert discovered playbooks into RecoveryCandidate contracts
 *
 * DOES NOT:
 *
 * - execute playbooks
 * - authorize execution
 * - evaluate policy
 * - evaluate preconditions
 * - perform final ranking
 * - approve recovery
 * - invent remediation steps
 */

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
} =
  require(
    "./recoveryDecisionContracts"
  );

class PlaybookDiscoveryService {
  constructor(
    options = {}
  ) {
    this.playbookRepository =
      options.playbookRepository ||
      null;

    this.minimumDiscoveryScore =
      normalizeScore(
        options.minimumDiscoveryScore,
        0.2
      );

    this.maximumCandidates =
      normalizePositiveInteger(
        options.maximumCandidates,
        25
      );
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async discover(
    input = {},
    dependencies = {}
  ) {
    this.assertDiscoveryInput(
      input
    );

    const diagnosis =
      input.diagnosis;

    const context =
      input.context ||
      {};

    const incident =
      input.incident ||
      context.incident ||
      {};

    const repository =
      dependencies.playbookRepository ||
      this.playbookRepository;

    if (
      !repository
    ) {
      throw Object.assign(
        new Error(
          "Playbook repository is required"
        ),
        {
          code:
            "PLAYBOOK_REPOSITORY_REQUIRED",
        }
      );
    }

    // ------------------------------------------------------------------------
    // PHASE 6 SAFETY BOUNDARY
    // ------------------------------------------------------------------------

    this.assertDiagnosisEligible(
      input
    );

    // ------------------------------------------------------------------------
    // BUILD DISCOVERY PROFILE
    // ------------------------------------------------------------------------

    const profile =
      this.buildDiscoveryProfile({
        diagnosis,
        context,
        incident,
      });

    // ------------------------------------------------------------------------
    // LOAD APPROVED PLAYBOOKS
    // ------------------------------------------------------------------------

    const playbooks =
      await this.loadApprovedPlaybooks(
        repository,
        {
          organizationId:
            input.organizationId ||
            context.organizationId ||
            null,

          environmentId:
            input.environmentId ||
            context.environmentId ||
            null,

          profile,
        }
      );

    // ------------------------------------------------------------------------
    // MATCH PLAYBOOKS
    // ------------------------------------------------------------------------

    const discovered =
      [];

    for (
      const playbook
      of playbooks
    ) {
      if (
        !this.isApprovedPlaybook(
          playbook
        )
      ) {
        continue;
      }

      const match =
        this.calculateMatch(
          playbook,
          profile
        );

      if (
        match.score <
        this.minimumDiscoveryScore
      ) {
        continue;
      }

      discovered.push(
        createRecoveryCandidate({
          playbookId:
            this.resolvePlaybookId(
              playbook
            ),

          playbookVersion:
            playbook.version ||
            null,

          title:
            playbook.title ||
            playbook.name ||
            null,

          description:
            playbook.description ||
            null,

          category:
            playbook.category ||
            null,

          status:
            CANDIDATE_STATUS
              .DISCOVERED,

          diagnosisMatch: {
            score:
              match.score,

            reasons:
              match.reasons,
          },

          metadata: {
            source:
              "approved_playbook_catalog",

            discoveryVersion:
              "phase7.2-v1",

            playbookStatus:
              playbook.status ||
              null,

            tags:
              normalizeStrings(
                playbook.tags
              ),

            serviceTypes:
              normalizeStrings(
                playbook.serviceTypes
              ),

            resourceTypes:
              normalizeStrings(
                playbook.resourceTypes
              ),
          },

          executionAuthorized:
            false,
        })
      );
    }

    // ------------------------------------------------------------------------
    // DISCOVERY ORDER
    // ------------------------------------------------------------------------

    /*
     * This is NOT final Phase 7 ranking.
     *
     * We only order by deterministic discovery relevance so downstream
     * evaluators receive the strongest matches first.
     */

    discovered.sort(
      (
        left,
        right
      ) =>
        (
          right
            .diagnosisMatch
            .score -
          left
            .diagnosisMatch
            .score
        ) ||
        String(
          left.playbookId
        )
          .localeCompare(
            String(
              right.playbookId
            )
          )
    );

    const candidates =
      discovered.slice(
        0,
        this.maximumCandidates
      );

    return {
      candidates,

      candidateCount:
        candidates.length,

      totalApprovedPlaybooks:
        playbooks.filter(
          (
            playbook
          ) =>
            this.isApprovedPlaybook(
              playbook
            )
        )
          .length,

      profile,

      noCandidates:
        candidates.length ===
        0,

      discoveryVersion:
        "phase7.2-v1",

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // PHASE 6 ELIGIBILITY
  // ==========================================================================

  assertDiagnosisEligible(
    input
  ) {
    const safetyGate =
      input.safetyGate ||
      input.context
        ?.safetyGate ||
      null;

    const nextStep =
      input.diagnosis
        ?.recommendedNextStep
        ?.type;

    /*
     * Defense in depth:
     *
     * Phase 7 discovery must not start merely because somebody calls
     * this service directly.
     */

    if (
      safetyGate
        ?.decision !==
      "ALLOW_EVALUATION"
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis is not authorized for playbook evaluation"
        ),
        {
          code:
            "PLAYBOOK_DISCOVERY_NOT_ALLOWED",

          safetyGateDecision:
            safetyGate
              ?.decision ||
            null,
        }
      );
    }

    if (
      nextStep !==
      "EVALUATE_PLAYBOOK"
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis does not request playbook evaluation"
        ),
        {
          code:
            "PLAYBOOK_DISCOVERY_NEXT_STEP_INVALID",

          nextStep:
            nextStep ||
            null,
        }
      );
    }

    if (
      input.executionAuthorized ===
      true ||
      input.diagnosis
        ?.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Phase 6 diagnosis must not authorize execution"
        ),
        {
          code:
            "PLAYBOOK_DISCOVERY_UNSAFE_DIAGNOSIS",
        }
      );
    }
  }

  // ==========================================================================
  // INPUT VALIDATION
  // ==========================================================================

  assertDiscoveryInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Discovery input is required"
        ),
        {
          code:
            "PLAYBOOK_DISCOVERY_INPUT_REQUIRED",
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
            "PLAYBOOK_DISCOVERY_DIAGNOSIS_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // DISCOVERY PROFILE
  // ==========================================================================

  buildDiscoveryProfile({
    diagnosis,
    context,
    incident,
  }) {
    const primary =
      diagnosis
        ?.primaryHypothesis ||
      {};

    const hypotheses =
      Array.isArray(
        diagnosis
          ?.hypotheses
      )
        ? diagnosis.hypotheses
        : [];

    const symptoms =
      Array.isArray(
        diagnosis
          ?.symptoms
      )
        ? diagnosis.symptoms
        : [];

    const service =
      context.service ||
      {};

    const risk =
      diagnosis.risk ||
      context.riskAnalysis ||
      {};

    return {
      rootCause:
        normalizeText(
          primary.rootCause ||
          primary.title
        ),

      rootCauseCategory:
        normalizeText(
          primary.category
        ),

      hypothesisCategories:
        uniqueStrings(
          hypotheses.map(
            (
              hypothesis
            ) =>
              hypothesis.category
          )
        ),

      symptomTypes:
        uniqueStrings(
          symptoms.flatMap(
            (
              symptom
            ) => [
              symptom.type,
              symptom.category,
              symptom.name,
              symptom.title,
            ]
          )
        ),

      serviceId:
        normalizeText(
          service.id ||
          service.serviceId ||
          incident.serviceId
        ),

      serviceName:
        normalizeText(
          service.name ||
          incident.serviceName
        ),

      serviceType:
        normalizeText(
          service.type ||
          service.serviceType
        ),

      resourceTypes:
        uniqueStrings(
          this.extractResourceTypes(
            context
          )
        ),

      severity:
        normalizeText(
          incident.severity
        ),

      environment:
        normalizeText(
          context.environment ||
          context.environmentName ||
          incident.environment
        ),

      riskLevel:
        normalizeText(
          risk.riskLevel ||
          risk.level
        ),

      keywords:
        this.buildKeywords({
          primary,
          hypotheses,
          symptoms,
          service,
          incident,
        }),
    };
  }

  // ==========================================================================
  // RESOURCE TYPES
  // ==========================================================================

  extractResourceTypes(
    context
  ) {
    const values =
      [];

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

    return values;
  }

  // ==========================================================================
  // KEYWORDS
  // ==========================================================================

  buildKeywords({
    primary,
    hypotheses,
    symptoms,
    service,
    incident,
  }) {
    const values = [
      primary.rootCause,
      primary.title,
      primary.category,

      service.id,
      service.name,
      service.type,
      service.serviceType,

      incident.title,
      incident.issue,

      ...hypotheses.flatMap(
        (
          hypothesis
        ) => [
          hypothesis.rootCause,
          hypothesis.title,
          hypothesis.category,
        ]
      ),

      ...symptoms.flatMap(
        (
          symptom
        ) => [
          symptom.type,
          symptom.category,
          symptom.name,
          symptom.title,
        ]
      ),
    ];

    const tokens =
      [];

    for (
      const value
      of values
    ) {
      if (
        !value
      ) {
        continue;
      }

      tokens.push(
        ...tokenize(
          value
        )
      );
    }

    return uniqueStrings(
      tokens
    );
  }

  // ==========================================================================
  // LOAD APPROVED PLAYBOOKS
  // ==========================================================================

  async loadApprovedPlaybooks(
    repository,
    query
  ) {
    let result;

    if (
      typeof repository
        .findApproved ===
      "function"
    ) {
      result =
        await repository
          .findApproved(
            query
          );
    } else if (
      typeof repository
        .listApproved ===
      "function"
    ) {
      result =
        await repository
          .listApproved(
            query
          );
    } else if (
      typeof repository
        .find ===
      "function"
    ) {
      result =
        await repository
          .find({
            ...query,

            status:
              "approved",
          });
    } else {
      throw Object.assign(
        new Error(
          "Playbook repository does not expose a supported discovery method"
        ),
        {
          code:
            "PLAYBOOK_REPOSITORY_INVALID",
        }
      );
    }

    if (
      Array.isArray(
        result
      )
    ) {
      return result;
    }

    if (
      Array.isArray(
        result?.playbooks
      )
    ) {
      return result.playbooks;
    }

    if (
      Array.isArray(
        result?.items
      )
    ) {
      return result.items;
    }

    return [];
  }

  // ==========================================================================
  // APPROVAL CHECK
  // ==========================================================================

  isApprovedPlaybook(
    playbook
  ) {
    if (
      !playbook
    ) {
      return false;
    }

    if (
      playbook.enabled ===
      false
    ) {
      return false;
    }

    if (
      playbook.archived ===
      true
    ) {
      return false;
    }

    const status =
      String(
        playbook.status ||
        playbook.lifecycleStatus ||
        ""
      )
        .trim()
        .toLowerCase();

    return [
      "approved",
      "active",
      "published",
    ].includes(
      status
    );
  }

  // ==========================================================================
  // MATCH CALCULATION
  // ==========================================================================

  calculateMatch(
    playbook,
    profile
  ) {
    let score =
      0;

    const reasons =
      [];

    // ------------------------------------------------------------------------
    // ROOT CAUSE CATEGORY — 30%
    // ------------------------------------------------------------------------

    const categories =
      normalizeStrings([
        playbook.category,

        ...normalizeArray(
          playbook.categories
        ),

        ...normalizeArray(
          playbook.rootCauseCategories
        ),

        ...normalizeArray(
          playbook.match
            ?.rootCauseCategories
        ),
      ]);

    if (
      profile.rootCauseCategory &&
      includesNormalized(
        categories,
        profile.rootCauseCategory
      )
    ) {
      score +=
        0.3;

      reasons.push(
        "Root-cause category matched."
      );
    }

    // ------------------------------------------------------------------------
    // SYMPTOMS — 20%
    // ------------------------------------------------------------------------

    const supportedSymptoms =
      normalizeStrings([
        ...normalizeArray(
          playbook.symptoms
        ),

        ...normalizeArray(
          playbook.supportedSymptoms
        ),

        ...normalizeArray(
          playbook.match
            ?.symptoms
        ),
      ]);

    if (
      hasIntersection(
        supportedSymptoms,
        profile.symptomTypes
      )
    ) {
      score +=
        0.2;

      reasons.push(
        "Observed symptom matched playbook coverage."
      );
    }

    // ------------------------------------------------------------------------
    // SERVICE TYPE — 15%
    // ------------------------------------------------------------------------

    const serviceTypes =
      normalizeStrings([
        ...normalizeArray(
          playbook.serviceTypes
        ),

        ...normalizeArray(
          playbook.match
            ?.serviceTypes
        ),
      ]);

    if (
      profile.serviceType &&
      includesNormalized(
        serviceTypes,
        profile.serviceType
      )
    ) {
      score +=
        0.15;

      reasons.push(
        "Service type matched."
      );
    }

    // ------------------------------------------------------------------------
    // RESOURCE TYPE — 15%
    // ------------------------------------------------------------------------

    const resourceTypes =
      normalizeStrings([
        ...normalizeArray(
          playbook.resourceTypes
        ),

        ...normalizeArray(
          playbook.match
            ?.resourceTypes
        ),
      ]);

    if (
      hasIntersection(
        resourceTypes,
        profile.resourceTypes
      )
    ) {
      score +=
        0.15;

      reasons.push(
        "Affected resource type matched."
      );
    }

    // ------------------------------------------------------------------------
    // KEYWORDS / TAGS — 15%
    // ------------------------------------------------------------------------

    const playbookKeywords =
      uniqueStrings([
        ...tokenize(
          playbook.title
        ),

        ...tokenize(
          playbook.name
        ),

        ...tokenize(
          playbook.description
        ),

        ...normalizeStrings(
          playbook.tags
        )
          .flatMap(
            (
              tag
            ) =>
              tokenize(
                tag
              )
          ),
      ]);

    const keywordOverlap =
      intersectionCount(
        playbookKeywords,
        profile.keywords
      );

    if (
      keywordOverlap >
      0
    ) {
      const keywordScore =
        Math.min(
          0.15,
          keywordOverlap *
          0.03
        );

      score +=
        keywordScore;

      reasons.push(
        `Keyword relevance matched (${keywordOverlap} token${keywordOverlap === 1 ? "" : "s"}).`
      );
    }

    // ------------------------------------------------------------------------
    // ENVIRONMENT — 5%
    // ------------------------------------------------------------------------

    const environments =
      normalizeStrings([
        ...normalizeArray(
          playbook.environments
        ),

        ...normalizeArray(
          playbook.match
            ?.environments
        ),
      ]);

    if (
      profile.environment &&
      includesNormalized(
        environments,
        profile.environment
      )
    ) {
      score +=
        0.05;

      reasons.push(
        "Environment matched."
      );
    }

    return {
      score:
        roundScore(
          Math.min(
            1,
            score
          )
        ),

      reasons,
    };
  }

  // ==========================================================================
  // PLAYBOOK ID
  // ==========================================================================

  resolvePlaybookId(
    playbook
  ) {
    const id =
      playbook.playbookId ||
      playbook.id ||
      playbook._id;

    if (
      !id
    ) {
      throw Object.assign(
        new Error(
          "Approved playbook is missing playbookId"
        ),
        {
          code:
            "PLAYBOOK_ID_REQUIRED",
        }
      );
    }

    return String(
      id
    );
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

  return uniqueStrings(
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
  );
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      (
        Array.isArray(
          values
        )
          ? values
          : []
      )
        .filter(
          (
            value
          ) =>
            value !==
              null &&
            value !==
              undefined &&
            String(
              value
            )
              .trim()
              .length >
              0
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
    ),
  ];
}

function tokenize(
  value
) {
  if (
    !value
  ) {
    return [];
  }

  return String(
    value
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9._-]+/g,
      " "
    )
    .split(
      /\s+/
    )
    .map(
      (
        token
      ) =>
        token.trim()
    )
    .filter(
      (
        token
      ) =>
        token.length >=
        2
    );
}

function includesNormalized(
  values,
  target
) {
  const normalizedTarget =
    normalizeText(
      target
    );

  if (
    !normalizedTarget
  ) {
    return false;
  }

  return normalizeStrings(
    values
  )
    .includes(
      normalizedTarget
    );
}

function hasIntersection(
  left,
  right
) {
  const leftSet =
    new Set(
      normalizeStrings(
        left
      )
    );

  return normalizeStrings(
    right
  )
    .some(
      (
        value
      ) =>
        leftSet.has(
          value
        )
    );
}

function intersectionCount(
  left,
  right
) {
  const leftSet =
    new Set(
      normalizeStrings(
        left
      )
    );

  let count =
    0;

  for (
    const value
    of normalizeStrings(
      right
    )
  ) {
    if (
      leftSet.has(
        value
      )
    ) {
      count +=
        1;
    }
  }

  return count;
}

function normalizeScore(
  value,
  fallback
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return fallback;
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
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}

function normalizePositiveInteger(
  value,
  fallback
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isInteger(
      number
    ) ||
    number <=
      0
  ) {
    return fallback;
  }

  return number;
}

function roundScore(
  value
) {
  return Math.round(
    value *
    10000
  ) /
    10000;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new PlaybookDiscoveryService();

module.exports
  .PlaybookDiscoveryService =
  PlaybookDiscoveryService;