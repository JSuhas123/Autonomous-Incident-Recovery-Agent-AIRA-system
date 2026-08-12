"use strict";

/**
 * Incident Playbook Integration Service
 *
 * Single bridge between:
 *
 * Incident
 *   ↓
 * Playbook matching
 *   ↓
 * Playbook execution
 *   ↓
 * Runbook execution
 *
 * Canonical ownership boundary:
 *
 * tenantId
 * + organizationId
 * + environmentId
 *
 * This service NEVER calls ActionHandlerRegistry directly.
 */

const {
  matchPlaybooks,
  resolveMatchOutcome,
} =
  require(
    "../../playbooks/matching/playbookMatcher"
  );

const {
  getPlaybookRegistry,
} =
  require(
    "../../playbooks/registry/playbookRegistry"
  );

const {
  getPlaybookExecutionService,
} =
  require(
    "../../playbooks/execution/playbookExecutionService"
  );

const {
  PLAYBOOK_LIFECYCLE,
} =
  require(
    "../../constants/playbook"
  );

const {
  EXECUTION_OUTCOME,
} =
  require(
    "../../constants/executionOutcomes"
  );

class IncidentPlaybookService {
  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _resolveScope(
    incident,
    options = {}
  ) {
    const tenantId =
      options.tenantId ||
      incident.tenantId ||
      null;

    const organizationId =
      options.organizationId ||
      incident.organizationId ||
      null;

    const environmentId =
      options.environmentId ||
      incident.environmentId ||
      null;

    if (!tenantId) {
      const error =
        new Error(
          "tenantId is required for incident playbook operations"
        );

      error.status =
        400;

      error.code =
        "INCIDENT_PLAYBOOK_TENANT_REQUIRED";

      throw error;
    }

    if (!organizationId) {
      const error =
        new Error(
          "organizationId is required for incident playbook operations"
        );

      error.status =
        400;

      error.code =
        "INCIDENT_PLAYBOOK_ORGANIZATION_REQUIRED";

      throw error;
    }

    if (!environmentId) {
      const error =
        new Error(
          "environmentId is required for incident playbook operations"
        );

      error.status =
        400;

      error.code =
        "INCIDENT_PLAYBOOK_ENVIRONMENT_REQUIRED";

      throw error;
    }

    return {
      tenantId,

      organizationId,

      environmentId,

      incidentId:
        incident.id ||
        incident._id ||
        options.incidentId ||
        null,
    };
  }

  // ==========================================================================
  // ANALYSE
  // ==========================================================================

  /**
   * Find candidate playbooks for an incident.
   *
   * Does NOT execute anything.
   */
  async analyseIncident(
    incident,
    options = {}
  ) {
    const scope =
      this._resolveScope(
        incident,
        options
      );

    const registry =
      getPlaybookRegistry();

    /**
     * Tenant-owned playbooks are now environment-scoped.
     *
     * The registry will subsequently be updated so this
     * query returns:
     *
     * - global SYSTEM playbooks
     * - tenant playbooks belonging to this environment
     *
     * and nothing from another environment.
     */
    const activePlaybooks =
      await registry.list({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        lifecycle:
          PLAYBOOK_LIFECYCLE
            .ACTIVE,
      });

    const incidentContext =
      _normaliseIncident(
        incident
      );

    const matchResults =
      matchPlaybooks(
        activePlaybooks,
        incidentContext,
        {
          minScore:
            options.minScore,

          maxResults:
            options.maxResults,
        }
      );

    const outcome =
      resolveMatchOutcome(
        matchResults,
        incidentContext
      );

    const eligible =
      matchResults.filter(
        (result) =>
          result.eligible
      );

    return {
      incidentId:
        scope.incidentId,

      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,

      candidateCount:
        matchResults.length,

      eligibleCount:
        eligible.length,

      outcome:
        outcome.outcome,

      outcomeReason:
        outcome.reason ||
        null,

      candidates:
        matchResults.map(
          _serialiseMatch
        ),

      eligible:
        eligible.map(
          _serialiseMatch
        ),

      best:
        outcome.best
          ? _serialiseMatch(
              outcome.best
            )
          : null,

      disqualifications:
        outcome.disqualifications ||
        [],

      missingEvidence:
        outcome.missingEvidence ||
        [],

      escalationRecommendation:
        outcome
          .escalationRecommendation ||
        null,

      analysedAt:
        new Date()
          .toISOString(),
    };
  }

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  /**
   * Execute the best matching playbook for an incident.
   */
  async executeForIncident(
    incident,
    options = {}
  ) {
    const scope =
      this._resolveScope(
        incident,
        options
      );

    const analysis =
      await this.analyseIncident(
        incident,
        {
          ...options,

          tenantId:
            scope.tenantId,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        }
      );

    if (
      analysis.outcome !==
        EXECUTION_OUTCOME
          .AUTO_RESOLVED ||
      !analysis.best
    ) {
      return {
        executed:
          false,

        outcome:
          analysis.outcome,

        reason:
          analysis.outcomeReason,

        analysis,

        execution:
          null,
      };
    }

    const {
      playbookId,
      semver,
    } =
      analysis.best;

    const service =
      getPlaybookExecutionService();

    const incidentContext =
      _normaliseIncident(
        incident
      );

    /**
     * Critical ownership propagation.
     *
     * From this point onward every execution layer receives
     * exactly the same organization/environment boundary.
     */
    const execution =
      await service.execute(
        playbookId,
        semver,
        incidentContext,
        {
          tenantId:
            scope.tenantId,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          incidentId:
            scope.incidentId,

          correlationId:
            options.correlationId,

          initiatedBy:
            options.initiatedBy,

          initiatorType:
            options.initiatorType ||
            "system",

          dryRun:
            Boolean(
              options.dryRun
            ),

          policyDecision:
            options.policyDecision,

          approvalId:
            options.approvalId,

          approver:
            options.approver,

          context: {
            ...(
              options.context ||
              {}
            ),

            tenantId:
              scope.tenantId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId:
              scope.incidentId,
          },
        }
      );

    return {
      executed:
        true,

      outcome:
        analysis.outcome,

      playbookId,

      semver,

      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,

      analysis,

      execution:
        _serialiseExecution(
          execution
        ),
    };
  }
}

