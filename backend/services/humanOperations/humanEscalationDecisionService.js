"use strict";


const {
  ESCALATION_DECISION,
  ESCALATION_REASON,
  ESCALATION_TRIGGER_SOURCE,
  ESCALATION_INVARIANTS,
} = require(
  "../../constants/humanEscalation"
);


function createError(
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
    }
  );
}


function arrayValue(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}


function normalizeSeverity(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toUpperCase();
}


function normalizeString(
  value
) {
  return String(
    value ||
    ""
  )
    .trim();
}


function intersects(
  left,
  right
) {
  const rightSet =
    new Set(
      arrayValue(
        right
      ).map(
        (
          item
        ) =>
          String(
            item
          )
      )
    );


  return arrayValue(
    left
  ).some(
    (
      item
    ) =>
      rightSet.has(
        String(
          item
        )
      )
  );
}


class HumanEscalationDecisionService {
  evaluate({
    context = {},
    policies = [],
    targets = [],
  } = {}) {
    const incidentId =
      normalizeString(
        context.incidentId
      );


    if (
      !incidentId
    ) {
      throw createError(
        "HUMAN_ESCALATION_INCIDENT_REQUIRED",
        "Escalation evaluation requires incidentId"
      );
    }


    const reasonCode =
      normalizeString(
        context.reasonCode
      );


    if (
      !Object.values(
        ESCALATION_REASON
      ).includes(
        reasonCode
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_REASON_INVALID",
        `Unsupported escalation reason: ${reasonCode}`
      );
    }


    const triggerSource =
      normalizeString(
        context.triggerSource
      );


    if (
      !Object.values(
        ESCALATION_TRIGGER_SOURCE
      ).includes(
        triggerSource
      )
    ) {
      throw createError(
        "HUMAN_ESCALATION_TRIGGER_INVALID",
        `Unsupported trigger source: ${triggerSource}`
      );
    }


    const orderedPolicies =
      arrayValue(
        policies
      )
        .filter(
          (
            policy
          ) =>
            policy &&
            policy.enabled !==
              false
        )
        .sort(
          (
            left,
            right
          ) => {
            const priorityDelta =
              Number(
                left.priority ??
                100
              ) -
              Number(
                right.priority ??
                100
              );


            if (
              priorityDelta !==
                0
            ) {
              return priorityDelta;
            }


            return String(
              left.publicId ||
              left.policyKey ||
              ""
            ).localeCompare(
              String(
                right.publicId ||
                right.policyKey ||
                ""
              )
            );
          }
        );


    const matchedPolicy =
      orderedPolicies.find(
        (
          policy
        ) =>
          this.matchesPolicy(
            policy,
            context
          )
      ) ||
      null;


    /*
     * Certain safety conditions are intrinsically escalatable.
     *
     * Policy matching determines routing/configuration, but an unsafe
     * recovery must never silently become "continue autonomously" merely
     * because an administrator forgot to configure a policy.
     */
    const safetyEscalationRequired =
      [
        ESCALATION_REASON.RECOVERY_UNSAFE,
        ESCALATION_REASON.INSUFFICIENT_EVIDENCE,
        ESCALATION_REASON.APPROVAL_REQUIRED,
        ESCALATION_REASON.AUTONOMY_NOT_ELIGIBLE,
        ESCALATION_REASON.RECOVERY_FAILED,
        ESCALATION_REASON.VERIFICATION_FAILED,
        ESCALATION_REASON.CONTROL_REQUIRED,
        ESCALATION_REASON.MANUAL_ESCALATION,
      ].includes(
        reasonCode
      );


    const decision =
      matchedPolicy ||
      safetyEscalationRequired
        ? ESCALATION_DECISION.ESCALATE
        : ESCALATION_DECISION.NO_ESCALATION;


    const selectedTarget =
      decision ===
        ESCALATION_DECISION.ESCALATE
        ? this.selectTarget({
            policy:
              matchedPolicy,

            context,

            targets,
          })
        : null;


    return {
      incidentId,

      decision,

      reasonCode,

      triggerSource,

      matchedPolicy:
        matchedPolicy
          ? {
              id:
                matchedPolicy.id ||
                null,

              publicId:
                matchedPolicy.publicId ||
                null,

              policyKey:
                matchedPolicy.policyKey ||
                null,

              priority:
                Number(
                  matchedPolicy.priority ??
                  100
                ),

              createHumanTask:
                matchedPolicy.createHumanTask !==
                false,

              blockAutonomousRecovery:
                matchedPolicy.blockAutonomousRecovery !==
                false,

              acknowledgementTimeoutSeconds:
                Number(
                  matchedPolicy
                    .acknowledgementTimeoutSeconds ??
                  900
                ),
            }
          : null,

      selectedTarget:
        selectedTarget
          ? {
              id:
                selectedTarget.id ||
                null,

              publicId:
                selectedTarget.publicId ||
                null,

              targetKey:
                selectedTarget.targetKey ||
                null,

              targetType:
                selectedTarget.targetType ||
                null,

              targetUserId:
                selectedTarget.targetUserId ||
                null,

              targetTeamId:
                selectedTarget.targetTeamId ||
                null,

              integrationRef:
                selectedTarget.integrationRef ||
                null,

              routingKey:
                selectedTarget.routingKey ||
                null,

              channels:
                arrayValue(
                  selectedTarget.channels
                ),
            }
          : null,

      createHumanTask:
        decision ===
          ESCALATION_DECISION.ESCALATE &&
        (
          matchedPolicy
            ? matchedPolicy.createHumanTask !==
              false
            : true
        ),

      autonomousRecoveryBlocked:
        decision ===
          ESCALATION_DECISION.ESCALATE
          ? (
              matchedPolicy
                ? matchedPolicy.blockAutonomousRecovery !==
                  false
                : true
            )
          : false,

      acknowledgementTimeoutSeconds:
        matchedPolicy
          ? Number(
              matchedPolicy
                .acknowledgementTimeoutSeconds ??
              900
            )
          : 900,

      deterministic:
        true,

      humanControlGranted:
        false,

      executionAuthorized:
        false,

      invariants:
        ESCALATION_INVARIANTS,
    };
  }


