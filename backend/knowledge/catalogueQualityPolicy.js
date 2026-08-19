"use strict";

/**
 * AIRA Knowledge Catalogue Quality Policy
 *
 * Phase 13.7
 *
 * Defines the minimum quality/depth contract for generated and manually
 * authored Playbooks and Runbooks.
 *
 * IMPORTANT:
 *
 * This policy does NOT replace the existing Playbook/Runbook validators.
 *
 * Existing validators answer:
 *   "Is this definition structurally/semantically valid?"
 *
 * This policy additionally answers:
 *   "Is this definition deep enough to belong in the production AIRA
 *    knowledge catalogue?"
 *
 * SAFETY INVARIANTS:
 *
 * - No lifecycle promotion
 * - No infrastructure execution
 * - No catalogue mutation
 * - No handler registration
 * - No definition rewriting
 */

const DEFINITION_KIND =
  Object.freeze({
    PLAYBOOK:
      "PLAYBOOK",

    RUNBOOK:
      "RUNBOOK",
  });


const QUALITY_SEVERITY =
  Object.freeze({
    ERROR:
      "ERROR",

    WARNING:
      "WARNING",

    INFO:
      "INFO",
  });


const QUALITY_CODE =
  Object.freeze({
    DEFINITION_REQUIRED:
      "DEFINITION_REQUIRED",

    ID_REQUIRED:
      "ID_REQUIRED",

    NAME_REQUIRED:
      "NAME_REQUIRED",

    DESCRIPTION_REQUIRED:
      "DESCRIPTION_REQUIRED",

    DESCRIPTION_TOO_SHALLOW:
      "DESCRIPTION_TOO_SHALLOW",

    VERSION_REQUIRED:
      "VERSION_REQUIRED",

    LIFECYCLE_REQUIRED:
      "LIFECYCLE_REQUIRED",

    OWNER_REQUIRED:
      "OWNER_REQUIRED",

    OWNER_NAME_REQUIRED:
      "OWNER_NAME_REQUIRED",

    SCOPE_REQUIRED:
      "SCOPE_REQUIRED",

    PROVIDER_SCOPE_REQUIRED:
      "PROVIDER_SCOPE_REQUIRED",

    ENVIRONMENT_SCOPE_REQUIRED:
      "ENVIRONMENT_SCOPE_REQUIRED",

    RISK_REQUIRED:
      "RISK_REQUIRED",

    PLAYBOOK_STAGES_REQUIRED:
      "PLAYBOOK_STAGES_REQUIRED",

    PLAYBOOK_STAGE_ID_REQUIRED:
      "PLAYBOOK_STAGE_ID_REQUIRED",

    PLAYBOOK_STAGE_TYPE_REQUIRED:
      "PLAYBOOK_STAGE_TYPE_REQUIRED",

    PLAYBOOK_RUNBOOK_REFERENCE_REQUIRED:
      "PLAYBOOK_RUNBOOK_REFERENCE_REQUIRED",

    RUNBOOK_STEPS_REQUIRED:
      "RUNBOOK_STEPS_REQUIRED",

    RUNBOOK_STEP_ID_REQUIRED:
      "RUNBOOK_STEP_ID_REQUIRED",

    RUNBOOK_STEP_TYPE_REQUIRED:
      "RUNBOOK_STEP_TYPE_REQUIRED",

    RUNBOOK_STEP_ACTION_REQUIRED:
      "RUNBOOK_STEP_ACTION_REQUIRED",

    RUNBOOK_FAILURE_POLICY_REQUIRED:
      "RUNBOOK_FAILURE_POLICY_REQUIRED",

    VERIFICATION_REQUIRED:
      "VERIFICATION_REQUIRED",

    VERIFICATION_CHECKS_REQUIRED:
      "VERIFICATION_CHECKS_REQUIRED",

    ROLLBACK_CONFIG_REQUIRED:
      "ROLLBACK_CONFIG_REQUIRED",

    AUDIT_CONFIG_REQUIRED:
      "AUDIT_CONFIG_REQUIRED",

    PARAMETER_DESCRIPTION_REQUIRED:
      "PARAMETER_DESCRIPTION_REQUIRED",

    SHALLOW_PLAYBOOK:
      "SHALLOW_PLAYBOOK",

    SHALLOW_RUNBOOK:
      "SHALLOW_RUNBOOK",
  });


