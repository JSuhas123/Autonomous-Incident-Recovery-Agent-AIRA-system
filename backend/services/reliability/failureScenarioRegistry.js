"use strict";

const path =
  require(
    "path"
  );


const fs =
  require(
    "fs"
  );


const {
  FAILURE_DOMAIN,

  FAILURE_TYPE,

  LAB_ENVIRONMENT_KIND,
} =
  require(
    "../../constants/reliabilityLab"
  );


const FAILURE_SCENARIO_REGISTRY_VERSION =
  "21.8-v1";


const FAILURE_RISK =
  Object.freeze({
    LOW:
      "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",
  });


const DEFAULT_REGISTRY_PATH =
  path.resolve(
    __dirname,
    "../../../reliability-lab/scenarios/failure-scenarios.json"
  );


class FailureScenarioRegistry {
  constructor(
    options =
      {}
  ) {
    this.registryPath =
      options.registryPath ||
      DEFAULT_REGISTRY_PATH;


    this.scenarios =
      loadScenarioFile(
        this.registryPath
      );


    validateRegistry(
      this.scenarios
    );


    this.byKey =
      new Map();


    for (
      const scenario
      of this.scenarios
    ) {
      const compositeKey =
        scenarioVersionKey(
          scenario.failureKey,
          scenario.version
        );


      this.byKey.set(
        compositeKey,
        deepFreeze(
          deepClone(
            scenario
          )
        )
      );
    }
  }


  list({
    labKind =
      null,

    includeEvaluatorGroundTruth =
      false,
  } = {}) {
    if (
      labKind !==
      null
    ) {
      requireLabKind(
        labKind
      );
    }


    return this.scenarios
      .filter(
        (
          scenario
        ) =>
          !labKind ||
          scenario
            .supportedLabTypes
            .includes(
              labKind
            )
      )
      .map(
        (
          scenario
        ) =>
          includeEvaluatorGroundTruth
            ? buildEvaluatorDescriptor(
                scenario
              )
            : buildPublicDescriptor(
                scenario
              )
      );
  }


  get(
    failureKey,
    version =
      1
  ) {
    requireString(
      failureKey,
      "failureKey"
    );


    requirePositiveInteger(
      version,
      "version"
    );


    const scenario =
      this.byKey.get(
        scenarioVersionKey(
          failureKey,
          version
        )
      );


    if (
      !scenario
    ) {
      return null;
    }


    return buildPublicDescriptor(
      scenario
    );
  }


  getEvaluatorScenario(
    failureKey,
    version =
      1
  ) {
    requireString(
      failureKey,
      "failureKey"
    );


    requirePositiveInteger(
      version,
      "version"
    );


    const scenario =
      this.byKey.get(
        scenarioVersionKey(
          failureKey,
          version
        )
      );


    if (
      !scenario
    ) {
      return null;
    }


    return buildEvaluatorDescriptor(
      scenario
    );
  }


  requireScenario(
    failureKey,
    version =
      1
  ) {
    const scenario =
      this.get(
        failureKey,
        version
      );


    if (
      !scenario
    ) {
      throw registryError(
        "FAILURE_SCENARIO_NOT_FOUND",
        `Failure scenario ${failureKey}@${version} was not found`,
        {
          failureKey,

          version,
        }
      );
    }


    return scenario;
  }


  assertSupportedByLab(
    {
      failureKey,

      version =
        1,

      labKind,
    }
  ) {
    requireLabKind(
      labKind
    );


    const scenario =
      this.getEvaluatorScenario(
        failureKey,
        version
      );


    if (
      !scenario
    ) {
      throw registryError(
        "FAILURE_SCENARIO_NOT_FOUND",
        `Failure scenario ${failureKey}@${version} was not found`
      );
    }


    if (
      !scenario
        .supportedLabTypes
        .includes(
          labKind
        )
    ) {
      throw registryError(
        "FAILURE_SCENARIO_LAB_KIND_UNSUPPORTED",
        `${failureKey}@${version} does not support lab kind ${labKind}`,
        {
          failureKey,

          version,

          labKind,
        }
      );
    }


    return {
      supported:
        true,

      failureKey,

      version,

      labKind,

      executionAuthorized:
        false,
    };
  }
}


function loadScenarioFile(
  registryPath
) {
  if (
    !fs.existsSync(
      registryPath
    )
  ) {
    throw registryError(
      "FAILURE_SCENARIO_FILE_NOT_FOUND",
      `Failure Scenario Registry file was not found: ${registryPath}`,
      {
        registryPath,
      }
    );
  }


  let parsed;


  try {
    parsed =
      JSON.parse(
        fs.readFileSync(
          registryPath,
          "utf8"
        )
      );
  } catch (
    error
  ) {
    throw registryError(
      "FAILURE_SCENARIO_FILE_INVALID",
      `Failure Scenario Registry JSON is invalid: ${error.message}`,
      {
        registryPath,
      }
    );
  }


  if (
    !Array.isArray(
      parsed
    )
  ) {
    throw registryError(
      "FAILURE_SCENARIO_REGISTRY_INVALID",
      "Failure Scenario Registry must be an array"
    );
  }


  return parsed;
}


function validateRegistry(
  scenarios
) {
  const seen =
    new Set();


  for (
    const scenario
    of scenarios
  ) {
    validateScenario(
      scenario
    );


    const key =
      scenarioVersionKey(
        scenario.failureKey,
        scenario.version
      );


    if (
      seen.has(
        key
      )
    ) {
      throw registryError(
        "FAILURE_SCENARIO_DUPLICATE",
        `Duplicate Failure Scenario Registry entry ${key}`,
        {
          key,
        }
      );
    }


    seen.add(
      key
    );
  }


  return {
    valid:
      true,

    count:
      scenarios.length,

    executionAuthorized:
      false,
  };
}