  matchesPolicy(
    policy,
    context
  ) {
    const conditions =
      policy
        ?.matchConditions ||
      {};


    const severityIn =
      arrayValue(
        conditions.severityIn
      )
        .map(
          normalizeSeverity
        );


    if (
      severityIn.length >
        0 &&
      !severityIn.includes(
        normalizeSeverity(
          context.severity
        )
      )
    ) {
      return false;
    }


    const reasonCodes =
      arrayValue(
        conditions.reasonCodes
      )
        .map(
          (
            item
          ) =>
            String(
              item
            )
        );


    if (
      reasonCodes.length >
        0 &&
      !reasonCodes.includes(
        String(
          context.reasonCode
        )
      )
    ) {
      return false;
    }


    const serviceIds =
      arrayValue(
        conditions.serviceIds
      );


    if (
      serviceIds.length >
        0 &&
      !serviceIds.includes(
        context.serviceId
      )
    ) {
      return false;
    }


    const providers =
      arrayValue(
        conditions.providers
      );


    if (
      providers.length >
        0 &&
      !providers.includes(
        context.provider
      )
    ) {
      return false;
    }


    const capabilityKeys =
      arrayValue(
        conditions.capabilityKeys
      );


    if (
      capabilityKeys.length >
        0 &&
      !capabilityKeys.includes(
        context.capabilityKey
      )
    ) {
      return false;
    }


    if (
      conditions.productionOnly ===
        true &&
      context.production !==
        true
    ) {
      return false;
    }


    if (
      Number.isFinite(
        Number(
          conditions.minRiskScore
        )
      ) &&
      Number(
        context.riskScore ??
        0
      ) <
        Number(
          conditions.minRiskScore
        )
    ) {
      return false;
    }


    if (
      Number.isFinite(
        Number(
          conditions.maxConfidence
        )
      ) &&
      Number(
        context.confidence ??
        1
      ) >
        Number(
          conditions.maxConfidence
        )
    ) {
      return false;
    }


    if (
      conditions
        .requireAutonomousRecoveryBlocked ===
        true &&
      context
        .autonomousRecoveryBlocked !==
        true
    ) {
      return false;
    }


    const tagsAny =
      arrayValue(
        conditions.tagsAny
      );


    if (
      tagsAny.length >
        0 &&
      !intersects(
        context.tags,
        tagsAny
      )
    ) {
      return false;
    }


    return true;
  }


  selectTarget({
    policy,
    context,
    targets,
  }) {
    const enabledTargets =
      arrayValue(
        targets
      )
        .filter(
          (
            target
          ) =>
            target &&
            target.enabled !==
              false
        );


    if (
      enabledTargets.length ===
        0
    ) {
      return null;
    }


    const preferredTargetKeys =
      arrayValue(
        policy
          ?.matchConditions
          ?.targetKeys
      );


    const serviceTargetKeys =
      arrayValue(
        context.targetKeys
      );


    const preferredKeys =
      [
        ...preferredTargetKeys,
        ...serviceTargetKeys,
      ];


    const preferred =
      enabledTargets
        .filter(
          (
            target
          ) =>
            preferredKeys.length ===
              0 ||
            preferredKeys.includes(
              target.targetKey
            )
        );


    const candidates =
      preferred.length >
        0
        ? preferred
        : enabledTargets;


    return candidates
      .sort(
        (
          left,
          right
        ) => {
          const priorityDelta =
            Number(
              left.priority ??
              100
            ) -
            Number(
              right.priority ??
              100
            );


          if (
            priorityDelta !==
              0
          ) {
            return priorityDelta;
          }


          return String(
            left.publicId ||
            left.targetKey ||
            ""
          ).localeCompare(
            String(
              right.publicId ||
              right.targetKey ||
              ""
            )
          );
        }
      )[0] ||
      null;
  }
}


const defaultService =
  new HumanEscalationDecisionService();


module.exports =
  defaultService;


module.exports
  .HumanEscalationDecisionService =
  HumanEscalationDecisionService;