const DEFAULT_QUALITY_POLICY =
  Object.freeze({
    minimumDescriptionLength:
      30,

    minimumPlaybookStages:
      1,

    minimumRunbookSteps:
      1,

    requireOwner:
      true,

    requireScope:
      true,

    requireRisk:
      true,

    requireVerification:
      true,

    requireRollbackConfig:
      true,

    requireAuditConfig:
      true,

    requireParameterDescriptions:
      true,
  });


// ============================================================================
// HELPERS
// ============================================================================

function _isObject(
  value
) {
  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}


function _nonEmptyString(
  value
) {
  return (
    typeof value ===
      "string" &&
    value
      .trim()
      .length >
      0
  );
}


function _push(
  diagnostics,
  {
    code,
    message,
    path = null,
    severity =
      QUALITY_SEVERITY.ERROR,
  }
) {
  diagnostics.push({
    code,
    severity,
    message,
    path,
  });
}


function _countErrors(
  diagnostics
) {
  return diagnostics
    .filter(
      (
        diagnostic
      ) =>
        diagnostic
          .severity ===
        QUALITY_SEVERITY.ERROR
    )
    .length;
}


function _countWarnings(
  diagnostics
) {
  return diagnostics
    .filter(
      (
        diagnostic
      ) =>
        diagnostic
          .severity ===
        QUALITY_SEVERITY.WARNING
    )
    .length;
}


// ============================================================================
// COMMON QUALITY
// ============================================================================

function _validateCommon(
  definition,
  idField,
  diagnostics,
  policy
) {
  if (
    !_isObject(
      definition
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .DEFINITION_REQUIRED,

        message:
          "Definition must be an object.",

        path:
          "$",
      }
    );

    return;
  }

  if (
    !_nonEmptyString(
      definition[
        idField
      ]
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .ID_REQUIRED,

        message:
          `${idField} is required.`,

        path:
          idField,
      }
    );
  }

  if (
    !_nonEmptyString(
      definition
        .name
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .NAME_REQUIRED,

        message:
          "Definition name is required.",

        path:
          "name",
      }
    );
  }

  if (
    !_nonEmptyString(
      definition
        .description
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .DESCRIPTION_REQUIRED,

        message:
          "Definition description is required.",

        path:
          "description",
      }
    );
  } else if (
    definition
      .description
      .trim()
      .length <
    policy
      .minimumDescriptionLength
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .DESCRIPTION_TOO_SHALLOW,

        message:
          `Description must contain at least ${policy.minimumDescriptionLength} characters.`,

        path:
          "description",
      }
    );
  }

  if (
    !_nonEmptyString(
      definition
        .semver
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .VERSION_REQUIRED,

        message:
          "semver is required.",

        path:
          "semver",
      }
    );
  }

  if (
    !_nonEmptyString(
      definition
        .lifecycle
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .LIFECYCLE_REQUIRED,

        message:
          "lifecycle is required.",

        path:
          "lifecycle",
      }
    );
  }

  if (
    policy
      .requireOwner
  ) {
    if (
      !_isObject(
        definition
          .owner
      )
    ) {
      _push(
        diagnostics,
        {
          code:
            QUALITY_CODE
              .OWNER_REQUIRED,

          message:
            "owner configuration is required.",

          path:
            "owner",
        }
      );
    } else if (
      !_nonEmptyString(
        definition
          .owner
          .name
      )
    ) {
      _push(
        diagnostics,
        {
          code:
            QUALITY_CODE
              .OWNER_NAME_REQUIRED,

          message:
            "owner.name is required.",

          path:
            "owner.name",
        }
      );
    }
  }

  if (
    policy
      .requireScope
  ) {
    if (
      !_isObject(
        definition
          .scope
      )
    ) {
      _push(
        diagnostics,
        {
          code:
            QUALITY_CODE
              .SCOPE_REQUIRED,

          message:
            "scope configuration is required.",

          path:
            "scope",
        }
      );
    } else {
      if (
        !Array.isArray(
          definition
            .scope
            .providers
        ) ||
        definition
          .scope
          .providers
          .length ===
          0
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .PROVIDER_SCOPE_REQUIRED,

            message:
              "At least one provider must be declared in scope.providers.",

            path:
              "scope.providers",
          }
        );
      }

      if (
        !Array.isArray(
          definition
            .scope
            .environments
        ) ||
        definition
          .scope
          .environments
          .length ===
          0
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .ENVIRONMENT_SCOPE_REQUIRED,

            message:
              "At least one environment must be declared in scope.environments.",

            path:
              "scope.environments",
          }
        );
      }
    }
  }

  if (
    policy
      .requireRisk &&
    !_isObject(
      definition
        .risk
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .RISK_REQUIRED,

        message:
          "risk configuration is required.",

        path:
          "risk",
      }
    );
  }

  if (
    policy
      .requireParameterDescriptions &&
    Array.isArray(
      definition
        .parameters
    )
  ) {
    definition
      .parameters
      .forEach(
        (
          parameter,
          index
        ) => {
          if (
            !_nonEmptyString(
              parameter
                ?.description
            )
          ) {
            _push(
              diagnostics,
              {
                code:
                  QUALITY_CODE
                    .PARAMETER_DESCRIPTION_REQUIRED,

                message:
                  `Parameter ${parameter?.name || index} requires a description.`,

                path:
                  `parameters[${index}].description`,
              }
            );
          }
        }
      );
  }
}


