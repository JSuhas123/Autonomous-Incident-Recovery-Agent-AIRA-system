"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.13
 * DETERMINISTIC INTEGRATION EXECUTION AUTHORIZATION BOUNDARY
 * ============================================================================
 *
 * executeCapability() is NOT authorization.
 *
 * This service verifies a previously persisted AIRA execution authorization
 * and its linked immutable execution request before an integration adapter may
 * receive an execution-capable invocation.
 *
 * Canonical authority:
 *
 *   execution.authorizations
 *   execution.execution_requests
 *
 * NOT:
 *
 *   request body
 *   LLM output
 *   IntegrationConnection
 *   adapter capability
 *   caller-provided { authorized: true }
 *
 * Required chain:
 *
 * Recovery decision
 *      ↓
 * Policy / approval / freshness / kill-switch / lock checks
 *      ↓
 * ExecutionAuthorizationEngine
 *      ↓
 * persisted execution.authorization
 *      ↓
 * persisted execution.execution_request
 *      ↓
 * THIS VERIFICATION BOUNDARY
 *      ↓
 * IntegrationRuntime.executeCapability()
 *      ↓
 * provider adapter
 * ============================================================================
 */

const PostgresExecutionAuthorizationRepository =
  require(
    "../../persistence/postgres/PostgresExecutionAuthorizationRepository"
  );

const {
  AUTHORIZATION_DECISION,

  AUTHORIZATION_STATUS,

  EXECUTION_APPROVAL_STATE,

  EXECUTION_POLICY_STATE,

  EXECUTION_FRESHNESS_STATE,

  KILL_SWITCH_STATE,

  EXECUTION_LOCK_STATE,

  EXECUTION_REQUEST_STATE,
} =
  require(
    "../execution/executionAuthorizationContracts"
  );


const ALLOWED_REQUEST_STATES =
  new Set([
    EXECUTION_REQUEST_STATE
      .AUTHORIZED,

    EXECUTION_REQUEST_STATE
      .QUEUED,

    EXECUTION_REQUEST_STATE
      .RUNNING,
  ]);


class IntegrationExecutionAuthorizationBoundary {
  constructor(
    options = {}
  ) {
    this.repository =
      options
        .executionAuthorizationRepository ||
      new PostgresExecutionAuthorizationRepository(
        options
      );


    this.now =
      options.now ||
      (() =>
        new Date());
  }


  async verify({
    organizationId,

    environmentId,

    incidentId,

    authorizationId,

    executionRequestId,

    planId,

    planHash,

    capability =
      null,
  } = {}) {
    requireText(
      organizationId,
      "organizationId"
    );

    requireText(
      environmentId,
      "environmentId"
    );

    requireText(
      incidentId,
      "incidentId"
    );

    requireText(
      authorizationId,
      "authorizationId"
    );

    requireText(
      executionRequestId,
      "executionRequestId"
    );

    requireText(
      planId,
      "planId"
    );

    requireText(
      planHash,
      "planHash"
    );


    const scope = {
      organizationId,

      environmentId,

      incidentId,
    };


    const [
      authorization,

      executionRequest,
    ] =
      await Promise.all([
        this.repository
          .findAuthorizationByIdentifier(
            scope,
            authorizationId
          ),

        this.repository
          .findExecutionRequestByIdentifier(
            scope,
            executionRequestId
          ),
      ]);


    if (
      !authorization
    ) {
      throw boundaryError(
        "Persisted execution authorization was not found",
        "INTEGRATION_EXECUTION_AUTHORIZATION_NOT_FOUND"
      );
    }


    if (
      !executionRequest
    ) {
      throw boundaryError(
        "Persisted execution request was not found",
        "INTEGRATION_EXECUTION_REQUEST_NOT_FOUND"
      );
    }


    this.assertAuthorization({
      authorization,

      organizationId,

      environmentId,

      incidentId,
    });


    this.assertExecutionRequest({
      executionRequest,

      authorization,

      organizationId,

      environmentId,

      incidentId,

      executionRequestId,

      planId,

      planHash,
    });


    this.assertPlanBinding({
      authorization,

      executionRequest,

      planId,

      planHash,
    });


    const checkedAt =
      this.now();


    return {
      verified:
        true,

      authorizationId:
        authorization
          .authorizationId,

      executionRequestId:
        executionRequest
          .executionRequestId,

      incidentId,

      planId,

      planHash,

      capability:
        capability ||
        null,

      authorizationDecision:
        authorization
          .decision,

      authorizationStatus:
        authorization
          .status,

      approvalState:
        authorization
          .approvalState,

      policyState:
        authorization
          .policyState,

      freshnessState:
        authorization
          .freshnessState,

      killSwitchState:
        authorization
          .killSwitchState,

      lockState:
        authorization
          .lockState,

      executionRequestState:
        executionRequest
          .state,

      checkedAt:
        checkedAt
          instanceof Date
          ? checkedAt
              .toISOString()
          : new Date(
              checkedAt
            )
              .toISOString(),

      /*
       * This deliberately remains false.
       *
       * The object proves that a prior AIRA authorization was verified.
       * It does not make IntegrationRuntime itself an authority.
       */
      executionAuthorized:
        false,
    };
  }


