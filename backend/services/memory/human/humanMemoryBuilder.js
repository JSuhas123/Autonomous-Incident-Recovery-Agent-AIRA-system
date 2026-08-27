"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  MEMORY_TYPES,
} =
  require(
    "../../../constants/memoryTypes"
  );


const {
  MEMORY_SCOPES,
} =
  require(
    "../../../constants/memoryScopes"
  );


const HUMAN_ACTION_TYPES =
  Object.freeze({
    APPROVED:
      "APPROVED",

    REJECTED:
      "REJECTED",

    MODIFIED:
      "MODIFIED",

    MANUAL_ACTION:
      "MANUAL_ACTION",

    COMMENTED:
      "COMMENTED",
  });


class HumanMemoryBuilder {

  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  normalizeText(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }


    const normalized =
      String(
        value
      )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    return normalized ||
      null;
  }


  normalizeActionType(
    value
  ) {
    const normalized =
      String(
        value ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      !Object.values(
        HUMAN_ACTION_TYPES
      )
        .includes(
          normalized
        )
    ) {
      throw this.createError(
        "Unknown human operational action type",
        "HUMAN_MEMORY_ACTION_TYPE_UNKNOWN"
      );
    }


    return normalized;
  }


  buildPublicId({
    organizationId,
    eventId,
  }) {
    const hash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          `${organizationId}|${eventId}`
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          32
        );


    return (
      "mem_human_" +
      hash
    );
  }


  determineScope({
    organizationId,
    environmentId,
    serviceId,
    incidentId,
  }) {
    if (
      incidentId
    ) {
      if (
        !environmentId
      ) {
        throw this.createError(
          "Incident-scoped human memory requires environment",
          "HUMAN_MEMORY_ENVIRONMENT_REQUIRED"
        );
      }


      return {
        organizationId,

        environmentId,

        serviceId:
          serviceId ||
          null,

        incidentId,

        scopeType:
          MEMORY_SCOPES
            .INCIDENT,
      };
    }


    if (
      serviceId
    ) {
      if (
        !environmentId
      ) {
        throw this.createError(
          "Service-scoped human memory requires environment",
          "HUMAN_MEMORY_ENVIRONMENT_REQUIRED"
        );
      }


      return {
        organizationId,

        environmentId,

        serviceId,

        incidentId:
          null,

        scopeType:
          MEMORY_SCOPES
            .SERVICE,
      };
    }


    if (
      environmentId
    ) {
      return {
        organizationId,

        environmentId,

        serviceId:
          null,

        incidentId:
          null,

        scopeType:
          MEMORY_SCOPES
            .ENVIRONMENT,
      };
    }


    return {
      organizationId,

      environmentId:
        null,

      serviceId:
        null,

      incidentId:
        null,

      scopeType:
        MEMORY_SCOPES
          .TENANT,
    };
  }


  calculateImportance(
    actionType
  ) {
    switch (
      actionType
    ) {
      case HUMAN_ACTION_TYPES
        .REJECTED:

        return 0.95;


      case HUMAN_ACTION_TYPES
        .MODIFIED:

        return 0.95;


      case HUMAN_ACTION_TYPES
        .MANUAL_ACTION:

        return 0.9;


      case HUMAN_ACTION_TYPES
        .APPROVED:

        return 0.8;


      default:

        return 0.65;
    }
  }


  buildSummary({
    actionType,
    actorDisplay,
    recommendation,
    finalAction,
    reason,
  }) {
    const actor =
      actorDisplay ||
      "An operator";


    switch (
      actionType
    ) {
      case HUMAN_ACTION_TYPES
        .APPROVED:

        return (
          `${actor} approved the proposed recovery` +
          (
            recommendation
              ? `: ${recommendation}.`
              : "."
          )
        );


      case HUMAN_ACTION_TYPES
        .REJECTED:

        return (
          `${actor} rejected the proposed recovery` +
          (
            recommendation
              ? `: ${recommendation}.`
              : "."
          ) +
          (
            reason
              ? ` Reason: ${reason}.`
              : ""
          )
        );


      case HUMAN_ACTION_TYPES
        .MODIFIED:

        return (
          `${actor} modified the proposed recovery` +
          (
            recommendation
              ? ` from ${recommendation}`
              : ""
          ) +
          (
            finalAction
              ? ` to ${finalAction}.`
              : "."
          )
        );


      case HUMAN_ACTION_TYPES
        .MANUAL_ACTION:

        return (
          `${actor} performed a manual operational action` +
          (
            finalAction
              ? `: ${finalAction}.`
              : "."
          )
        );


      case HUMAN_ACTION_TYPES
        .COMMENTED:

        return (
          `${actor} added operational feedback.` +
          (
            reason
              ? ` ${reason}`
              : ""
          )
        );


      default:

        return (
          `${actor} recorded an operational action.`
        );
    }
  }


  build({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    incidentId =
      null,

    eventId,

    actionType,

    actorId =
      null,

    actorDisplay =
      null,

    actorType =
      "HUMAN",

    recommendation =
      null,

    finalAction =
      null,

    reason =
      null,

    comment =
      null,

    approvalId =
      null,

    authorizationId =
      null,

    recoveryDecisionId =
      null,

    executionRequestId =
      null,

    occurredAt =
      new Date(),

    metadata =
      {},
  }) {
    if (
      !organizationId ||
      !eventId
    ) {
      throw this.createError(
        "Human memory requires organization and event identifier",
        "HUMAN_MEMORY_INPUT_REQUIRED"
      );
    }


    const normalizedType =
      this
        .normalizeActionType(
          actionType
        );


    const scope =
      this
        .determineScope({
          organizationId,

          environmentId,

          serviceId,

          incidentId,
        });


    const normalizedRecommendation =
      this
        .normalizeText(
          recommendation
        );


    const normalizedFinalAction =
      this
        .normalizeText(
          finalAction
        );


    const normalizedReason =
      this
        .normalizeText(
          reason
        );


    const normalizedComment =
      this
        .normalizeText(
          comment
        );


    const summary =
      this
        .buildSummary({
          actionType:
            normalizedType,

          actorDisplay,

          recommendation:
            normalizedRecommendation,

          finalAction:
            normalizedFinalAction,

          reason:
            normalizedReason,
        });


    const sources = [
      {
        sourceType:
          "HUMAN_EVENT",

        sourceId:
          eventId,

        evidenceRole:
          "HUMAN_CONFIRMED",

        observedAt:
          occurredAt,
      },
    ];


    if (
      incidentId
    ) {
      sources.push({
        sourceType:
          "INCIDENT",

        sourceId:
          incidentId,

        evidenceRole:
          "SUPPORTING",

        observedAt:
          occurredAt,
      });
    }


    if (
      recoveryDecisionId
    ) {
      sources.push({
        sourceType:
          "RECOVERY_DECISION",

        sourceId:
          recoveryDecisionId,

        evidenceRole:
          "SUPPORTING",

        observedAt:
          occurredAt,
      });
    }


    if (
      executionRequestId
    ) {
      sources.push({
        sourceType:
          "EXECUTION_REQUEST",

        sourceId:
          executionRequestId,

        evidenceRole:
          "SUPPORTING",

        observedAt:
          occurredAt,
      });
    }


    return {
      sources,

      memory: {
        publicId:
          this
            .buildPublicId({
              organizationId,

              eventId,
            }),

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        serviceId:
          scope.serviceId,

        resourceId:
          null,

        incidentId:
          scope.incidentId,

        memoryType:
          MEMORY_TYPES
            .HUMAN,

        scopeType:
          scope.scopeType,

        title:
          `Human operational decision: ${normalizedType}`,

        summary,

        content: {
          humanAction: {
            eventId,

            actionType:
              normalizedType,

            actor: {
              id:
                actorId,

              display:
                actorDisplay,

              type:
                actorType,
            },

            recommendation:
              normalizedRecommendation,

            finalAction:
              normalizedFinalAction,

            reason:
              normalizedReason,

            comment:
              normalizedComment,

            occurredAt,
          },

          references: {
            approvalId,

            authorizationId,

            recoveryDecisionId,

            executionRequestId,
          },

          interpretation: {
            /**
             * HUMAN memory records what happened.
             *
             * It never converts historical approval into future permission.
             */
            historicalEvidence:
              true,

            executionAuthorized:
              false,

            reusableAuthorization:
              false,
          },
        },

        confidence:
          1,

        trustScore:
          0.95,

        importance:
          this
            .calculateImportance(
              normalizedType
            ),

        status:
          "ACTIVE",

        sourceType:
          "HUMAN_OPERATIONAL_EVENT",

        sourceCount:
          0,

        evidenceCount:
          sources.length,

        observationCount:
          1,

        observedAt:
          occurredAt,

        validFrom:
          occurredAt,

        validUntil:
          null,

        supersedesMemoryId:
          null,

        legacySourceType:
          null,

        legacySourceId:
          null,

        metadata: {
          phase:
            "16.12",

          generator:
            "humanMemoryBuilder",

          authoritativeStore:
            "postgresql",

          retrievalStore:
            "qdrant",

          executionAuthorized:
            false,

          reusableAuthorization:
            false,

          ...metadata,
        },

        schemaVersion:
          1,
      },
    };
  }
}


const humanMemoryBuilder =
  new HumanMemoryBuilder();


module.exports = {
  HUMAN_ACTION_TYPES,

  HumanMemoryBuilder,

  humanMemoryBuilder,
};