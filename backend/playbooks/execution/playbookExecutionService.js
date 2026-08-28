"use strict";

/**
 * Playbook Execution Service
 *
 * Orchestrates playbook execution by chaining runbook executions through
 * the RunbookExecutionEngine.
 *
 * Canonical execution ownership:
 *
 * tenantId
 * + organizationId
 * + environmentId
 * + incidentId
 *
 * Architecture invariant:
 *
 * PlaybookExecutionService
 *   → PlaybookRegistry
 *   → PlaybookParameterMapper
 *   → RunbookRegistry
 *   → RunbookExecutionEngine
 *   → ActionHandlerRegistry
 *
 * This service NEVER executes infrastructure directly.
 */

const {
  v4: uuidv4,
} = require("uuid");

const {
  PLAYBOOK_EXECUTION_STATUS,
  STAGE_EXECUTION_STATUS,
  PLAYBOOK_STAGE_TYPE,
  PLAYBOOK_FAILURE_POLICY,
  PLAYBOOK_ROLLBACK_STRATEGY,
} = require("../../constants/playbook");

const PlaybookExecution =
  require(
    "../../persistence/postgres/PostgresPlaybookExecutionAdapter"
  );
  
  const {
  getPlaybookRegistry,
} = require("../registry/playbookRegistry");

const {
  mapParameters,
} = require("../parameters/playbookParameterMapper");

const {
  computePlaybookChecksum,
  playbookVersionRef,
} = require("../versioning/playbookVersioning");

const {
  getRunbookRegistry,
} = require("../../runbooks/registry/runbookRegistry");

const {
  getRunbookExecutionEngine,
} = require("../../runbooks/execution/runbookExecutionEngine");

// ============================================================================
// SERVICE
// ============================================================================

class PlaybookExecutionService {
  constructor(options = {}) {
    this._playbookRegistry =
      options.playbookRegistry ||
      getPlaybookRegistry();

    this._runbookRegistry =
      options.runbookRegistry ||
      getRunbookRegistry();

    this._executionEngine =
      options.executionEngine ||
      getRunbookExecutionEngine();
  }

  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _assertExecutionScope(
    options = {}
  ) {
    const {
      tenantId,
      organizationId,
      environmentId,
      incidentId,
    } = options;

    if (!tenantId) {
      const error =
        new Error(
          "tenantId is required for playbook execution"
        );

      error.status = 400;
      error.code =
        "PLAYBOOK_EXECUTION_TENANT_REQUIRED";

      throw error;
    }

    if (!organizationId) {
      const error =
        new Error(
          "organizationId is required for playbook execution"
        );

      error.status = 400;
      error.code =
        "PLAYBOOK_EXECUTION_ORGANIZATION_REQUIRED";

      throw error;
    }

    if (!environmentId) {
      const error =
        new Error(
          "environmentId is required for playbook execution"
        );

      error.status = 400;
      error.code =
        "PLAYBOOK_EXECUTION_ENVIRONMENT_REQUIRED";

      throw error;
    }

    return {
      tenantId,
      organizationId,
      environmentId,
      incidentId:
        incidentId || null,
    };
  }

