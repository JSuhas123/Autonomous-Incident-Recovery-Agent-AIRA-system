"use strict";

const crypto = require("node:crypto");

const PostgresIncidentRepository =
  require("../../persistence/postgres/PostgresIncidentRepository");

const PostgresRecoveryDecisionRepository =
  require("../../persistence/postgres/PostgresRecoveryDecisionRepository");

const PostgresExecutionAuthorizationRepository =
  require("../../persistence/postgres/PostgresExecutionAuthorizationRepository");

const PostgresTenantScope =
  require("../../persistence/postgres/PostgresTenantScope");

const IntegrationConnectionStore =
  require("../integrations/integrationConnectionStore");

const {
  IntegrationRuntime,
} = require("../integrations/integrationRuntime");

const {
  getGovernance,
  upsertGovernance,
} = require("../integrations/integrationGovernanceService");

const {
  ExecutionAuthorizationEngine,
} = require("../execution/executionAuthorizationEngine");

const executionAuthorizationCritic =
  require("../execution/executionAuthorizationCritic");

const executionAuthorizationPersistenceService =
  require("../execution/executionAuthorizationPersistenceService");

const {
  EXECUTION_APPROVAL_STATE,
  EXECUTION_POLICY_STATE,
  EXECUTION_FRESHNESS_STATE,
  KILL_SWITCH_STATE,
  EXECUTION_LOCK_STATE,
  IDEMPOTENCY_STATE,
} = require("../execution/executionAuthorizationContracts");


const RECOVERY_EXECUTOR_VERSION =
  "23R.10G.2.1";

const CAPABILITY =
  "kubernetes.restartDeployment";

const RUNTIME_CAPABILITY =
  "execute_capability";

const PLAYBOOK_ID =
  "PB-PHASE23R-K8S-RESTART-LAB-001";


