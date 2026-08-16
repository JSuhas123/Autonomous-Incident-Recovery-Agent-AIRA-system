/**
 * Resilient K8s Executor
 *
 * PHASE 11.5 — CIRCUIT BREAKERS & DEPENDENCY FAILURE ISOLATION
 *
 * Wraps Kubernetes operations with:
 *
 * - comprehensive audit logging
 * - timeout enforcement
 * - pre/post-state validation
 * - dependency isolation
 * - circuit-breaker protection
 * - fail-closed mutation semantics
 *
 * IMPORTANT:
 *
 * Kubernetes mutations are CRITICAL dependency operations.
 *
 * Dependency failure must NEVER:
 *
 * - authorize execution
 * - be interpreted as mutation success
 * - trigger blind mutation replay
 *
 * Ambiguous execution outcomes are handled by the Phase 11.4
 * replay/reconciliation boundary.
 */

"use strict";

const loggingService =
  require(
    "../infrastructure/loggingService"
  );

const metricsService =
  require(
    "../infrastructure/metricsService"
  );

const dependencyIsolationService =
  require(
    "../infrastructure/dependencyIsolationService"
  );


class ResilientK8sExecutor {
  constructor(
    k8sClient,
    options = {}
  ) {
    if (
      !k8sClient
    ) {
      throw new Error(
        "ResilientK8sExecutor requires a Kubernetes client"
      );
    }

    this.k8sClient =
      k8sClient;

    this.dependencyIsolation =
      options.dependencyIsolation ||
      dependencyIsolationService;

    this.defaultTimeout =
      parseInt(
        process.env
          .K8S_EXEC_TIMEOUT ||
        "60000",
        10
      );

    this.auditLogs =
      [];
  }


  // ==========================================================================
  // RESTART POD
  // ==========================================================================

