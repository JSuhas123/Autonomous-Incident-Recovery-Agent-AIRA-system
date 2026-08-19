"use strict";

/**
 * AIRA Diagnosis Lifecycle Service
 *
 * Phase 6.14
 *
 * Bridges the incident lifecycle into the Phase 6 diagnosis pipeline.
 *
 * Responsibilities:
 *
 * - receive incident lifecycle events
 * - decide whether diagnosis should run
 * - prevent unnecessary duplicate diagnosis runs
 * - invoke DiagnosisCoordinator
 * - persist diagnosis revisions
 *
 * Safety:
 *
 * - no remediation execution
 * - no playbook execution
 * - no execution authorization
 */

const diagnosisCoordinator =
  require(
    "./diagnosisCoordinator"
  );

const diagnosisPersistenceService =
  require(
    "./diagnosisPersistenceService"
  );

const {
  agentIntelligenceRunRepository,
} =
  require(
    "../../persistence/repositories"
  );

class DiagnosisLifecycleService {
  constructor(
    options = {}
  ) {
    this.coordinator =
      options.coordinator ||
      diagnosisCoordinator;

    this.persistence =
      options.persistence ||
      diagnosisPersistenceService;

    this.minimumRerunIntervalMs =
      Number(
        options.minimumRerunIntervalMs ||
        process.env
          .DIAGNOSIS_MIN_RERUN_INTERVAL_MS
      ) ||
      30 * 1000;
  }

  // ==========================================================================
  // INCIDENT DETECTED
  // ==========================================================================

  async onIncidentDetected(
    payload,
    dependencies = {}
  ) {
    this.assertPayload(
      payload
    );

    const {
      organizationId,
      environmentId,
      incidentId,
    } =
      payload;

    const shouldRun =
      await this.shouldRunDiagnosis({
        organizationId,
        environmentId,
        incidentId,
        reason:
          "incident_detected",
      });

    if (
      !shouldRun.run
    ) {
      return {
        triggered:
          false,

        reason:
          shouldRun.reason,

        incidentId,

        executionAuthorized:
          false,
      };
    }

    return this.runDiagnosis({
      organizationId,
      environmentId,
      incidentId,
      reason:
        "incident_detected",
      dependencies,
    });
  }

  // ==========================================================================
  // INCIDENT UPDATED
  // ==========================================================================

  async onIncidentUpdated(
    payload,
    dependencies = {}
  ) {
    this.assertPayload(
      payload
    );

    if (
      !this.isMeaningfulUpdate(
        payload
      )
    ) {
      return {
        triggered:
          false,

        reason:
          "incident_update_not_diagnostically_meaningful",

        incidentId:
          payload.incidentId,

        executionAuthorized:
          false,
      };
    }

    const shouldRun =
      await this.shouldRunDiagnosis({
        organizationId:
          payload.organizationId,

        environmentId:
          payload.environmentId,

        incidentId:
          payload.incidentId,

        reason:
          payload.reason ||
          payload.changeType ||
          "incident_updated",
      });

    if (
      !shouldRun.run
    ) {
      return {
        triggered:
          false,

        reason:
          shouldRun.reason,

        incidentId:
          payload.incidentId,

        executionAuthorized:
          false,
      };
    }

    return this.runDiagnosis({
      organizationId:
        payload.organizationId,

      environmentId:
        payload.environmentId,

      incidentId:
        payload.incidentId,

      reason:
        payload.reason ||
        payload.changeType ||
        "incident_updated",

      dependencies,
    });
  }

  // ==========================================================================
  // SIGNAL ATTACHED
  // ==========================================================================

  async onSignalAttached(
    payload,
    dependencies = {}
  ) {
    this.assertPayload(
      payload
    );

    const shouldRun =
      await this.shouldRunDiagnosis({
        organizationId:
          payload.organizationId,

        environmentId:
          payload.environmentId,

        incidentId:
          payload.incidentId,

        reason:
          "new_signal",
      });

    if (
      !shouldRun.run
    ) {
      return {
        triggered:
          false,

        reason:
          shouldRun.reason,

        incidentId:
          payload.incidentId,

        executionAuthorized:
          false,
      };
    }

    return this.runDiagnosis({
      organizationId:
        payload.organizationId,

      environmentId:
        payload.environmentId,

      incidentId:
        payload.incidentId,

      reason:
        "new_signal",

      dependencies,
    });
  }

  // ==========================================================================
  // RUN DIAGNOSIS
  // ==========================================================================

