"use strict";


const {
  AUTONOMY_LEVEL,

  autonomyRank,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  REPUTATION_TREND,

  RECERTIFICATION_REASON,

  DEFAULT_RECERTIFICATION_POLICY,

  CERTIFICATE_STATUS,
} =
  require(
    "../../constants/runtimeAutonomyPolicy"
  );


class AutonomyReputationService {
  evaluate(
    input = {}
  ) {
    const qualification =
      input.qualification;


    if (
      !qualification ||
      typeof qualification !==
        "object"
    ) {
      throw reputationError(
        "AUTONOMY_REPUTATION_QUALIFICATION_REQUIRED",

        "qualification is required"
      );
    }


    if (
      qualification.executionAuthorized ===
        true
    ) {
      throw reputationError(
        "AUTONOMY_REPUTATION_AUTHORITY_LEAK",

        "Autonomy reputation cannot consume execution authority"
      );
    }


    const currentLevel =
      qualification
        .qualifiedLevel;


    autonomyRank(
      currentLevel
    );


    const previous =
      input.previousReputation ||
      null;


    const previousLevel =
      previous
        ?.currentLevel ||
      input.previousLevel ||
      null;


    if (
      previousLevel
    ) {
      autonomyRank(
        previousLevel
      );
    }


    const policy = {
      ...DEFAULT_RECERTIFICATION_POLICY,

      ...(
        input.policy ||
        {}
      ),
    };


    validatePolicy(
      policy
    );


    const now =
      validDate(
        input.now ||
        new Date(),

        "now"
      );


    const certificate =
      input.certificate ||
      {};


    const certificateStatus =
      certificate.status ||
      CERTIFICATE_STATUS
        .CERTIFIED;


    const evidenceCount =
      Number(
        input.evidenceCount ??
        qualification
          .statistics
          ?.totalTests ??
        previous
          ?.evidenceCount ??
        0
      );


    const newEvidenceCount =
      Number(
        input.newEvidenceCount ??
        0
      );


    if (
      !Number.isFinite(
        evidenceCount
      ) ||
      evidenceCount <
        0 ||

      !Number.isFinite(
        newEvidenceCount
      ) ||
      newEvidenceCount <
        0
    ) {
      throw reputationError(
        "AUTONOMY_REPUTATION_EVIDENCE_COUNT_INVALID",

        "evidence counts must be non-negative finite numbers"
      );
    }


    const trend =
      determineTrend({
        previousLevel,

        currentLevel,

        certificateStatus,

        qualification,
      });


    const recertification =
      determineRecertification({
        now,

        certificate,

        certificateStatus,

        qualification,

        newEvidenceCount,

        policy,
      });


    const lastCertifiedAt =
      certificate.issuedAt ||
      certificate.issued_at ||
      previous
        ?.lastCertifiedAt ||
      null;


    const expiresAt =
      certificate.expiresAt ||
      certificate.expires_at ||
      previous
        ?.expiresAt ||
      null;


    const nextReviewAt =
      calculateNextReviewAt({
        now,

        expiresAt,

        policy,
      });


    const promotionEligible =
      previousLevel !==
        null &&

      autonomyRank(
        currentLevel
      ) >
      autonomyRank(
        previousLevel
      ) &&

      qualification
        .safetyCap
        ?.failed !==
        true &&

      qualification
        .safetyCap
        ?.suspended !==
        true;


    const demotionRisk =
      qualification
        .demoted ===
        true ||

      qualification
        .safetyCap
        ?.capped ===
        true ||

      qualification
        .safetyCap
        ?.suspended ===
        true;


    return Object.freeze({
      currentLevel,

      previousLevel,

      trend,

      evidenceCount,

      newEvidenceCount,

      confidence:
        qualification.confidence ??
        certificate.confidence ??
        null,

      lastCertifiedAt,

      expiresAt,

      nextReviewAt,

      promotionEligible,

      demotionRisk,

      suspended:
        certificateStatus ===
          CERTIFICATE_STATUS
            .SUSPENDED ||

        qualification
          .safetyCap
          ?.suspended ===
          true,

      revoked:
        certificateStatus ===
        CERTIFICATE_STATUS
          .REVOKED,

      recertificationRequired:
        recertification.required,

      recertificationReason:
        recertification.reason,

      /*
       * Reputation is historical operational evidence.
       *
       * Reputation NEVER becomes execution authority.
       */
      executionAuthorized:
        false,

      authorizationGranted:
        false,

      productionCertified:
        false,
    });
  }
}


