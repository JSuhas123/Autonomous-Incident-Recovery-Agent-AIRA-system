"use strict";


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  FailureScenarioRegistry,
} =
  require(
    "../services/reliability/failureScenarioRegistry"
  );


const {
  validateExperimentDefinition,
} =
  require(
    "../contracts/reliability/experimentContract"
  );


const {
  EXPERIMENT_ASSERTION,
} =
  require(
    "../constants/reliabilityLab"
  );


const SEED_VERSION =
  "phase21-experiment-definition-seed-v1";


function requireEnvironment(
  name
) {
  const value =
    process.env[name];


  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    const error =
      new Error(
        `${name} is required`
      );


    error.code =
      `PHASE21_${name}_REQUIRED`;


    throw error;
  }


  return value.trim();
}


function assertionsForScenario(
  scenario
) {
  const assertions =
    [
      EXPERIMENT_ASSERTION
        .BASELINE_HEALTHY,

      EXPERIMENT_ASSERTION
        .FAILURE_INJECTED,

      EXPERIMENT_ASSERTION
        .FAILURE_OBSERVABLE,

      EXPERIMENT_ASSERTION
        .DETECTED,

      EXPERIMENT_ASSERTION
        .CORRELATED,

      EXPERIMENT_ASSERTION
        .DIAGNOSIS_CORRECT,

      EXPERIMENT_ASSERTION
        .RECOVERY_SELECTION_CORRECT,

      EXPERIMENT_ASSERTION
        .PARAMETERS_CORRECT,

      EXPERIMENT_ASSERTION
        .POLICY_RESPECTED,

      EXPERIMENT_ASSERTION
        .APPROVAL_RESPECTED,

      EXPERIMENT_ASSERTION
        .AUTHORIZATION_RESPECTED,

      EXPERIMENT_ASSERTION
        .EXECUTION_TARGET_CORRECT,

      EXPERIMENT_ASSERTION
        .EXECUTION_CAPABILITY_CORRECT,

      EXPERIMENT_ASSERTION
        .NO_DUPLICATE_EXECUTION,

      EXPERIMENT_ASSERTION
        .NO_CROSS_TENANT_ACTION,

      EXPERIMENT_ASSERTION
        .NO_OUT_OF_LAB_MUTATION,

      EXPERIMENT_ASSERTION
        .VERIFICATION_CORRECT,

      EXPERIMENT_ASSERTION
        .ROLLBACK_CORRECT,

      EXPERIMENT_ASSERTION
        .RESET_SUCCEEDED,
    ];


  return assertions.filter(
    Boolean
  );
}


function buildExperimentDefinition(
  {
    scenario,

    organizationId,

    environmentId,
  }
) {
  return {
    organizationId,

    environmentId,

    experimentKey:
      scenario.failureKey,

    version:
      scenario.version,

    name:
      scenario.name,

    description:
      [
        "Phase 21 Reliability Lab experiment generated",
        "from the canonical Failure Scenario Registry.",
        "Ground truth is evaluator-only.",
      ].join(
        " "
      ),

    failureDomain:
      scenario.domain,

    failureType:
      scenario.failureType,

    targetResourceType:
      scenario.targetResourceType,

    groundTruth:
      scenario.groundTruth,

    assertions:
      assertionsForScenario(
        scenario
      ),

    configuration:
      {
        seedVersion:
          SEED_VERSION,

        registryVersion:
          scenario.registryVersion,

        failureKey:
          scenario.failureKey,

        scenarioVersion:
          scenario.version,

        injector:
          scenario.injector,

        risk:
          scenario.risk,

        destructive:
          scenario.destructive,

        reversible:
          scenario.reversible,

        supportedLabTypes:
          scenario.supportedLabTypes,

        evaluatorGroundTruthOnly:
          true,

        productionCertified:
          false,

        executionAuthorized:
          false,
      },

    enabled:
      true,

    executionAuthorized:
      false,
  };
}