  assertAuthorization({
    authorization,

    organizationId,

    environmentId,

    incidentId,
  }) {
    if (
      String(
        authorization
          .organizationId
      ) !==
      String(
        organizationId
      ) ||
      String(
        authorization
          .environmentId
      ) !==
      String(
        environmentId
      ) ||
      String(
        authorization
          .incidentId
      ) !==
      String(
        incidentId
      )
    ) {
      throw boundaryError(
        "Execution authorization scope does not match integration invocation",
        "INTEGRATION_EXECUTION_SCOPE_MISMATCH"
      );
    }


    if (
      authorization
        .authorizationGranted !==
      true
    ) {
      throw boundaryError(
        "Execution authorization was not granted",
        "INTEGRATION_EXECUTION_NOT_AUTHORIZED"
      );
    }


    if (
      authorization.decision !==
      AUTHORIZATION_DECISION
        .AUTHORIZED
    ) {
      throw boundaryError(
        `Execution authorization decision is "${authorization.decision}"`,
        "INTEGRATION_EXECUTION_NOT_AUTHORIZED"
      );
    }


    if (
      authorization.status !==
      AUTHORIZATION_STATUS
        .AUTHORIZED
    ) {
      throw boundaryError(
        `Execution authorization status is "${authorization.status}"`,
        "INTEGRATION_EXECUTION_AUTHORIZATION_STATUS_INVALID"
      );
    }


    if (
      authorization
        .revokedAt
    ) {
      throw boundaryError(
        "Execution authorization has been revoked",
        "INTEGRATION_EXECUTION_AUTHORIZATION_REVOKED"
      );
    }


    if (
      authorization
        .consumedAt
    ) {
      throw boundaryError(
        "Execution authorization has already been consumed",
        "INTEGRATION_EXECUTION_AUTHORIZATION_CONSUMED"
      );
    }


    if (
      authorization
        .expiresAt &&
      this.now()
        .getTime() >
      new Date(
        authorization
          .expiresAt
      )
        .getTime()
    ) {
      throw boundaryError(
        "Execution authorization has expired",
        "INTEGRATION_EXECUTION_AUTHORIZATION_EXPIRED"
      );
    }


    if (
      ![
        EXECUTION_APPROVAL_STATE
          .NOT_REQUIRED,

        EXECUTION_APPROVAL_STATE
          .APPROVED,
      ].includes(
        authorization
          .approvalState
      )
    ) {
      throw boundaryError(
        `Execution approval state "${authorization.approvalState}" is not satisfied`,
        "INTEGRATION_EXECUTION_APPROVAL_NOT_SATISFIED"
      );
    }


    /*
     * ALLOWED:
     * policy allowed execution directly.
     *
     * REQUIRES_APPROVAL:
     * policy allowed execution only after the separately recorded approval
     * state became APPROVED.
     */
    if (
      ![
        EXECUTION_POLICY_STATE
          .ALLOWED,

        EXECUTION_POLICY_STATE
          .REQUIRES_APPROVAL,
      ].includes(
        authorization
          .policyState
      )
    ) {
      throw boundaryError(
        `Execution policy state "${authorization.policyState}" does not permit execution`,
        "INTEGRATION_EXECUTION_POLICY_BLOCKED"
      );
    }


    if (
      authorization
        .policyState ===
        EXECUTION_POLICY_STATE
          .REQUIRES_APPROVAL &&
      authorization
        .approvalState !==
        EXECUTION_APPROVAL_STATE
          .APPROVED
    ) {
      throw boundaryError(
        "Policy requires approval but authorization does not contain an approved state",
        "INTEGRATION_EXECUTION_APPROVAL_NOT_SATISFIED"
      );
    }


    if (
      authorization
        .freshnessState !==
      EXECUTION_FRESHNESS_STATE
        .FRESH
    ) {
      throw boundaryError(
        `Execution freshness state is "${authorization.freshnessState}"`,
        "INTEGRATION_EXECUTION_STALE"
      );
    }


    /*
     * In AIRA's existing executionKillSwitchGateService:
     *
     * ENABLED = execution actions enabled
     * DISABLED = execution blocked
     * EMERGENCY_MODE = execution blocked
     * UNKNOWN = fail closed
     */
    if (
      authorization
        .killSwitchState !==
      KILL_SWITCH_STATE
        .ENABLED
    ) {
      throw boundaryError(
        `Kill-switch state "${authorization.killSwitchState}" blocks provider execution`,
        "INTEGRATION_EXECUTION_KILL_SWITCH_BLOCKED"
      );
    }


    if (
      authorization
        .lockState !==
      EXECUTION_LOCK_STATE
        .ACQUIRED
    ) {
      throw boundaryError(
        `Execution lock state is "${authorization.lockState}"`,
        "INTEGRATION_EXECUTION_LOCK_NOT_ACQUIRED"
      );
    }
  }