function determineTrend({
  previousLevel,
  currentLevel,
  certificateStatus,
  qualification,
}) {
  if (
    certificateStatus ===
    CERTIFICATE_STATUS
      .REVOKED
  ) {
    return REPUTATION_TREND
      .REVOKED;
  }


  if (
    certificateStatus ===
      CERTIFICATE_STATUS
        .SUSPENDED ||

    qualification
      .safetyCap
      ?.suspended ===
      true
  ) {
    return REPUTATION_TREND
      .SUSPENDED;
  }


  if (
    previousLevel ===
      null
  ) {
    return REPUTATION_TREND
      .NEW;
  }


  const currentRank =
    autonomyRank(
      currentLevel
    );


  const previousRank =
    autonomyRank(
      previousLevel
    );


  if (
    currentRank >
    previousRank
  ) {
    return REPUTATION_TREND
      .PROMOTING;
  }


  if (
    currentRank <
    previousRank
  ) {
    return REPUTATION_TREND
      .DEGRADING;
  }


  return REPUTATION_TREND
    .STABLE;
}


function determineRecertification({
  now,
  certificate,
  certificateStatus,
  qualification,
  newEvidenceCount,
  policy,
}) {
  if (
    certificateStatus ===
    CERTIFICATE_STATUS
      .REVOKED
  ) {
    return {
      required:
        true,

      reason:
        RECERTIFICATION_REASON
          .CERTIFICATE_REVOKED,
    };
  }


  if (
    certificateStatus ===
    CERTIFICATE_STATUS
      .SUSPENDED
  ) {
    return {
      required:
        true,

      reason:
        RECERTIFICATION_REASON
          .CERTIFICATE_SUSPENDED,
    };
  }


  if (
    qualification
      .safetyCap
      ?.failed ===
        true ||

    qualification
      .safetyCap
      ?.suspended ===
        true
  ) {
    return {
      required:
        true,

      reason:
        RECERTIFICATION_REASON
          .SAFETY_REGRESSION,
    };
  }


  if (
    qualification.demoted ===
      true
  ) {
    return {
      required:
        true,

      reason:
        RECERTIFICATION_REASON
          .LEVEL_DEMOTION,
    };
  }


  const expiresAtRaw =
    certificate.expiresAt ||
    certificate.expires_at;


  if (
    expiresAtRaw
  ) {
    const expiresAt =
      validDate(
        expiresAtRaw,

        "certificate.expiresAt"
      );


    const remainingDays =
      (
        expiresAt.getTime() -
        now.getTime()
      ) /
      DAY_MS;


    if (
      remainingDays <=
      policy.expirationWarningDays
    ) {
      return {
        required:
          true,

        reason:
          RECERTIFICATION_REASON
            .EXPIRING_SOON,
      };
    }
  }


  const evidenceLatest =
    qualification
      .evidenceWindow
      ?.latest ||
    qualification
      .statistics
      ?.evidenceWindow
      ?.latest ||
    null;


  if (
    evidenceLatest
  ) {
    const latest =
      validDate(
        evidenceLatest,

        "evidenceWindow.latest"
      );


    const ageDays =
      (
        now.getTime() -
        latest.getTime()
      ) /
      DAY_MS;


    if (
      ageDays >
      policy.maximumEvidenceAgeDays
    ) {
      return {
        required:
          true,

        reason:
          RECERTIFICATION_REASON
            .EVIDENCE_STALE,
      };
    }
  }


  if (
    newEvidenceCount >=
    policy.minimumNewEvidenceForReview
  ) {
    return {
      required:
        true,

      reason:
        RECERTIFICATION_REASON
          .NEW_EVIDENCE_AVAILABLE,
    };
  }


  return {
    required:
      false,

    reason:
      RECERTIFICATION_REASON
        .NONE,
  };
}


function calculateNextReviewAt({
  now,
  expiresAt,
  policy,
}) {
  const evidenceReviewAt =
    new Date(
      now.getTime() +
      policy.maximumEvidenceAgeDays *
      DAY_MS
    );


  if (
    !expiresAt
  ) {
    return evidenceReviewAt
      .toISOString();
  }


  const certificateExpiry =
    validDate(
      expiresAt,

      "expiresAt"
    );


  const warningAt =
    new Date(
      certificateExpiry.getTime() -
      policy.expirationWarningDays *
      DAY_MS
    );


  return new Date(
    Math.min(
      evidenceReviewAt.getTime(),

      warningAt.getTime()
    )
  )
    .toISOString();
}


function validatePolicy(
  policy
) {
  for (
    const key
    of [
      "expirationWarningDays",

      "maximumEvidenceAgeDays",

      "minimumNewEvidenceForReview",
    ]
  ) {
    if (
      !Number.isFinite(
        Number(
          policy[key]
        )
      ) ||

      Number(
        policy[key]
      ) <
        0
    ) {
      throw reputationError(
        "AUTONOMY_REPUTATION_POLICY_INVALID",

        `${key} must be a non-negative finite number`
      );
    }
  }
}


function validDate(
  value,
  field
) {
  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw reputationError(
      "AUTONOMY_REPUTATION_DATE_INVALID",

      `${field} must be a valid date`
    );
  }


  return date;
}


function reputationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "AutonomyReputationError",

      code,

      executionAuthorized:
        false,

      authorizationGranted:
        false,
    }
  );
}


const DAY_MS =
  24 *
  60 *
  60 *
  1000;


module.exports = {
  AutonomyReputationService,

  determineTrend,

  determineRecertification,

  calculateNextReviewAt,
};