'use strict';

const express = require('express');

const {
  decisionTraceService,
} = require('../services/core');

const {
  memoryService,
} = require('../services/learning');

const {
  circuitBreakerService,
} = require('../services/execution');

const router = express.Router({
  mergeParams: true,
});

/**
 * Core Decision Loop API Routes
 *
 * Routes:
 *
 * - GET /decisions/:id
 * - GET /decisions
 * - GET /incidents/:id
 * - GET /actions/:id
 * - GET /patterns
 * - GET /audit/:id
 * - GET /metrics
 * - GET /circuit-breakers
 *
 * DecisionTrace ownership boundary:
 *
 * tenantId
 * + organizationId
 * + environmentId
 *
 * A trace from PROD must never be visible from STAGING,
 * even if the caller knows its decisionId.
 */

// ============================================================================
// SCOPE
// ============================================================================

/**
 * Resolve canonical authenticated execution scope.
 *
 * Primary source:
 *
 * req.auth
 *
 * Compatibility fallbacks are retained for older middleware that exposes:
 *
 * req.tenant
 * req.environment
 * req.context
 * req.params.tenantId
 */
function getDecisionScope(req) {
  const tenantId =
    req.auth?.tenantId ||
    req.tenant?.id ||
    req.tenant?._id ||
    req.params?.tenantId ||
    null;

  const organizationId =
    req.auth?.organizationId ||
    req.organizationId ||
    req.context?.organizationId ||
    req.tenant?.organizationId ||
    null;

  const environmentId =
    req.auth?.environmentId ||
    req.environmentId ||
    req.environment?.id ||
    req.environment?._id ||
    req.context?.environmentId ||
    null;

  if (!tenantId) {
    const error =
      new Error(
        'Authenticated tenantId is required'
      );

    error.status =
      400;

    error.code =
      'DECISION_TENANT_REQUIRED';

    throw error;
  }

  if (!organizationId) {
    const error =
      new Error(
        'Authenticated organizationId is required'
      );

    error.status =
      400;

    error.code =
      'DECISION_ORGANIZATION_REQUIRED';

    throw error;
  }

  if (!environmentId) {
    const error =
      new Error(
        'Active environmentId is required for decision operations'
      );

    error.status =
      400;

    error.code =
      'DECISION_ENVIRONMENT_REQUIRED';

    throw error;
  }

  return {
    tenantId,
    organizationId,
    environmentId,
  };
}

// ============================================================================
// GET /decisions/:id
// ============================================================================

/**
 * Retrieve full decision trace.
 *
 * This is the primary explainability endpoint.
 */
router.get(
  '/decisions/:id',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const {
        id,
      } =
        req.params;

      const trace =
        await decisionTraceService
          .getTrace(
            id,
            scope
          );

      if (!trace) {
        return res
          .status(404)
          .json({
            error:
              'Decision trace not found',
          });
      }

      const confidence =
        trace.inputs
          ?.confidence ??
        0;

      return res.json({
        decision:
          trace,

        explanation: {
          confidence: {
            score:
              confidence,

            level:
              confidence >=
              0.8
                ? 'HIGH'
                : confidence >=
                    0.6
                  ? 'MEDIUM'
                  : 'LOW',

            factors:
              trace.reasoning
                ?.confidenceFactors ||
              [],
          },

          rulesThatFired:
            trace.rulesTriggered ||
            [],

          actionChosen: {
            action:
              trace.recommendedAction,

            reason:
              trace.reasoning
                ?.hypothesis ||
              null,

            riskAssessment:
              trace.actionRisk ||
              null,
          },

          policiesApplied:
            trace.policyCheck
              ?.checks ||
            [],

          actionResult:
            trace.actionResult ||
            null,
        },
      });
    } catch (error) {
      if (
        error.code ===
          'DECISION_TRACE_NOT_FOUND' ||
        error.message
          ?.toLowerCase()
          .includes(
            'trace not found'
          )
      ) {
        error.status =
          404;
      }

      return next(error);
    }
  }
);

// ============================================================================
// GET /decisions
// ============================================================================

/**
 * List recent decisions for the active environment.
 */
