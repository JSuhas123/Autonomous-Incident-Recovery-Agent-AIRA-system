"use strict";


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  ensurePhase21LabService,
  verifyPhase21LabSignalOwnership,
} =
  require(
    "../services/reliability/phase21LabServiceOwnership"
  );


async function main() {
  const organizationId =
    process.env
      .PHASE21_ORGANIZATION_ID ||
    "aira-dev-org";


  const environmentId =
    process.env
      .PHASE21_ENVIRONMENT_ID ||
    "env_aira_development";


  const tenantId =
    process.env
      .PHASE21_TENANT_ID ||
    organizationId;


  const labEnvironmentId =
    process.env
      .PHASE21_LAB_ENVIRONMENT_ID;


  if (
    !labEnvironmentId
  ) {
    throw error(
      "PHASE21_LAB_ENVIRONMENT_ID_REQUIRED",
      "PHASE21_LAB_ENVIRONMENT_ID is required"
    );
  }


  if (
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase() !==
      "true"
  ) {
    throw error(
      "PHASE21_RELIABILITY_LAB_FLAG_REQUIRED",
      "AIRA_RELIABILITY_LAB=true is required"
    );
  }


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.13 + 21.14 BATCH-7 LIVE PREPARATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Organization:          ${organizationId}`
  );

  console.log(
    `Environment:           ${environmentId}`
  );

  console.log(
    `Tenant:                ${tenantId}`
  );

  console.log(
    `Lab environment:       ${labEnvironmentId}`
  );

  console.log(
    "Persistence:           PostgreSQL required"
  );

  console.log(
    "Infrastructure change: NONE"
  );

  console.log(
    "Execution authorized:  false"
  );

  console.log(
    ""
  );


  const repository =
    new PostgresReliabilityLabRepository();


  const lab =
    await repository
      .getLabEnvironment({
        organizationId,

        environmentId,

        labEnvironmentId,
      });


  if (
    !lab
  ) {
    throw error(
      "PHASE21_LAB_ENVIRONMENT_NOT_FOUND",
      "Canonical Reliability Lab environment was not found"
    );
  }


  if (
    lab.status !==
      "AVAILABLE"
  ) {
    throw error(
      "PHASE21_LAB_NOT_AVAILABLE",
      `Lab must be AVAILABLE; received ${lab.status}`
    );
  }


  if (
    lab.production ===
      true
  ) {
    throw error(
      "PHASE21_PRODUCTION_TARGET_FORBIDDEN",
      "Batch 7 preparation refuses production environments"
    );
  }


  if (
    lab.executionAuthorized ===
      true
  ) {
    throw error(
      "PHASE21_AUTHORITY_VIOLATION",
      "Reliability Lab environment unexpectedly authorizes execution"
    );
  }


  console.log(
    "LAB SAFETY"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Status:                ${lab.status}`
  );

  console.log(
    `Safety class:          ${lab.safetyClass}`
  );

  console.log(
    `Production:            ${lab.production}`
  );

  console.log(
    `Execution authorized:  ${lab.executionAuthorized}`
  );

  console.log(
    ""
  );


  const ownership =
    await ensurePhase21LabService({
      organizationId,

      environmentId,

      tenantId,

      serviceName:
        "lab-api",

      serviceSlug:
        "lab-api",
    });


  console.log(
    "CANONICAL LAB SERVICE"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Created:               ${ownership.created}`
  );

  console.log(
    `Service ID:            ${ownership.service.id}`
  );

  console.log(
    `Name:                  ${ownership.service.name}`
  );

  console.log(
    `Slug:                  ${ownership.service.slug}`
  );

  console.log(
    `Type:                  ${ownership.service.type}`
  );

  console.log(
    `Status:                ${ownership.service.status}`
  );

  console.log(
    `Canonical persistence: ${ownership.canonicalPersistence}`
  );

  console.log(
    `Execution authorized:  ${ownership.executionAuthorized}`
  );

  console.log(
    ""
  );


  const resolution =
    await verifyPhase21LabSignalOwnership({
      organizationId,

      environmentId,

      tenantId,

      serviceId:
        ownership.service.id,

      serviceName:
        ownership.service.name,
    });


  console.log(
    "SIGNAL OWNERSHIP RESOLUTION"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Resolved:              ${resolution.resolved}`
  );

  console.log(
    `Service ID:            ${resolution.serviceId}`
  );

  console.log(
    `Service name:          ${resolution.serviceName}`
  );

  console.log(
    `Service type:          ${resolution.serviceType}`
  );

  console.log(
    `Execution authorized:  ${resolution.executionAuthorized}`
  );

  console.log(
    ""
  );


  if (
    resolution.resolved !==
      true
  ) {
    throw error(
      "PHASE21_BATCH7_SERVICE_RESOLUTION_FAILED",
      "Canonical lab-api service resolution did not pass"
    );
  }


  console.log(
    "=============================================================="
  );

  console.log(
    "BATCH-7 LIVE PREPARATION: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `PHASE21_BATCH7_SERVICE_ID=${ownership.service.id}`
  );

  console.log(
    "Incident ownership path: READY"
  );

  console.log(
    "Infrastructure mutated:  false"
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Execution authorized:     false"
  );

  console.log(
    ""
  );
}


function error(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


if (
  require.main ===
  module
) {
  main()
    .catch(
      (
        failure
      ) => {
        console.error(
          ""
        );

        console.error(
          "=============================================================="
        );

        console.error(
          "BATCH-7 LIVE PREPARATION: FAIL"
        );

        console.error(
          "=============================================================="
        );

        console.error(
          `Code: ${failure.code || "UNKNOWN"}`
        );

        console.error(
          failure.message
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


        process.exitCode =
          1;
      }
    );
}


module.exports = {
  main,
};