// ============================================================================
// PLAYBOOK QUALITY
// ============================================================================

function validatePlaybookQuality(
  definition,
  options = {}
) {
  const policy = {
    ...DEFAULT_QUALITY_POLICY,
    ...(
      options.policy ||
      {}
    ),
  };

  const diagnostics =
    [];

  _validateCommon(
    definition,
    "playbookId",
    diagnostics,
    policy
  );

  if (
    !_isObject(
      definition
    )
  ) {
    return _result(
      DEFINITION_KIND.PLAYBOOK,
      diagnostics
    );
  }

  const stages =
    Array.isArray(
      definition
        .stages
    )
      ? definition.stages
      : [];

  if (
    stages.length <
    policy
      .minimumPlaybookStages
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .PLAYBOOK_STAGES_REQUIRED,

        message:
          `Playbook requires at least ${policy.minimumPlaybookStages} stage(s).`,

        path:
          "stages",
      }
    );
  }

  let referenceCount =
    0;

  stages.forEach(
    (
      stage,
      stageIndex
    ) => {
      if (
        !_nonEmptyString(
          stage
            ?.id
        )
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .PLAYBOOK_STAGE_ID_REQUIRED,

            message:
              "Every Playbook stage requires an id.",

            path:
              `stages[${stageIndex}].id`,
          }
        );
      }

      if (
        !_nonEmptyString(
          stage
            ?.type
        )
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .PLAYBOOK_STAGE_TYPE_REQUIRED,

            message:
              "Every Playbook stage requires a type.",

            path:
              `stages[${stageIndex}].type`,
          }
        );
      }

      const refs =
        Array.isArray(
          stage
            ?.runbooks
        )
          ? stage.runbooks
          : [];

      referenceCount +=
        refs.length;
    }
  );

  if (
    referenceCount ===
      0 &&
    !definition
      ?.rollback
      ?.runbook
      ?.runbookId
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .PLAYBOOK_RUNBOOK_REFERENCE_REQUIRED,

        message:
          "Playbook must reference at least one Runbook.",

        path:
          "stages",
      }
    );
  }

  /*
   * Shallow-definition guard.
   *
   * This intentionally does not require a fixed number of stages.
   * Some incidents legitimately need one deep stage while others need many.
   */
  if (
    stages.length ===
      1 &&
    referenceCount ===
      1 &&
    !_isObject(
      definition
        .rollback
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .SHALLOW_PLAYBOOK,

        severity:
          QUALITY_SEVERITY.WARNING,

        message:
          "Playbook contains only one stage and one Runbook relationship; review for sufficient operational depth.",

        path:
          "stages",
      }
    );
  }

  return _result(
    DEFINITION_KIND.PLAYBOOK,
    diagnostics
  );
}


// ============================================================================
// RUNBOOK QUALITY
// ============================================================================

