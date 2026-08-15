"use strict";

const {
  ExecutionAuthorizationEngine,
} =
  require(
    "../executionAuthorizationEngine"
  );

const {
  ExecutionAuthorizationCritic,
} =
  require(
    "../executionAuthorizationCritic"
  );

const {
  StepExecutionEngine,
  EXECUTION_STATUS,
} =
  require(
    "../stepExecutionEngine"
  );

const {
  ExecutionRollbackService,
  ROLLBACK_STATUS,
} =
  require(
    "../executionRollbackService"
  );

const {
  ExecutorRegistry,
} =
  require(
    "../executorRegistry"
  );

const {
  EXECUTOR_DOMAIN,
} =
  require(
    "../executorContracts"
  );

const {
  AUTHORIZATION_DECISION,
  EXECUTION_APPROVAL_STATE,
  EXECUTION_POLICY_STATE,
  EXECUTION_FRESHNESS_STATE,
  KILL_SWITCH_STATE,
  EXECUTION_LOCK_STATE,
  IDEMPOTENCY_STATE,
} =
  require(
    "../executionAuthorizationContracts"
  );

// ============================================================================
// INPUT HELPERS
// ============================================================================

function baseInput(
  overrides = {}
) {
  const generatedAt =
    new Date();

  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-1",

    recoveryDecisionRevision:
      1,

    diagnosisId:
      "diagnosis-1",

    diagnosisRevision:
      1,

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "kubernetes.restartDeployment.v1",

    environment:
      "production",

    recoveryDecision: {
      decisionId:
        "recovery-1",

      revision:
        1,

      approvalRequired:
        false,

      policyStatus:
        "eligible",

      generatedAt,

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      incidentId:
        "incident-1",

      executionAuthorized:
        false,
    },

    selectedCandidate: {
      candidateId:
        "candidate-1",

      playbookId:
        "kubernetes.restartDeployment.v1",

      metadata: {
        actionType:
          "restartDeployment",

        resourceType:
          "deployment",

        resourceId:
          "payment-api",

        productionAllowed:
          true,
      },

      executionAuthorized:
        false,
    },

    playbook: {
      playbookId:
        "kubernetes.restartDeployment.v1",

      version:
        "1.0.0",

      title:
        "Restart payment API deployment",

      adapter:
        "kubernetes",

      requiredParameters: [
        "namespace",
        "deployment",
      ],

      steps: [
        {
          id:
            "restart",

          order:
            1,

          adapter:
            "kubernetes",

          action:
            "restartDeployment",

          parameters: {
            namespace:
              "{{namespace}}",

            deployment:
              "{{deployment}}",
          },

          timeoutMs:
            1000,

          continueOnFailure:
            false,
        },

        {
          id:
            "wait",

          order:
            2,

          adapter:
            "kubernetes",

          action:
            "waitRollout",

          parameters: {
            namespace:
              "{{namespace}}",

            deployment:
              "{{deployment}}",
          },

          timeoutMs:
            1000,

          continueOnFailure:
            false,
        },
      ],

      rollback: {
        available:
          true,

        automaticAllowed:
          true,

        reversibility:
          "FULL",

        steps: [
          {
            id:
              "rollback",

            order:
              1,

            adapter:
              "kubernetes",

            action:
              "rollbackDeployment",

            parameters: {
              namespace:
                "{{namespace}}",

              deployment:
                "{{deployment}}",
            },

            timeoutMs:
              1000,
          },
        ],
      },
    },

    context: {
      environment:
        "production",

      service: {
        id:
          "payment-api",

        namespace:
          "production",

        deployment:
          "payment-api",

        protected:
          false,
      },
    },

    parameters: {
      namespace:
        "production",

      deployment:
        "payment-api",
    },

    retryAllowed:
      false,

    maxAttempts:
      1,

    executionAuthorized:
      false,

    ...overrides,
  };
}

// ============================================================================
// PHASE 8 PASSING DEPENDENCIES
// ============================================================================

