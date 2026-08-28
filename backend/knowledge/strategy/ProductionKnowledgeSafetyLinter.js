"use strict";

/**
 * Phase 18.19 production knowledge safety gate.
 *
 * It validates safety properties of FailureMode / Playbook / Runbook
 * definitions before they are promoted into production knowledge.
 *
 * This is intentionally domain-neutral.
 */
class ProductionKnowledgeSafetyLinter {
  lintRunbook(
    runbook = {}
  ) {
    const errors = [];
    const warnings = [];

    const runbookId =
      runbook.runbookId ||
      runbook.runbookKey ||
      runbook.id ||
      "UNKNOWN_RUNBOOK";

    const lifecycle =
      String(
        runbook.lifecycle ||
        "DRAFT"
      ).toUpperCase();

    const steps =
      Array.isArray(
        runbook.steps
      )
        ? runbook.steps
        : [];

    if (!steps.length) {
      errors.push(
        issue(
          "RUNBOOK_STEPS_REQUIRED",
          runbookId
        )
      );
    }

    for (
      let index = 0;
      index < steps.length;
      index += 1
    ) {
      this._lintRunbookStep({
        runbookId,
        lifecycle,
        step:
          steps[index],
        index,
        errors,
      });
    }

    const mutating =
      steps.some(
        isMutatingStep
      );

    if (
      mutating &&
      !hasExplicitRollbackDefinition(
        runbook
      )
    ) {
      errors.push(
        issue(
          "ROLLBACK_MUST_BE_EXPLICIT",
          runbookId
        )
      );
    }

    if (
      mutating &&
      !hasVerificationDefinition(
        runbook
      )
    ) {
      errors.push(
        issue(
          "VERIFICATION_REQUIRED_FOR_MUTATION",
          runbookId
        )
      );
    }

    const risk =
      normalizeRisk(
        runbook
      );

    if (
      [
        "HIGH",
        "CRITICAL",
      ].includes(risk) &&
      !runbook.escalation
    ) {
      warnings.push(
        issue(
          "HIGH_RISK_ESCALATION_RECOMMENDED",
          runbookId
        )
      );
    }

    return result({
      kind:
        "RUNBOOK",

      id:
        runbookId,

      errors,
      warnings,
    });
  }


  lintPlaybook(
    playbook = {}
  ) {
    const errors = [];
    const warnings = [];

    const playbookId =
      playbook.playbookId ||
      playbook.playbookKey ||
      playbook.id ||
      "UNKNOWN_PLAYBOOK";

    const stages =
      Array.isArray(
        playbook.stages
      )
        ? playbook.stages
        : [];

    if (!stages.length) {
      errors.push(
        issue(
          "PLAYBOOK_STAGES_REQUIRED",
          playbookId
        )
      );
    }

    for (
      let index = 0;
      index < stages.length;
      index += 1
    ) {
      const stage =
        stages[index];

      const forbiddenFields = [
        "command",
        "commands",
        "shell",
        "script",
        "action",
        "actions",
      ];

      for (
        const field
        of forbiddenFields
      ) {
        if (
          Object.prototype
            .hasOwnProperty
            .call(
              stage,
              field
            )
        ) {
          errors.push(
            issue(
              "PLAYBOOK_DIRECT_EXECUTION_FORBIDDEN",
              `${playbookId}:stage:${index}:${field}`
            )
          );
        }
      }

      if (
        !hasRunbookReference(
          stage
        )
      ) {
        errors.push(
          issue(
            "PLAYBOOK_STAGE_RUNBOOK_REQUIRED",
            `${playbookId}:stage:${index}`
          )
        );
      }
    }

    if (
      !playbook.escalation
    ) {
      warnings.push(
        issue(
          "PLAYBOOK_ESCALATION_NOT_DEFINED",
          playbookId
        )
      );
    }

    return result({
      kind:
        "PLAYBOOK",

      id:
        playbookId,

      errors,
      warnings,
    });
  }