function executorError(
  code,
  message,
  status = 422
) {
  return Object.assign(
    new Error(message),
    {
      name:
        "Phase23R10G2RecoveryExecutorError",

      code,

      status,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


function requireString(
  value,
  field
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw executorError(
      "PHASE23R_10G2_RECOVERY_FIELD_REQUIRED",
      `${field} is required`
    );
  }

  return value.trim();
}


function requireObject(
  value,
  field
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw executorError(
      "PHASE23R_10G2_RECOVERY_OBJECT_REQUIRED",
      `${field} must be an object`
    );
  }

  return value;
}


function assertSafeInput(
  input
) {
  requireObject(
    input,
    "input"
  );

  requireString(
    input.organizationId,
    "organizationId"
  );

  requireString(
    input.environmentId,
    "environmentId"
  );

  requireString(
    input.incidentId,
    "incidentId"
  );

  const diagnosis =
    requireObject(
      input.diagnosis,
      "diagnosis"
    );

  requireString(
    diagnosis.diagnosisRunId,
    "diagnosis.diagnosisRunId"
  );

  requireString(
    diagnosis.selectedFailureMode,
    "diagnosis.selectedFailureMode"
  );

  if (
    input.executionAuthorized === true ||
    input.production === true ||
    input.productionAuthorized === true ||
    diagnosis.executionAuthorized === true ||
    diagnosis.groundTruthConsumed === true ||
    diagnosis.evaluatorInfluencedReasoning === true
  ) {
    throw executorError(
      "PHASE23R_10G2_RECOVERY_UNSAFE_INPUT",
      (
        "Recovery execution input violated "
        + "Phase 23R safety boundaries"
      )
    );
  }

  for (
    const key
    of [
      "groundTruth",
      "evaluatorGroundTruth",
      "sealedEvaluation",
      "expectedDiagnosis",
      "expectedRecovery",
      "rootCause",
    ]
  ) {
    if (
      input[key] !== undefined
    ) {
      throw executorError(
        "PHASE23R_10G2_RECOVERY_GROUND_TRUTH_FORBIDDEN",
        (
          `${key} must not enter the `
          + "recovery execution path"
        )
      );
    }
  }
}


async function getNextRecoveryDecisionRevision({
  repository,
  organizationId,
  environmentId,
  incidentId,
}) {
  return repository
    .scope
    .run(
      {
        organizationId,
        environmentId,
        incidentId,
      },

      async (
        client,
        resolved
      ) => {
        const incident =
          await repository
            .resolveIncident(
              client,
              resolved,
              incidentId
            );

        if (
          !incident
        ) {
          throw executorError(
            "PHASE23R_10G2_RECOVERY_INCIDENT_NOT_FOUND",
            (
              "Could not resolve incident "
              + "while allocating recovery revision"
            )
          );
        }

        const result =
          await client.query(
            `
              SELECT
                COALESCE(
                  MAX(revision),
                  0
                ) AS max_revision
              FROM
                execution.recovery_decisions
              WHERE
                incident_id = $1
            `,
            [
              incident.id,
            ]
          );

        const maxRevision =
          Number(
            result.rows[0]?.max_revision || 0
          );

        if (
          !Number.isSafeInteger(
            maxRevision
          ) ||
          maxRevision < 0
        ) {
          throw executorError(
            "PHASE23R_10G2_RECOVERY_REVISION_INVALID",
            (
              "Invalid existing recovery revision: "
              + String(
                result.rows[0]?.max_revision
              )
            )
          );
        }

        return maxRevision + 1;
      }
    );
}


async function deleteTemporaryGovernance({
  scope,
  organizationId,
  environmentId,
  integrationId,
}) {
  return scope.run(
    {
      organizationId,
      environmentId,
    },

    async (
      client,
      resolved
    ) => {
      await client.query(
        `
          DELETE FROM
            integrations.connection_governance
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND integration_id = $3
        `,
        [
          resolved.organizationUuid,
          resolved.environmentUuid,
          String(integrationId),
        ]
      );

      return true;
    }
  );
}


function buildAuthorizationEngine() {
  return new ExecutionAuthorizationEngine({
    freshnessService: {
      async validate() {
        return {
          state:
            EXECUTION_FRESHNESS_STATE.FRESH,

          fresh:
            true,

          reasons:
            [],

          warnings:
            [],
        };
      },
    },

    approvalService: {
      async resolve() {
        return {
          state:
            EXECUTION_APPROVAL_STATE.NOT_REQUIRED,

          satisfied:
            true,

          reasons:
            [],

          warnings:
            [],
        };
      },
    },

    policyService: {
      async validate() {
        return {
          state:
            EXECUTION_POLICY_STATE.ALLOWED,

          allowed:
            true,

          reasons: [
            (
              "Explicit Phase 23R.10G.2 "
              + "LAB_ONLY live-certification "
              + "policy fixture."
            ),
          ],

          warnings:
            [],
        };
      },
    },

    killSwitchService: {
      async evaluate() {
        return {
          state:
            KILL_SWITCH_STATE.ENABLED,

          allowed:
            true,

          reasons:
            [],

          warnings:
            [],
        };
      },
    },

    idempotencyService: {
      async evaluate(
        input
      ) {
        return {
          state:
            IDEMPOTENCY_STATE.NEW,

          allowed:
            true,

          idempotencyKey:
            input.idempotencyKey,

          retryAllowed:
            false,

          reasons:
            [],

          warnings:
            [],
        };
      },
    },

    leaseService: {
      async acquire(
        input
      ) {
        return {
          state:
            EXECUTION_LOCK_STATE.ACQUIRED,

          acquired:
            true,

          leaseKey:
            input.lockKey,

          ownerId:
            input.ownerId,

          reasons:
            [],

          warnings:
            [],
        };
      },

      async release() {
        return {
          released:
            true,
        };
      },
    },
  });
}


class Phase23R10G2RecoveryExecutor {
  constructor(
    options = {}
  ) {
    this.context =
      requireString(
        options.context,
        "context"
      );

    this.namespace =
      requireString(
        options.namespace,
        "namespace"
      );

    this.deployment =
      requireString(
        options.deployment,
        "deployment"
      );

    this.kubeconfig =
      requireString(
        options.kubeconfig,
        "kubeconfig"
      );

    if (
      this.context !==
      "kind-aira-reliability-lab"
    ) {
      throw executorError(
        "PHASE23R_10G2_RECOVERY_CONTEXT_FORBIDDEN",
        (
          "Recovery executor is locked to "
          + "kind-aira-reliability-lab"
        )
      );
    }

    if (
      this.namespace !==
      "aira-reliability-lab"
    ) {
      throw executorError(
        "PHASE23R_10G2_RECOVERY_NAMESPACE_FORBIDDEN",
        (
          "Recovery executor is locked to "
          + "aira-reliability-lab"
        )
      );
    }

    this.incidentRepository =
      options.incidentRepository ||
      new PostgresIncidentRepository(
        options
      );

    this.recoveryRepository =
      options.recoveryRepository ||
      new PostgresRecoveryDecisionRepository(
        options
      );

    this.authorizationRepository =
      options.authorizationRepository ||
      new PostgresExecutionAuthorizationRepository(
        options
      );

    this.integrationConnectionStore =
      options.integrationConnectionStore ||
      new IntegrationConnectionStore(
        options
      );

    this.governanceScope =
      options.governanceScope ||
      new PostgresTenantScope(
        options
      );

    this.authorizationEngine =
      options.authorizationEngine ||
      buildAuthorizationEngine();

    this.authorizationCritic =
      options.authorizationCritic ||
      executionAuthorizationCritic;

    this.authorizationPersistenceService =
      options.authorizationPersistenceService ||
      executionAuthorizationPersistenceService;

    this.integrationRuntime =
      options.integrationRuntime ||
      new IntegrationRuntime(
        options
      );
  }


  async execute(
    input = {}
  ) {
    assertSafeInput(
      input
    );

    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );

    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );

    const incidentId =
      requireString(
        input.incidentId,
        "incidentId"
      );

    const diagnosis =
      requireObject(
        input.diagnosis,
        "diagnosis"
      );

    const incident =
      await this
        .incidentRepository
        .findOne({
          organizationId,
          environmentId,
          _id:
            incidentId,
        });

    if (
      !incident
    ) {
      throw executorError(
        "PHASE23R_10G2_RECOVERY_INCIDENT_NOT_FOUND",
        (
          `Incident ${incidentId} `
          + "was not found"
        )
      );
    }

    let temporaryConnection =
      null;

    let governanceCreated =
      false;

    try {
      const integrationPublicId =
        (
          "int_phase23r10g2_"
          +
          crypto
            .randomUUID()
            .replace(
              /-/g,
              ""
            )
            .slice(
              0,
              16
            )
        );

      temporaryConnection =
        await this
          .integrationConnectionStore
          .createConnection({
            organizationId,
            environmentId,

            publicId:
              integrationPublicId,

            provider:
              "kubernetes",

            name:
              (
                "Phase 23R.10G.2 "
                + "Reliability Lab execution"
              ),

            serviceIds: [
              incident.serviceId,
            ].filter(Boolean),

            capabilities: [
              "get_health",
              "discover_resources",
              RUNTIME_CAPABILITY,
              "revoke",
            ],

            nonSecretConfig: {
              authMode:
                "kubeconfig",

              clusterName:
                this.context,

              allowedNamespaces: [
                this.namespace,
              ],

              allowedDeployments: [
                (
                  `${this.namespace}/`
                  + `${this.deployment}`
                ),
              ],

              allowedExecutionCapabilities: [
                CAPABILITY,
              ],

              phase23RRealityLab:
                true,

              safetyClass:
                "LAB_ONLY",
            },

            status:
              "connected",

            healthStatus:
              "healthy",

            metadata: {
              phase:
                "23R.10G.2",

              temporary:
                true,

              diagnosisRunId:
                diagnosis.diagnosisRunId,

              selectedFailureMode:
                diagnosis.selectedFailureMode,

              productionCertified:
                false,

              executionAuthorized:
                false,
            },

            secret:
              this.kubeconfig,
          });

      if (
        !temporaryConnection ||
        temporaryConnection.executionAuthorized ===
          true
      ) {
        throw executorError(
          "PHASE23R_10G2_CONNECTION_CREATE_FAILED",
          (
            "Temporary lab Kubernetes "
            + "integration was not created safely"
          )
        );
      }

      const governance =
        await upsertGovernance({
          organizationId,
          environmentId,

          integrationId:
            temporaryConnection.publicId,

          provider:
            "kubernetes",

          actorUserId:
            null,

          scope:
            this.governanceScope,

          settings: {
            enabled:
              true,

            allowIngestion:
              false,

            allowQueries:
              true,

            allowResourceDiscovery:
              true,

            allowExecution:
              true,

            credentialAccessMode:
              "managed_only",

            credentialRotationRequired:
              false,

            credentialRotationDays:
              90,

            allowedCapabilities: [
              RUNTIME_CAPABILITY,
            ],

            deniedCapabilities:
              [],

            rateLimits: {
              maxConcurrentExecutions:
                1,
            },

            metadata: {
              phase:
                "23R.10G.2",

              temporary:
                true,

              safetyClass:
                "LAB_ONLY",

              namespace:
                this.namespace,

              deployment:
                this.deployment,

              executionAuthorized:
                false,

              productionCertified:
                false,
            },
          },
        });

      governanceCreated =
        true;

      if (
        !governance ||
        governance.enabled !== true ||
        governance.allow_execution !== true
      ) {
        throw executorError(
          "PHASE23R_10G2_GOVERNANCE_INVALID",
          (
            "Temporary integration governance "
            + "did not explicitly allow lab execution"
          )
        );
      }

      const reloadedGovernance =
        await getGovernance({
          organizationId,
          environmentId,

          integrationId:
            temporaryConnection.publicId,

          scope:
            this.governanceScope,
        });

      if (
        !reloadedGovernance ||
        reloadedGovernance.allow_execution !==
          true ||
        !Array.isArray(
          reloadedGovernance.allowed_capabilities
        ) ||
        !reloadedGovernance
          .allowed_capabilities
          .includes(
            RUNTIME_CAPABILITY
          )
      ) {
        throw executorError(
          "PHASE23R_10G2_GOVERNANCE_RELOAD_INVALID",
          (
            "Persisted lab governance could "
            + "not be reloaded safely"
          )
        );
      }

      /*
       * ================================================================
       * NEGATIVE AUTHORIZATION PROBE
       * ================================================================
       *
       * No authorizationReference is supplied here.
       *
       * The canonical Phase-20 boundary MUST reject the request before
       * the Kubernetes provider is allowed to mutate anything.
       */
      let unauthorizedExecutionBlocked =
        false;

      let unauthorizedExecutionCode =
        null;

      try {
        await this
          .integrationRuntime
          .executeCapability(
            {
              organizationId,
              environmentId,

              integrationId:
                temporaryConnection.publicId,

              provider:
                "kubernetes",

              executionAuthorized:
                false,
            },

            {
              capability:
                CAPABILITY,

              parameters: {
                namespace:
                  this.namespace,

                deploymentName:
                  this.deployment,
              },

              executionAuthorized:
                false,
            },

            null
          );
      } catch (
        error
      ) {
        unauthorizedExecutionBlocked =
          true;

        unauthorizedExecutionCode =
          error?.code ||
          error?.message ||
          "BLOCKED";
      }

      if (
        !unauthorizedExecutionBlocked
      ) {
        throw executorError(
          "PHASE23R_10G2_UNAUTHORIZED_EXECUTION_NOT_BLOCKED",
          (
            "IntegrationRuntime accepted execution "
            + "without canonical authorization"
          )
        );
      }

      const recoveryRevision =
        await getNextRecoveryDecisionRevision({
          repository:
            this.recoveryRepository,

          organizationId,
          environmentId,
          incidentId,
        });

      const decisionId =
        (
          "rec_phase23r10g2_"
          +
          crypto
            .randomUUID()
            .replace(
              /-/g,
              ""
            )
            .slice(
              0,
              20
            )
        );

      const candidateId =
        (
          "cand_phase23r10g2_"
          +
          crypto
            .randomUUID()
            .replace(
              /-/g,
              ""
            )
            .slice(
              0,
              16
            )
        );

      /*
       * Controlled LAB_ONLY recovery proposal.
       *
       * The proposal is tied to the real AIRA diagnosis produced by 10E.
       * It is deliberately not represented as autonomous production
       * recovery.
       */
      const recoveryDecision = {
        decisionId,
        organizationId,
        environmentId,
        incidentId,

        revision:
          recoveryRevision,

        isCurrent:
          false,

        status:
          "lab_fixture",

        decision:
          "RECOMMEND_PLAYBOOK",

        selectedCandidateId:
          candidateId,

        selectedPlaybookId:
          PLAYBOOK_ID,

        confidence:
          Number.isFinite(
            diagnosis.diagnosisConfidence
          )
            ? diagnosis.diagnosisConfidence
            : 1,

        candidates: [
          {
            candidateId,

            playbookId:
              PLAYBOOK_ID,

            status:
              "ELIGIBLE",

            parameters: {
              namespace:
                this.namespace,

              deploymentName:
                this.deployment,
            },

            executionAuthorized:
              false,
          },
        ],

        rejectedCandidates:
          [],

        reasons: [
          (
            "AIRA live diagnosis selected "
            + "failure mode "
            + `${diagnosis.selectedFailureMode}.`
          ),

          (
            "Phase 23R.10G.2 controlled "
            + "LAB_ONLY restart proposal."
          ),
        ],

        unknowns:
          [],

        policyStatus:
          "ELIGIBLE",

        riskLevel:
          "LOW",

        approvalRequired:
          false,

        approvalMode:
          "NONE",

        rollbackAvailable:
          false,

        reversibility:
          "RESTART_ONLY",

        criticResult: {
          accepted:
            true,

          source:
            "PHASE23R_10G2_LAB_FIXTURE",

          executionAuthorized:
            false,
        },

        generatedAt:
          new Date(),

        metadata: {
          phase:
            "23R.10G.2",

          safetyClass:
            "LAB_ONLY",

          controlledFixture:
            true,

          diagnosisRunId:
            diagnosis.diagnosisRunId,

          selectedFailureMode:
            diagnosis.selectedFailureMode,

          recoveryRevision,

          executionAuthorized:
            false,

          productionCertified:
            false,
        },

        executionAuthorized:
          false,
      };

      const persistedRecoveryDecision =
        await this
          .recoveryRepository
          .createDecision(
            recoveryDecision
          );

      if (
        !persistedRecoveryDecision ||
        Number(
          persistedRecoveryDecision.revision
        ) !== recoveryRevision ||
        persistedRecoveryDecision.executionAuthorized ===
          true
      ) {
        throw executorError(
          "PHASE23R_10G2_RECOVERY_DECISION_PERSIST_FAILED",
          (
            "Controlled lab recovery decision "
            + "was not persisted safely"
          )
        );
      }

      const selectedCandidate = {
        candidateId,

        playbookId:
          PLAYBOOK_ID,

        parameters: {
          namespace:
            this.namespace,

          deploymentName:
            this.deployment,
        },

        metadata: {
          actionType:
            CAPABILITY,

          resourceType:
            "kubernetes.deployment",

          resourceId:
            (
              `${this.namespace}/`
              + `${this.deployment}`
            ),
        },

        executionAuthorized:
          false,
      };

      const playbook = {
        playbookId:
          PLAYBOOK_ID,

        version:
          "1.0.0",

        title:
          (
            "Phase 23R Kubernetes Deployment "
            + "Restart Lab Fixture"
          ),

        adapter:
          "kubernetes",

        actionType:
          CAPABILITY,

        resourceType:
          "kubernetes.deployment",

        requiredParameters: [
          "namespace",
          "deploymentName",
        ],

        steps: [
          {
            id:
              "restart-deployment",

            name:
              (
                "Restart controlled Reliability "
                + "Lab deployment"
              ),

            action:
              "restartDeployment",

            adapter:
              "kubernetes",

            parameters: {
              namespace:
                "{{namespace}}",

              deploymentName:
                "{{deploymentName}}",
            },

            timeoutMs:
              60000,

            continueOnFailure:
              false,

            requiresConfirmation:
              false,

            metadata: {
              capability:
                CAPABILITY,

              phase23R:
                true,

              safetyClass:
                "LAB_ONLY",
            },
          },
        ],

        rollback: {
          steps:
            [],

          reversibility:
            "RESTART_ONLY",

          automaticAllowed:
            false,
        },

        verificationHooks:
          [],

        executionAuthorized:
          false,
      };

      const idempotencyKey =
        (
          `phase23r10g2:${incidentId}:`
          + `${Date.now()}`
        );

      /*
       * ================================================================
       * CANONICAL EXECUTION AUTHORIZATION ENGINE
       * ================================================================
       */
      const authorizationEngineResult =
        await this
          .authorizationEngine
          .authorize(
            {
              organizationId,
              environmentId,
              incidentId,

              recoveryDecisionId:
                persistedRecoveryDecision.decisionId,

              recoveryDecisionRevision:
                recoveryRevision,

              diagnosisId:
                diagnosis.diagnosisRunId,

              diagnosisRevision:
                null,

              selectedCandidateId:
                candidateId,

              selectedPlaybookId:
                PLAYBOOK_ID,

              recoveryDecision:
                persistedRecoveryDecision,

              selectedCandidate,

              playbook,

              actionType:
                CAPABILITY,

              resourceType:
                "kubernetes.deployment",

              resourceId:
                (
                  `${this.namespace}/`
                  + `${this.deployment}`
                ),

              parameters: {
                namespace:
                  this.namespace,

                deploymentName:
                  this.deployment,
              },

              context: {
                incident,

                service: {
                  id:
                    incident.serviceId ||
                    null,
                },

                namespace:
                  this.namespace,

                deploymentName:
                  this.deployment,

                safetyClass:
                  "LAB_ONLY",

                diagnosisRunId:
                  diagnosis.diagnosisRunId,

                selectedFailureMode:
                  diagnosis.selectedFailureMode,

                executionAuthorized:
                  false,
              },

              idempotencyKey,

              lockKey:
                (
                  "phase23r10g2:"
                  + `${this.namespace}:`
                  + `${this.deployment}`
                ),

              ownerId:
                `phase23r10g2-${process.pid}`,

              executionAuthorized:
                false,
            },

            {}
          );

      if (
        authorizationEngineResult
          ?.authorizationGranted !== true ||
        authorizationEngineResult
          ?.executionStarted === true ||
        !authorizationEngineResult
          ?.executionPlan
          ?.planId ||
        !authorizationEngineResult
          ?.executionPlan
          ?.planHash
      ) {
        throw executorError(
          "PHASE23R_10G2_AUTHORIZATION_INVALID",
          (
            "Canonical ExecutionAuthorizationEngine "
            + "did not produce a safe granted "
            + "authorization"
          )
        );
      }

      /*
       * ================================================================
       * AUTHORIZATION CRITIC
       * ================================================================
       */
      const criticResult =
        await this
          .authorizationCritic
          .review(
            authorizationEngineResult
          );

      if (
        criticResult
          ?.accepted !== true ||
        criticResult
          ?.authorizationGranted !== true ||
        (
          criticResult.violations ||
          []
        ).length !== 0
      ) {
        throw executorError(
          "PHASE23R_10G2_AUTHORIZATION_CRITIC_REJECTED",
          (
            "Execution authorization critic "
            + "rejected the lab authorization"
          )
        );
      }

      /*
       * ================================================================
       * CANONICAL POSTGRESQL AUTHORIZATION PERSISTENCE
       * ================================================================
       */
      const persisted =
        await this
          .authorizationPersistenceService
          .persist({
            engineResult:
              authorizationEngineResult,

            criticResult,
          });

      if (
        persisted
          ?.authorizationGranted !== true ||
        persisted
          ?.requestCreated !== true ||
        !persisted
          ?.authorization ||
        !persisted
          ?.executionRequest ||
        persisted
          ?.executionStarted === true
      ) {
        throw executorError(
          "PHASE23R_10G2_AUTHORIZATION_PERSISTENCE_INVALID",
          (
            "Authorization persistence did not "
            + "produce the immutable execution request"
          )
        );
      }

      const scope = {
        organizationId,
        environmentId,
        incidentId,
      };

      const reloadedAuthorization =
        await this
          .authorizationRepository
          .findAuthorizationByIdentifier(
            scope,

            persisted
              .authorization
              .authorizationId
          );

      const reloadedRequest =
        await this
          .authorizationRepository
          .findExecutionRequestByIdentifier(
            scope,

            persisted
              .executionRequest
              .executionRequestId
          );

      if (
        !reloadedAuthorization ||
        !reloadedRequest ||
        reloadedAuthorization
          .authorizationGranted !== true ||
        reloadedRequest
          .planId !==
          authorizationEngineResult
            .executionPlan
            .planId ||
        reloadedRequest
          .planHash !==
          authorizationEngineResult
            .executionPlan
            .planHash
      ) {
        throw executorError(
          "PHASE23R_10G2_AUTHORIZATION_RELOAD_INVALID",
          (
            "Persisted authorization/request "
            + "could not be reloaded with "
            + "immutable plan binding"
          )
        );
      }

      const authorizationReference = {
        incidentId,

        authorizationId:
          reloadedAuthorization.authorizationId,

        executionRequestId:
          reloadedRequest.executionRequestId,

        planId:
          reloadedRequest.planId,

        planHash:
          reloadedRequest.planHash,
      };

      /*
       * ================================================================
       * PHASE-20 AUTHORIZATION BOUNDARY + REAL KUBERNETES EXECUTION
       * ================================================================
       */
      const runtimeResult =
        await this
          .integrationRuntime
          .executeCapability(
            {
              organizationId,
              environmentId,

              integrationId:
                temporaryConnection.publicId,

              provider:
                "kubernetes",

              executionAuthorized:
                false,
            },

            {
              capability:
                CAPABILITY,

              parameters: {
                namespace:
                  this.namespace,

                deploymentName:
                  this.deployment,
              },

              executionAuthorized:
                false,
            },

            authorizationReference
          );

      /*
       * IntegrationRuntime returns the canonical IntegrationResult
       * envelope. The raw Kubernetes adapter result is under data.
       *
       * Provider activity is evidence of the authorized LAB_ONLY
       * execution. It does NOT become execution authority.
       */
      if (
        !runtimeResult ||
        runtimeResult.status !== "SUCCESS" ||
        runtimeResult.data?.success !== true ||
        runtimeResult.executionAuthorized === true
      ) {
        throw executorError(
          "PHASE23R_10G2_RUNTIME_EXECUTION_FAILED",
          (
            "IntegrationRuntime did not report "
            + "a canonical successful Kubernetes recovery"
          )
        );
      }

      return {
        executorVersion:
          RECOVERY_EXECUTOR_VERSION,

        executed:
          true,

        success:
          true,

        capability:
          CAPABILITY,

        incidentId,

        diagnosisRunId:
          diagnosis.diagnosisRunId,

        selectedFailureMode:
          diagnosis.selectedFailureMode,

        recoveryDecisionId:
          persistedRecoveryDecision.decisionId,

        authorizationId:
          reloadedAuthorization.authorizationId,

        executionRequestId:
          reloadedRequest.executionRequestId,

        planId:
          reloadedRequest.planId,

        planHash:
          reloadedRequest.planHash,

        authorizationGranted:
          true,

        authorizationCriticAccepted:
          true,

        persistedAuthorization:
          true,

        immutableExecutionRequest:
          true,

        integrationAuthorizationBoundaryVerified:
          true,

        providerExecutionObserved:
          true,

        unauthorizedExecutionBlocked,

        unauthorizedExecutionCode,

        runtimeResult,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    } finally {
      /*
       * ================================================================
       * TEMPORARY GOVERNANCE CLEANUP
       * ================================================================
       *
       * The temporary execution governance must not remain enabled after
       * the certification attempt.
       */
      if (
        governanceCreated &&
        temporaryConnection?.publicId
      ) {
        await deleteTemporaryGovernance({
          scope:
            this.governanceScope,

          organizationId,
          environmentId,

          integrationId:
            temporaryConnection.publicId,
        })
          .catch(
            error => {
              console.error(
                (
                  "[23R.10G.2 cleanup] "
                  + "Temporary governance cleanup failed: "
                  + error.message
                )
              );
            }
          );
      }

      /*
       * ================================================================
       * RETIRE TEMPORARY INTEGRATION CONNECTION
       * ================================================================
       *
       * Do not delete the connection because invocation/audit history can
       * reference it. Revoke the credential and retire operational access.
       */
      if (
        temporaryConnection?.id
      ) {
        await this
          .integrationConnectionStore
          .revokeCredential({
            organizationId,
            environmentId,

            connectionId:
              temporaryConnection.id,
          })
          .catch(
            error => {
              console.error(
                (
                  "[23R.10G.2 cleanup] "
                  + "Temporary credential revocation failed: "
                  + error.message
                )
              );
            }
          );

        const retiredAt =
          new Date()
            .toISOString();

        await this
          .integrationConnectionStore
          .updateConnection({
            organizationId,
            environmentId,

            connectionId:
              temporaryConnection.id,

            patch: {
              status:
                "disabled",

              healthStatus:
                "unknown",

              disabledAt:
                new Date(),

              disabledReason:
                (
                  "Phase 23R.10G.2 live "
                  + "certification completed"
                ),

              capabilities:
                [],

              nonSecretConfig: {
                phase23RRealityLab:
                  true,

                safetyClass:
                  "LAB_ONLY",

                retired:
                  true,

                retiredAt,

                allowedNamespaces:
                  [],

                allowedDeployments:
                  [],

                allowedExecutionCapabilities:
                  [],
              },

              metadata: {
                phase:
                  "23R.10G.2",

                temporary:
                  true,

                retired:
                  true,

                retiredAt,

                productionCertified:
                  false,

                executionAuthorized:
                  false,
              },

              executionAuthorized:
                false,
            },
          })
          .catch(
            error => {
              console.error(
                (
                  "[23R.10G.2 cleanup] "
                  + "Temporary integration retirement failed: "
                  + error.message
                )
              );
            }
          );
      }
    }
  }
}


module.exports = {
  RECOVERY_EXECUTOR_VERSION,

  CAPABILITY,

  RUNTIME_CAPABILITY,

  Phase23R10G2RecoveryExecutor,

  assertSafeInput,

  buildAuthorizationEngine,
};