function passingDependencies(
  overrides = {}
) {
  return {
    freshness: {
      async getCurrentRecoveryDecision() {
        return {
          decisionId:
            "recovery-1",

          revision:
            1,

          isCurrent:
            true,
        };
      },

      async getCurrentDiagnosis() {
        return {
          diagnosisId:
            "diagnosis-1",

          revision:
            1,

          isCurrent:
            true,
        };
      },

      async getIncident() {
        return {
          _id:
            "incident-1",

          status:
            "open",
        };
      },

      async getPlaybook() {
        return {
          playbookId:
            "kubernetes.restartDeployment.v1",

          status:
            "approved",

          enabled:
            true,
        };
      },
    },

    approval: {
      async getApproval() {
        return null;
      },
    },

    policy: {
      async evaluatePolicy() {
        return {
          allowed:
            true,

          denied:
            false,

          requiresApproval:
            false,

          policyIds: [
            "default-safe-recovery",
          ],
        };
      },
    },

    killSwitch: {
      async getKillSwitchManager() {
        return {
          areActionsEnabled() {
            return true;
          },

          getAllStatuses() {
            return {
              EMERGENCY_MODE:
                false,

              RECOVERY_EXECUTION_ENABLED:
                true,
            };
          },

          isActionAllowed() {
            return true;
          },
        };
      },
    },

    idempotency: {
      async checkIdempotency() {
        return null;
      },
    },

    lease: {
      async acquireLock({
        ownerId,
        ttlMs,
      }) {
        return {
          acquired:
            true,

          ownerId,

          acquiredAt:
            new Date(),

          expiresAt:
            new Date(
              Date.now() +
              ttlMs
            ),
        };
      },

      async releaseLock() {
        return {
          released:
            true,
        };
      },

      async validateLock() {
        return {
          valid:
            true,
        };
      },
    },

    ...overrides,
  };
}

// ============================================================================
// EXECUTOR REGISTRY
// ============================================================================

function createRegistry(
  options = {}
) {
  const registry =
    new ExecutorRegistry();

  registry.register({
    capability:
      "kubernetes.restartDeployment",

    domain:
      EXECUTOR_DOMAIN
        .KUBERNETES,

    handler:
      async () => {
        if (
          options.restartFails
        ) {
          throw Object.assign(
            new Error(
              "Restart failed"
            ),
            {
              code:
                "RESTART_FAILED",
            }
          );
        }

        return {
          changed:
            true,

          restarted:
            true,
        };
      },
  });

  registry.register({
    capability:
      "kubernetes.waitRollout",

    domain:
      EXECUTOR_DOMAIN
        .KUBERNETES,

    handler:
      async () => {
        if (
          options.rolloutFails
        ) {
          throw Object.assign(
            new Error(
              "Rollout did not become ready"
            ),
            {
              code:
                "ROLLOUT_FAILED",
            }
          );
        }

        return {
          changed:
            false,

          ready:
            true,
        };
      },
  });

  registry.register({
    capability:
      "kubernetes.rollbackDeployment",

    domain:
      EXECUTOR_DOMAIN
        .KUBERNETES,

    handler:
      async () => {
        if (
          options.rollbackFails
        ) {
          throw Object.assign(
            new Error(
              "Rollback failed"
            ),
            {
              code:
                "ROLLBACK_FAILED",
            }
          );
        }

        return {
          changed:
            true,

          rolledBack:
            true,
        };
      },
  });

  return registry;
}

// ============================================================================
// AUTHORIZATION HELPER
// ============================================================================

