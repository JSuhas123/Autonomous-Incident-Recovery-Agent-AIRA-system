"use strict";

/**
 * AIRA Lifecycle Controller
 *
 * Phase 10.14
 *
 * Exposes lifecycle control-plane APIs.
 *
 * SAFETY:
 *
 * - may queue lifecycle processing
 * - may read lifecycle state/history
 * - does not execute rollback
 * - does not execute recovery
 * - does not authorize infrastructure execution
 */

const IncidentLifecycle =
  require(
    "../models/IncidentLifecycle"
  );

const IncidentLifecycleTransition =
  require(
    "../models/IncidentLifecycleTransition"
  );

const RecoveryVerification =
  require(
    "../models/RecoveryVerification"
  );

const lifecycleQueueService =
  require(
    "../services/lifecycle/lifecycleQueueService"
  );

class LifecycleController {
  // ==========================================================================
  // QUEUE LIFECYCLE PROCESSING
  // ==========================================================================

  async requestLifecycleProcessing(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      if (
        !incidentId
      ) {
        throw this.error(
          "incidentId is required",
          "LIFECYCLE_API_INCIDENT_REQUIRED",
          400
        );
      }

      const verification =
        await RecoveryVerification
          .findOne({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,

            isCurrent:
              true,
          })
          .lean();

      if (
        !verification
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "LIFECYCLE_VERIFICATION_NOT_FOUND",

              message:
                "Current recovery verification not found.",
            },
          });
      }

      const queued =
        await lifecycleQueueService
          .enqueue({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,

            verificationId:
              verification
                .verificationId,

            lifecycleIntent:
              req.body
                ?.lifecycleIntent ||
              null,

            executionAuthorized:
              false,
          });

      return res
        .status(
          202
        )
        .json({
          success:
            true,

          queued:
            queued.queued ===
            true,

          incidentId,

          verificationId:
            verification
              .verificationId,

          lifecycleStarted:
            false,

          recoveryStarted:
            false,

          rollbackStarted:
            false,

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // CURRENT LIFECYCLE
  // ==========================================================================

  async getCurrentLifecycle(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      const lifecycle =
        await IncidentLifecycle
          .findOne({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          })
          .lean();

      if (
        !lifecycle
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "INCIDENT_LIFECYCLE_NOT_FOUND",

              message:
                "Incident lifecycle state not found.",
            },
          });
      }

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          lifecycle:
            this.serializeLifecycle(
              lifecycle
            ),
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // HISTORY
  // ==========================================================================

  async getLifecycleHistory(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      const limit =
        Math.min(
          500,
          Math.max(
            1,
            Number(
              req.query.limit ||
              100
            )
          )
        );

      const transitions =
        await IncidentLifecycleTransition
          .find({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          })
          .sort({
            revision:
              1,
          })
          .limit(
            limit
          )
          .lean();

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          incidentId,

          count:
            transitions.length,

          transitions,
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // STABILITY
  // ==========================================================================

  async getStabilityStatus(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      const lifecycle =
        await IncidentLifecycle
          .findOne({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          })
          .lean();

      if (
        !lifecycle
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "INCIDENT_LIFECYCLE_NOT_FOUND",

              message:
                "Incident lifecycle state not found.",
            },
          });
      }

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          incidentId,

          lifecycleState:
            lifecycle
              .lifecycleState,

          stabilityObservation:
            lifecycle
              .stabilityObservation ||
            null,

          closureEligibility:
            lifecycle
              .closureEligibility ||
            null,

          resolvedAt:
            lifecycle
              .resolvedAt ||
            null,

          closedAt:
            lifecycle
              .closedAt ||
            null,

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // CONTROL STATUS
  // ==========================================================================

  async getControlStatus(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      const lifecycle =
        await IncidentLifecycle
          .findOne({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          })
          .lean();

      if (
        !lifecycle
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "INCIDENT_LIFECYCLE_NOT_FOUND",

              message:
                "Incident lifecycle state not found.",
            },
          });
      }

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          incidentId,

          lifecycleState:
            lifecycle
              .lifecycleState,

          verificationId:
            lifecycle
              .verificationId ||
            null,

          retryRequestId:
            lifecycle
              .retryRequestId ||
            null,

          rollbackRequestId:
            lifecycle
              .rollbackRequestId ||
            null,

          escalationId:
            lifecycle
              .escalationId ||
            null,

          stabilityObservation:
            lifecycle
              .stabilityObservation ||
            null,

          closureEligibility:
            lifecycle
              .closureEligibility ||
            null,

          resolvedAt:
            lifecycle
              .resolvedAt ||
            null,

          closedAt:
            lifecycle
              .closedAt ||
            null,

          regressedAt:
            lifecycle
              .regressedAt ||
            null,

          escalatedAt:
            lifecycle
              .escalatedAt ||
            null,

          recoveryStarted:
            false,

          rollbackStarted:
            false,

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  serializeLifecycle(
    lifecycle
  ) {
    return {
      organizationId:
        lifecycle
          .organizationId,

      environmentId:
        lifecycle
          .environmentId,

      incidentId:
        lifecycle
          .incidentId,

      lifecycleState:
        lifecycle
          .lifecycleState,

      revision:
        lifecycle
          .revision,

      verificationId:
        lifecycle
          .verificationId ||
        null,

      recoveryDecisionId:
        lifecycle
          .recoveryDecisionId ||
        null,

      executionRequestId:
        lifecycle
          .executionRequestId ||
        null,

      retryRequestId:
        lifecycle
          .retryRequestId ||
        null,

      rollbackRequestId:
        lifecycle
          .rollbackRequestId ||
        null,

      escalationId:
        lifecycle
          .escalationId ||
        null,

      stabilityObservation:
        lifecycle
          .stabilityObservation ||
        null,

      closureEligibility:
        lifecycle
          .closureEligibility ||
        null,

      latestTransition:
        lifecycle
          .latestTransition ||
        null,

      lastReason:
        lifecycle
          .lastReason ||
        null,

      resolvedAt:
        lifecycle
          .resolvedAt ||
        null,

      closedAt:
        lifecycle
          .closedAt ||
        null,

      regressedAt:
        lifecycle
          .regressedAt ||
        null,

      escalatedAt:
        lifecycle
          .escalatedAt ||
        null,

      createdAt:
        lifecycle
          .createdAt,

      updatedAt:
        lifecycle
          .updatedAt,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SCOPE
  // ==========================================================================

  resolveScope(
    req
  ) {
    const organizationId =
      req.organizationId ||
      req.context
        ?.organizationId ||
      req.user
        ?.organizationId;

    const environmentId =
      req.environmentId ||
      req.context
        ?.environmentId ||
      req.headers[
        "x-environment-id"
      ];

    if (
      !organizationId ||
      !environmentId
    ) {
      throw this.error(
        "Lifecycle API requires organization and environment scope",
        "LIFECYCLE_API_SCOPE_REQUIRED",
        400
      );
    }

    return {
      organizationId:
        String(
          organizationId
        ),

      environmentId:
        String(
          environmentId
        ),
    };
  }

  error(
    message,
    code,
    status
  ) {
    return Object.assign(
      new Error(
        message
      ),
      {
        code,
        status,
      }
    );
  }
}

module.exports =
  new LifecycleController();

module.exports
  .LifecycleController =
  LifecycleController;