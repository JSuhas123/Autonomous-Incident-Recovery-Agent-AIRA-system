"use strict";


const crypto =
  require(
    "node:crypto"
  );


const HANDOFF_SCHEMA_VERSION =
  "23.4.1";


const HANDOFF_INVARIANTS =
  Object.freeze({
    INFORMATION_ONLY:
      true,

    HANDOFF_IS_NOT_ACKNOWLEDGEMENT:
      true,

    HANDOFF_IS_NOT_TAKEOVER:
      true,

    HANDOFF_IS_NOT_CONTROL:
      true,

    HANDOFF_NEVER_AUTHORIZES_EXECUTION:
      true,

    STALE_PLAN_RESUME_PROHIBITED:
      true,

    HUMAN_RETURN_REQUIRES_FRESH_EVALUATION:
      true,
  });


function firstDefined(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value !==
        undefined &&
      value !==
        null
    ) {
      return value;
    }
  }


  return null;
}


function asArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}


function safeObject(
  value
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  )
    ? value
    : {};
}


function stableSortValue(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      stableSortValue
    );
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.keys(
      value
    )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[key] =
            stableSortValue(
              value[key]
            );


          return result;
        },
        {}
      );
  }


  return value;
}


function stableStringify(
  value
) {
  return JSON.stringify(
    stableSortValue(
      value
    )
  );
}


function contentHash(
  handoffPackage
) {
  const hashable = {
    ...handoffPackage,
  };


  /*
   * Generation time must not change the semantic identity of the package.
   *
   * If nothing operational changed, generating the package again should
   * produce the same content hash and therefore not create another revision.
   */
  delete hashable.generatedAt;


  return crypto
    .createHash(
      "sha256"
    )
    .update(
      stableStringify(
        hashable
      )
    )
    .digest(
      "hex"
    );
}


function extractConfidence(
  diagnosis
) {
  if (
    !diagnosis
  ) {
    return null;
  }


  const confidence =
    firstDefined(
      diagnosis.overallConfidence,

      diagnosis.confidence,

      diagnosis
        .confidence
        ?.overallConfidence,

      diagnosis
        .confidence
        ?.score,

      diagnosis
        .result
        ?.confidence,

      diagnosis
        .diagnosis
        ?.confidence
    );


  if (
    typeof confidence ===
    "number"
  ) {
    return confidence;
  }


  if (
    confidence &&
    typeof confidence ===
      "object"
  ) {
    return firstDefined(
      confidence.overallConfidence,
      confidence.score,
      confidence.value
    );
  }


  return confidence;
}


function extractRootCause(
  diagnosis
) {
  if (
    !diagnosis
  ) {
    return null;
  }


  return firstDefined(
    diagnosis.rootCause,

    diagnosis.primaryRootCause,

    diagnosis.primaryHypothesis,

    diagnosis
      .result
      ?.rootCause,

    diagnosis
      .result
      ?.primaryHypothesis,

    diagnosis
      .diagnosis
      ?.rootCause
  );
}


function buildIncidentSummary(
  detail
) {
  const incident =
    detail?.incident ||
    {};


  return {
    incidentId:
      firstDefined(
        incident._id,
        incident.incidentId,
        incident.publicId,
        incident.id
      ),

    title:
      firstDefined(
        incident.title,
        incident.name,
        incident.summary
      ),

    description:
      incident.description ||
      null,

    status:
      incident.status ||
      null,

    severity:
      incident.severity ||
      null,

    source:
      incident.source ||
      null,

    createdAt:
      incident.createdAt ||
      null,

    updatedAt:
      incident.updatedAt ||
      null,

    acknowledgedAt:
      incident.acknowledgedAt ||
      null,

    resolvedAt:
      incident.resolvedAt ||
      null,

    closedAt:
      incident.closedAt ||
      null,

    providers:
      asArray(
        incident.providers
      ),

    impact:
      detail?.impact ||
      incident.impactAnalysis ||
      null,

    correlation:
      detail?.correlation ||
      null,
  };
}