async function authorize(
  input = baseInput(),
  dependencies =
    passingDependencies()
) {
  const engine =
    new ExecutionAuthorizationEngine();

  const engineResult =
    await engine.authorize(
      input,
      dependencies
    );

  const critic =
    new ExecutionAuthorizationCritic();

  const criticResult =
    await critic.review(
      engineResult
    );

  return {
    engineResult,
    criticResult,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "Phase 8 Execution E2E",
  () => {
    // ========================================================================
    // 1. HAPPY PATH
    // ========================================================================

    test(
      "valid recovery decision is authorized, criticized and executed safely",
      async () => {
        const {
          engineResult,
          criticResult,
        } =
          await authorize();

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            true
          );

        expect(
          engineResult
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .AUTHORIZED
          );

        expect(
          criticResult.accepted
        )
          .toBe(
            true
          );

        expect(
          criticResult
            .authorizationGranted
        )
          .toBe(
            true
          );

        const executor =
          new StepExecutionEngine({
            executorRegistry:
              createRegistry(),
          });

        const execution =
          await executor.execute({
            executionRequestId:
              "request-1",

            authorization:
              engineResult
                .authorization,

            executionPlan:
              engineResult
                .executionPlan,
          });

        expect(
          execution.status
        )
          .toBe(
            EXECUTION_STATUS
              .SUCCEEDED
          );

        expect(
          execution.success
        )
          .toBe(
            true
          );

        expect(
          execution.stepResults
        )
          .toHaveLength(
            2
          );

        expect(
          execution.executionStarted
        )
          .toBe(
            true
          );
      }
    );

    // ========================================================================
    // 2. APPROVAL REQUIRED
    // ========================================================================

    test(
      "required approval blocks authorization until approved",
      async () => {
        const input =
          baseInput();

        input
          .recoveryDecision
          .approvalRequired =
          true;

        const dependencies =
          passingDependencies();

        dependencies.approval = {
          async getApproval() {
            return {
              approvalId:
                "approval-1",

              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              recoveryDecisionId:
                "recovery-1",

              recoveryDecisionRevision:
                1,

              candidateId:
                "candidate-1",

              playbookId:
                "kubernetes.restartDeployment.v1",

              status:
                "pending",
            };
          },
        };

        const {
          engineResult,
        } =
          await authorize(
            input,
            dependencies
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          engineResult
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .REQUIRES_APPROVAL
          );
      }
    );

    test(
      "valid scoped approval allows authorization",
      async () => {
        const input =
          baseInput();

        input
          .recoveryDecision
          .approvalRequired =
          true;

        const dependencies =
          passingDependencies();

        dependencies.approval = {
          async getApproval() {
            return {
              approvalId:
                "approval-1",

              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              recoveryDecisionId:
                "recovery-1",

              recoveryDecisionRevision:
                1,

              candidateId:
                "candidate-1",

              playbookId:
                "kubernetes.restartDeployment.v1",

              status:
                "approved",

              approvedBy:
                "operator-1",

              approvedAt:
                new Date(),

              expiresAt:
                new Date(
                  Date.now() +
                  60000
                ),
            };
          },
        };

        const {
          engineResult,
        } =
          await authorize(
            input,
            dependencies
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            true
          );

        expect(
          engineResult
            .authorization
            .approvalState
        )
          .toBe(
            EXECUTION_APPROVAL_STATE
              .APPROVED
          );
      }
    );

    // ========================================================================
    // 3. FRESHNESS
    // ========================================================================

    test(
      "superseded recovery decision never reaches execution",
      async () => {
        const dependencies =
          passingDependencies();

        dependencies
          .freshness
          .getCurrentRecoveryDecision =
          async () => ({
            decisionId:
              "recovery-new",

            revision:
              2,
          });

        const {
          engineResult,
        } =
          await authorize(
            baseInput(),
            dependencies
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          engineResult
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .STALE
          );

        expect(
          engineResult.executionPlan
        )
          .toBeNull();
      }
    );

    // ========================================================================
    // 4. POLICY
    // ========================================================================

    test(
      "current policy denial prevents execution authorization",
      async () => {
        const dependencies =
          passingDependencies();

        dependencies.policy = {
          async evaluatePolicy() {
            return {
              allowed:
                false,

              denied:
                true,

              policyIds: [
                "prod-freeze",
              ],

              reasons: [
                "Production changes frozen.",
              ],
            };
          },
        };

        const {
          engineResult,
        } =
          await authorize(
            baseInput(),
            dependencies
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          engineResult
            .authorization
            .policyState
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .DENIED
          );
      }
    );

    // ========================================================================
    // 5. KILL SWITCH
    // ========================================================================

    test(
      "global kill switch blocks execution before lease and plan",
      async () => {
        const dependencies =
          passingDependencies();

        dependencies.killSwitch = {
          async getKillSwitchManager() {
            return {
              areActionsEnabled() {
                return false;
              },

              getAllStatuses() {
                return {
                  EMERGENCY_MODE:
                    false,

                  RECOVERY_EXECUTION_ENABLED:
                    true,
                };
              },

              isActionAllowed() {
                return true;
              },
            };
          },
        };

        const {
          engineResult,
        } =
          await authorize(
            baseInput(),
            dependencies
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          engineResult
            .authorization
            .killSwitchState
        )
          .toBe(
            KILL_SWITCH_STATE
              .DISABLED
          );
      }
    );

    // ========================================================================
    // 6. IDEMPOTENCY
    // ========================================================================

    test(
      "duplicate active execution is blocked",
      async () => {
        const dependencies =
          passingDependencies();

        dependencies.idempotency = {
          async checkIdempotency() {
            return {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              recoveryDecisionId:
                "recovery-1",

              state:
                "running",

              attempt:
                1,
            };
          },
        };

        const {
          engineResult,
        } =
          await authorize(
            baseInput(),
            dependencies
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          engineResult
            .authorization
            .idempotencyState
        )
          .toBe(
            IDEMPOTENCY_STATE
              .DUPLICATE
          );
      }
    );

    // ========================================================================
    // 7. LEASE
    // ========================================================================

    test(
      "concurrent execution lease conflict blocks authorization",
      async () => {
        const dependencies =
          passingDependencies();

        dependencies.lease = {
          async acquireLock() {
            return {
              acquired:
                false,

              ownerId:
                "other-worker",

              reason:
                "Resource already locked.",
            };
          },
        };

        const {
          engineResult,
        } =
          await authorize(
            baseInput(),
            dependencies
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          engineResult
            .authorization
            .lockState
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .DENIED
          );
      }
    );

    // ========================================================================
    // 8. CRITIC
    // ========================================================================

    test(
      "critic rejects tampered authorization result",
      async () => {
        const {
          engineResult,
        } =
          await authorize();

        engineResult
          .authorization
          .policyState =
          EXECUTION_POLICY_STATE
            .DENIED;

        const critic =
          new ExecutionAuthorizationCritic();

        const criticResult =
          await critic.review(
            engineResult
          );

        expect(
          criticResult.rejected
        )
          .toBe(
            true
          );

        expect(
          criticResult
            .authorizationGranted
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 9. UNKNOWN CAPABILITY
    // ========================================================================

    test(
      "execution cannot invoke unregistered infrastructure capability",
      async () => {
        const {
          engineResult,
        } =
          await authorize();

        const planCopy =
          JSON.parse(
            JSON.stringify(
              engineResult
                .executionPlan
            )
          );

        planCopy.steps[0] = {
          ...planCopy.steps[0],

          capability:
            "kubernetes.deleteEverything",
        };

        const executor =
          new StepExecutionEngine({
            executorRegistry:
              createRegistry(),
          });

        const execution =
          await executor.execute({
            executionRequestId:
              "request-unknown",

            authorization:
              engineResult
                .authorization,

            executionPlan:
              planCopy,
          });

        expect(
          execution.success
        )
          .toBe(
            false
          );

        expect(
          execution.stepResults[0]
            .success
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 10. ROLLBACK SUCCESS
    // ========================================================================

    test(
      "partial execution triggers predefined rollback successfully",
      async () => {
        const {
          engineResult,
        } =
          await authorize();

        const executor =
          new StepExecutionEngine({
            executorRegistry:
              createRegistry({
                rolloutFails:
                  true,
              }),
          });

        const execution =
          await executor.execute({
            executionRequestId:
              "request-rollback",

            authorization:
              engineResult
                .authorization,

            executionPlan:
              engineResult
                .executionPlan,
          });

        expect(
          execution.status
        )
          .toBe(
            EXECUTION_STATUS
              .PARTIAL
          );

        expect(
          execution.rollbackRequired
        )
          .toBe(
            true
          );

        const rollbackService =
          new ExecutionRollbackService({
            executorRegistry:
              createRegistry(),
          });

        const rollback =
          await rollbackService
            .execute({
              executionRequestId:
                "request-rollback",

              authorization:
                engineResult
                  .authorization,

              executionResult:
                execution,

              executionPlan:
                engineResult
                  .executionPlan,
            });

        expect(
          rollback.status
        )
          .toBe(
            ROLLBACK_STATUS
              .SUCCEEDED
          );

        expect(
          rollback.success
        )
          .toBe(
            true
          );
      }
    );

    // ========================================================================
    // 11. ROLLBACK FAILURE
    // ========================================================================

    test(
      "rollback failure is surfaced and never hidden",
      async () => {
        const {
          engineResult,
        } =
          await authorize();

        const executor =
          new StepExecutionEngine({
            executorRegistry:
              createRegistry({
                rolloutFails:
                  true,
              }),
          });

        const execution =
          await executor.execute({
            authorization:
              engineResult
                .authorization,

            executionPlan:
              engineResult
                .executionPlan,
          });

        expect(
          execution.rollbackRequired
        )
          .toBe(
            true
          );

        const rollbackService =
          new ExecutionRollbackService({
            executorRegistry:
              createRegistry({
                rollbackFails:
                  true,
              }),
          });

        const rollback =
          await rollbackService
            .execute({
              authorization:
                engineResult
                  .authorization,

              executionResult:
                execution,

              executionPlan:
                engineResult
                  .executionPlan,
            });

        expect(
          rollback.status
        )
          .toBe(
            ROLLBACK_STATUS
              .FAILED
          );

        expect(
          rollback.success
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // 12. TENANT ISOLATION
    // ========================================================================

    test(
      "cross-organization recovery decision is rejected before execution",
      async () => {
        const input =
          baseInput();

        input
          .recoveryDecision
          .organizationId =
          "org-other";

        const {
          engineResult,
        } =
          await authorize(
            input
          );

        expect(
          engineResult
            .authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          engineResult
            .authorization
            .freshnessState
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );
      }
    );

    // ========================================================================
    // 13. UPSTREAM AUTHORIZATION FORBIDDEN
    // ========================================================================

    test(
      "Phase 7 cannot inject execution authorization",
      async () => {
        const engine =
          new ExecutionAuthorizationEngine();

        await expect(
          engine.authorize(
            baseInput({
              executionAuthorized:
                true,
            }),
            passingDependencies()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_AUTHORIZATION_ENGINE_UNSAFE_INPUT",
          });
      }
    );

    // ========================================================================
    // 14. COMPLETE STAGE TRACE
    // ========================================================================

    test(
      "successful authorization traverses all seven mandatory gates",
      async () => {
        const {
          engineResult,
        } =
          await authorize();

        expect(
          engineResult.trace
            .map(
              (
                stage
              ) =>
                stage.stage
            )
        )
          .toEqual([
            "freshness",
            "approval_state",
            "policy_revalidation",
            "kill_switch",
            "idempotency",
            "execution_lease",
            "execution_plan",
          ]);

        expect(
          engineResult.trace
            .every(
              (
                stage
              ) =>
                stage.status ===
                "SUCCESS"
            )
        )
          .toBe(
            true
          );
      }
    );

    // ========================================================================
    // 15. PLAN INTEGRITY
    // ========================================================================

    test(
      "authorization binds exactly to immutable execution plan hash",
      async () => {
        const {
          engineResult,
          criticResult,
        } =
          await authorize();

        expect(
          criticResult.accepted
        )
          .toBe(
            true
          );

        expect(
          engineResult
            .authorization
            .metadata
            .planHash
        )
          .toBe(
            engineResult
              .executionPlan
              .planHash
          );

        expect(
          engineResult
            .authorization
            .metadata
            .planId
        )
          .toBe(
            engineResult
              .executionPlan
              .planId
          );

        expect(
          Object.isFrozen(
            engineResult
              .executionPlan
          )
        )
          .toBe(
            true
          );
      }
    );
  }
);