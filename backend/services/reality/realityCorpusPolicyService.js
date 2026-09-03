"use strict";


const REALITY_CORPUS_POLICY_VERSION =
  "23R.13A-C-D.1";


const SOURCE_POLICY_STATUS =
  Object.freeze({
    APPROVED_COMMERCIAL:
      "APPROVED_COMMERCIAL",

    APPROVED_RESEARCH_ONLY:
      "APPROVED_RESEARCH_ONLY",

    QUARANTINED_LICENSE_REVIEW:
      "QUARANTINED_LICENSE_REVIEW",

    BLOCKED:
      "BLOCKED",
  });


const CORPUS_ROLE =
  Object.freeze({
    INDEPENDENT_BENCHMARK:
      "INDEPENDENT_BENCHMARK",

    EXECUTABLE_WORKLOAD:
      "EXECUTABLE_WORKLOAD",

    HEALTHY_BASELINE:
      "HEALTHY_BASELINE",

    NOISY_DERIVATIVE:
      "NOISY_DERIVATIVE",

    MULTI_FAULT:
      "MULTI_FAULT",

    CASCADING_FAILURE:
      "CASCADING_FAILURE",

    AMBIGUOUS_EVIDENCE:
      "AMBIGUOUS_EVIDENCE",

    RECOVERY_OUTCOME:
      "RECOVERY_OUTCOME",

    CLOUD_BEHAVIOUR:
      "CLOUD_BEHAVIOUR",

    LOG_DIVERSITY:
      "LOG_DIVERSITY",

    INTEGRATION_TRANSLATION:
      "INTEGRATION_TRANSLATION",

    PRODUCTION_RECONSTRUCTION:
      "PRODUCTION_RECONSTRUCTION",

    RESEARCH_EXPERIMENT:
      "RESEARCH_EXPERIMENT",

    FINAL_HOLDOUT:
      "FINAL_HOLDOUT",
  });


const RESTRICTIVENESS =
  Object.freeze({
    APPROVED_COMMERCIAL:
      0,

    APPROVED_RESEARCH_ONLY:
      1,

    QUARANTINED_LICENSE_REVIEW:
      2,

    BLOCKED:
      3,
  });


const ELIGIBILITY_KEYS =
  Object.freeze([
    "researchEligible",
    "modelTrainingEligible",
    "retrievalEligible",
    "developmentEvaluationEligible",
    "validationEligible",
    "holdoutEligible",
    "productionCertificationEligible",
    "customerRuntimeEligible",
    "redistributionAllowed",
    "agentGroundTruthVisible",
  ]);


function policyError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


function assertPolicyStatus(
  value
) {
  if (
    !Object.prototype.hasOwnProperty.call(
      RESTRICTIVENESS,
      value
    )
  ) {
    throw policyError(
      "REALITY_CORPUS_POLICY_STATUS_INVALID",
      `unknown source policy status: ${value}`
    );
  }


  return value;
}


function destinationZoneForStatus(
  status
) {
  assertPolicyStatus(
    status
  );


  if (
    status ===
      SOURCE_POLICY_STATUS.APPROVED_COMMERCIAL
  ) {
    return "APPROVED";
  }


  if (
    status ===
      SOURCE_POLICY_STATUS.APPROVED_RESEARCH_ONLY
  ) {
    return "RESEARCH_ONLY";
  }


  if (
    status ===
      SOURCE_POLICY_STATUS.QUARANTINED_LICENSE_REVIEW
  ) {
    return "QUARANTINE";
  }


  return "BLOCKED";
}


function mostRestrictiveStatus(
  statuses
) {
  if (
    !Array.isArray(
      statuses
    ) ||
    statuses.length ===
      0
  ) {
    throw policyError(
      "REALITY_CORPUS_LINEAGE_REQUIRED",
      "at least one lineage policy status is required"
    );
  }


  return statuses
    .map(
      assertPolicyStatus
    )
    .sort(
      (
        left,
        right
      ) =>
        RESTRICTIVENESS[
          right
        ] -
        RESTRICTIVENESS[
          left
        ]
    )[0];
}


