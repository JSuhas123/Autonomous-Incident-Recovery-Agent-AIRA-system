"use strict";

/**
 * AIRA Executor Bootstrap Service
 *
 * Phase 8.13
 *
 * Defines the initial controlled executor capability surface.
 *
 * These are registrations, NOT unrestricted command execution.
 */

const executorRegistry =
  require(
    "./executorRegistry"
  );

const {
  EXECUTOR_DOMAIN,
} =
  require(
    "./executorContracts"
  );

const INITIAL_CAPABILITIES =
  Object.freeze([
    {
      capability:
        "kubernetes.restartDeployment",

      domain:
        EXECUTOR_DOMAIN
          .KUBERNETES,

      description:
        "Restart an approved Kubernetes deployment.",

      riskLevel:
        "medium",
    },

    {
      capability:
        "kubernetes.scaleDeployment",

      domain:
        EXECUTOR_DOMAIN
          .KUBERNETES,

      description:
        "Scale an approved Kubernetes deployment.",

      riskLevel:
        "high",
    },

    {
      capability:
        "docker.restartContainer",

      domain:
        EXECUTOR_DOMAIN
          .DOCKER,

      description:
        "Restart an approved Docker container.",

      riskLevel:
        "medium",
    },

    {
      capability:
        "database.restartService",

      domain:
        EXECUTOR_DOMAIN
          .DATABASE,

      description:
        "Restart an approved database service.",

      riskLevel:
        "high",
    },

    {
      capability:
        "cicd.rollbackDeployment",

      domain:
        EXECUTOR_DOMAIN
          .CICD,

      description:
        "Rollback an approved deployment.",

      riskLevel:
        "high",
    },

    {
      capability:
        "observability.restartCollector",

      domain:
        EXECUTOR_DOMAIN
          .OBSERVABILITY,

      description:
        "Restart an approved telemetry collector.",

      riskLevel:
        "medium",
    },
  ]);

class ExecutorBootstrapService {
  constructor(
    options = {}
  ) {
    this.registry =
      options.registry ||
      executorRegistry;
  }

  registerDefaults() {
    const registered =
      [];

    for (
      const definition
      of INITIAL_CAPABILITIES
    ) {
      if (
        this.registry
          .has(
            definition
              .capability
          )
      ) {
        registered.push(
          this.registry
            .describe(
              definition
                .capability
            )
        );

        continue;
      }

      registered.push(
        this.registry
          .register({
            ...definition,

            requiresAuthorization:
              true,

            /*
             * Real infrastructure adapters arrive next.
             *
             * Until then this handler intentionally refuses mutation.
             */
            handler:
              async () => {
                throw Object.assign(
                  new Error(
                    `Executor adapter not implemented for ${definition.capability}`
                  ),
                  {
                    code:
                      "EXECUTOR_ADAPTER_NOT_IMPLEMENTED",
                  }
                );
              },
          })
      );
    }

    return {
      registered:
        true,

      count:
        registered.length,

      capabilities:
        registered,
    };
  }
}

module.exports =
  new ExecutorBootstrapService();

module.exports
  .ExecutorBootstrapService =
  ExecutorBootstrapService;

module.exports
  .INITIAL_CAPABILITIES =
  INITIAL_CAPABILITIES;