  async restartPod(
    podName,
    namespace,
    options = {}
  ) {
    const {
      timeout =
        this.defaultTimeout,

      correlationId,

      decisionId,

      organizationId,

      environmentId,

      incidentId,
    } =
      options;

    const executionId =
      `exec-${podName}-${Date.now()}`;

    const auditEntry = {
      executionId,

      action:
        "restart-pod",

      resource:
        `pod/${podName}`,

      namespace,

      correlationId,

      decisionId,

      organizationId,

      environmentId,

      incidentId,

      startTime:
        new Date(),

      status:
        "IN_PROGRESS",

      executionAuthorized:
        false,
    };


    try {
      // ----------------------------------------------------------------------
      // PRE-STATE
      // ----------------------------------------------------------------------

      const preState =
        await this
          ._getResourceState(
            "pod",
            podName,
            namespace,
            timeout / 3
          );

      auditEntry.preState =
        preState;


      // ----------------------------------------------------------------------
      // MUTATION — CRITICAL DEPENDENCY BOUNDARY
      // ----------------------------------------------------------------------

      const dependencyResult =
        await this
          ._executeWithTimeout(
            () =>
              this.dependencyIsolation
                .execute(
                  "kubernetes",

                  () =>
                    this.k8sClient
                      .restartPod(
                        podName,
                        namespace,
                        options
                      ),

                  {
                    organizationId:
                      organizationId ||
                      null,

                    environmentId:
                      environmentId ||
                      null,

                    incidentId:
                      incidentId ||
                      null,

                    correlationId:
                      correlationId ||
                      null,

                    executionId,

                    operation:
                      "restart-pod",
                  }
                ),

            timeout,

            `Restart pod ${podName}`
          );


      if (
        !dependencyResult ||
        dependencyResult.ok !==
          true
      ) {
        throw Object.assign(
          new Error(
            `Kubernetes restart operation did not complete successfully for pod ${podName}`
          ),
          {
            code:
              "K8S_DEPENDENCY_OPERATION_FAILED",

            executionAuthorized:
              false,

            dependencyResult:
              dependencyResult ||
              null,
          }
        );
      }


      const result =
        dependencyResult.result;


      // ----------------------------------------------------------------------
      // POST-STATE — BEST EFFORT FOR RESTART
      // ----------------------------------------------------------------------

      await this
        ._delay(
          2000
        );

      const postState =
        await this
          ._getResourceState(
            "pod",
            podName,
            namespace,
            timeout / 3
          );

      auditEntry.postState =
        postState;


      // ----------------------------------------------------------------------
      // SUCCESS
      // ----------------------------------------------------------------------

      auditEntry.status =
        "SUCCESS";

      auditEntry.result =
        result;

      auditEntry.circuit =
        dependencyResult
          .circuit ||
        null;

      auditEntry.endTime =
        new Date();

      auditEntry.duration =
        auditEntry.endTime -
        auditEntry.startTime;


      this._recordAudit(
        auditEntry
      );

      this._logExecution(
        auditEntry
      );

      this._recordK8sMetric(
        "restart-pod",
        "success",
        auditEntry.duration,
        {
          organizationId,
          environmentId,
        }
      );


      return {
        success:
          true,

        ...(
          result &&
          typeof result ===
            "object"
            ? result
            : {
                result,
              }
        ),

        executionId,

        auditEntry,

        circuit:
          dependencyResult
            .circuit ||
          null,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      auditEntry.status =
        "FAILED";

      auditEntry.error =
        error.message;

      auditEntry.errorCode =
        error.code ||
        null;

      auditEntry.executionOutcome =
        error.executionOutcome ||
        null;

      auditEntry.requiresReconciliation =
        error.requiresReconciliation ===
        true;

      auditEntry.endTime =
        new Date();

      auditEntry.duration =
        auditEntry.endTime -
        auditEntry.startTime;


      this._recordAudit(
        auditEntry
      );

      this._logExecution(
        auditEntry
      );

      this._recordK8sMetric(
        "restart-pod",
        "failure",
        auditEntry.duration,
        {
          organizationId,
          environmentId,
        }
      );


      const errorMsg =
        `[K8sExecutor] Failed to restart pod. ` +
        `ExecutionId: ${executionId}. ` +
        `Error: ${error.message}`;


      this._safeLog(
        "error",
        errorMsg,
        {
          component:
            "k8s-executor",

          executionId,

          correlationId,

          decisionId,

          organizationId,

          environmentId,

          incidentId,

          podName,

          namespace,

          dependency:
            "kubernetes",

          circuitState:
            error
              ?.circuitState ||
            null,

          executionOutcome:
            error
              ?.executionOutcome ||
            null,

          requiresReconciliation:
            error
              ?.requiresReconciliation ===
            true,

          errorCode:
            error
              ?.code ||
            null,

          error:
            error.message,

          executionAuthorized:
            false,
        }
      );


      throw Object.assign(
        new Error(
          errorMsg
        ),
        {
          code:
            error.code ||
            "K8S_RESTART_FAILED",

          executionId,

          dependency:
            "kubernetes",

          circuitState:
            error
              ?.circuitState ||
            null,

          executionOutcome:
            error
              ?.executionOutcome ||
            null,

          requiresReconciliation:
            error
              ?.requiresReconciliation ===
            true,

          retryable:
            error.retryable !==
            false,

          executionAuthorized:
            false,

          cause:
            error,
        }
      );
    }
  }


  // ==========================================================================
  // SCALE DEPLOYMENT
  // ==========================================================================

  async scaleDeployment(
    deploymentName,
    namespace,
    replicas,
    options = {}
  ) {
    const {
      timeout =
        this.defaultTimeout,

      correlationId,

      decisionId,

      organizationId,

      environmentId,

      incidentId,
    } =
      options;


    const executionId =
      `exec-scale-${deploymentName}-${Date.now()}`;


    const auditEntry = {
      executionId,

      action:
        "scale-deployment",

      resource:
        `deployment/${deploymentName}`,

      namespace,

      targetReplicas:
        replicas,

      correlationId,

      decisionId,

      organizationId,

      environmentId,

      incidentId,

      startTime:
        new Date(),

      status:
        "IN_PROGRESS",

      executionAuthorized:
        false,
    };


    try {
      // ----------------------------------------------------------------------
      // PRE-STATE
      // ----------------------------------------------------------------------

      const preState =
        await this
          ._getResourceState(
            "deployment",
            deploymentName,
            namespace,
            timeout / 3
          );

      auditEntry.preState =
        preState;


      // ----------------------------------------------------------------------
      // MUTATION — CRITICAL DEPENDENCY BOUNDARY
      // ----------------------------------------------------------------------

      const dependencyResult =
        await this
          ._executeWithTimeout(
            () =>
              this.dependencyIsolation
                .execute(
                  "kubernetes",

                  () =>
                    this.k8sClient
                      .scaleDeployment(
                        deploymentName,
                        namespace,
                        replicas,
                        options
                      ),

                  {
                    organizationId:
                      organizationId ||
                      null,

                    environmentId:
                      environmentId ||
                      null,

                    incidentId:
                      incidentId ||
                      null,

                    correlationId:
                      correlationId ||
                      null,

                    executionId,

                    operation:
                      "scale-deployment",
                  }
                ),

            timeout,

            `Scale deployment ${deploymentName} to ${replicas} replicas`
          );


      if (
        !dependencyResult ||
        dependencyResult.ok !==
          true
      ) {
        throw Object.assign(
          new Error(
            `Kubernetes scale operation did not complete successfully for deployment ${deploymentName}`
          ),
          {
            code:
              "K8S_DEPENDENCY_OPERATION_FAILED",

            executionAuthorized:
              false,

            dependencyResult:
              dependencyResult ||
              null,
          }
        );
      }


      const result =
        dependencyResult.result;


      // ----------------------------------------------------------------------
      // POST-STATE
      // ----------------------------------------------------------------------

      await this
        ._delay(
          2000
        );

      const postState =
        await this
          ._getResourceState(
            "deployment",
            deploymentName,
            namespace,
            timeout / 3
          );

      auditEntry.postState =
        postState;


      // ----------------------------------------------------------------------
      // VERIFY
      // ----------------------------------------------------------------------

      if (
        !postState
      ) {
        throw Object.assign(
          new Error(
            "Scaling verification could not establish deployment post-state"
          ),
          {
            code:
              "K8S_SCALE_VERIFICATION_UNKNOWN",

            executionOutcome:
              "UNKNOWN",

            requiresReconciliation:
              true,

            executionAuthorized:
              false,
          }
        );
      }


      const desiredReplicas =
        Number(
          postState
            .desiredReplicas
        );

      const updatedReplicas =
        Number(
          postState
            .updatedReplicas
        );


      const scalingSucceeded =
        desiredReplicas ===
          Number(
            replicas
          ) ||
        (
          Number.isFinite(
            updatedReplicas
          ) &&
          updatedReplicas >=
            Number(
              replicas
            )
        );


      if (
        !scalingSucceeded
      ) {
        throw Object.assign(
          new Error(
            `Scaling verification failed. Expected ${replicas} replicas, ` +
            `got ${postState.desiredReplicas} desired, ` +
            `${postState.updatedReplicas} updated`
          ),
          {
            code:
              "K8S_SCALE_VERIFICATION_FAILED",

            executionOutcome:
              "UNKNOWN",

            requiresReconciliation:
              true,

            executionAuthorized:
              false,
          }
        );
      }


      // ----------------------------------------------------------------------
      // SUCCESS
      // ----------------------------------------------------------------------

      auditEntry.status =
        "SUCCESS";

      auditEntry.result =
        result;

      auditEntry.circuit =
        dependencyResult
          .circuit ||
        null;

      auditEntry.endTime =
        new Date();

      auditEntry.duration =
        auditEntry.endTime -
        auditEntry.startTime;


      this._recordAudit(
        auditEntry
      );

      this._logExecution(
        auditEntry
      );

      this._recordK8sMetric(
        "scale-deployment",
        "success",
        auditEntry.duration,
        {
          organizationId,
          environmentId,
        }
      );


      return {
        success:
          true,

        ...(
          result &&
          typeof result ===
            "object"
            ? result
            : {
                result,
              }
        ),

        executionId,

        auditEntry,

        circuit:
          dependencyResult
            .circuit ||
          null,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      auditEntry.status =
        "FAILED";

      auditEntry.error =
        error.message;

      auditEntry.errorCode =
        error.code ||
        null;

      auditEntry.executionOutcome =
        error.executionOutcome ||
        null;

      auditEntry.requiresReconciliation =
        error.requiresReconciliation ===
        true;

      auditEntry.endTime =
        new Date();

      auditEntry.duration =
        auditEntry.endTime -
        auditEntry.startTime;


      this._recordAudit(
        auditEntry
      );

      this._logExecution(
        auditEntry
      );

      this._recordK8sMetric(
        "scale-deployment",
        "failure",
        auditEntry.duration,
        {
          organizationId,
          environmentId,
        }
      );


      const errorMsg =
        `[K8sExecutor] Failed to scale deployment. ` +
        `ExecutionId: ${executionId}. ` +
        `Error: ${error.message}`;


      this._safeLog(
        "error",
        errorMsg,
        {
          component:
            "k8s-executor",

          executionId,

          correlationId,

          decisionId,

          organizationId,

          environmentId,

          incidentId,

          deploymentName,

          namespace,

          targetReplicas:
            replicas,

          dependency:
            "kubernetes",

          circuitState:
            error
              ?.circuitState ||
            null,

          executionOutcome:
            error
              ?.executionOutcome ||
            null,

          requiresReconciliation:
            error
              ?.requiresReconciliation ===
            true,

          errorCode:
            error
              ?.code ||
            null,

          error:
            error.message,

          executionAuthorized:
            false,
        }
      );


      throw Object.assign(
        new Error(
          errorMsg
        ),
        {
          code:
            error.code ||
            "K8S_SCALE_FAILED",

          executionId,

          dependency:
            "kubernetes",

          circuitState:
            error
              ?.circuitState ||
            null,

          executionOutcome:
            error
              ?.executionOutcome ||
            null,

          requiresReconciliation:
            error
              ?.requiresReconciliation ===
            true,

          retryable:
            error.retryable !==
            false,

          executionAuthorized:
            false,

          cause:
            error,
        }
      );
    }
  }


  // ==========================================================================
  // TIMEOUT
  // ==========================================================================

  async _executeWithTimeout(
    operation,
    timeoutMs,
    operationName
  ) {
    const safeTimeout =
      Math.max(
        1,
        Number(
          timeoutMs
        ) ||
        this.defaultTimeout
      );


    return new Promise(
      (
        resolve,
        reject
      ) => {
        let completed =
          false;


        const timer =
          setTimeout(
            () => {
              if (
                completed
              ) {
                return;
              }

              completed =
                true;


              reject(
                Object.assign(
                  new Error(
                    `${operationName} timed out after ${safeTimeout}ms`
                  ),
                  {
                    code:
                      "K8S_OPERATION_TIMEOUT",

                    dependency:
                      "kubernetes",

                    executionOutcome:
                      "UNKNOWN",

                    requiresReconciliation:
                      true,

                    retryable:
                      true,

                    executionAuthorized:
                      false,
                  }
                )
              );
            },

            safeTimeout
          );


        Promise
          .resolve()
          .then(
            operation
          )
          .then(
            (
              result
            ) => {
              if (
                completed
              ) {
                return;
              }

              completed =
                true;

              clearTimeout(
                timer
              );

              resolve(
                result
              );
            }
          )
          .catch(
            (
              error
            ) => {
              if (
                completed
              ) {
                return;
              }

              completed =
                true;

              clearTimeout(
                timer
              );

              reject(
                error
              );
            }
          );
      }
    );
  }


  // ==========================================================================
  // RESOURCE STATE
  // ==========================================================================

  async _getResourceState(
    resourceType,
    name,
    namespace,
    timeout
  ) {
    try {
      if (
        resourceType ===
        "pod"
      ) {
        return await this
          ._executeWithTimeout(
            () =>
              this.k8sClient
                .getPodStatus(
                  name,
                  namespace
                ),

            timeout,

            `Get pod status for ${name}`
          );
      }


      if (
        resourceType ===
        "deployment"
      ) {
        return await this
          ._executeWithTimeout(
            () =>
              this.k8sClient
                .getDeploymentStatus(
                  name,
                  namespace
                ),

            timeout,

            `Get deployment status for ${name}`
          );
      }


      return null;
    } catch (
      error
    ) {
      console.warn(
        `[K8sExecutor] Could not get ${resourceType} state: ${error.message}`
      );

      return null;
    }
  }


  // ==========================================================================
  // AUDIT
  // ==========================================================================

  _recordAudit(
    auditEntry
  ) {
    this.auditLogs
      .push(
        auditEntry
      );

    if (
      this.auditLogs.length >
      1000
    ) {
      this.auditLogs =
        this.auditLogs
          .slice(
            -1000
          );
    }
  }


  _logExecution(
    auditEntry
  ) {
    this._safeLog(
      auditEntry.status ===
        "SUCCESS"
        ? "info"
        : "warn",

      `K8s ${auditEntry.action} ${auditEntry.status}`,

      {
        component:
          "k8s-executor",

        executionId:
          auditEntry.executionId,

        correlationId:
          auditEntry.correlationId,

        decisionId:
          auditEntry.decisionId,

        organizationId:
          auditEntry.organizationId,

        environmentId:
          auditEntry.environmentId,

        incidentId:
          auditEntry.incidentId,

        action:
          auditEntry.action,

        resource:
          auditEntry.resource,

        namespace:
          auditEntry.namespace,

        status:
          auditEntry.status,

        duration:
          auditEntry.duration,

        errorCode:
          auditEntry.errorCode,

        error:
          auditEntry.error,

        executionOutcome:
          auditEntry.executionOutcome,

        requiresReconciliation:
          auditEntry
            .requiresReconciliation ===
          true,

        executionAuthorized:
          false,
      }
    );
  }


  // ==========================================================================
  // OBSERVABILITY SAFETY
  // ==========================================================================

  _safeLog(
    level,
    message,
    context = {}
  ) {
    try {
      if (
        loggingService &&
        typeof loggingService.log ===
          "function"
      ) {
        loggingService.log(
          level,
          message,
          context
        );

        return;
      }


      if (
        loggingService &&
        typeof loggingService[level] ===
          "function"
      ) {
        loggingService[level](
          message,
          context
        );
      }
    } catch (
      loggingError
    ) {
      console.warn(
        `[K8sExecutor] Logging failure suppressed: ${loggingError.message}`
      );
    }
  }


  _recordK8sMetric(
    operation,
    status,
    duration,
    context = {}
  ) {
    try {
      if (
        !metricsService ||
        typeof metricsService
          .recordActionExecution !==
        "function"
      ) {
        return;
      }


      const tenantId =
        context.organizationId ||
        context.tenantId ||
        "system";


      metricsService
        .recordActionExecution(
          String(
            tenantId
          ),

          `k8s:${operation}`,

          status,

          Number(
            duration
          ) ||
          0
        );
    } catch (
      metricsError
    ) {
      console.warn(
        `[K8sExecutor] Metrics failure suppressed: ${metricsError.message}`
      );
    }
  }


  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  _delay(
    ms
  ) {
    return new Promise(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          ms
        )
    );
  }


  getAuditTrail(
    decisionId
  ) {
    return this.auditLogs
      .filter(
        (
          log
        ) =>
          log.decisionId ===
          decisionId
      );
  }


  getRecentAudit(
    count = 50
  ) {
    return this.auditLogs
      .slice(
        -count
      );
  }
}


module.exports = {
  ResilientK8sExecutor,
};