router.get(
  '/decisions',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const {
        limit = 50,
        action,
        status,
      } =
        req.query;

      const parsedLimit =
        Math.min(
          Math.max(
            Number.parseInt(
              limit,
              10
            ) ||
              50,
            1
          ),
          100
        );

      const filter =
        {};

      if (action) {
        filter.recommendedAction =
          action;
      }

      if (status) {
        filter[
          'actionResult.status'
        ] =
          status;
      }

      const traces =
        await decisionTraceService
          .getRecentTraces(
            scope,
            parsedLimit,
            filter
          );

      const summary =
        await decisionTraceService
          .getDecisionSummary(
            scope
          );

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        recentDecisions:
          traces.map(
            (trace) => ({
              decisionId:
                trace.decisionId,

              incidentId:
                trace.incidentId ||
                null,

              timestamp:
                trace.createdAt,

              action:
                trace.recommendedAction,

              confidence:
                trace.inputs
                  ?.confidence,

              policyVerdict:
                trace.policyCheck
                  ?.verdict,

              actionStatus:
                trace.actionResult
                  ?.status,
            })
          ),

        summary,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// GET /incidents/:id
// ============================================================================

/**
 * Lightweight incident decision view.
 *
 * The canonical Incident API remains responsible for the complete
 * incident document. This endpoint provides decision-loop context.
 */
router.get(
  '/incidents/:id',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const {
        id,
      } =
        req.params;

      const traces =
        await decisionTraceService
          .searchTraces(
            scope,
            {
              incidentId:
                id,

              limit:
                10,
            }
          );

      const incidentTrace =
        traces[0];

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incident: {
          incidentId:
            id,

          severity:
            incidentTrace
              ?.inputs
              ?.severity,

          status:
            incidentTrace
              ? 'active'
              : 'unknown',

          affectedServices:
            incidentTrace
              ?.inputs
              ?.signals
              ?.affectedServices ||
            [],

          detectionTime:
            incidentTrace
              ?.createdAt ||
            null,

          lastUpdateTime:
            incidentTrace
              ?.updatedAt ||
            null,

          relatedDecisions:
            traces.length,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// GET /actions/:id
// ============================================================================

/**
 * Retrieve action execution result.
 *
 * Action lookup remains environment-scoped through DecisionTrace.
 */
router.get(
  '/actions/:id',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const {
        id,
      } =
        req.params;

      const traces =
        await decisionTraceService
          .searchTraces(
            scope,
            {
              actionId:
                id,

              limit:
                1,
            }
          );

      const trace =
        traces[0];

      if (
        !trace ||
        !trace.actionResult
      ) {
        return res
          .status(404)
          .json({
            error:
              'Action not found',
          });
      }

      const actionResult =
        trace.actionResult;

      /**
       * Defensive check in case an older DecisionTraceService
       * implementation ignores actionId filtering.
       */
      if (
        actionResult.actionId &&
        actionResult.actionId !==
          id
      ) {
        return res
          .status(404)
          .json({
            error:
              'Action not found',
          });
      }

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        action: {
          actionId:
            actionResult.actionId,

          action:
            actionResult.action,

          status:
            actionResult.status,

          durationMs:
            actionResult.durationMs,

          outcome:
            actionResult.outcome,

          dryRunPerformed:
            actionResult
              .dryRunPerformed,

          timestamp:
            actionResult.timestamp,

          error:
            actionResult.error,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// GET /patterns
// ============================================================================

/**
 * Recurring incident patterns.
 *
 * MemoryService is still tenant-keyed in the current architecture,
 * so we retain its existing API here.
 */
router.get(
  '/patterns',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const summary =
        await memoryService
          .getSummary(
            scope.tenantId
          );

      const patterns =
        (
          summary.patterns ||
          []
        ).map(
          (pattern) => {
            const bestAction =
              Object.entries(
                pattern.actionStats ||
                {}
              ).reduce(
                (
                  best,
                  [
                    action,
                    stats,
                  ]
                ) => {
                  if (
                    !best ||
                    stats.successRate >
                      best.successRate
                  ) {
                    return {
                      action,
                      ...stats,
                    };
                  }

                  return best;
                },
                null
              );

            return {
              patternId:
                pattern.patternId,

              occurrences:
                pattern
                  .totalOccurrences,

              lastSeen:
                pattern
                  .lastOccurrence,

              bestResolution:
                bestAction
                  ?.action,

              successRate:
                bestAction
                  ?.successRate,

              avgRecoveryTimeMs:
                bestAction
                  ?.avgRecoveryTimeMs,

              actions:
                pattern.actionStats,
            };
          }
        );

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        patterns,

        totalPatterns:
          summary.totalPatterns ||
          patterns.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// GET /audit/:id
// ============================================================================

/**
 * Retrieve full decision audit trail.
 */
router.get(
  '/audit/:id',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const {
        id,
      } =
        req.params;

      const trace =
        await decisionTraceService
          .getTrace(
            id,
            scope
          );

      if (!trace) {
        return res
          .status(404)
          .json({
            error:
              'Trace not found',
          });
      }

      const policyChecks =
        trace.policyCheck
          ?.checks ||
        [];

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        auditTrail: {
          decisionId:
            trace.decisionId,

          correlationId:
            trace.correlationId,

          incidentId:
            trace.incidentId ||
            null,

          events:
            (
              trace.auditTrail ||
              []
            ).map(
              (event) => ({
                stage:
                  event.stage,

                timestamp:
                  event.timestamp,

                status:
                  event.status,
              })
            ),

          timeline: [
            {
              event:
                'decision_made',

              timestamp:
                trace.createdAt,

              decision:
                trace.decision,

              reasoning:
                trace.reasoning
                  ?.hypothesis ||
                null,
            },

            ...(
              trace.policyCheck
                ? [
                    {
                      event:
                        'policy_checked',

                      timestamp:
                        trace
                          .policyCheck
                          .timestamp,

                      verdict:
                        trace
                          .policyCheck
                          .verdict,

                      rules:
                        policyChecks
                          .length,
                    },
                  ]
                : []
            ),

            ...(
              trace.actionResult
                ? [
                    {
                      event:
                        'action_executed',

                      timestamp:
                        trace
                          .actionResult
                          .timestamp,

                      status:
                        trace
                          .actionResult
                          .status,

                      outcome:
                        trace
                          .actionResult
                          .outcome,
                    },
                  ]
                : []
            ),

            ...(
              trace.memoryUpdate
                ? [
                    {
                      event:
                        'memory_updated',

                      timestamp:
                        trace
                          .memoryUpdate
                          .timestamp,

                      pattern:
                        trace
                          .memoryUpdate
                          .pattern,

                      success:
                        trace
                          .memoryUpdate
                          .successRecorded,
                    },
                  ]
                : []
            ),
          ],
        },
      });
    } catch (error) {
      if (
        error.code ===
          'DECISION_TRACE_NOT_FOUND' ||
        error.message
          ?.toLowerCase()
          .includes(
            'trace not found'
          )
      ) {
        error.status =
          404;
      }

      return next(error);
    }
  }
);

// ============================================================================
// GET /metrics
// ============================================================================

/**
 * Environment-scoped decision metrics.
 */
router.get(
  '/metrics',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const summary =
        await decisionTraceService
          .getDecisionSummary(
            scope
          );

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        metrics: {
          totalDecisions:
            summary.totalDecisions,

          decisionTypes:
            summary.byDecisionType,

          actionType:
            summary.byActionType,

          avgConfidence:
            `${(
              (
                summary.avgConfidence ||
                0
              ) *
              100
            ).toFixed(1)}%`,

          policyApprovalRate:
            `${(
              (
                summary.policyApprovalRate ||
                0
              ) *
              100
            ).toFixed(1)}%`,

          actionSuccessRate:
            `${(
              (
                summary.successRate ||
                0
              ) *
              100
            ).toFixed(1)}%`,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// GET /circuit-breakers
// ============================================================================

/**
 * Circuit-breaker service currently remains tenant-keyed.
 *
 * Environment context is still returned so this route is consistent
 * with the active environment contract.
 */
router.get(
  '/circuit-breakers',
  async (
    req,
    res,
    next
  ) => {
    try {
      const scope =
        getDecisionScope(req);

      const statuses =
        await circuitBreakerService
          .getStatusAll(
            scope.tenantId
          );

      return res.json({
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        circuitBreakers:
          statuses,

        totalOpen:
          statuses.filter(
            (status) =>
              status.status ===
              'OPEN'
          ).length,

        totalHalfOpen:
          statuses.filter(
            (status) =>
              status.status ===
              'HALF_OPEN'
          ).length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports =
  router;