"use strict";

class EscalationDefinitionEngine {
  evaluate({
    failureMode = null,
    playbook = null,
    runbooks = [],
    context = {},
  } = {}) {
    const definitions = [
      failureMode?.escalation,
      playbook?.escalation,
      ...runbooks.map(
        (runbook) =>
          runbook.escalation
      ),
    ].filter(Boolean);

    const triggers =
      definitions.flatMap(
        (definition) =>
          Array.isArray(
            definition.triggers
          )
            ? definition.triggers
            : []
      );

    const destinations =
      unique(
        definitions.flatMap(
          (definition) => {
            if (
              Array.isArray(
                definition.destinations
              )
            ) {
              return definition
                .destinations;
            }

            if (
              definition.destination
            ) {
              return [
                definition.destination,
              ];
            }

            return [];
          }
        )
      );

    const triggered =
      this._matchesTrigger(
        triggers,
        context
      );

    return {
      escalationDefined:
        definitions.length > 0,

      triggered,

      triggers,

      destinations,

      humanEscalationAvailable:
        true,

      reason:
        triggered
          ? (
              context.reason ||
              "ESCALATION_TRIGGERED"
            )
          : null,

      /**
       * Escalation metadata is procedural knowledge,
       * never execution authority.
       */
      executionAuthorized:
        false,
    };
  }

  _matchesTrigger(
    triggers,
    context
  ) {
    if (
      context.forceEscalation ===
      true
    ) {
      return true;
    }

    if (
      context.requiresHumanReview ===
      true
    ) {
      return true;
    }

    if (
      context.rollbackFailed ===
      true
    ) {
      return true;
    }

    if (
      context.verificationFailed ===
      true
    ) {
      return true;
    }

    if (
      context.policyDenied ===
      true
    ) {
      return true;
    }

    if (
      context.missingCapability ===
      true
    ) {
      return true;
    }

    const reason =
      context.reason;

    if (!reason) {
      return false;
    }

    return triggers.some(
      (trigger) =>
        trigger === reason ||
        trigger?.reason === reason ||
        trigger?.code === reason
    );
  }
}

function unique(
  values
) {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ];
}

module.exports =
  EscalationDefinitionEngine;