function validateRunbookQuality(
  definition,
  options = {}
) {
  const policy = {
    ...DEFAULT_QUALITY_POLICY,
    ...(
      options.policy ||
      {}
    ),
  };

  const diagnostics =
    [];

  _validateCommon(
    definition,
    "runbookId",
    diagnostics,
    policy
  );

  if (
    !_isObject(
      definition
    )
  ) {
    return _result(
      DEFINITION_KIND.RUNBOOK,
      diagnostics
    );
  }

  const steps =
    Array.isArray(
      definition
        .steps
    )
      ? definition.steps
      : [];

  if (
    steps.length <
    policy
      .minimumRunbookSteps
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .RUNBOOK_STEPS_REQUIRED,

        message:
          `Runbook requires at least ${policy.minimumRunbookSteps} step(s).`,

        path:
          "steps",
      }
    );
  }

  steps.forEach(
    (
      step,
      stepIndex
    ) => {
      if (
        !_nonEmptyString(
          step
            ?.id
        )
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .RUNBOOK_STEP_ID_REQUIRED,

            message:
              "Every Runbook step requires an id.",

            path:
              `steps[${stepIndex}].id`,
          }
        );
      }

      if (
        !_nonEmptyString(
          step
            ?.type
        )
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .RUNBOOK_STEP_TYPE_REQUIRED,

            message:
              "Every Runbook step requires a type.",

            path:
              `steps[${stepIndex}].type`,
          }
        );
      }

      if (
        !_nonEmptyString(
          step
            ?.action
        )
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .RUNBOOK_STEP_ACTION_REQUIRED,

            message:
              "Every Runbook step requires an action.",

            path:
              `steps[${stepIndex}].action`,
          }
        );
      }

      if (
        !_nonEmptyString(
          step
            ?.failurePolicy
        )
      ) {
        _push(
          diagnostics,
          {
            code:
              QUALITY_CODE
                .RUNBOOK_FAILURE_POLICY_REQUIRED,

            message:
              "Every Runbook step requires a failurePolicy.",

            path:
              `steps[${stepIndex}].failurePolicy`,
          }
        );
      }
    }
  );

  if (
    policy
      .requireVerification
  ) {
    if (
      !_isObject(
        definition
          .verification
      )
    ) {
      _push(
        diagnostics,
        {
          code:
            QUALITY_CODE
              .VERIFICATION_REQUIRED,

          message:
            "Runbook verification configuration is required.",

          path:
            "verification",
        }
      );
    } else if (
      !Array.isArray(
        definition
          .verification
          .checks
      ) ||
      definition
        .verification
        .checks
        .length ===
        0
    ) {
      _push(
        diagnostics,
        {
          code:
            QUALITY_CODE
              .VERIFICATION_CHECKS_REQUIRED,

          message:
            "Runbook requires at least one verification check.",

          path:
            "verification.checks",
        }
      );
    }
  }

  if (
    policy
      .requireRollbackConfig &&
    !_isObject(
      definition
        .rollbackConfig
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .ROLLBACK_CONFIG_REQUIRED,

        message:
          "Runbook rollbackConfig is required.",

        path:
          "rollbackConfig",
      }
    );
  }

  if (
    policy
      .requireAuditConfig &&
    !_isObject(
      definition
        .auditConfig
    )
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .AUDIT_CONFIG_REQUIRED,

        message:
          "Runbook auditConfig is required.",

        path:
          "auditConfig",
      }
    );
  }

  if (
    steps.length ===
      1 &&
    definition
      ?.verification
      ?.checks
      ?.length ===
      1
  ) {
    _push(
      diagnostics,
      {
        code:
          QUALITY_CODE
            .SHALLOW_RUNBOOK,

        severity:
          QUALITY_SEVERITY.INFO,

        message:
          "Single-step Runbook detected; acceptable only when the deterministic action is intentionally atomic.",

        path:
          "steps",
      }
    );
  }

  return _result(
    DEFINITION_KIND.RUNBOOK,
    diagnostics
  );
}


// ============================================================================
// RESULT
// ============================================================================

function _result(
  kind,
  diagnostics
) {
  const errors =
    _countErrors(
      diagnostics
    );

  const warnings =
    _countWarnings(
      diagnostics
    );

  return {
    kind,

    valid:
      errors ===
      0,

    errors,

    warnings,

    diagnostics,
  };
}


// ============================================================================
// GENERIC ENTRY POINT
// ============================================================================

function validateCatalogueDefinitionQuality(
  definition,
  options = {}
) {
  const kind =
    String(
      definition
        ?.kind ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    kind ===
      "PLAYBOOK"
  ) {
    return validatePlaybookQuality(
      definition,
      options
    );
  }

  if (
    kind ===
      "RUNBOOK"
  ) {
    return validateRunbookQuality(
      definition,
      options
    );
  }

  return {
    kind:
      "UNKNOWN",

    valid:
      false,

    errors:
      1,

    warnings:
      0,

    diagnostics: [
      {
        code:
          QUALITY_CODE
            .DEFINITION_REQUIRED,

        severity:
          QUALITY_SEVERITY
            .ERROR,

        message:
          "Definition kind must be Playbook or Runbook.",

        path:
          "kind",
      },
    ],
  };
}


module.exports = {
  DEFINITION_KIND,
  QUALITY_SEVERITY,
  QUALITY_CODE,
  DEFAULT_QUALITY_POLICY,

  validatePlaybookQuality,
  validateRunbookQuality,
  validateCatalogueDefinitionQuality,
};