  _executionScopeFilter(
    record
  ) {
    return {
      executionId:
        record.executionId,

      organizationId:
        record.organizationId,

      environmentId:
        record.environmentId,
    };
  }

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  /**
   * Execute a playbook for a given incident context.
   *
   * options:
   *
   * {
   *   tenantId,
   *   organizationId,
   *   environmentId,
   *   incidentId,
   *   correlationId,
   *   initiatedBy,
   *   initiatorType,
   *   dryRun,
   *   policyDecision,
   *   approvalId,
   *   approver,
   *   context
   * }
   */
  async execute(
    playbookId,
    semver,
    incidentContext = {},
    options = {}
  ) {
    const scope =
      this._assertExecutionScope(
        options
      );

    const executionId =
      uuidv4();

    const correlationId =
      options.correlationId ||
      uuidv4();

    const startedAtMs =
      Date.now();

    /**
     * Create the forensic execution record immediately.
     *
     * Even failures during registry lookup or matching are
     * therefore persisted.
     */
    let record =
      await PlaybookExecution.create({
        executionId,

        correlationId,

        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId:
          scope.incidentId,

        // Legacy compatibility only.
        orgId:
          String(
            scope.organizationId
          ),

        playbookId,

        playbookVersion:
          semver,

        /**
         * Required by schema.
         *
         * Replaced with the real immutable definition
         * immediately after registry resolution.
         */
        playbookSnapshot:
          {
            playbookId,
            semver,
          },

        playbookChecksum:
          "pending",

        versionRef:
          playbookVersionRef(
            playbookId,
            semver
          ),

        incidentContext,

        initiatedBy:
          options.initiatedBy ||
          null,

        initiatorType:
          options.initiatorType ||
          "api",

        status:
          PLAYBOOK_EXECUTION_STATUS
            .CREATED,

        stageExecutions:
          [],
      });

    try {
      // ======================================================================
      // 1. LOAD PLAYBOOK
      // ======================================================================

      record.status =
        PLAYBOOK_EXECUTION_STATUS
          .EVALUATING;

      await record.save();

      /**
       * Registry call receives full ownership scope.
       *
       * Registry implementation will be updated next so it can return:
       * - global system playbook
       * - matching tenant/environment playbook
       *
       * but never another tenant environment.
       */
      const playbookDef =
        await this
          ._playbookRegistry
          .getExecutionDefinition(
            playbookId,
            semver,
            {
              tenantId:
                scope.tenantId,

              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            }
          );

      const checksum =
        playbookDef.checksum ||
        computePlaybookChecksum(
          playbookDef
        );

      record.playbookSnapshot =
        _sanitizePlaybookSnapshot(
          playbookDef
        );

      record.playbookChecksum =
        checksum;

      record.versionRef =
        playbookVersionRef(
          playbookId,
          semver
        );

      await record.save();

      // ======================================================================
      // 2. POLICY
      // ======================================================================

      const policyDecision =
        _evaluatePolicy(
          playbookDef,
          incidentContext,
          options
        );

      record.policyDecision =
        policyDecision;

      await record.save();

      if (
        policyDecision.denied
      ) {
        record.status =
          PLAYBOOK_EXECUTION_STATUS
            .FAILED;

        record.errorCode =
          "POLICY_DENIED";

        record.errorMessage =
          policyDecision.reason;

        _setOutcome(
          record,
          false,
          Date.now() -
            startedAtMs,
          policyDecision.reason
        );

        record.completedAt =
          new Date();

        record.durationMs =
          Date.now() -
          startedAtMs;

        await record.save();

        return record.toObject();
      }

      // ======================================================================
      // 3. APPROVAL
      // ======================================================================

      if (
        _requiresApproval(
          playbookDef,
          policyDecision
        ) &&
        !options.approvalId
      ) {
        record.status =
          PLAYBOOK_EXECUTION_STATUS
            .WAITING_FOR_APPROVAL;

        record.statusReason =
          "Playbook requires human approval";

        await record.save();

        return record.toObject();
      }

      if (
        options.approvalId
      ) {
        record.approval = {
          approvalId:
            options.approvalId,

          approver:
            options.approver ||
            null,

          approvedAt:
            new Date(),

          mode:
            playbookDef
              .approval
              ?.mode ||
            null,

          decision:
            "APPROVED",
        };

        await record.save();
      }

      // ======================================================================
      // 4. RUN
      // ======================================================================

      record.status =
        PLAYBOOK_EXECUTION_STATUS
          .RUNNING;

      record.startedAt =
        new Date();

      await record.save();

      const sortedStages =
        [
          ...(playbookDef
            .stages ||
            []),
        ].sort(
          (a, b) =>
            a.order -
            b.order
        );

      for (
        const stage
        of sortedStages
      ) {
        /**
         * Rollback/escalation/verification stages are
         * handled in their respective phases.
         */
        if (
          stage.type ===
            PLAYBOOK_STAGE_TYPE
              .ROLLBACK &&
          !record._inRollback
        ) {
          continue;
        }

        if (
          stage.type ===
            PLAYBOOK_STAGE_TYPE
              .ESCALATION &&
          !record._inEscalation
        ) {
          continue;
        }

        if (
          stage.type ===
          PLAYBOOK_STAGE_TYPE
            .VERIFICATION
        ) {
          continue;
        }

        const stageRecord =
          _createStageRecord(
            stage
          );

        record.stageExecutions
          .push(
            stageRecord
          );

        await record.save();

       await this._executeStage(
  stageRecord,
  stage,
  incidentContext,
  playbookDef,
  {
    ...options,

    tenantId:
      scope.tenantId,

    organizationId:
      scope.organizationId,

    environmentId:
      scope.environmentId,

    incidentId:
      scope.incidentId,

    playbookExecutionId:
      record.executionId,

    correlationId,
  }
);

        /**
         * stageRecord is a plain object, so explicitly mark
         * nested field modified after mutation.
         */
        record.markModified(
          "stageExecutions"
        );

        await record.save();

        if (
          stageRecord.status ===
          STAGE_EXECUTION_STATUS
            .FAILED
        ) {
          const failurePolicy =
            stage.failurePolicy ||
            PLAYBOOK_FAILURE_POLICY
              .STOP;

          if (
            failurePolicy ===
            PLAYBOOK_FAILURE_POLICY
              .STOP
          ) {
            record.status =
              PLAYBOOK_EXECUTION_STATUS
                .FAILED;

            record.failedStageId =
              stage.id;

            record.errorMessage =
              stageRecord.error;

            break;
          }

          if (
            failurePolicy ===
            PLAYBOOK_FAILURE_POLICY
              .ROLLBACK
          ) {
            record.status =
              PLAYBOOK_EXECUTION_STATUS
                .ROLLBACK_PENDING;

            break;
          }

          if (
            failurePolicy ===
            PLAYBOOK_FAILURE_POLICY
              .ESCALATE
          ) {
            record.status =
              PLAYBOOK_EXECUTION_STATUS
                .ESCALATED;

            await this
              ._triggerEscalation(
                record,
                playbookDef,
                stage,
                options
              );

            break;
          }

          if (
            failurePolicy ===
            PLAYBOOK_FAILURE_POLICY
              .SKIP
          ) {
            stageRecord.status =
              STAGE_EXECUTION_STATUS
                .SKIPPED;

            stageRecord.skipped =
              true;

            stageRecord.skippedReason =
              "Skipped after failure (policy: SKIP)";

            record.markModified(
              "stageExecutions"
            );

            await record.save();

            continue;
          }

          if (
            failurePolicy ===
            PLAYBOOK_FAILURE_POLICY
              .CONTINUE
          ) {
            continue;
          }
        }
      }

      // ======================================================================
      // 5. ROLLBACK
      // ======================================================================

      if (
        record.status ===
        PLAYBOOK_EXECUTION_STATUS
          .ROLLBACK_PENDING
      ) {
       await this
  ._executeRollback(
    record,
    playbookDef,
    incidentContext,
    {
      ...options,

      tenantId:
        scope.tenantId,

      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,

      incidentId:
        scope.incidentId,

      playbookExecutionId:
        record.executionId,

      correlationId,
    },
    startedAtMs
  );
}

      // ======================================================================
      // 6. VERIFICATION
      // ======================================================================

      else if (
        record.status ===
        PLAYBOOK_EXECUTION_STATUS
          .RUNNING
      ) {
        record.status =
          PLAYBOOK_EXECUTION_STATUS
            .VERIFYING;

        await record.save();

        const verificationStages =
          sortedStages.filter(
            (stage) =>
              stage.type ===
              PLAYBOOK_STAGE_TYPE
                .VERIFICATION
          );

        let verificationPassed =
          true;

        for (
          const verificationStage
          of verificationStages
        ) {
          const stageRecord =
            _createStageRecord(
              verificationStage
            );

          record.stageExecutions
            .push(
              stageRecord
            );

          await record.save();

          await this
  ._executeStage(
    stageRecord,
    verificationStage,
    incidentContext,
    playbookDef,
    {
      ...options,

      tenantId:
        scope.tenantId,

      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,

      incidentId:
        scope.incidentId,

      playbookExecutionId:
        record.executionId,

      correlationId,
    }
  );

          record.markModified(
            "stageExecutions"
          );

          await record.save();

          if (
            stageRecord.status ===
            STAGE_EXECUTION_STATUS
              .FAILED
          ) {
            verificationPassed =
              false;

            const failurePolicy =
              verificationStage
                .failurePolicy ||
              PLAYBOOK_FAILURE_POLICY
                .STOP;

            if (
              failurePolicy ===
              PLAYBOOK_FAILURE_POLICY
                .ESCALATE
            ) {
              record.status =
                PLAYBOOK_EXECUTION_STATUS
                  .ESCALATED;

              await this
                ._triggerEscalation(
                  record,
                  playbookDef,
                  verificationStage,
                  options
                );
            } else {
              record.status =
                PLAYBOOK_EXECUTION_STATUS
                  .FAILED;

              record.errorCode =
                "VERIFICATION_FAILED";

              record.errorMessage =
                stageRecord.error ||
                `Verification stage "${verificationStage.id}" failed`;
            }

            break;
          }
        }

        if (
          verificationPassed
        ) {
          record.status =
            PLAYBOOK_EXECUTION_STATUS
              .SUCCEEDED;

          _setOutcome(
            record,
            true,
            Date.now() -
              startedAtMs,
            null
          );
        } else {
          _setOutcome(
            record,
            false,
            Date.now() -
              startedAtMs,
            record.errorMessage
          );
        }
      }

      // ======================================================================
      // COMPLETE
      // ======================================================================

      record.completedAt =
        new Date();

      record.durationMs =
        Date.now() -
        startedAtMs;

      await record.save();

      return record.toObject();
    } catch (error) {
      record.status =
        PLAYBOOK_EXECUTION_STATUS
          .FAILED;

      record.errorMessage =
        error.message;

      record.errorCode =
        error.code ||
        "EXECUTION_ERROR";

      record.completedAt =
        new Date();

      record.durationMs =
        Date.now() -
        startedAtMs;

      _setOutcome(
        record,
        false,
        record.durationMs,
        error.message
      );

      try {
        await record.save();
      } catch (
        persistenceError
      ) {
        console.error(
          "[playbook-execution] Failed to persist failure state:",
          persistenceError.message
        );
      }

      return record.toObject();
    }
  }

