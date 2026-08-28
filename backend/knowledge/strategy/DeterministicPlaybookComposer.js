"use strict";

/**
 * Converts an already-approved Playbook definition into a deterministic
 * Runbook composition.
 *
 * IMPORTANT:
 *
 * This service:
 * - does not execute
 * - does not authorize
 * - does not invent steps
 * - does not accept AI-generated actions
 * - only follows Runbook references already stored in the Playbook
 */
class DeterministicPlaybookComposer {
  compose({
    playbook,
    runbooks = [],
  } = {}) {
    if (!playbook) {
      throw createError(
        "PLAYBOOK_REQUIRED",
        "playbook is required"
      );
    }

    const playbookId =
      playbook.playbookId ||
      playbook.playbookKey ||
      playbook.id ||
      null;

    if (!playbookId) {
      throw createError(
        "PLAYBOOK_ID_REQUIRED",
        "playbook must have an identifier"
      );
    }

    this._assertLifecycle(
      playbook
    );

    const stages =
      Array.isArray(
        playbook.stages
      )
        ? playbook.stages
        : [];

    if (!stages.length) {
      throw createError(
        "PLAYBOOK_STAGES_REQUIRED",
        `Playbook ${playbookId} has no stages`
      );
    }

    const runbookIndex =
      buildRunbookIndex(
        runbooks
      );

    const composedStages =
      stages.map(
        (
          stage,
          index
        ) =>
          this._composeStage({
            stage,
            index,
            runbookIndex,
          })
      );

    return {
      playbookId,

      playbookVersion:
        playbook.version ||
        playbook.semanticVersion ||
        null,

      checksum:
        playbook.checksum ||
        null,

      stages:
        composedStages,

      deterministic:
        true,

      containsAiGeneratedOperations:
        false,

      requiresPolicyEvaluation:
        true,

      requiresAuthorization:
        true,

      executionAuthorized:
        false,
    };
  }


  _composeStage({
    stage,
    index,
    runbookIndex,
  }) {
    this._assertNoDirectAction(
      stage,
      index
    );

    const reference =
      resolveRunbookReference(
        stage
      );

    if (!reference.id) {
      throw createError(
        "RUNBOOK_REFERENCE_REQUIRED",
        `Playbook stage ${index} must reference a Runbook`
      );
    }

    const runbook =
      resolveExactRunbook({
        reference,
        runbookIndex,
      });

    if (!runbook) {
      throw createError(
        "RUNBOOK_NOT_FOUND",
        `Runbook not found for stage ${index}: ${reference.id}`
      );
    }

    assertRunbookLifecycle(
      runbook
    );

    return {
      stageId:
        stage.stageId ||
        stage.id ||
        `stage-${index + 1}`,

      stageType:
        stage.stageType ||
        stage.type ||
        null,

      runbookId:
        runbook.runbookId ||
        runbook.runbookKey ||
        runbook.id,

      runbookVersion:
        runbook.version ||
        runbook.semanticVersion ||
        reference.version ||
        null,

      checksum:
        runbook.checksum ||
        null,

      parameterMappings:
        stage.parameterMappings ||
        stage.parameters ||
        {},

      failurePolicy:
        stage.failurePolicy ||
        "STOP",

      /**
       * Exact stored procedure reference.
       * No operational steps are generated here.
       */
      deterministic:
        true,

      executionAuthorized:
        false,
    };
  }


  _assertLifecycle(
    playbook
  ) {
    const lifecycle =
      String(
        playbook.lifecycle ||
        "ACTIVE"
      ).toUpperCase();

    if (
      lifecycle ===
        "DISABLED" ||
      lifecycle ===
        "DEPRECATED"
    ) {
      throw createError(
        "PLAYBOOK_NOT_EXECUTABLE",
        `Playbook lifecycle is ${lifecycle}`
      );
    }
  }


  _assertNoDirectAction(
    stage,
    index
  ) {
    const forbidden =
      [
        "command",
        "commands",
        "shell",
        "script",
        "action",
        "actions",
      ];

    for (
      const field
      of forbidden
    ) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(
            stage,
            field
          )
      ) {
        throw createError(
          "PLAYBOOK_DIRECT_EXECUTION_FORBIDDEN",
          `Stage ${index} contains forbidden direct execution field: ${field}`
        );
      }
    }
  }
}


function resolveRunbookReference(
  stage
) {
  const nested =
    stage.runbook ||
    stage.runbookRef ||
    null;

  if (
    typeof nested ===
      "string"
  ) {
    return {
      id:
        nested,

      version:
        stage.runbookVersion ||
        null,
    };
  }

  if (
    nested &&
    typeof nested ===
      "object"
  ) {
    return {
      id:
        nested.runbookId ||
        nested.runbookKey ||
        nested.id ||
        nested.key ||
        null,

      version:
        nested.version ||
        stage.runbookVersion ||
        null,
    };
  }

  return {
    id:
      stage.runbookId ||
      stage.runbookKey ||
      null,

    version:
      stage.runbookVersion ||
      null,
  };
}


function buildRunbookIndex(
  runbooks
) {
  const index =
    new Map();

  for (
    const runbook
    of (
      Array.isArray(
        runbooks
      )
        ? runbooks
        : []
    )
  ) {
    const id =
      runbook.runbookId ||
      runbook.runbookKey ||
      runbook.id;

    if (!id) {
      continue;
    }

    const version =
      runbook.version ||
      runbook.semanticVersion ||
      null;

    if (
      !index.has(id)
    ) {
      index.set(
        id,
        []
      );
    }

    index
      .get(id)
      .push({
        ...runbook,
        __resolvedVersion:
          version,
      });
  }

  return index;
}


function resolveExactRunbook({
  reference,
  runbookIndex,
}) {
  const candidates =
    runbookIndex.get(
      reference.id
    ) || [];

  if (!candidates.length) {
    return null;
  }

  if (
    reference.version
  ) {
    return (
      candidates.find(
        (runbook) =>
          String(
            runbook.__resolvedVersion
          ) ===
          String(
            reference.version
          )
      ) || null
    );
  }

  /**
   * Composer refuses ambiguous unversioned references.
   *
   * One candidate is deterministic.
   * Multiple versions require explicit version selection.
   */
  if (
    candidates.length !== 1
  ) {
    throw createError(
      "AMBIGUOUS_RUNBOOK_VERSION",
      `Runbook ${reference.id} has multiple versions; exact version required`
    );
  }

  return candidates[0];
}


function assertRunbookLifecycle(
  runbook
) {
  const lifecycle =
    String(
      runbook.lifecycle ||
      "ACTIVE"
    ).toUpperCase();

  if (
    lifecycle ===
      "DISABLED" ||
    lifecycle ===
      "DEPRECATED"
  ) {
    throw createError(
      "RUNBOOK_NOT_EXECUTABLE",
      `Runbook lifecycle is ${lifecycle}`
    );
  }
}


function createError(
  code,
  message
) {
  return Object.assign(
    new Error(message),
    {
      code,
      executionAuthorized:
        false,
    }
  );
}


module.exports =
  DeterministicPlaybookComposer;