  assertExecutionRequest({
    executionRequest,

    authorization,

    organizationId,

    environmentId,

    incidentId,

    executionRequestId,

    planId,

    planHash,
  }) {
    if (
      String(
        executionRequest
          .organizationId
      ) !==
      String(
        organizationId
      ) ||
      String(
        executionRequest
          .environmentId
      ) !==
      String(
        environmentId
      ) ||
      String(
        executionRequest
          .incidentId
      ) !==
      String(
        incidentId
      )
    ) {
      throw boundaryError(
        "Execution request scope does not match integration invocation",
        "INTEGRATION_EXECUTION_REQUEST_SCOPE_MISMATCH"
      );
    }


    if (
      String(
        executionRequest
          .executionRequestId
      ) !==
      String(
        executionRequestId
      )
    ) {
      throw boundaryError(
        "Execution request identity mismatch",
        "INTEGRATION_EXECUTION_REQUEST_IDENTITY_MISMATCH"
      );
    }


    if (
      String(
        executionRequest
          .authorizationId
      ) !==
      String(
        authorization
          .authorizationId
      )
    ) {
      throw boundaryError(
        "Execution request is not linked to the verified authorization",
        "INTEGRATION_EXECUTION_AUTHORIZATION_LINK_MISMATCH"
      );
    }


    if (
      !ALLOWED_REQUEST_STATES
        .has(
          executionRequest
            .state
        )
    ) {
      throw boundaryError(
        `Execution request state "${executionRequest.state}" is not executable`,
        "INTEGRATION_EXECUTION_REQUEST_STATE_INVALID"
      );
    }


    if (
      String(
        executionRequest
          .planId
      ) !==
      String(
        planId
      )
    ) {
      throw boundaryError(
        "Execution request planId does not match invocation",
        "INTEGRATION_EXECUTION_PLAN_ID_MISMATCH"
      );
    }


    if (
      String(
        executionRequest
          .planHash
      ) !==
      String(
        planHash
      )
    ) {
      throw boundaryError(
        "Execution request planHash does not match invocation",
        "INTEGRATION_EXECUTION_PLAN_HASH_MISMATCH"
      );
    }
  }


  assertPlanBinding({
    authorization,

    executionRequest,

    planId,

    planHash,
  }) {
    const authorizationPlanId =
      authorization
        .planId ||
      authorization
        ?.metadata
        ?.planId ||
      authorization
        ?.executionPlan
        ?.planId ||
      null;


    const authorizationPlanHash =
      authorization
        .planHash ||
      authorization
        ?.metadata
        ?.planHash ||
      authorization
        ?.executionPlan
        ?.planHash ||
      null;


    if (
      String(
        authorizationPlanId
      ) !==
      String(
        planId
      )
    ) {
      throw boundaryError(
        "Persisted authorization planId does not match execution request",
        "INTEGRATION_EXECUTION_AUTHORIZATION_PLAN_ID_MISMATCH"
      );
    }


    if (
      String(
        authorizationPlanHash
      ) !==
      String(
        planHash
      )
    ) {
      throw boundaryError(
        "Persisted authorization planHash does not match execution request",
        "INTEGRATION_EXECUTION_AUTHORIZATION_PLAN_HASH_MISMATCH"
      );
    }


    if (
      String(
        executionRequest
          .planId
      ) !==
      String(
        authorizationPlanId
      ) ||
      String(
        executionRequest
          .planHash
      ) !==
      String(
        authorizationPlanHash
      )
    ) {
      throw boundaryError(
        "Execution authorization and execution request are bound to different immutable plans",
        "INTEGRATION_EXECUTION_PLAN_BINDING_MISMATCH"
      );
    }
  }
}


function requireText(
  value,
  field
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    !String(
      value
    )
      .trim()
  ) {
    throw boundaryError(
      `${field} is required`,
      "INTEGRATION_EXECUTION_REFERENCE_REQUIRED",
      {
        field,
      }
    );
  }
}


function boundaryError(
  message,
  code,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationExecutionAuthorizationError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationExecutionAuthorizationBoundary,

  ALLOWED_REQUEST_STATES,
};