function deriveLineageEligibility(
  parents
) {
  if (
    !Array.isArray(
      parents
    ) ||
    parents.length ===
      0
  ) {
    throw policyError(
      "REALITY_CORPUS_LINEAGE_REQUIRED",
      "at least one parent corpus decision is required"
    );
  }


  for (
    const parent
    of parents
  ) {
    if (
      !parent ||
      typeof parent !==
        "object" ||
      !parent.eligibility ||
      typeof parent.eligibility !==
        "object"
    ) {
      throw policyError(
        "REALITY_CORPUS_PARENT_POLICY_INVALID",
        "every parent requires an eligibility object"
      );
    }


    assertPolicyStatus(
      parent.policyStatus
    );


    for (
      const key
      of ELIGIBILITY_KEYS
    ) {
      if (
        typeof parent
          .eligibility[
            key
          ] !==
        "boolean"
      ) {
        throw policyError(
          "REALITY_CORPUS_PARENT_ELIGIBILITY_INVALID",
          `parent eligibility ${key} must be boolean`
        );
      }
    }
  }


  const policyStatus =
    mostRestrictiveStatus(
      parents.map(
        parent =>
          parent.policyStatus
      )
    );


  const eligibility =
    {};


  for (
    const key
    of ELIGIBILITY_KEYS
  ) {
    eligibility[
      key
    ] =
      parents.every(
        parent =>
          parent
            .eligibility[
              key
            ] ===
          true
      );
  }


  /*
   * Absolute corpus safety invariant.
   *
   * Ground truth visibility is never inherited from
   * parent metadata. Even malformed ancestry must
   * fail closed rather than expose evaluator truth.
   */
  eligibility.agentGroundTruthVisible =
    false;


  const hasFinalHoldoutAncestor =
    parents.some(
      parent =>
        parent.isFinalHoldout ===
          true ||
        parent.corpusRole ===
          CORPUS_ROLE.FINAL_HOLDOUT
    );


  const hasResearchOnlyAncestor =
    parents.some(
      parent =>
        parent.policyStatus ===
          SOURCE_POLICY_STATUS.APPROVED_RESEARCH_ONLY
    );


  if (
    hasFinalHoldoutAncestor
  ) {
    Object.assign(
      eligibility,
      {
        researchEligible:
          false,

        modelTrainingEligible:
          false,

        retrievalEligible:
          false,

        developmentEvaluationEligible:
          false,

        validationEligible:
          false,

        holdoutEligible:
          true,

        customerRuntimeEligible:
          false,

        agentGroundTruthVisible:
          false,
      }
    );
  }


  if (
    hasResearchOnlyAncestor
  ) {
    Object.assign(
      eligibility,
      {
        modelTrainingEligible:
          false,

        retrievalEligible:
          false,

        developmentEvaluationEligible:
          false,

        validationEligible:
          false,

        holdoutEligible:
          false,

        productionCertificationEligible:
          false,

        customerRuntimeEligible:
          false,

        agentGroundTruthVisible:
          false,
      }
    );
  }


  if (
    policyStatus ===
      SOURCE_POLICY_STATUS.QUARANTINED_LICENSE_REVIEW ||
    policyStatus ===
      SOURCE_POLICY_STATUS.BLOCKED
  ) {
    for (
      const key
      of ELIGIBILITY_KEYS
    ) {
      eligibility[
        key
      ] =
        false;
    }
  }


  return {
    version:
      REALITY_CORPUS_POLICY_VERSION,

    policyStatus,

    destinationZone:
      destinationZoneForStatus(
        policyStatus
      ),

    hasFinalHoldoutAncestor,

    hasResearchOnlyAncestor,

    eligibility,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


function assertIngestionAllowed(
  decision,
  requestedZone
) {
  if (
    !decision ||
    typeof decision !==
      "object"
  ) {
    throw policyError(
      "REALITY_CORPUS_POLICY_DECISION_REQUIRED",
      "corpus policy decision is required"
    );
  }


  const requiredZone =
    destinationZoneForStatus(
      decision.policyStatus
    );


  if (
    requiredZone ===
      "BLOCKED"
  ) {
    throw policyError(
      "REALITY_CORPUS_SOURCE_BLOCKED",
      "blocked source cannot be ingested"
    );
  }


  if (
    requestedZone !==
      requiredZone
  ) {
    throw policyError(
      "REALITY_CORPUS_DESTINATION_VIOLATION",
      `${decision.policyStatus} must route to ${requiredZone}`
    );
  }


  return {
    allowed:
      true,

    destinationZone:
      requiredZone,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


module.exports = {
  REALITY_CORPUS_POLICY_VERSION,

  SOURCE_POLICY_STATUS,

  CORPUS_ROLE,

  ELIGIBILITY_KEYS,

  destinationZoneForStatus,

  mostRestrictiveStatus,

  deriveLineageEligibility,

  assertIngestionAllowed,
};