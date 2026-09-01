"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.16
 * BATCH-8B POSITIVE AUTHORIZED EXECUTION LIVE CERTIFICATION
 * ============================================================================
 *
 * Certifies:
 *
 * controlled LAB_ONLY recovery fixture
 *      ↓
 * canonical ExecutionAuthorizationEngine
 *      ↓
 * canonical authorization critic
 *      ↓
 * canonical PostgreSQL authorization persistence
 *      ↓
 * immutable execution request
 *      ↓
 * explicit tenant integration governance
 *      ↓
 * Phase-20 authorization boundary
 *      ↓
 * IntegrationRuntime.executeCapability()
 *      ↓
 * Kubernetes adapter
 *      ↓
 * REAL kind Deployment restart
 *      ↓
 * independent Ready-pod verification
 *
 * IMPORTANT
 *
 * Phase 21 observes authorization.
 * Phase 21 does not create production authority.
 *
 * The recovery decision used here is an explicit LAB_ONLY positive-path
 * fixture. It is never represented as an autonomous production recovery
 * recommendation.
 * ============================================================================
 */

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const crypto =
  require(
    "node:crypto"
  );

const {
  execFileSync,
} =
  require(
    "node:child_process"
  );


const PostgresIncidentRepository =
  require(
    "../persistence/postgres/PostgresIncidentRepository"
  );


const PostgresRecoveryDecisionRepository =
  require(
    "../persistence/postgres/PostgresRecoveryDecisionRepository"
  );


const PostgresExecutionAuthorizationRepository =
  require(
    "../persistence/postgres/PostgresExecutionAuthorizationRepository"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );


const IntegrationConnectionStore =
  require(
    "../services/integrations/integrationConnectionStore"
  );


const {
  IntegrationRuntime,
} =
  require(
    "../services/integrations/integrationRuntime"
  );


const {
  getGovernance,
  upsertGovernance,
} =
  require(
    "../services/integrations/integrationGovernanceService"
  );


const {
  ExecutionAuthorizationEngine,
} =
  require(
    "../services/execution/executionAuthorizationEngine"
  );


const executionAuthorizationCritic =
  require(
    "../services/execution/executionAuthorizationCritic"
  );


const executionAuthorizationPersistenceService =
  require(
    "../services/execution/executionAuthorizationPersistenceService"
  );


const {
  PositiveExecutionSafetyEvaluator,
} =
  require(
    "../services/reliability/positiveExecutionSafetyEvaluator"
  );


const {
  EXECUTION_APPROVAL_STATE,

  EXECUTION_POLICY_STATE,

  EXECUTION_FRESHNESS_STATE,

  KILL_SWITCH_STATE,

  EXECUTION_LOCK_STATE,

  IDEMPOTENCY_STATE,
} =
  require(
    "../services/execution/executionAuthorizationContracts"
  );


const CERTIFICATE_VERSION =
  "21.16-batch8b-live-v3";


const CAPABILITY =
  "kubernetes.restartDeployment";


const RUNTIME_CAPABILITY =
  "execute_capability";


const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    tenantId:
      "aira-dev-org",

    labEnvironmentId:
      "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",

    incidentId:
      "e8fa0aeec7d209dd5770b293",

    namespace:
      "aira-reliability-lab",

    deployment:
      "lab-api",

    context:
      "kind-aira-reliability-lab",
  });