function validateScenario(
  scenario
) {
  requireString(
    scenario
      ?.failureKey,
    "failureKey"
  );


  requirePositiveInteger(
    scenario
      ?.version,
    "version"
  );


  requireString(
    scenario
      ?.name,
    "name"
  );


  requireEnum(
    scenario
      ?.domain,
    FAILURE_DOMAIN,
    "domain"
  );


  requireEnum(
    scenario
      ?.failureType,
    FAILURE_TYPE,
    "failureType"
  );


  requireString(
    scenario
      ?.targetResourceType,
    "targetResourceType"
  );


  requireEnum(
    scenario
      ?.risk,
    FAILURE_RISK,
    "risk"
  );


  if (
    typeof scenario
      ?.destructive !==
      "boolean"
  ) {
    throw registryError(
      "FAILURE_SCENARIO_DESTRUCTIVE_INVALID",
      "destructive must be boolean"
    );
  }


  if (
    typeof scenario
      ?.reversible !==
      "boolean"
  ) {
    throw registryError(
      "FAILURE_SCENARIO_REVERSIBLE_INVALID",
      "reversible must be boolean"
    );
  }


  if (
    !Array.isArray(
      scenario
        ?.supportedLabTypes
    ) ||
    scenario
      .supportedLabTypes
      .length ===
      0
  ) {
    throw registryError(
      "FAILURE_SCENARIO_LAB_TYPES_REQUIRED",
      "supportedLabTypes must contain at least one lab type"
    );
  }


  for (
    const labKind
    of scenario
      .supportedLabTypes
  ) {
    requireLabKind(
      labKind
    );
  }


  requireString(
    scenario
      ?.injector,
    "injector"
  );


  if (
    !scenario
      ?.groundTruth ||
    typeof scenario
      .groundTruth !==
      "object" ||
    Array.isArray(
      scenario
        .groundTruth
    )
  ) {
    throw registryError(
      "FAILURE_SCENARIO_GROUND_TRUTH_REQUIRED",
      "Evaluator-only groundTruth is required"
    );
  }


  requireString(
    scenario
      .groundTruth
      .expectedFailureModeKey,
    "groundTruth.expectedFailureModeKey"
  );


  if (
    scenario
      ?.executionAuthorized !==
      false
  ) {
    throw registryError(
      "FAILURE_SCENARIO_CANNOT_AUTHORIZE_EXECUTION",
      "Failure scenarios must explicitly remain non-authorizing"
    );
  }


  return {
    valid:
      true,

    failureKey:
      scenario
        .failureKey,

    version:
      scenario
        .version,

    executionAuthorized:
      false,
  };
}


function buildPublicDescriptor(
  scenario
) {
  return deepFreeze({
    registryVersion:
      FAILURE_SCENARIO_REGISTRY_VERSION,

    failureKey:
      scenario.failureKey,

    version:
      scenario.version,

    name:
      scenario.name,

    domain:
      scenario.domain,

    failureType:
      scenario.failureType,

    targetResourceType:
      scenario
        .targetResourceType,

    risk:
      scenario.risk,

    destructive:
      scenario.destructive,

    reversible:
      scenario.reversible,

    supportedLabTypes:
      [
        ...scenario
          .supportedLabTypes,
      ],

    evaluatorGroundTruthIncluded:
      false,

    injectorIncluded:
      false,

    executionAuthorized:
      false,
  });
}


function buildEvaluatorDescriptor(
  scenario
) {
  return deepFreeze({
    registryVersion:
      FAILURE_SCENARIO_REGISTRY_VERSION,

    failureKey:
      scenario.failureKey,

    version:
      scenario.version,

    name:
      scenario.name,

    domain:
      scenario.domain,

    failureType:
      scenario.failureType,

    targetResourceType:
      scenario
        .targetResourceType,

    risk:
      scenario.risk,

    destructive:
      scenario.destructive,

    reversible:
      scenario.reversible,

    supportedLabTypes:
      [
        ...scenario
          .supportedLabTypes,
      ],

    injector:
      scenario.injector,

    groundTruth:
      deepClone(
        scenario
          .groundTruth
      ),

    visibility:
      "EVALUATOR_ONLY",

    executionAuthorized:
      false,
  });
}


function scenarioVersionKey(
  failureKey,
  version
) {
  return `${failureKey}@${version}`;
}


function requireLabKind(
  value
) {
  requireEnum(
    value,
    LAB_ENVIRONMENT_KIND,
    "labKind"
  );
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw registryError(
      "FAILURE_SCENARIO_FIELD_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}


function requirePositiveInteger(
  value,
  field
) {
  if (
    !Number.isInteger(
      value
    ) ||
    value <=
      0
  ) {
    throw registryError(
      "FAILURE_SCENARIO_INTEGER_INVALID",
      `${field} must be a positive integer`,
      {
        field,
      }
    );
  }
}


function requireEnum(
  value,
  enumObject,
  field
) {
  if (
    !Object.values(
      enumObject
    ).includes(
      value
    )
  ) {
    throw registryError(
      "FAILURE_SCENARIO_ENUM_INVALID",
      `${field} is invalid`,
      {
        field,

        value,
      }
    );
  }
}


function deepClone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function deepFreeze(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  Object.values(
    value
  ).forEach(
    deepFreeze
  );


  return value;
}


function registryError(
  code,
  message,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "ReliabilityFailureScenarioRegistryError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  FAILURE_SCENARIO_REGISTRY_VERSION,

  FAILURE_RISK,

  DEFAULT_REGISTRY_PATH,

  FailureScenarioRegistry,

  loadScenarioFile,

  validateRegistry,

  validateScenario,

  registryError,
};