  lintFailureMode(
    failureMode = {}
  ) {
    const errors = [];
    const warnings = [];

    const id =
      failureMode.failureModeId ||
      failureMode.id ||
      "UNKNOWN_FAILURE_MODE";

    const evidence =
      failureMode
        .evidenceRequirements ||
      failureMode
        .requiredEvidence ||
      [];

    if (
      !Array.isArray(
        evidence
      ) ||
      !evidence.length
    ) {
      warnings.push(
        issue(
          "FAILURE_MODE_HAS_NO_EVIDENCE_REQUIREMENTS",
          id
        )
      );
    }

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          failureMode,
          "executionAuthorized"
        ) &&
      failureMode
        .executionAuthorized ===
        true
    ) {
      errors.push(
        issue(
          "KNOWLEDGE_CANNOT_AUTHORIZE_EXECUTION",
          id
        )
      );
    }

    return result({
      kind:
        "FAILURE_MODE",

      id,

      errors,
      warnings,
    });
  }


  lintCatalogue({
    failureModes = [],
    playbooks = [],
    runbooks = [],
  } = {}) {
    const reports = [
      ...(
        Array.isArray(
          failureModes
        )
          ? failureModes
          : []
      ).map(
        (item) =>
          this.lintFailureMode(
            item
          )
      ),

      ...(
        Array.isArray(
          playbooks
        )
          ? playbooks
          : []
      ).map(
        (item) =>
          this.lintPlaybook(
            item
          )
      ),

      ...(
        Array.isArray(
          runbooks
        )
          ? runbooks
          : []
      ).map(
        (item) =>
          this.lintRunbook(
            item
          )
      ),
    ];

    const errors =
      reports.flatMap(
        (report) =>
          report.errors
      );

    const warnings =
      reports.flatMap(
        (report) =>
          report.warnings
      );

    return {
      valid:
        errors.length === 0,

      reports,

      errorCount:
        errors.length,

      warningCount:
        warnings.length,

      errors,
      warnings,

      executionAuthorized:
        false,
    };
  }


  _lintRunbookStep({
    runbookId,
    lifecycle,
    step,
    index,
    errors,
  }) {
    if (
      !step ||
      typeof step !==
        "object"
    ) {
      errors.push(
        issue(
          "INVALID_RUNBOOK_STEP",
          `${runbookId}:step:${index}`
        )
      );

      return;
    }

    const type =
      String(
        step.type ||
        step.stepType ||
        ""
      ).toUpperCase();

    /**
     * Legacy SHELL may exist in historical definitions.
     *
     * But it cannot be promoted as ACTIVE/APPROVED production knowledge.
     */
    if (
      type ===
      "SHELL" &&
      [
        "ACTIVE",
        "APPROVED",
      ].includes(
        lifecycle
      )
    ) {
      errors.push(
        issue(
          "EXECUTABLE_SHELL_FORBIDDEN",
          `${runbookId}:step:${index}`
        )
      );
    }

    const arbitraryFields = [
      "rawCommand",
      "shellCommand",
      "arbitraryCommand",
    ];

    for (
      const field
      of arbitraryFields
    ) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(
            step,
            field
          )
      ) {
        errors.push(
          issue(
            "ARBITRARY_COMMAND_FIELD_FORBIDDEN",
            `${runbookId}:step:${index}:${field}`
          )
        );
      }
    }

    if (
      step.executionAuthorized ===
      true
    ) {
      errors.push(
        issue(
          "KNOWLEDGE_CANNOT_AUTHORIZE_EXECUTION",
          `${runbookId}:step:${index}`
        )
      );
    }
  }
}


function hasRunbookReference(
  stage
) {
  return Boolean(
    stage.runbookId ||
    stage.runbookKey ||
    stage.runbookRef ||
    stage.runbook
  );
}


function isMutatingStep(
  step
) {
  if (!step) {
    return false;
  }

  if (
    step.readOnly ===
    true
  ) {
    return false;
  }

  const type =
    String(
      step.type ||
      step.stepType ||
      ""
    ).toUpperCase();

  const readOnlyTypes =
    new Set([
      "READ",
      "QUERY",
      "OBSERVE",
      "METRIC",
      "LOG",
      "EVENT",
      "WAIT",
      "CHECK",
      "VERIFY",
      "INVESTIGATE",
    ]);

  if (
    readOnlyTypes.has(
      type
    )
  ) {
    return false;
  }

  return (
    step.mutating === true ||
    step.readOnly === false
  );
}


function hasExplicitRollbackDefinition(
  runbook
) {
  const rollback =
    runbook.rollbackConfig ||
    runbook.rollback;

  if (!rollback) {
    return false;
  }

  if (
    rollback.available ===
    false
  ) {
    return true;
  }

  if (
    String(
      rollback.strategy ||
      ""
    ).toUpperCase() ===
    "NONE"
  ) {
    return true;
  }

  if (
    rollback.strategy
  ) {
    return true;
  }

  if (
    Array.isArray(
      rollback.steps
    )
  ) {
    return true;
  }

  return false;
}


function hasVerificationDefinition(
  runbook
) {
  const verification =
    runbook.verification;

  if (!verification) {
    return false;
  }

  if (
    verification.strategy
  ) {
    return true;
  }

  return [
    verification.checks,
    verification.steps,
    verification.conditions,
  ].some(
    (value) =>
      Array.isArray(
        value
      ) &&
      value.length > 0
  );
}


function normalizeRisk(
  definition
) {
  return String(
    definition.risk?.level ||
    definition.riskLevel ||
    "LOW"
  ).toUpperCase();
}


function issue(
  code,
  target
) {
  return {
    code,
    target,
  };
}


function result({
  kind,
  id,
  errors,
  warnings,
}) {
  return {
    kind,
    id,

    valid:
      errors.length === 0,

    errorCount:
      errors.length,

    warningCount:
      warnings.length,

    errors,
    warnings,

    executionAuthorized:
      false,
  };
}


module.exports =
  ProductionKnowledgeSafetyLinter;