 async runDiagnosis({
  organizationId,
  environmentId,
  incidentId,
  reason,
  dependencies = {},
}) {
  const coordinatorResult =
    await this.coordinator
      .diagnose(
        {
          organizationId,
          environmentId,
        },

        incidentId,

        dependencies
      );

  /*
   * Preserve the lifecycle trigger inside the canonical diagnostic context.
   *
   * The diagnostic pipeline remains read-only and this metadata is useful for
   * audit, replay and downstream recovery-planning decisions.
   */
  coordinatorResult
    .context
    .metadata = {
      ...(
        coordinatorResult
          .context
          .metadata ||
        {}
      ),

      lifecycleTrigger:
        reason,
    };

  const persisted =
    await this.persistence
      .persist(
        coordinatorResult
      );

  /*
   * Phase 12.1:
   *
   * Return the canonical diagnostic result to trusted in-process callers.
   *
   * This allows recovery planning to continue FROM the already completed
   * diagnosis instead of independently re-running InvestigationAgent and
   * DiagnosisAgent through the legacy compatibility orchestrator.
   *
   * Nothing returned here grants execution authority.
   */
  const canonicalResult = {
    runId:
      coordinatorResult
        .runId,

    coordinatorVersion:
      coordinatorResult
        .coordinatorVersion,

    incidentId:
      coordinatorResult
        .incidentId,

    organizationId:
      coordinatorResult
        .organizationId,

    environmentId:
      coordinatorResult
        .environmentId,

    tenantId:
      coordinatorResult
        .context
        ?.tenantId ||
      null,

    diagnosis:
      coordinatorResult
        .diagnosis,

    context:
      coordinatorResult
        .context,

    agentTrace:
      coordinatorResult
        .agentTrace ||
      [],

    confidence:
      coordinatorResult
        .confidence,

    safetyGate:
      coordinatorResult
        .safetyGate,

    startedAt:
      coordinatorResult
        .startedAt,

    completedAt:
      coordinatorResult
        .completedAt,

    durationMs:
      coordinatorResult
        .durationMs,

    executionAuthorized:
      false,
  };

  return {
    triggered:
      true,

    reason,

    incidentId,

    runId:
      coordinatorResult
        .runId,

    diagnosisId:
      persisted
        .diagnosis
        ._id,

    revision:
      persisted
        .revision,

    decision:
      coordinatorResult
        .confidence
        ?.decision ||
      null,

    confidence:
      coordinatorResult
        .confidence
        ?.confidence ??
      null,

    safetyGateDecision:
      coordinatorResult
        .safetyGate
        ?.decision ||
      null,

    canEvaluatePlaybook:
      Boolean(
        coordinatorResult
          .safetyGate
          ?.canEvaluatePlaybook
      ),

    /*
     * Trusted internal handoff object.
     *
     * HTTP routes must choose explicitly what they expose to clients.
     */
    canonicalResult,

    executionAuthorized:
      false,
  };
}

  // ==========================================================================
  // SHOULD RUN?
  // ==========================================================================

 async shouldRunDiagnosis({
  organizationId,
  environmentId,
  incidentId,
}) {
  const previous =
    await agentIntelligenceRunRepository
      .findLatestForIncident({
        organizationId,

        environmentId,

        incidentId,
      });

  if (
    !previous
  ) {
    return {
      run:
        true,

      reason:
        "first_diagnosis",
    };
  }

  const timestamp =
    previous.completedAt ||
    previous.createdAt;

  if (
    !timestamp
  ) {
    return {
      run:
        true,

      reason:
        "previous_run_timestamp_missing",
    };
  }

  const elapsed =
    Date.now() -
    new Date(
      timestamp
    )
      .getTime();

  if (
    elapsed <
    this.minimumRerunIntervalMs
  ) {
    return {
      run:
        false,

      reason:
        "diagnosis_debounce_active",
    };
  }

  return {
    run:
      true,

    reason:
      "diagnosis_refresh_allowed",
  };
}

  // ==========================================================================
  // MEANINGFUL UPDATE
  // ==========================================================================

  isMeaningfulUpdate(
    payload
  ) {
    if (
      payload.forceDiagnosis ===
      true
    ) {
      return true;
    }

    const changeType =
      String(
        payload.changeType ||
        payload.reason ||
        ""
      )
        .trim()
        .toLowerCase();

    return [
      "new_signal",
      "severity_changed",
      "incident_reopened",
      "correlation_updated",
      "blast_radius_changed",
      "topology_changed",
      "new_evidence",
      "provider_added",
      "occurrence_increased",
    ]
      .includes(
        changeType
      );
  }

  // ==========================================================================
  // VALIDATE PAYLOAD
  // ==========================================================================

  assertPayload(
    payload
  ) {
    if (
      !payload
        ?.organizationId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis lifecycle event requires organizationId"
        ),
        {
          code:
            "DIAGNOSIS_LIFECYCLE_ORGANIZATION_REQUIRED",
        }
      );
    }

    if (
      !payload
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis lifecycle event requires environmentId"
        ),
        {
          code:
            "DIAGNOSIS_LIFECYCLE_ENVIRONMENT_REQUIRED",
        }
      );
    }

    if (
      !payload
        ?.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis lifecycle event requires incidentId"
        ),
        {
          code:
            "DIAGNOSIS_LIFECYCLE_INCIDENT_REQUIRED",
        }
      );
    }
  }
}

module.exports =
  new DiagnosisLifecycleService();

module.exports
  .DiagnosisLifecycleService =
  DiagnosisLifecycleService;