  // ==========================================================================
  // STAGE EXECUTION
  // ==========================================================================

  async _executeStage(
    stageRecord,
    stage,
    incidentContext,
    playbookDef,
    options
  ) {
    stageRecord.status =
      STAGE_EXECUTION_STATUS
        .RUNNING;

    stageRecord.startedAt =
      new Date();

    const stageStartedAt =
      Date.now();

    try {
      const runbooks =
        stage.runbooks ||
        [];

      for (
        const reference
        of runbooks
      ) {
        const runbookId =
          reference.runbookId;

        const runbookVersion =
          await this
            ._resolveRunbookVersion(
              runbookId,
              reference
                .versionConstraint,
              {
                tenantId:
                  options.tenantId,

                organizationId:
                  options.organizationId,

                environmentId:
                  options.environmentId,
              }
            );

        /**
         * Environment-safe registry lookup.
         */
        const runbookDefinition =
          await this
            ._runbookRegistry
            .getVersion(
              runbookId,
              runbookVersion,
              {
                tenantId:
                  options.tenantId,

                organizationId:
                  options.organizationId,

                environmentId:
                  options.environmentId,
              }
            );

        const {
          mapped,
          missing,
        } =
          mapParameters(
            reference
              .parameterMappings ||
              {},
            {
              incident:
                incidentContext,

              signal:
                incidentContext.signal,

              context:
                options.context ||
                {},

              evidence:
                incidentContext
                  .evidence ||
                {},

              service:
                incidentContext
                  .service ||
                {},

              constants:
                options.constants ||
                {},

              stage_output:
                _collectStageOutputs(
                  stageRecord
                ),
            },
            runbookDefinition
              .parameters ||
              []
          );

        if (
          missing.length >
          0
        ) {
          const required =
            runbookDefinition
              .parameters
              ?.filter(
                (parameter) =>
                  parameter.required &&
                  missing.includes(
                    parameter.name
                  )
              ) ||
            [];

          if (
            required.length >
            0
          ) {
            stageRecord.status =
              STAGE_EXECUTION_STATUS
                .FAILED;

            stageRecord.error =
              `Missing required parameters for runbook ${runbookId}: ${required
                .map(
                  (parameter) =>
                    parameter.name
                )
                .join(", ")}`;

            stageRecord.completedAt =
              new Date();

            stageRecord.durationMs =
              Date.now() -
              stageStartedAt;

            return;
          }
        }

        /**
         * CRITICAL:
         *
         * Full ownership context flows into the real
         * RunbookExecutionEngine and therefore down into
         * action handlers.
         */
        const runbookExecution =
  await this
    ._executionEngine
    .execute(
      runbookDefinition,
      {
        explicitInputs:
          mapped,

        incidentEvidence:
          incidentContext
            .evidence ||
          {},

        alertLabels:
          incidentContext
            .signal
            ?.labels ||
          {},

        tenantId:
          options.tenantId,

        organizationId:
          options.organizationId,

        environmentId:
          options.environmentId,

        incidentId:
          options.incidentId,

        playbookExecutionId:
          options.playbookExecutionId,

        correlationId:
          options.correlationId,

        initiatedBy:
          options.initiatedBy,

        initiatorType:
          options.initiatorType ||
          "system",

        approvalId:
          options.approvalId,

        approver:
          options.approver,

        dryRun:
          options.dryRun,
      }
    );

        stageRecord
          .runbookExecutions
          .push({
            runbookId,

            runbookVersion,

            executionId:
              runbookExecution
                .executionId,

            status:
              runbookExecution
                .status,

            startedAt:
              runbookExecution
                .startedAt,

            completedAt:
              runbookExecution
                .completedAt,

            durationMs:
              runbookExecution
                .durationMs,

            mappedParams:
              _redactMappedParams(
                mapped,
                runbookDefinition
                  .parameters ||
                  []
              ),

            output:
              runbookExecution
                .output ||
              null,

            error:
              runbookExecution
                .errorMessage ||
              null,
          });

        if (
          [
            "FAILED",
            "ROLLBACK_FAILED",
            "ESCALATED",
          ].includes(
            runbookExecution.status
          )
        ) {
          const required =
            reference.required !==
            false;

          if (required) {
            stageRecord.status =
              STAGE_EXECUTION_STATUS
                .FAILED;

            stageRecord.error =
              `Runbook ${runbookId} failed: ${
                runbookExecution.errorMessage ||
                runbookExecution.status
              }`;

            stageRecord.completedAt =
              new Date();

            stageRecord.durationMs =
              Date.now() -
              stageStartedAt;

            return;
          }
        }
      }

      stageRecord.status =
        STAGE_EXECUTION_STATUS
          .SUCCEEDED;

      stageRecord.completedAt =
        new Date();

      stageRecord.durationMs =
        Date.now() -
        stageStartedAt;
    } catch (error) {
      stageRecord.status =
        STAGE_EXECUTION_STATUS
          .FAILED;

      stageRecord.error =
        error.message;

      stageRecord.completedAt =
        new Date();

      stageRecord.durationMs =
        Date.now() -
        stageStartedAt;
    }
  }