function buildEvidenceSummary(
  detail,
  task
) {
  const evidence =
    detail?.evidence ||
    {};


  return {
    signalCount:
      Number(
        evidence.signalCount ||
        0
      ),

    embeddedEvidenceCount:
      Number(
        evidence.embeddedEvidenceCount ||
        0
      ),

    providerCount:
      Number(
        evidence.providerCount ||
        0
      ),

    providers:
      asArray(
        evidence.providers
      ),

    correlationConfidence:
      firstDefined(
        evidence.correlationConfidence,
        null
      ),

    signals:
      asArray(
        evidence.signals
      ),

    taskEvidence:
      asArray(
        task?.evidence
      ),

    /*
     * These are references / snapshots only.
     *
     * The handoff package does not mutate or manufacture incident evidence.
     */
    evidenceIsInformational:
      true,

    executionAuthorized:
      false,
  };
}


function buildDiagnosisSummary(
  diagnosis
) {
  if (
    !diagnosis
  ) {
    return {
      available:
        false,

      diagnosisId:
        null,

      revision:
        null,

      confidence:
        null,

      rootCause:
        null,

      hypotheses:
        [],

      executionAuthorized:
        false,
    };
  }


  return {
    available:
      true,

    diagnosisId:
      firstDefined(
        diagnosis.diagnosisId,
        diagnosis._id,
        diagnosis.id
      ),

    revision:
      diagnosis.revision ||
      null,

    status:
      diagnosis.status ||
      null,

    confidence:
      extractConfidence(
        diagnosis
      ),

    rootCause:
      extractRootCause(
        diagnosis
      ),

    hypotheses:
      asArray(
        firstDefined(
          diagnosis.hypotheses,
          diagnosis
            .result
            ?.hypotheses,
          diagnosis
            .diagnosis
            ?.hypotheses
        )
      ),

    missingEvidence:
      asArray(
        firstDefined(
          diagnosis.missingEvidence,
          diagnosis
            .evidence
            ?.missingEvidence
        )
      ),

    completedAt:
      firstDefined(
        diagnosis.completedAt,
        diagnosis.diagnosedAt,
        diagnosis.updatedAt
      ),

    executionAuthorized:
      false,
  };
}


function buildRecoverySummary(
  recoveryDecision
) {
  if (
    !recoveryDecision
  ) {
    return {
      available:
        false,

      decisionId:
        null,

      revision:
        null,

      decision:
        null,

      selectedCandidate:
        null,

      executionAuthorized:
        false,
    };
  }


  return {
    available:
      true,

    decisionId:
      firstDefined(
        recoveryDecision.decisionId,
        recoveryDecision._id,
        recoveryDecision.id
      ),

    revision:
      recoveryDecision.revision ||
      null,

    status:
      recoveryDecision.status ||
      null,

    decision:
      recoveryDecision.decision ||
      null,

    reason:
      firstDefined(
        recoveryDecision.reason,
        recoveryDecision.reasonCode,
        recoveryDecision
          .decisionResult
          ?.reason
      ),

    selectedCandidate:
      firstDefined(
        recoveryDecision.selectedCandidate,
        recoveryDecision
          .decisionResult
          ?.selectedCandidate,
        recoveryDecision.candidate
      ),

    risk:
      firstDefined(
        recoveryDecision.risk,
        recoveryDecision
          .riskAnalysis,
        recoveryDecision
          .decisionResult
          ?.risk
      ),

    approvalRequired:
      firstDefined(
        recoveryDecision.approvalRequired,
        recoveryDecision
          .decisionResult
          ?.approvalRequired,
        false
      ),

    executionRequestId:
      firstDefined(
        recoveryDecision.executionRequestId,
        recoveryDecision
          .decisionResult
          ?.executionRequestId
      ),

    updatedAt:
      recoveryDecision.updatedAt ||
      null,

    /*
     * A handoff may report a historical decision.
     *
     * This field describes the handoff package itself and never turns that
     * historical decision into current execution authorization.
     */
    executionAuthorized:
      false,
  };
}


