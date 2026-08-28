"use strict";

class CapabilityRequirementEngine {
  evaluate({
    requiredCapabilities = [],
    availableCapabilities = [],
    resourceCapabilities = [],
  } = {}) {
    const required =
      unique(
        requiredCapabilities
      );

    const available =
      unique([
        ...availableCapabilities,
        ...resourceCapabilities,
      ]);

    const availableSet =
      new Set(available);

    const satisfied =
      required.filter(
        (capability) =>
          availableSet.has(
            capability
          )
      );

    const missing =
      required.filter(
        (capability) =>
          !availableSet.has(
            capability
          )
      );

    return {
      requiredCapabilities:
        required,

      availableCapabilities:
        available,

      satisfiedCapabilities:
        satisfied,

      missingCapabilities:
        missing,

      technicallyApplicable:
        missing.length === 0,

      capabilityCoverage:
        required.length === 0
          ? 1
          : satisfied.length /
            required.length,

      /**
       * CRITICAL:
       *
       * Technical applicability is NOT authorization.
       */
      executionAuthorized:
        false,
    };
  }

  evaluatePlaybook({
    playbook,
    availableCapabilities = [],
    resourceCapabilities = [],
  } = {}) {
    if (!playbook) {
      throw createError(
        "PLAYBOOK_REQUIRED",
        "playbook is required"
      );
    }

    const required =
      playbook.requiredCapabilities ||
      playbook.capabilities?.required ||
      [];

    return {
      playbookId:
        playbook.playbookId ||
        playbook.id ||
        null,

      ...this.evaluate({
        requiredCapabilities:
          required,

        availableCapabilities,

        resourceCapabilities,
      }),

      executionAuthorized:
        false,
    };
  }
}

function unique(values) {
  return [
    ...new Set(
      (Array.isArray(values)
        ? values
        : [])
        .filter(Boolean)
    ),
  ].sort();
}

function createError(
  code,
  message
) {
  return Object.assign(
    new Error(message),
    {
      code,
      executionAuthorized: false,
    }
  );
}

module.exports =
  CapabilityRequirementEngine;