"use strict";

require("dotenv").config();


const PostgresIntegrationConnectionRepository =
  require(
    "../persistence/postgres/PostgresIntegrationConnectionRepository"
  );


const ORGANIZATION_ID =
  process.env
    .PHASE21_CERT_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .PHASE21_CERT_ENVIRONMENT_ID ||
  "env_aira_development";


const PROVIDER =
  "opentelemetry";


const CONNECTION_NAME =
  "Phase 21 Reliability Lab OpenTelemetry";


async function main() {
  console.log(
    "\n=============================================================="
  );

  console.log(
    "AIRA PHASE 21 OPENTELEMETRY LAB INTEGRATION BOOTSTRAP"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Organization: ${ORGANIZATION_ID}`
  );

  console.log(
    `Environment:  ${ENVIRONMENT_ID}`
  );

  console.log(
    `Provider:     ${PROVIDER}`
  );

  console.log(
    "Safety class: LAB_ONLY"
  );

  console.log(
    "Production:   false"
  );

  console.log(
    "Execution:    false"
  );

  console.log(
    "==============================================================\n"
  );


  const repository =
    new PostgresIntegrationConnectionRepository();


  const existing =
    await repository
      .listConnections({
        organizationId:
          ORGANIZATION_ID,

        environmentId:
          ENVIRONMENT_ID,

        provider:
          PROVIDER,

        limit:
          100,
      });


  const usable =
    existing.find(
      (
        connection
      ) =>
        connection &&
        connection.provider ===
          PROVIDER &&
        connection.status !==
          "disabled"
    );


  let connection;


  if (
    usable
  ) {
    connection =
      usable;


    console.log(
      "Existing OpenTelemetry integration found."
    );
  } else {
    console.log(
      "No existing OpenTelemetry integration found."
    );

    console.log(
      "Creating dedicated Phase 21 LAB_ONLY connection..."
    );


    connection =
      await repository
        .createConnection({
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          provider:
            PROVIDER,

          name:
            CONNECTION_NAME,

          externalAccountId:
            "phase21-reliability-lab",

          serviceIds: [],

          capabilities: [
            "receive_events",
            "normalize_events",
            "get_health",
            "query_metrics",
            "query_logs",
            "query_traces",
          ],

          nonSecretConfig: {
            transport:
              "http_json",

            maxBatchSize:
              10000,

            reliabilityLab:
              true,

            safetyClass:
              "LAB_ONLY",

            production:
              false,
          },

          status:
            "connected",

          healthStatus:
            "healthy",

          metadata: {
            phase:
              "21",

            subphase:
              "21.10B",

            purpose:
              "reliability_lab_capacity_certification",

            reliabilityLab:
              true,

            safetyClass:
              "LAB_ONLY",

            production:
              false,

            executionAuthorized:
              false,
          },
        });
  }


  if (
    !connection ||
    !connection.id
  ) {
    throw bootstrapError(
      "PHASE21_OTEL_CONNECTION_CREATE_FAILED",

      "OpenTelemetry lab integration did not return a canonical PostgreSQL ID"
    );
  }


  if (
    connection.provider !==
    PROVIDER
  ) {
    throw bootstrapError(
      "PHASE21_OTEL_PROVIDER_MISMATCH",

      `Expected provider ${PROVIDER}, received ${connection.provider}`
    );
  }


  if (
    connection.executionAuthorized ===
    true
  ) {
    throw bootstrapError(
      "PHASE21_OTEL_AUTHORIZATION_VIOLATION",

      "Reliability Lab OpenTelemetry connection must never authorize execution"
    );
  }


  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "CANONICAL CONNECTION"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `ID:            ${connection.id}`
  );

  console.log(
    `Public ID:     ${connection.publicId}`
  );

  console.log(
    `Provider:      ${connection.provider}`
  );

  console.log(
    `Status:        ${connection.status}`
  );

  console.log(
    `Health:        ${connection.healthStatus}`
  );

  console.log(
    `Execution:     ${connection.executionAuthorized}`
  );

  console.log(
    "--------------------------------------------------------------"
  );


  console.log(
    "\nPowerShell for the capacity certificate:\n"
  );


  console.log(
    `$env:PHASE21_OTEL_INTEGRATION_ID="${connection.id}"`
  );


  console.log(
    `$env:PHASE21_OTEL_TENANT_ID="${ORGANIZATION_ID}"`
  );


  console.log(
    "\nPHASE 21 OTEL LAB INTEGRATION BOOTSTRAP: PASS\n"
  );
}


function bootstrapError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21OpenTelemetryBootstrapError",

      code,

      executionAuthorized:
        false,
    }
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
        "\nPHASE 21 OTEL LAB INTEGRATION BOOTSTRAP: FAIL"
      );

      console.error(
        error
      );


      process.exit(
        1
      );
    }
  );