function buildVerificationSummary(
  verification
) {
  if (
    !verification
  ) {
    return {
      available:
        false,

      verificationId:
        null,

      decision:
        null,

      recoveryConfirmed:
        false,

      incidentClosureEligible:
        false,

      executionAuthorized:
        false,
    };
  }


  return {
    available:
      true,

    verificationId:
      firstDefined(
        verification.verificationId,
        verification._id,
        verification.id
      ),

    revision:
      verification.revision ||
      null,

    status:
      verification.status ||
      null,

    decision:
      verification.decision ||
      null,

    confidence:
      verification.confidence ||
      null,

    recovered:
      verification.recovered ===
      true,

    recoveryConfirmed:
      verification.recoveryConfirmed ===
      true,

    incidentClosureEligible:
      verification.incidentClosureEligible ===
      true,

    overallScore:
      firstDefined(
        verification.overallScore,
        verification.overall_score
      ),

    nextAction:
      verification.nextAction ||
      null,

    verifiedAt:
      firstDefined(
        verification.verifiedAt,
        verification.completedAt,
        verification.updatedAt
      ),

    executionAuthorized:
      false,
  };
}


function buildEscalationSummary(
  escalation
) {
  return {
    escalationId:
      firstDefined(
        escalation?.publicId,
        escalation?.id
      ),

    decision:
      escalation?.decision ||
      null,

    reasonCode:
      escalation?.reasonCode ||
      null,

    severity:
      escalation?.severity ||
      null,

    triggerSource:
      escalation?.triggerSource ||
      null,

    status:
      escalation?.status ||
      null,

    acknowledgementDeadline:
      escalation
        ?.acknowledgementDeadline ||
      null,

    selectedTargetId:
      escalation
        ?.selectedTargetId ||
      null,

    routingSnapshot:
      safeObject(
        escalation
          ?.routingSnapshot
      ),

    decisionSnapshot:
      safeObject(
        escalation
          ?.decisionSnapshot
      ),

    executionAuthorized:
      false,
  };
}


function buildHumanTaskSummary(
  task,
  taskHistory
) {
  if (
    !task
  ) {
    return {
      available:
        false,

      taskId:
        null,

      history:
        [],

      executionAuthorized:
        false,
    };
  }


  return {
    available:
      true,

    taskId:
      firstDefined(
        task.publicId,
        task.id
      ),

    taskType:
      task.taskType ||
      null,

    title:
      task.title ||
      null,

    description:
      task.description ||
      null,

    priority:
      task.priority ||
      null,

    status:
      task.status ||
      null,

    source:
      task.source ||
      null,

    assignedUserId:
      task.assignedUserId ||
      null,

    assignedTeamId:
      task.assignedTeamId ||
      null,

    acknowledgementRequired:
      task.acknowledgementRequired ===
      true,

    autonomousRecoveryBlocked:
      task.autonomousRecoveryBlocked !==
      false,

    recommendedActions:
      asArray(
        task.recommendedActions
      ),

    dueAt:
      task.dueAt ||
      null,

    expiresAt:
      task.expiresAt ||
      null,

    acknowledgedAt:
      task.acknowledgedAt ||
      null,

    resolvedAt:
      task.resolvedAt ||
      null,

    controlEpoch:
      Number(
        task.controlEpoch ||
        0
      ),

    history:
      asArray(
        taskHistory
      ),

    executionAuthorized:
      false,
  };
}


function recommendedNextSteps(
  task,
  escalation,
  verification
) {
  const explicit =
    asArray(
      task?.recommendedActions
    )
      .filter(
        Boolean
      );


  if (
    explicit.length >
    0
  ) {
    return explicit;
  }


  const fallback =
    [];


  if (
    escalation
      ?.acknowledgementDeadline
  ) {
    fallback.push(
      "Acknowledge the human escalation before the acknowledgement deadline."
    );
  }


  fallback.push(
    "Review the incident evidence and AIRA diagnosis before making infrastructure changes."
  );


  if (
    verification &&
    verification.recoveryConfirmed !==
      true
  ) {
    fallback.push(
      "Validate the current infrastructure state because recovery has not been conclusively verified."
    );
  }


  fallback.push(
    "Use the explicit Take Control workflow before performing human-controlled incident operations."
  );


  fallback.push(
    "When returning control to AIRA, require a fresh investigation and recovery decision; never resume the stale pre-handoff plan."
  );


  return fallback;
}