  // ==========================================================================
  // ROLLBACK
  // ==========================================================================

  async _executeRollback(
    record,
    playbookDef,
    incidentContext,
    options,
    startedAt
  ) {
    const strategy =
      playbookDef
        .rollback
        ?.strategy ||
      PLAYBOOK_ROLLBACK_STRATEGY
        .NONE;

    if (
      strategy ===
      PLAYBOOK_ROLLBACK_STRATEGY
        .NONE
    ) {
      record.status =
        PLAYBOOK_EXECUTION_STATUS
          .FAILED;

      _setOutcome(
        record,
        false,
        Date.now() -
          startedAt,
        "Stage failed, no rollback configured"
      );

      await record.save();

      return;
    }

    record.status =
      PLAYBOOK_EXECUTION_STATUS
        .ROLLING_BACK;

    record._inRollback =
      true;

    await record.save();

    const rollbackRecord =
      {
        strategy,

        triggeredAt:
          new Date(),

        success:
          false,

        reason:
          null,

        stageResults:
          [],
      };

    try {
      if (
        strategy ===
        PLAYBOOK_ROLLBACK_STRATEGY
          .STAGE_ROLLBACK
      ) {
        const rollbackStageIds =
          playbookDef
            .rollback
            ?.stages ||
          [];

        const descendingStages =
          [
            ...(
              playbookDef
                .stages ||
              []
            ),
          ].sort(
            (a, b) =>
              b.order -
              a.order
          );

        const rollbackStages =
          rollbackStageIds
            .length >
          0
            ? rollbackStageIds
                .map(
                  (id) =>
                    playbookDef
                      .stages
                      .find(
                        (
                          stage
                        ) =>
                          stage.id ===
                          id
                      )
                )
                .filter(
                  Boolean
                )
            : descendingStages
                .filter(
                  (stage) =>
                    stage.type ===
                    PLAYBOOK_STAGE_TYPE
                      .ROLLBACK
                );

        for (
          const stage
          of rollbackStages
        ) {
          const stageRecord =
            _createStageRecord(
              stage
            );

          record.stageExecutions
            .push(
              stageRecord
            );

          await record.save();

          await this
            ._executeStage(
              stageRecord,
              stage,
              incidentContext,
              playbookDef,
              options
            );

          rollbackRecord
            .stageResults
            .push({
              stageId:
                stage.id,

              status:
                stageRecord.status,
            });

          record.markModified(
            "stageExecutions"
          );

          await record.save();
        }
      }

      rollbackRecord.completedAt =
        new Date();

      rollbackRecord.success =
        true;

      record.rollback =
        rollbackRecord;

      record.status =
        PLAYBOOK_EXECUTION_STATUS
          .ROLLED_BACK;

      _setOutcome(
        record,
        false,
        Date.now() -
          startedAt,
        "Execution rolled back"
      );

      await record.save();
    } catch (error) {
      rollbackRecord.completedAt =
        new Date();

      rollbackRecord.success =
        false;

      rollbackRecord.reason =
        error.message;

      record.rollback =
        rollbackRecord;

      record.status =
        PLAYBOOK_EXECUTION_STATUS
          .ROLLBACK_FAILED;

      _setOutcome(
        record,
        false,
        Date.now() -
          startedAt,
        `Rollback failed: ${error.message}`
      );

      await record.save();
    }
  }