async function seedScenario(
  {
    repository,

    scenario,

    organizationId,

    environmentId,
  }
) {
  const existing =
    await repository
      .getExperimentDefinition(
        {
          organizationId,

          environmentId,

          experimentKey:
            scenario.failureKey,

          version:
            scenario.version,
        }
      );


  if (
    existing
  ) {
    console.log(
      [
        "EXISTS",
        `${scenario.failureKey}@${scenario.version}`,
        existing.publicId,
      ].join(
        " | "
      )
    );


    return {
      action:
        "EXISTS",

      experimentKey:
        scenario.failureKey,

      version:
        scenario.version,

      publicId:
        existing.publicId,

      executionAuthorized:
        existing.executionAuthorized,
    };
  }


  const definition =
    buildExperimentDefinition(
      {
        scenario,

        organizationId,

        environmentId,
      }
    );


  validateExperimentDefinition(
    definition
  );


  const created =
    await repository
      .createExperimentDefinition(
        definition
      );


  if (
    created.executionAuthorized ===
    true
  ) {
    throw new Error(
      `Experiment definition ${scenario.failureKey}@${scenario.version} unexpectedly authorizes execution`
    );
  }


  console.log(
    [
      "CREATED",
      `${scenario.failureKey}@${scenario.version}`,
      created.publicId,
    ].join(
      " | "
    )
  );


  return {
    action:
      "CREATED",

    experimentKey:
      scenario.failureKey,

    version:
      scenario.version,

    publicId:
      created.publicId,

    executionAuthorized:
      false,
  };
}


async function main() {
  const organizationId =
    requireEnvironment(
      "PHASE21_ORGANIZATION_ID"
    );


  const environmentId =
    requireEnvironment(
      "PHASE21_ENVIRONMENT_ID"
    );


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21 - EXPERIMENT DEFINITION SEED"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Organization:         ${organizationId}`
  );

  console.log(
    `Environment:          ${environmentId}`
  );

  console.log(
    "Source:               Failure Scenario Registry"
  );

  console.log(
    "Ground truth:         EVALUATOR_ONLY"
  );

  console.log(
    "Production certified: false"
  );

  console.log(
    "Execution authorized: false"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    ""
  );


  const repository =
    new PostgresReliabilityLabRepository();


  const registry =
    new FailureScenarioRegistry();


  const scenarios =
    registry.list(
      {
        includeEvaluatorGroundTruth:
          true,
      }
    );


  if (
    !Array.isArray(
      scenarios
    ) ||
    scenarios.length ===
      0
  ) {
    throw new Error(
      "Failure Scenario Registry returned no scenarios"
    );
  }


  const results =
    [];


  for (
    const scenario
    of scenarios
  ) {
    if (
      !scenario.groundTruth
    ) {
      throw new Error(
        `Evaluator ground truth missing for ${scenario.failureKey}@${scenario.version}`
      );
    }


    const result =
      await seedScenario(
        {
          repository,

          scenario,

          organizationId,

          environmentId,
        }
      );


    results.push(
      result
    );
  }


  const podCrash =
    await repository
      .getExperimentDefinition(
        {
          organizationId,

          environmentId,

          experimentKey:
            "kubernetes.pod.crash",

          version:
            1,
        }
      );


  if (
    !podCrash
  ) {
    const error =
      new Error(
        "kubernetes.pod.crash@1 was not persisted"
      );


    error.code =
      "PHASE21_POD_CRASH_EXPERIMENT_MISSING";


    throw error;
  }


  if (
    podCrash.executionAuthorized ===
    true
  ) {
    throw new Error(
      "Canonical experiment definition unexpectedly authorizes execution"
    );
  }


  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "BATCH-6 REQUIRED DEFINITION"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Experiment:           ${podCrash.experimentKey}@${podCrash.version}`
  );

  console.log(
    `Definition ID:        ${podCrash.publicId}`
  );

  console.log(
    `Failure domain:       ${podCrash.failureDomain}`
  );

  console.log(
    `Failure type:         ${podCrash.failureType}`
  );

  console.log(
    `Target type:          ${podCrash.targetResourceType}`
  );

  console.log(
    `Enabled:              ${podCrash.enabled}`
  );

  console.log(
    `Execution authorized: ${podCrash.executionAuthorized}`
  );


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21 EXPERIMENT DEFINITION SEED: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Definitions checked:  ${results.length}`
  );

  console.log(
    "Canonical PG:         reliability.experiment_definitions"
  );

  console.log(
    "Versioned:            true"
  );

  console.log(
    "Immutable:            true"
  );

  console.log(
    "Execution authorized: false"
  );

  console.log(
    ""
  );
}


main()
  .then(
    () => {
      process.exit(
        0
      );
    }
  )
  .catch(
    (
      error
    ) => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "PHASE 21 EXPERIMENT DEFINITION SEED: FAIL"
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
        "Execution authorized: false"
      );


      process.exit(
        1
      );
    }
  );