function buildIncidentHandoffPackage({
  detail,

  diagnosis =
    null,

  recoveryDecision =
    null,

  verification =
    null,

  escalation,

  task =
    null,

  taskHistory =
    [],

  generatedAt =
    new Date()
      .toISOString(),
} = {}) {
  if (
    !detail?.incident
  ) {
    throw Object.assign(
      new Error(
        "Incident handoff requires canonical incident detail"
      ),
      {
        code:
          "INCIDENT_HANDOFF_INCIDENT_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  if (
    !escalation
  ) {
    throw Object.assign(
      new Error(
        "Incident handoff requires canonical escalation"
      ),
      {
        code:
          "INCIDENT_HANDOFF_ESCALATION_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  const incident =
    buildIncidentSummary(
      detail
    );


  const diagnosisSummary =
    buildDiagnosisSummary(
      diagnosis
    );


  const recoverySummary =
    buildRecoverySummary(
      recoveryDecision
    );


  const verificationSummary =
    buildVerificationSummary(
      verification
    );


  const escalationSummary =
    buildEscalationSummary(
      escalation
    );


  const humanTask =
    buildHumanTaskSummary(
      task,
      taskHistory
    );


  const evidence =
    buildEvidenceSummary(
      detail,
      task
    );


  const nextSteps =
    recommendedNextSteps(
      task,
      escalation,
      verification
    );


  return {
    schemaVersion:
      HANDOFF_SCHEMA_VERSION,

    generatedAt,

    purpose:
      "HUMAN_INCIDENT_HANDOFF",

    incident,

    investigation: {
      diagnosis:
        diagnosisSummary,

      evidence,

      timeline:
        asArray(
          detail.timeline
        ),

      events:
        asArray(
          detail.events
        ),

      executionAuthorized:
        false,
    },

    recovery:
      recoverySummary,

    verification:
      verificationSummary,

    escalation:
      escalationSummary,

    humanTask,

    operatorBrief: {
      whyAiraStopped:
        escalation.reasonCode ||
        "HUMAN_ESCALATION",

      currentIncidentStatus:
        incident.status,

      currentSeverity:
        incident.severity,

      diagnosedRootCause:
        diagnosisSummary.rootCause,

      diagnosisConfidence:
        diagnosisSummary.confidence,

      recoveryDecision:
        recoverySummary.decision,

      recoveryDecisionReason:
        recoverySummary.reason,

      verificationDecision:
        verificationSummary.decision,

      recoveryConfirmed:
        verificationSummary
          .recoveryConfirmed,

      humanTaskStatus:
        humanTask.status,

      autonomousRecoveryBlocked:
        task
          ? task
              .autonomousRecoveryBlocked !==
            false
          : true,

      recommendedNextSteps:
        nextSteps,

      stalePlanResumeAllowed:
        false,

      freshEvaluationRequiredOnReturn:
        true,

      executionAuthorized:
        false,
    },

    provenance: {
      incidentId:
        incident.incidentId,

      diagnosisId:
        diagnosisSummary
          .diagnosisId,

      diagnosisRevision:
        diagnosisSummary
          .revision,

      recoveryDecisionId:
        recoverySummary
          .decisionId,

      recoveryDecisionRevision:
        recoverySummary
          .revision,

      verificationId:
        verificationSummary
          .verificationId,

      verificationRevision:
        verificationSummary
          .revision,

      escalationId:
        escalationSummary
          .escalationId,

      humanTaskId:
        humanTask.taskId,

      executionAuthorized:
        false,
    },

    safety: {
      ...HANDOFF_INVARIANTS,

      humanControlGranted:
        false,

      acknowledgementGranted:
        false,

      executionAuthorized:
        false,
    },

    executionAuthorized:
      false,
  };
}


module.exports = {
  HANDOFF_SCHEMA_VERSION,

  HANDOFF_INVARIANTS,

  buildIncidentHandoffPackage,

  contentHash,

  stableStringify,

  recommendedNextSteps,

  extractConfidence,

  extractRootCause,
};