  // ==========================================================================
  // ESCALATION
  // ==========================================================================

  async _triggerEscalation(
    record,
    playbookDef,
    failedStage
  ) {
    record.escalation =
      {
        triggered:
          true,

        triggeredAt:
          new Date(),

        reason:
          `Stage "${failedStage.id}" failed with ESCALATE policy`,

        escalatedTo:
          playbookDef
            .escalation
            ?.escalateTo ||
          null,

        notified:
          false,

        channels:
          playbookDef
            .escalation
            ?.notifyChannels ||
          [],
      };

    await record.save();
  }

  // ==========================================================================
  // RUNBOOK VERSION RESOLUTION
  // ==========================================================================

  async _resolveRunbookVersion(
    runbookId,
    constraint,
    scope
  ) {
    if (
      constraint &&
      constraint !==
        ""
    ) {
      return constraint
        .replace(
          /^[>=~]/,
          ""
        );
    }

    const latest =
      await this
        ._runbookRegistry
        .getLatestVersion(
          runbookId,
          scope
        );

    if (!latest) {
      throw new Error(
        `Runbook "${runbookId}" not found in the active environment`
      );
    }

    return latest.semver;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function _createStageRecord(
  stage
) {
  return {
    stageId:
      stage.id,

    stageName:
      stage.name,

    stageType:
      stage.type,

    status:
      STAGE_EXECUTION_STATUS
        .PENDING,

    startedAt:
      null,

    completedAt:
      null,

    durationMs:
      null,

    runbookExecutions:
      [],

    output:
      null,

    error:
      null,

    skipped:
      false,

    skippedReason:
      null,
  };
}

function _setOutcome(
  record,
  successful,
  durationMs,
  failureReason
) {
  record.outcome =
    {
      successful,

      recoveryTimeMs:
        durationMs,

      failureReason:
        failureReason ||
        null,

      learningCaptured:
        false,

      incidentMemoryUpdated:
        false,

      humanInvolved:
        record.approval !=
        null,

      summary:
        successful
          ? "Playbook completed successfully"
          : (
              failureReason ||
              "Execution failed"
            ),
    };
}

function _evaluatePolicy(
  playbookDef,
  incidentContext,
  options
) {
  if (
    !playbookDef
      .policy
      ?.required
  ) {
    return {
      denied:
        false,

      reason:
        null,
    };
  }

  if (
    !options
      .policyDecision
  ) {
    return {
      denied:
        false,

      reason:
        null,
    };
  }

  return options
    .policyDecision;
}

function _requiresApproval(
  playbookDef,
  policyDecision
) {
  const mode =
    playbookDef
      .approval
      ?.mode;

  if (
    !mode ||
    mode ===
      "DISABLED" ||
    mode ===
      "AUTOMATIC"
  ) {
    return false;
  }

  if (
    mode ===
    "MANUAL"
  ) {
    return true;
  }

  if (
    mode ===
    "CONDITIONAL"
  ) {
    return (
      policyDecision
        ?.requiresApproval ===
      true
    );
  }

  return false;
}

function _collectStageOutputs(
  stageRecord
) {
  const output =
    {};

  if (
    !stageRecord
      ?.runbookExecutions
  ) {
    return output;
  }

  for (
    const runbookExecution
    of stageRecord
      .runbookExecutions
  ) {
    if (
      runbookExecution.output
    ) {
      Object.assign(
        output,
        runbookExecution
          .output
      );
    }
  }

  return output;
}

function _redactMappedParams(
  mapped,
  parameterDefinitions
) {
  const sensitive =
    new Set(
      parameterDefinitions
        .filter(
          (parameter) =>
            parameter.sensitive ||
            parameter.type ===
              "secret-reference"
        )
        .map(
          (parameter) =>
            parameter.name
        )
    );

  const result =
    {};

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      mapped
    )
  ) {
    result[key] =
      sensitive.has(
        key
      )
        ? "[REDACTED]"
        : value;
  }

  return result;
}

function _sanitizePlaybookSnapshot(
  definition
) {
  const snapshot =
    {
      ...definition,
    };

  delete snapshot._id;
  delete snapshot.__v;
  delete snapshot.createdAt;
  delete snapshot.updatedAt;

  return snapshot;
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;

function getPlaybookExecutionService(
  options = {}
) {
  if (!instance) {
    instance =
      new PlaybookExecutionService(
        options
      );
  }

  return instance;
}

function resetPlaybookExecutionService() {
  instance =
    null;
}

module.exports = {
  PlaybookExecutionService,
  getPlaybookExecutionService,
  resetPlaybookExecutionService,
};