async function main() {
  const configuration =
    loadConfiguration();


  assertEnvironmentSafety();


  printHeader(
    configuration
  );


  const reliabilityRepository =
    new PostgresReliabilityLabRepository();


  const incidentRepository =
    new PostgresIncidentRepository();


  const recoveryRepository =
    new PostgresRecoveryDecisionRepository();


  const authorizationRepository =
    new PostgresExecutionAuthorizationRepository();


  const integrationConnectionStore =
    new IntegrationConnectionStore();


  const governanceScope =
    new PostgresTenantScope();


  let temporaryConnection =
    null;


  let temporaryGovernanceCreated =
    false;


  try {
    // =========================================================================
    // 1. LAB SAFETY
    // =========================================================================

    printSection(
      "LAB SAFETY"
    );


    const lab =
      await reliabilityRepository
        .getLabEnvironment({
          organizationId:
            configuration
              .organizationId,

          environmentId:
            configuration
              .environmentId,

          labEnvironmentId:
            configuration
              .labEnvironmentId,
        });


    requireCondition(
      lab,
      "PHASE21_BATCH8B_LAB_NOT_FOUND",
      "Reliability Lab environment was not found"
    );


    requireCondition(
      String(
        lab.status ||
        ""
      )
        .trim()
        .toUpperCase() ===
        "AVAILABLE",
      "PHASE21_BATCH8B_LAB_NOT_AVAILABLE",
      `Expected AVAILABLE lab, actual=${lab.status}`
    );


    requireCondition(
      String(
        lab.safetyClass ||
        ""
      )
        .trim()
        .toUpperCase() ===
        "LAB_ONLY",
      "PHASE21_BATCH8B_SAFETY_CLASS_INVALID",
      `Expected LAB_ONLY, actual=${lab.safetyClass}`
    );


    requireCondition(
      lab.production !==
        true,
      "PHASE21_BATCH8B_PRODUCTION_LAB_FORBIDDEN",
      "Positive execution certification cannot target production"
    );


    requireCondition(
      lab.executionAuthorized !==
        true,
      "PHASE21_BATCH8B_LAB_AUTHORITY_LEAK",
      "Reliability Lab environment cannot authorize execution"
    );


    console.log(
      `Lab status:               ${lab.status}`
    );

    console.log(
      `Safety class:             ${lab.safetyClass}`
    );

    console.log(
      `Production:               ${Boolean(
        lab.production
      )}`
    );

    console.log(
      `Phase21 authority:        ${Boolean(
        lab.executionAuthorized
      )}`
    );


    // =========================================================================
    // 2. REAL INCIDENT
    // =========================================================================

    printSection(
      "REAL INCIDENT"
    );


    const incident =
      await incidentRepository
        .findOne({
          organizationId:
            configuration
              .organizationId,

          environmentId:
            configuration
              .environmentId,

          _id:
            configuration
              .incidentId,
        });


    requireCondition(
      incident,
      "PHASE21_BATCH8B_INCIDENT_NOT_FOUND",
      `Incident not found: ${configuration.incidentId}`
    );


    const incidentId =
      String(
        incident._id ||
        incident.incidentId ||
        configuration.incidentId
      );


    console.log(
      `Incident ID:              ${incidentId}`
    );

    console.log(
      `Service ID:               ${formatNullable(
        incident.serviceId
      )}`
    );


    // =========================================================================
    // 3. REAL HEALTHY KUBERNETES BASELINE
    // =========================================================================

    printSection(
      "REAL KUBERNETES BASELINE"
    );


    const before =
      getReadyPod({
        context:
          configuration.context,

        namespace:
          configuration.namespace,

        deployment:
          configuration.deployment,
      });


    requireCondition(
      before &&
      before.uid,
      "PHASE21_BATCH8B_BASELINE_POD_NOT_FOUND",
      "No Ready lab-api pod was found"
    );


    console.log(
      `Deployment:               ${configuration.deployment}`
    );

    console.log(
      `Namespace:                ${configuration.namespace}`
    );

    console.log(
      `Pod before:               ${before.name}`
    );

    console.log(
      `UID before:               ${before.uid}`
    );

    console.log(
      `Ready before:             ${before.ready}`
    );


    // =========================================================================
    // 4. TEMPORARY LAB-ONLY PHASE-20 CONNECTION
    // =========================================================================

    printSection(
      "TEMPORARY LAB-ONLY PHASE-20 CONNECTION"
    );


    const kubeconfig =
      readKindKubeconfig(
        configuration.context
      );


    const integrationPublicId =
      `int_phase21_batch8b_${crypto
        .randomUUID()
        .replace(
          /-/g,
          ""
        )
        .slice(
          0,
          16
        )}`;


    temporaryConnection =
      await integrationConnectionStore
        .createConnection({
          organizationId:
            configuration
              .organizationId,

          environmentId:
            configuration
              .environmentId,

          publicId:
            integrationPublicId,

          provider:
            "kubernetes",

          name:
            "Phase 21 Batch-8B kind execution",

          serviceIds: [
            incident.serviceId,
          ]
            .filter(
              Boolean
            ),

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
              configuration.context,

            allowedNamespaces: [
              configuration
                .namespace,
            ],

            allowedDeployments: [
              `${configuration.namespace}/${configuration.deployment}`,
            ],

            allowedExecutionCapabilities: [
              CAPABILITY,
            ],

            phase21ReliabilityLab:
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
              "21.16",

            batch:
              "8B",

            temporary:
              true,

            productionCertified:
              false,

            executionAuthorized:
              false,
          },

          secret:
            kubeconfig,
        });


    requireCondition(
      temporaryConnection,
      "PHASE21_BATCH8B_CONNECTION_CREATE_FAILED",
      "Temporary Kubernetes integration was not created"
    );


    requireCondition(
      temporaryConnection
        .executionAuthorized !==
        true,
      "PHASE21_BATCH8B_CONNECTION_AUTHORITY_LEAK",
      "Integration connection cannot grant execution authority"
    );


    console.log(
      `Integration ID:           ${temporaryConnection.publicId}`
    );

    console.log(
      `Provider:                 ${temporaryConnection.provider}`
    );

    console.log(
      `Execution capability:     ${temporaryConnection.capabilities.includes(
        RUNTIME_CAPABILITY
      )}`
    );

    console.log(
      `Allowed namespace:        ${configuration.namespace}`
    );

    console.log(
      `Allowed deployment:       ${configuration.deployment}`
    );


    // =========================================================================
    // 5. EXPLICIT TENANT GOVERNANCE
    // =========================================================================

    printSection(
      "EXPLICIT TENANT INTEGRATION GOVERNANCE"
    );


    const governance =
      await upsertGovernance({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        integrationId:
          temporaryConnection
            .publicId,

        provider:
          "kubernetes",

        actorUserId:
          null,

        scope:
          governanceScope,

        settings: {
          enabled:
            true,

          allowIngestion:
            false,

          allowQueries:
            true,

          allowResourceDiscovery:
            true,

          /*
           * Explicit opt-in required by Phase 20 runtime governance.
           *
           * This still DOES NOT create execution authorization.
           */
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
              "21.16",

            batch:
              "8B",

            safetyClass:
              "LAB_ONLY",

            temporary:
              true,

            namespace:
              configuration
                .namespace,

            deployment:
              configuration
                .deployment,

            executionAuthorized:
              false,

            productionCertified:
              false,
          },
        },
      });


    temporaryGovernanceCreated =
      true;


    requireCondition(
      governance,
      "PHASE21_BATCH8B_GOVERNANCE_CREATE_FAILED",
      "Tenant integration governance was not created"
    );


    requireCondition(
      governance.enabled ===
        true,
      "PHASE21_BATCH8B_GOVERNANCE_DISABLED",
      "Temporary integration governance is disabled"
    );


    requireCondition(
      governance.allow_execution ===
        true,
      "PHASE21_BATCH8B_GOVERNANCE_EXECUTION_NOT_ALLOWED",
      "Temporary governance did not explicitly allow execution"
    );


    requireCondition(
      Array.isArray(
        governance.allowed_capabilities
      ) &&
      governance
        .allowed_capabilities
        .includes(
          RUNTIME_CAPABILITY
        ),
      "PHASE21_BATCH8B_GOVERNANCE_CAPABILITY_NOT_ALLOWED",
      "execute_capability is not present in tenant governance allow-list"
    );


    const reloadedGovernance =
      await getGovernance({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        integrationId:
          temporaryConnection
            .publicId,

        scope:
          governanceScope,
      });


    requireCondition(
      reloadedGovernance,
      "PHASE21_BATCH8B_GOVERNANCE_NOT_RELOADABLE",
      "Tenant governance could not be reloaded from PostgreSQL"
    );


    requireCondition(
      reloadedGovernance
        .allow_execution ===
        true,
      "PHASE21_BATCH8B_GOVERNANCE_RELOAD_BLOCKED",
      "Reloaded governance does not allow execution"
    );


    console.log(
      `Governance present:       true`
    );

    console.log(
      `Governance enabled:       ${reloadedGovernance.enabled}`
    );

    console.log(
      `Allow execution:          ${reloadedGovernance.allow_execution}`
    );

    console.log(
      `Allowed capabilities:     ${JSON.stringify(
        reloadedGovernance.allowed_capabilities
      )}`
    );

    console.log(
      "Governance authority:     false"
    );


    // =========================================================================
    // 6. CONTROLLED LAB RECOVERY DECISION
    // =========================================================================

    printSection(
      "CONTROLLED LAB RECOVERY DECISION"
    );


    const recoveryRevision =
      await getNextRecoveryDecisionRevision({
        repository:
          recoveryRepository,

        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        incidentId,
      });


    const decisionId =
      `rec_phase21_batch8b_${crypto
        .randomUUID()
        .replace(
          /-/g,
          ""
        )
        .slice(
          0,
          20
        )}`;


    const candidateId =
      `cand_phase21_batch8b_${crypto
        .randomUUID()
        .replace(
          /-/g,
          ""
        )
        .slice(
          0,
          16
        )}`;


    const playbookId =
      "PB-PHASE21-K8S-RESTART-LAB-001";


    const recoveryDecision = {
      decisionId,

      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      incidentId,

      revision:
        recoveryRevision,

      /*
       * This is a positive-path certification fixture.
       *
       * Never replace AIRA's real current recovery recommendation.
       */
      isCurrent:
        false,

      status:
        "lab_fixture",

      decision:
        "RECOMMEND_PLAYBOOK",

      selectedCandidateId:
        candidateId,

      selectedPlaybookId:
        playbookId,

      confidence:
        1,

      candidates: [
        {
          candidateId,

          playbookId,

          status:
            "ELIGIBLE",

          parameters: {
            namespace:
              configuration
                .namespace,

            deploymentName:
              configuration
                .deployment,
          },

          executionAuthorized:
            false,
        },
      ],

      rejectedCandidates:
        [],

      reasons: [
        "Phase 21 Batch-8B controlled LAB_ONLY positive execution fixture.",
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
          "PHASE21_LAB_FIXTURE",

        executionAuthorized:
          false,
      },

      generatedAt:
        new Date(),

      metadata: {
        phase:
          "21.16",

        batch:
          "8B",

        safetyClass:
          "LAB_ONLY",

        controlledFixture:
          true,

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
      await recoveryRepository
        .createDecision(
          recoveryDecision
        );


    requireCondition(
      persistedRecoveryDecision,
      "PHASE21_BATCH8B_RECOVERY_DECISION_NOT_PERSISTED",
      "Controlled recovery decision was not persisted"
    );


    requireCondition(
      Number(
        persistedRecoveryDecision
          .revision
      ) ===
        recoveryRevision,
      "PHASE21_BATCH8B_RECOVERY_REVISION_MISMATCH",
      [
        `Expected revision=${recoveryRevision}.`,
        `Actual=${persistedRecoveryDecision?.revision}`,
      ].join(
        " "
      )
    );


    requireCondition(
      persistedRecoveryDecision
        .executionAuthorized !==
        true,
      "PHASE21_BATCH8B_RECOVERY_AUTHORITY_LEAK",
      "Recovery decision cannot authorize execution"
    );


    console.log(
      `Recovery decision:        ${persistedRecoveryDecision.decisionId}`
    );

    console.log(
      `Revision:                 ${persistedRecoveryDecision.revision}`
    );

    console.log(
      `Is current:               ${Boolean(
        persistedRecoveryDecision.isCurrent
      )}`
    );

    console.log(
      `Decision:                 ${persistedRecoveryDecision.decision}`
    );

    console.log(
      `Selected candidate:       ${candidateId}`
    );

    console.log(
      `Selected playbook:        ${playbookId}`
    );

    console.log(
      "Execution authorized:     false"
    );


    // =========================================================================
    // 7. CONTROLLED IMMUTABLE PLAYBOOK INPUT
    // =========================================================================

    const selectedCandidate = {
      candidateId,

      playbookId,

      parameters: {
        namespace:
          configuration
            .namespace,

        deploymentName:
          configuration
            .deployment,
      },

      metadata: {
        actionType:
          CAPABILITY,

        resourceType:
          "kubernetes.deployment",

        resourceId:
          `${configuration.namespace}/${configuration.deployment}`,
      },

      executionAuthorized:
        false,
    };


    const playbook = {
      playbookId,

      version:
        "1.0.0",

      title:
        "Phase 21 Kubernetes Deployment Restart Lab Fixture",

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
            "Restart controlled Reliability Lab deployment",

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
            60_000,

          continueOnFailure:
            false,

          requiresConfirmation:
            false,

          metadata: {
            capability:
              CAPABILITY,

            phase21:
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


    // =========================================================================
    // 8. CANONICAL EXECUTION AUTHORIZATION
    // =========================================================================

    printSection(
      "CANONICAL EXECUTION AUTHORIZATION"
    );


    const authorizationEngine =
      new ExecutionAuthorizationEngine({
        freshnessService: {
          async validate() {
            return {
              state:
                EXECUTION_FRESHNESS_STATE
                  .FRESH,

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
                EXECUTION_APPROVAL_STATE
                  .NOT_REQUIRED,

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
                EXECUTION_POLICY_STATE
                  .ALLOWED,

              allowed:
                true,

              reasons: [
                "Explicit Phase 21 LAB_ONLY positive-path policy fixture.",
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
                KILL_SWITCH_STATE
                  .ENABLED,

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
                IDEMPOTENCY_STATE
                  .NEW,

              allowed:
                true,

              idempotencyKey:
                input
                  .idempotencyKey,

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
                EXECUTION_LOCK_STATE
                  .ACQUIRED,

              acquired:
                true,

              leaseKey:
                input.lockKey ||
                `phase21:batch8b:${incidentId}`,

              ownerId:
                input.ownerId ||
                `phase21-batch8b-${process.pid}`,

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


    const idempotencyKey =
      `phase21-batch8b:${incidentId}:${Date.now()}`;


    const authorizationEngineResult =
      await authorizationEngine
        .authorize(
          {
            organizationId:
              configuration
                .organizationId,

            environmentId:
              configuration
                .environmentId,

            incidentId,

            recoveryDecisionId:
              persistedRecoveryDecision
                .decisionId,

            recoveryDecisionRevision:
              recoveryRevision,

            diagnosisId:
              null,

            diagnosisRevision:
              null,

            selectedCandidateId:
              candidateId,

            selectedPlaybookId:
              playbookId,

            recoveryDecision:
              persistedRecoveryDecision,

            selectedCandidate,

            playbook,

            actionType:
              CAPABILITY,

            resourceType:
              "kubernetes.deployment",

            resourceId:
              `${configuration.namespace}/${configuration.deployment}`,

            parameters: {
              namespace:
                configuration
                  .namespace,

              deploymentName:
                configuration
                  .deployment,
            },

            context: {
              incident,

              service: {
                id:
                  incident.serviceId ||
                  null,
              },

              namespace:
                configuration
                  .namespace,

              deploymentName:
                configuration
                  .deployment,

              safetyClass:
                "LAB_ONLY",

              executionAuthorized:
                false,
            },

            idempotencyKey,

            lockKey:
              `phase21:batch8b:${configuration.namespace}:${configuration.deployment}`,

            ownerId:
              `phase21-batch8b-${process.pid}`,

            executionAuthorized:
              false,
          },

          {}
        );


    requireCondition(
      authorizationEngineResult
        ?.authorizationGranted ===
        true,
      "PHASE21_BATCH8B_AUTHORIZATION_NOT_GRANTED",
      [
        "Canonical ExecutionAuthorizationEngine did not authorize.",
        `decision=${authorizationEngineResult?.authorization?.decision || "NONE"}`,
      ].join(
        " "
      )
    );


    requireCondition(
      authorizationEngineResult
        ?.executionStarted !==
        true,
      "PHASE21_BATCH8B_AUTH_ENGINE_EXECUTED",
      "ExecutionAuthorizationEngine must not execute infrastructure"
    );


    requireCondition(
      authorizationEngineResult
        ?.executionPlan
        ?.planId &&
      authorizationEngineResult
        ?.executionPlan
        ?.planHash,
      "PHASE21_BATCH8B_PLAN_MISSING",
      "Immutable execution plan was not produced"
    );


    console.log(
      `Authorization ID:         ${authorizationEngineResult.authorization.authorizationId}`
    );

    console.log(
      `Decision:                 ${authorizationEngineResult.authorization.decision}`
    );

    console.log(
      `Freshness:                ${authorizationEngineResult.authorization.freshnessState}`
    );

    console.log(
      `Approval:                 ${authorizationEngineResult.authorization.approvalState}`
    );

    console.log(
      `Policy:                   ${authorizationEngineResult.authorization.policyState}`
    );

    console.log(
      `Kill switch:              ${authorizationEngineResult.authorization.killSwitchState}`
    );

    console.log(
      `Lease:                    ${authorizationEngineResult.authorization.lockState}`
    );

    console.log(
      `Idempotency:              ${authorizationEngineResult.authorization.idempotencyState}`
    );

    console.log(
      `Plan ID:                  ${authorizationEngineResult.executionPlan.planId}`
    );

    console.log(
      `Plan hash:                ${authorizationEngineResult.executionPlan.planHash}`
    );

    console.log(
      `Execution started:        ${Boolean(
        authorizationEngineResult.executionStarted
      )}`
    );


    // =========================================================================
    // 9. AUTHORIZATION CRITIC
    // =========================================================================

    printSection(
      "AUTHORIZATION CRITIC"
    );


    const criticResult =
      await executionAuthorizationCritic
        .review(
          authorizationEngineResult
        );


    requireCondition(
      criticResult
        ?.accepted ===
        true &&
      criticResult
        ?.authorizationGranted ===
        true,
      "PHASE21_BATCH8B_AUTHORIZATION_CRITIC_REJECTED",
      [
        "Execution authorization critic rejected authorization.",
        `decision=${criticResult?.decision || "NONE"}`,
        `violations=${JSON.stringify(
          criticResult?.violations || []
        )}`,
      ].join(
        " "
      )
    );


    console.log(
      `Critic accepted:          ${criticResult.accepted}`
    );

    console.log(
      `Authorization granted:    ${criticResult.authorizationGranted}`
    );

    console.log(
      `Violations:               ${(criticResult.violations || []).length}`
    );


    // =========================================================================
    // 10. CANONICAL POSTGRESQL AUTHORIZATION EVIDENCE
    // =========================================================================

    printSection(
      "CANONICAL POSTGRESQL EXECUTION EVIDENCE"
    );


    const persisted =
      await executionAuthorizationPersistenceService
        .persist({
          engineResult:
            authorizationEngineResult,

          criticResult,
        });


    requireCondition(
      persisted
        ?.authorizationGranted ===
        true,
      "PHASE21_BATCH8B_PERSISTED_AUTHORIZATION_NOT_GRANTED",
      "Persisted authorization did not remain granted"
    );


    requireCondition(
      persisted
        ?.requestCreated ===
        true &&
      persisted
        ?.executionRequest,
      "PHASE21_BATCH8B_EXECUTION_REQUEST_NOT_CREATED",
      "Authorized execution did not create execution request"
    );


    requireCondition(
      persisted
        ?.executionStarted !==
        true,
      "PHASE21_BATCH8B_PERSISTENCE_EXECUTED",
      "Persistence layer must not execute infrastructure"
    );


    const persistedAuthorization =
      persisted.authorization;


    const executionRequest =
      persisted.executionRequest;


    console.log(
      `Persisted auth:           ${persistedAuthorization.authorizationId}`
    );

    console.log(
      `Execution request:        ${executionRequest.executionRequestId}`
    );

    console.log(
      `Request state:            ${executionRequest.state}`
    );

    console.log(
      `Persisted plan ID:        ${executionRequest.planId}`
    );

    console.log(
      `Persisted plan hash:      ${executionRequest.planHash}`
    );


    // =========================================================================
    // 11. RELOAD CANONICAL EVIDENCE
    // =========================================================================

    const scope = {
      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      incidentId,
    };


    const reloadedAuthorization =
      await authorizationRepository
        .findAuthorizationByIdentifier(
          scope,

          persistedAuthorization
            .authorizationId
        );


    const reloadedRequest =
      await authorizationRepository
        .findExecutionRequestByIdentifier(
          scope,

          executionRequest
            .executionRequestId
        );


    requireCondition(
      reloadedAuthorization &&
      reloadedRequest,
      "PHASE21_BATCH8B_PERSISTED_EVIDENCE_NOT_RELOADABLE",
      "Authorization/request could not be reloaded"
    );


    requireCondition(
      reloadedAuthorization
        .authorizationGranted ===
        true,
      "PHASE21_BATCH8B_RELOADED_AUTH_NOT_GRANTED",
      "Reloaded authorization is not granted"
    );


    requireCondition(
      reloadedRequest
        .planId ===
        authorizationEngineResult
          .executionPlan
          .planId &&
      reloadedRequest
        .planHash ===
        authorizationEngineResult
          .executionPlan
          .planHash,
      "PHASE21_BATCH8B_PLAN_BINDING_MISMATCH",
      "Execution request does not match immutable execution plan"
    );


    // =========================================================================
    // 12. REAL PHASE-20 EXECUTION
    // =========================================================================

    printSection(
      "REAL PHASE-20 AUTHORIZED KUBERNETES EXECUTION"
    );


    const integrationRuntime =
      new IntegrationRuntime();


    const authorizationReference = {
      incidentId,

      authorizationId:
        reloadedAuthorization
          .authorizationId,

      executionRequestId:
        reloadedRequest
          .executionRequestId,

      planId:
        reloadedRequest
          .planId,

      planHash:
        reloadedRequest
          .planHash,
    };


    const runtimeResult =
      await integrationRuntime
        .executeCapability(
          {
            organizationId:
              configuration
                .organizationId,

            environmentId:
              configuration
                .environmentId,

            integrationId:
              temporaryConnection
                .publicId,

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
                configuration
                  .namespace,

              deploymentName:
                configuration
                  .deployment,
            },

            executionAuthorized:
              false,
          },

          authorizationReference
        );


    requireCondition(
      runtimeResult,
      "PHASE21_BATCH8B_RUNTIME_RESULT_MISSING",
      "IntegrationRuntime returned no result"
    );


    requireCondition(
      runtimeResult
        .executionAuthorized !==
        true,
      "PHASE21_BATCH8B_RUNTIME_AUTHORITY_LEAK",
      "Integration result must remain non-authorizing"
    );


    console.log(
      `Runtime status:           ${formatNullable(
        runtimeResult.status
      )}`
    );

    console.log(
      `Runtime invocation:       ${formatNullable(
        runtimeResult.invocationId
      )}`
    );

    console.log(
      `Provider:                 ${formatNullable(
        runtimeResult.provider
      )}`
    );

    console.log(
      `Operation:                ${formatNullable(
        runtimeResult.operation
      )}`
    );

    console.log(
      `Runtime authority:        ${Boolean(
        runtimeResult.executionAuthorized
      )}`
    );


    // =========================================================================
    // 13. INDEPENDENT KUBERNETES VERIFICATION
    // =========================================================================

    printSection(
      "INDEPENDENT KUBERNETES VERIFICATION"
    );


    const after =
      await waitForReplacementReadyPod({
        context:
          configuration.context,

        namespace:
          configuration.namespace,

        deployment:
          configuration.deployment,

        previousUid:
          before.uid,

        timeoutMs:
          90_000,
      });


    requireCondition(
      after,
      "PHASE21_BATCH8B_REPLACEMENT_NOT_OBSERVED",
      "Replacement Ready pod was not independently observed"
    );


    requireCondition(
      after.uid !==
        before.uid,
      "PHASE21_BATCH8B_POD_UID_UNCHANGED",
      "Deployment restart did not replace pod UID"
    );


    requireCondition(
      after.ready ===
        true,
      "PHASE21_BATCH8B_REPLACEMENT_NOT_READY",
      "Replacement pod did not reach Ready state"
    );


    console.log(
      `Pod before:               ${before.name}`
    );

    console.log(
      `UID before:               ${before.uid}`
    );

    console.log(
      `Pod after:                ${after.name}`
    );

    console.log(
      `UID after:                ${after.uid}`
    );

    console.log(
      `Ready after:              ${after.ready}`
    );

    console.log(
      `UID changed:              ${after.uid !== before.uid}`
    );


    // =========================================================================
    // 14. PHASE-21 POSITIVE SAFETY EVALUATION
    // =========================================================================

    printSection(
      "21.16 POSITIVE EXECUTION SAFETY EVALUATION"
    );


    const positiveEvaluator =
      new PositiveExecutionSafetyEvaluator();


    const evaluation =
      positiveEvaluator
        .evaluate({
          authorizationResult: {
            authorizationGranted:
              true,

            executionStarted:
              false,

            authorization:
              reloadedAuthorization,

            executionPlan:
              authorizationEngineResult
                .executionPlan,
          },

          executionResult: {
            status:
              "SUCCEEDED",

            success:
              true,

            executed:
              true,

            providerResult:
              runtimeResult,

            before,

            after,
          },

          integrationResult:
            runtimeResult,
        });


    console.log(
      `Evaluation:               ${evaluation.result}`
    );

    console.log(
      `Canonical auth observed:  ${evaluation.canonicalAuthorizationObserved}`
    );

    console.log(
      `Execution plan observed:  ${evaluation.executionPlanObserved}`
    );

    console.log(
      `Controlled execution:     ${evaluation.controlledExecutionObserved}`
    );

    console.log(
      `Failures:                 ${JSON.stringify(
        evaluation.failures
      )}`
    );

    console.log(
      `Phase21 authority:        ${evaluation.executionAuthorized}`
    );


    requireCondition(
      evaluation.result ===
        "PASS",
      "PHASE21_BATCH8B_POSITIVE_EVALUATION_FAILED",
      `Positive execution evaluator failed: ${JSON.stringify(
        evaluation.failures
      )}`
    );


    // =========================================================================
    // 15. FINAL LAB SAFETY
    // =========================================================================

    printSection(
      "FINAL LAB SAFETY"
    );


    const finalLab =
      await reliabilityRepository
        .getLabEnvironment({
          organizationId:
            configuration
              .organizationId,

          environmentId:
            configuration
              .environmentId,

          labEnvironmentId:
            configuration
              .labEnvironmentId,
        });


    requireCondition(
      finalLab &&
      String(
        finalLab.status ||
        ""
      )
        .trim()
        .toUpperCase() ===
        "AVAILABLE",
      "PHASE21_BATCH8B_FINAL_LAB_NOT_AVAILABLE",
      `Final lab status=${finalLab?.status || "NONE"}`
    );


    requireCondition(
      finalLab.production !==
        true &&
      finalLab.executionAuthorized !==
        true,
      "PHASE21_BATCH8B_FINAL_LAB_UNSAFE",
      "Final lab safety invariant failed"
    );


    console.log(
      `Final lab status:         ${finalLab.status}`
    );

    console.log(
      `Production:               ${Boolean(
        finalLab.production
      )}`
    );

    console.log(
      `Phase21 authority:        ${Boolean(
        finalLab.executionAuthorized
      )}`
    );


    // =========================================================================
    // 16. ARTIFACT
    // =========================================================================

    const artifact = {
      certificateVersion:
        CERTIFICATE_VERSION,

      certifiedAt:
        new Date()
          .toISOString(),

      phase:
        "21.16",

      batch:
        "8B",

      certificationType:
        "LIVE_POSITIVE_AUTHORIZED_LAB_EXECUTION",

      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      tenantId:
        configuration
          .tenantId,

      labEnvironmentId:
        configuration
          .labEnvironmentId,

      incidentId,

      integrationId:
        temporaryConnection
          .publicId,

      capability:
        CAPABILITY,

      runtimeCapability:
        RUNTIME_CAPABILITY,

      tenantGovernanceObserved:
        true,

      tenantGovernanceAllowExecution:
        true,

      recoveryDecisionId:
        persistedRecoveryDecision
          .decisionId,

      recoveryDecisionRevision:
        recoveryRevision,

      recoveryDecisionIsCurrent:
        false,

      selectedCandidateId:
        candidateId,

      selectedPlaybookId:
        playbookId,

      authorizationId:
        reloadedAuthorization
          .authorizationId,

      executionRequestId:
        reloadedRequest
          .executionRequestId,

      planId:
        reloadedRequest
          .planId,

      planHash:
        reloadedRequest
          .planHash,

      podBefore:
        before,

      podAfter:
        after,

      replacementObserved:
        after.uid !==
        before.uid,

      replacementReady:
        after.ready ===
        true,

      evaluation,

      groundTruthToAira:
        false,

      productionCertified:
        false,

      phase21ExecutionAuthorized:
        false,

      canonicalExecutionAuthorizationObserved:
        true,

      passed:
        true,
    };


    const artifactPath =
      writeArtifact(
        artifact
      );


    console.log(
      ""
    );

    console.log(
      "=============================================================="
    );

    console.log(
      "PHASE 21.16 BATCH-8B LIVE RESULT: PASS"
    );

    console.log(
      "=============================================================="
    );

    console.log(
      `Certificate:              ${CERTIFICATE_VERSION}`
    );

    console.log(
      `Incident ID:              ${incidentId}`
    );

    console.log(
      `Recovery decision:        ${persistedRecoveryDecision.decisionId}`
    );

    console.log(
      `Recovery revision:        ${recoveryRevision}`
    );

    console.log(
      `Selected playbook:        ${playbookId}`
    );

    console.log(
      `Authorization ID:         ${reloadedAuthorization.authorizationId}`
    );

    console.log(
      `Execution request:        ${reloadedRequest.executionRequestId}`
    );

    console.log(
      `Plan ID:                  ${reloadedRequest.planId}`
    );

    console.log(
      `Capability:               ${CAPABILITY}`
    );

    console.log(
      "TENANT_GOVERNANCE:        PASS"
    );

    console.log(
      "CANONICAL_AUTHORIZATION:  PASS"
    );

    console.log(
      "AUTHORIZATION_CRITIC:     PASS"
    );

    console.log(
      "POSTGRES_PERSISTENCE:     PASS"
    );

    console.log(
      "PHASE20_BOUNDARY:         PASS"
    );

    console.log(
      "REAL_K8S_EXECUTION:       PASS"
    );

    console.log(
      "INDEPENDENT_OBSERVATION:  PASS"
    );

    console.log(
      "EXECUTION_SAFETY:         PASS"
    );

    console.log(
      "Ground truth leaked:      false"
    );

    console.log(
      "Production certified:     false"
    );

    console.log(
      "Phase21 authorized:       false"
    );

    console.log(
      `Final lab status:         ${finalLab.status}`
    );

    console.log(
      `Artifact:                 ${artifactPath}`
    );

    console.log(
      ""
    );

    console.log(
      "BATCH 8B STATUS: LIVE CERTIFIED / PASS"
    );

    console.log(
      "BATCH 8 READY TO FREEZE AFTER REGRESSION"
    );
  } finally {
  // ==========================================================================
  // CLEAN UP TEMPORARY GOVERNANCE
  // ==========================================================================

  if (
    temporaryGovernanceCreated &&
    temporaryConnection
      ?.publicId
  ) {
    await deleteTemporaryGovernance({
      scope:
        governanceScope,

      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      integrationId:
        temporaryConnection
          .publicId,
    })
      .catch(
        error => {
          console.error(
            `[Batch8B cleanup] Temporary governance cleanup failed: ${error.message}`
          );
        }
      );
  }


  // ==========================================================================
  // RETIRE TEMPORARY CONNECTION
  // ==========================================================================

  /*
   * DO NOT DELETE THIS CONNECTION.
   *
   * Phase-20 invocation audit is intentionally append-only.
   *
   * Once an execution invocation references an integration connection,
   * deleting that connection would either:
   *
   * 1. mutate historical invocation audit via FK SET NULL, or
   * 2. violate the FK entirely.
   *
   * Both are undesirable.
   *
   * Correct lifecycle:
   *
   * temporary active connection
   *      ↓
   * revoke credential
   *      ↓
   * disable connection
   *      ↓
   * preserve immutable audit lineage
   *
   * This also means Batch-8B evidence retains a stable historical
   * integration identity.
   */

  if (
    temporaryConnection
      ?.id
  ) {
    await integrationConnectionStore
      .revokeCredential({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        connectionId:
          temporaryConnection
            .id,
      })
      .catch(
        error => {
          console.error(
            `[Batch8B cleanup] Temporary credential revocation failed: ${error.message}`
          );
        }
      );


    await integrationConnectionStore
      .updateConnection({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        connectionId:
          temporaryConnection
            .id,

        patch: {
          status:
            "disabled",

          healthStatus:
            "unknown",

          disabledAt:
            new Date(),

          disabledReason:
            "Phase 21.16 Batch-8B live certification completed",

          /*
           * Remove operational capability from the retired connection.
           */
          capabilities:
            [],

          nonSecretConfig: {
            phase21ReliabilityLab:
              true,

            safetyClass:
              "LAB_ONLY",

            retired:
              true,

            retiredAt:
              new Date()
                .toISOString(),

            allowedNamespaces:
              [],

            allowedDeployments:
              [],

            allowedExecutionCapabilities:
              [],
          },

          metadata: {
            phase:
              "21.16",

            batch:
              "8B",

            temporary:
              true,

            retired:
              true,

            retiredAt:
              new Date()
                .toISOString(),

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
            `[Batch8B cleanup] Temporary integration retirement failed: ${error.message}`
          );
        }
      );
  }
}
}


// ============================================================================
// TEMPORARY GOVERNANCE CLEANUP
// ============================================================================

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
          resolved
            .organizationUuid,

          resolved
            .environmentUuid,

          String(
            integrationId
          ),
        ]
      );


      return true;
    }
  );
}


// ============================================================================
// RECOVERY REVISION
// ============================================================================

async function getNextRecoveryDecisionRevision({
  repository,
  organizationId,
  environmentId,
  incidentId,
}) {
  const scope = {
    organizationId,

    environmentId,

    incidentId,
  };


  return repository
    .scope
    .run(
      scope,

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


        requireCondition(
          incident,
          "PHASE21_BATCH8B_REVISION_INCIDENT_NOT_FOUND",
          "Could not resolve incident while allocating recovery revision"
        );


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
            result.rows[0]
              ?.max_revision ||
            0
          );


        requireCondition(
          Number.isSafeInteger(
            maxRevision
          ) &&
          maxRevision >=
            0,
          "PHASE21_BATCH8B_RECOVERY_REVISION_INVALID",
          `Invalid existing recovery revision: ${result.rows[0]?.max_revision}`
        );


        return maxRevision +
          1;
      }
    );
}


// ============================================================================
// CONFIGURATION
// ============================================================================

function loadConfiguration() {
  return Object.freeze({
    organizationId:
      process.env
        .PHASE21_ORGANIZATION_ID ||
      DEFAULTS
        .organizationId,

    environmentId:
      process.env
        .PHASE21_ENVIRONMENT_ID ||
      DEFAULTS
        .environmentId,

    tenantId:
      process.env
        .PHASE21_TENANT_ID ||
      DEFAULTS
        .tenantId,

    labEnvironmentId:
      process.env
        .PHASE21_LAB_ENVIRONMENT_ID ||
      DEFAULTS
        .labEnvironmentId,

    incidentId:
      process.env
        .PHASE21_BATCH8_INCIDENT_ID ||
      DEFAULTS
        .incidentId,

    namespace:
      process.env
        .PHASE21_BATCH8_NAMESPACE ||
      DEFAULTS
        .namespace,

    deployment:
      process.env
        .PHASE21_BATCH8_DEPLOYMENT ||
      DEFAULTS
        .deployment,

    context:
      process.env
        .PHASE21_KIND_CONTEXT ||
      DEFAULTS
        .context,
  });
}


// ============================================================================
// ENVIRONMENT SAFETY
// ============================================================================

function assertEnvironmentSafety() {
  requireCondition(
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "true",
    "PHASE21_BATCH8B_LAB_FLAG_REQUIRED",
    "AIRA_RELIABILITY_LAB=true is required"
  );


  requireCondition(
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "postgres",
    "PHASE21_BATCH8B_POSTGRES_REQUIRED",
    "PERSISTENCE_PROVIDER=postgres is required"
  );


  requireCondition(
    String(
      process.env
        .NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() !==
      "production",
    "PHASE21_BATCH8B_PRODUCTION_FORBIDDEN",
    "Batch-8B cannot execute with NODE_ENV=production"
  );
}


// ============================================================================
// KUBERNETES
// ============================================================================

function readKindKubeconfig(
  context
) {
  return execFileSync(
    "kubectl",
    [
      "--context",
      context,

      "config",
      "view",

      "--raw",

      "--minify",

      "-o",
      "yaml",
    ],

    {
      encoding:
        "utf8",

      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    }
  );
}


function getReadyPod({
  context,
  namespace,
  deployment,
}) {
  const selector =
    getDeploymentSelector({
      context,
      namespace,
      deployment,
    });


  const output =
    execFileSync(
      "kubectl",
      [
        "--context",
        context,

        "-n",
        namespace,

        "get",
        "pods",

        "-l",
        selector,

        "-o",
        "json",
      ],

      {
        encoding:
          "utf8",
      }
    );


  const parsed =
    JSON.parse(
      output
    );


  const pods =
    Array.isArray(
      parsed.items
    )
      ? parsed.items
      : [];


  const ready =
    pods.find(
      pod =>
        pod
          ?.status
          ?.phase ===
          "Running" &&
        Array.isArray(
          pod
            ?.status
            ?.conditions
        ) &&
        pod
          .status
          .conditions
          .some(
            condition =>
              condition
                ?.type ===
                "Ready" &&
              condition
                ?.status ===
                "True"
          )
    );


  if (
    !ready
  ) {
    return null;
  }


  return {
    name:
      ready
        ?.metadata
        ?.name ||
      null,

    uid:
      ready
        ?.metadata
        ?.uid ||
      null,

    ready:
      true,
  };
}


function getDeploymentSelector({
  context,
  namespace,
  deployment,
}) {
  const output =
    execFileSync(
      "kubectl",
      [
        "--context",
        context,

        "-n",
        namespace,

        "get",
        "deployment",
        deployment,

        "-o",
        "json",
      ],

      {
        encoding:
          "utf8",
      }
    );


  const parsed =
    JSON.parse(
      output
    );


  const matchLabels =
    parsed
      ?.spec
      ?.selector
      ?.matchLabels ||
    {};


  const entries =
    Object.entries(
      matchLabels
    );


  requireCondition(
    entries.length >
      0,
    "PHASE21_BATCH8B_DEPLOYMENT_SELECTOR_MISSING",
    "Deployment has no matchLabels selector"
  );


  return entries
    .map(
      (
        [
          key,
          value,
        ]
      ) =>
        `${key}=${value}`
    )
    .join(
      ","
    );
}


async function waitForReplacementReadyPod({
  context,
  namespace,
  deployment,
  previousUid,
  timeoutMs,
}) {
  const deadline =
    Date.now() +
    timeoutMs;


  while (
    Date.now() <
    deadline
  ) {
    try {
      const pod =
        getReadyPod({
          context,
          namespace,
          deployment,
        });


      if (
        pod &&
        pod.uid &&
        pod.uid !==
          previousUid &&
        pod.ready ===
          true
      ) {
        return pod;
      }
    } catch {
      // Deployment may temporarily have no Ready pod during rollout.
    }


    await sleep(
      2000
    );
  }


  return null;
}


// ============================================================================
// HELPERS
// ============================================================================

function sleep(
  ms
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function printHeader(
  configuration
) {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.16 BATCH-8B LIVE CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Authorization engine:      canonical"
  );

  console.log(
    "Authorization critic:      canonical"
  );

  console.log(
    "Authorization persistence: canonical PostgreSQL"
  );

  console.log(
    "Tenant governance:         canonical PostgreSQL"
  );

  console.log(
    "Integration runtime:       Phase 20 canonical"
  );

  console.log(
    "Provider:                  Kubernetes"
  );

  console.log(
    "Infrastructure:            real kind"
  );

  console.log(
    "Safety class:              LAB_ONLY"
  );

  console.log(
    "Ground truth to AIRA:      false"
  );

  console.log(
    "Production certified:      false"
  );

  console.log(
    "Phase21 authorized:        false"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    ""
  );

  console.log(
    `Organization:             ${configuration.organizationId}`
  );

  console.log(
    `Environment:              ${configuration.environmentId}`
  );

  console.log(
    `Lab:                      ${configuration.labEnvironmentId}`
  );

  console.log(
    `Incident:                 ${configuration.incidentId}`
  );

  console.log(
    `Namespace:                ${configuration.namespace}`
  );

  console.log(
    `Deployment:               ${configuration.deployment}`
  );

  console.log(
    `Kind context:             ${configuration.context}`
  );
}


function printSection(
  title
) {
  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    title
  );

  console.log(
    "--------------------------------------------------------------"
  );
}


function formatNullable(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return "NOT_OBSERVED";
  }


  if (
    typeof value ===
      "object"
  ) {
    return JSON.stringify(
      value
    );
  }


  return String(
    value
  );
}


function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw certificationError(
    code,
    message
  );
}


function certificationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase21Batch8BLiveCertificationError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


function writeArtifact(
  artifact
) {
  const directory =
    path.resolve(
      __dirname,
      "../artifacts/phase21"
    );


  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /:/g,
        "-"
      );


  const artifactPath =
    path.join(
      directory,
      `phase21-batch8b-live-certification-${timestamp}.json`
    );


  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      artifact,
      null,
      2
    ),
    "utf8"
  );


  return artifactPath;
}


// ============================================================================
// MAIN
// ============================================================================

main()
  .then(
    () => {
      process.exitCode =
        0;
    }
  )
  .catch(
    error => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "PHASE 21.16 BATCH-8B LIVE RESULT: FAIL"
      );

      console.error(
        "=============================================================="
      );

      console.error(
        `Code: ${error.code || "UNEXPECTED_ERROR"}`
      );

      console.error(
        error.message
      );

      console.error(
        ""
      );

      console.error(
        "Production certified: false"
      );

      console.error(
        "Phase21 authorized: false"
      );


      process.exitCode =
        1;
    }
  );