// ============================================================================
// INCIDENT NORMALISATION
// ============================================================================

function _normaliseIncident(
  incident
) {
  return {
    id:
      incident.id ||
      (
        incident._id
          ? incident._id
              .toString()
          : undefined
      ),

    organizationId:
      incident.organizationId,

    environmentId:
      incident.environmentId,

    serviceId:
      incident.serviceId,

    monitorId:
      incident.monitorId,

    type:
      incident.incidentType ||
      incident.type ||
      "unknown",

    severity:
      incident.severity,

    provider:
      incident.provider ||
      _inferProvider(
        incident
      ),

    /**
     * Human-readable environment classification used
     * by playbook applicability matching.
     *
     * environmentId remains the ownership boundary.
     */
    environment:
      incident.environment ||
      incident.scope
        ?.environment,

    resource:
      incident.resource ||
      _extractResource(
        incident
      ),

    evidence:
      incident.evidence ||
      {},

    signal:
      incident.signal ||
      {},

    confidence:
      incident.confidence ??
      incident.confidenceScore ??
      0,

    tags:
      incident.tags ||
      [],

    createdAt:
      incident.createdAt,

    detectedAt:
      incident.detectedAt,

    title:
      incident.title ||
      "",

    description:
      incident.description ||
      "",
  };
}

// ============================================================================
// PROVIDER / RESOURCE HELPERS
// ============================================================================

function _inferProvider(
  incident
) {
  if (
    !Array.isArray(
      incident.tags
    )
  ) {
    return undefined;
  }

  if (
    incident.tags.some(
      (tag) =>
        /^kubernetes|k8s/i
          .test(tag)
    )
  ) {
    return "kubernetes";
  }

  if (
    incident.tags.some(
      (tag) =>
        /^database|db/i
          .test(tag)
    )
  ) {
    return "database";
  }

  return undefined;
}

function _extractResource(
  incident
) {
  return {
    pod:
      incident.evidence
        ?.pod ||
      incident.signal
        ?.pod_name,

    namespace:
      incident.evidence
        ?.namespace ||
      incident.signal
        ?.namespace,

    deployment:
      incident.evidence
        ?.deployment ||
      incident.signal
        ?.deployment,

    cluster:
      incident.evidence
        ?.cluster ||
      incident.signal
        ?.cluster,

    service:
      incident.serviceId ||
      incident.evidence
        ?.service,
  };
}

// ============================================================================
// SERIALISERS
// ============================================================================

function _serialiseMatch(
  match
) {
  return {
    playbookId:
      match.playbookId,

    semver:
      match.semver,

    name:
      match.name,

    score:
      match.score,

    eligible:
      match.eligible,

    approvalMode:
      match.approvalMode,

    riskLevel:
      match.riskLevel,

    matchReasons:
      match.matchReasons ||
      [],

    disqualifications:
      match.disqualifications ||
      [],
  };
}

function _serialiseExecution(
  execution
) {
  if (!execution) {
    return null;
  }

  return {
    executionId:
      execution.executionId,

    playbookId:
      execution.playbookId,

    /**
     * PlaybookExecution model stores this as playbookVersion.
     */
    semver:
      execution.playbookVersion ||
      execution.semver,

    organizationId:
      execution.organizationId,

    environmentId:
      execution.environmentId,

    incidentId:
      execution.incidentId,

    status:
      execution.status,

    startedAt:
      execution.startedAt,

    completedAt:
      execution.completedAt,

    durationMs:
      execution.durationMs,

    errorCode:
      execution.errorCode ||
      null,

    errorMessage:
      execution.errorMessage ||
      null,

    stageExecutions:
      (
        execution.stageExecutions ||
        []
      ).map(
        (stage) => ({
          stageId:
            stage.stageId,

          stageName:
            stage.stageName,

          stageType:
            stage.stageType,

          status:
            stage.status,

          durationMs:
            stage.durationMs,

          runbookExecutions:
            (
              stage.runbookExecutions ||
              []
            ).map(
              (runbook) => ({
                runbookId:
                  runbook.runbookId,

                executionId:
                  runbook.executionId,

                status:
                  runbook.status,

                durationMs:
                  runbook.durationMs,

                error:
                  runbook.error ||
                  null,
              })
            ),
        })
      ),

    outcome:
      execution.outcome ||
      null,
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;

function getIncidentPlaybookService() {
  if (!instance) {
    instance =
      new IncidentPlaybookService();
  }

  return instance;
}

module.exports = {
  IncidentPlaybookService,
  getIncidentPlaybookService,
};