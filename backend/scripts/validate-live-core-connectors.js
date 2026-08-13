"use strict";

require("dotenv").config();

const {
  getAdapter,
} =
  require(
    "../services/integrations/adapterRegistry"
  );

// ============================================================================
// STATUS
// ============================================================================

const STATUS = Object.freeze({
  PASS:
    "PASS",

  FAIL:
    "FAIL",

  SKIPPED_NOT_CONFIGURED:
    "SKIPPED_NOT_CONFIGURED",
});

// ============================================================================
// HELPERS
// ============================================================================

function hasAllEnv(
  names
) {
  return names.every(
    (name) =>
      Boolean(
        process.env[name]
      )
  );
}

function safeError(
  error
) {
  return {
    message:
      error?.message ||
      String(error),

    code:
      error?.code ||
      null,

    status:
      error?.status ||
      error?.statusCode ||
      null,
  };
}

function buildResult(
  provider,
  status,
  extra = {}
) {
  return {
    provider,
    status,
    ...extra,
  };
}

function separator() {
  console.log(
    "\n============================================================"
  );
}

// ============================================================================
// DATADOG
// ============================================================================

async function validateDatadog() {
  const provider =
    "datadog";

  if (
    !hasAllEnv([
      "DATADOG_API_KEY",
      "DATADOG_APP_KEY",
    ])
  ) {
    return buildResult(
      provider,
      STATUS
        .SKIPPED_NOT_CONFIGURED,
      {
        reason:
          "DATADOG_API_KEY or DATADOG_APP_KEY is missing",
      }
    );
  }

  const adapter =
    getAdapter(
      provider
    );

  const connection = {
    provider,

    nonSecretConfig: {
      site:
        process.env
          .DATADOG_SITE ||
        "us1",
    },

    _decryptedSecret:
      JSON.stringify({
        apiKey:
          process.env
            .DATADOG_API_KEY,

        appKey:
          process.env
            .DATADOG_APP_KEY,
      }),
  };

  try {
    const test =
      await adapter
        .testConnection(
          connection
        );

    if (!test.success) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
        }
      );
    }

    const health =
      await adapter
        .getHealth(
          connection
        );

    if (
      health.status !==
      "healthy"
    ) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
          health,
        }
      );
    }

    return buildResult(
      provider,
      STATUS.PASS,
      {
        latencyMs:
          test.latencyMs ??
          null,

        detail:
          test.detail ||
          health.detail ||
          "Datadog connection validated",
      }
    );
  } catch (error) {
    return buildResult(
      provider,
      STATUS.FAIL,
      {
        error:
          safeError(
            error
          ),
      }
    );
  }
}

// ============================================================================
// AWS
// ============================================================================

async function validateAws() {
  const provider =
    "aws_cloudwatch";

  const region =
    process.env
      .AWS_REGION ||
    process.env
      .AWS_DEFAULT_REGION;

  const useDefaultChain =
    String(
      process.env
        .AIRA_AWS_USE_DEFAULT_CHAIN ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "true";

  if (
    !region
  ) {
    return buildResult(
      provider,
      STATUS
        .SKIPPED_NOT_CONFIGURED,
      {
        reason:
          "AWS_REGION or AWS_DEFAULT_REGION is missing",
      }
    );
  }

  if (
    !useDefaultChain &&
    !hasAllEnv([
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
    ])
  ) {
    return buildResult(
      provider,
      STATUS
        .SKIPPED_NOT_CONFIGURED,
      {
        reason:
          "AWS credentials are missing. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or AIRA_AWS_USE_DEFAULT_CHAIN=true",
      }
    );
  }

  const adapter =
    getAdapter(
      provider
    );

  const connection = {
    provider,

    nonSecretConfig: {
      region,

      authMode:
        useDefaultChain
          ? "default_chain"
          : "access_key",
    },

    _decryptedSecret:
      useDefaultChain
        ? null
        : JSON.stringify({
            accessKeyId:
              process.env
                .AWS_ACCESS_KEY_ID,

            secretAccessKey:
              process.env
                .AWS_SECRET_ACCESS_KEY,

            ...(process.env
              .AWS_SESSION_TOKEN
              ? {
                  sessionToken:
                    process.env
                      .AWS_SESSION_TOKEN,
                }
              : {}),
          }),
  };

  try {
    const test =
      await adapter
        .testConnection(
          connection
        );

    if (!test.success) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
        }
      );
    }

    const health =
      await adapter
        .getHealth(
          connection
        );

    if (
      health.status !==
      "healthy"
    ) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
          health,
        }
      );
    }

    return buildResult(
      provider,
      STATUS.PASS,
      {
        latencyMs:
          test.latencyMs ??
          null,

        detail:
          test.detail ||
          "AWS CloudWatch connection validated",
      }
    );
  } catch (error) {
    return buildResult(
      provider,
      STATUS.FAIL,
      {
        error:
          safeError(
            error
          ),
      }
    );
  }
}

// ============================================================================
// AZURE
// ============================================================================

async function validateAzure() {
  const provider =
    "azure_monitor";

  const subscriptionId =
    process.env
      .AZURE_SUBSCRIPTION_ID;

  const useDefaultCredential =
    String(
      process.env
        .AIRA_AZURE_USE_DEFAULT_CREDENTIAL ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "true";

  if (!subscriptionId) {
    return buildResult(
      provider,
      STATUS
        .SKIPPED_NOT_CONFIGURED,
      {
        reason:
          "AZURE_SUBSCRIPTION_ID is missing",
      }
    );
  }

  if (
    !useDefaultCredential &&
    !hasAllEnv([
      "AZURE_TENANT_ID",
      "AZURE_CLIENT_ID",
      "AZURE_CLIENT_SECRET",
    ])
  ) {
    return buildResult(
      provider,
      STATUS
        .SKIPPED_NOT_CONFIGURED,
      {
        reason:
          "Azure service-principal credentials are missing, or set AIRA_AZURE_USE_DEFAULT_CREDENTIAL=true",
      }
    );
  }

  const adapter =
    getAdapter(
      provider
    );

  const connection = {
    provider,

    nonSecretConfig: {
      subscriptionId,

      authMode:
        useDefaultCredential
          ? "default_credential"
          : "service_principal",

      ...(process.env
        .AZURE_DEFAULT_RESOURCE_ID
        ? {
            defaultResourceId:
              process.env
                .AZURE_DEFAULT_RESOURCE_ID,
          }
        : {}),

      ...(process.env
        .AZURE_DEFAULT_WORKSPACE_ID
        ? {
            defaultWorkspaceId:
              process.env
                .AZURE_DEFAULT_WORKSPACE_ID,
          }
        : {}),
    },

    _decryptedSecret:
      useDefaultCredential
        ? null
        : JSON.stringify({
            tenantId:
              process.env
                .AZURE_TENANT_ID,

            clientId:
              process.env
                .AZURE_CLIENT_ID,

            clientSecret:
              process.env
                .AZURE_CLIENT_SECRET,
          }),
  };

  try {
    const test =
      await adapter
        .testConnection(
          connection
        );

    if (!test.success) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
        }
      );
    }

    const health =
      await adapter
        .getHealth(
          connection
        );

    if (
      health.status !==
      "healthy"
    ) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
          health,
        }
      );
    }

    return buildResult(
      provider,
      STATUS.PASS,
      {
        latencyMs:
          test.latencyMs ??
          null,

        detail:
          test.detail ||
          "Azure Monitor connection validated",
      }
    );
  } catch (error) {
    return buildResult(
      provider,
      STATUS.FAIL,
      {
        error:
          safeError(
            error
          ),
      }
    );
  }
}

// ============================================================================
// GCP
// ============================================================================

function getGcpCredentials() {
  if (
    process.env
      .GCP_SERVICE_ACCOUNT_JSON
  ) {
    try {
      return JSON.parse(
        process.env
          .GCP_SERVICE_ACCOUNT_JSON
      );
    } catch {
      throw Object.assign(
        new Error(
          "GCP_SERVICE_ACCOUNT_JSON contains invalid JSON"
        ),
        {
          code:
            "GCP_SERVICE_ACCOUNT_JSON_INVALID",
        }
      );
    }
  }

  if (
    process.env
      .GOOGLE_APPLICATION_CREDENTIALS
  ) {
    /*
     * Let Google SDK use its normal credential-file
     * resolution.
     */
    return null;
  }

  return null;
}

async function validateGcp() {
  const provider =
    "gcp_monitoring";

  const projectId =
    process.env
      .GCP_PROJECT_ID ||
    process.env
      .GOOGLE_CLOUD_PROJECT;

  if (!projectId) {
    return buildResult(
      provider,
      STATUS
        .SKIPPED_NOT_CONFIGURED,
      {
        reason:
          "GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is missing",
      }
    );
  }

  if (
    !process.env
      .GCP_SERVICE_ACCOUNT_JSON &&
    !process.env
      .GOOGLE_APPLICATION_CREDENTIALS
  ) {
    return buildResult(
      provider,
      STATUS
        .SKIPPED_NOT_CONFIGURED,
      {
        reason:
          "GCP_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is missing",
      }
    );
  }

  let credentials;

  try {
    credentials =
      getGcpCredentials();
  } catch (error) {
    return buildResult(
      provider,
      STATUS.FAIL,
      {
        error:
          safeError(
            error
          ),
      }
    );
  }

  const adapter =
    getAdapter(
      provider
    );

  const connection = {
    provider,

    nonSecretConfig: {
      projectId,
    },

    _decryptedSecret:
      credentials
        ? JSON.stringify(
            credentials
          )
        : null,
  };

  try {
    const test =
      await adapter
        .testConnection(
          connection
        );

    if (!test.success) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
        }
      );
    }

    const health =
      await adapter
        .getHealth(
          connection
        );

    if (
      health.status !==
      "healthy"
    ) {
      return buildResult(
        provider,
        STATUS.FAIL,
        {
          test,
          health,
        }
      );
    }

    return buildResult(
      provider,
      STATUS.PASS,
      {
        latencyMs:
          test.latencyMs ??
          null,

        detail:
          test.detail ||
          "Google Cloud Monitoring connection validated",
      }
    );
  } catch (error) {
    return buildResult(
      provider,
      STATUS.FAIL,
      {
        error:
          safeError(
            error
          ),
      }
    );
  }
}

// ============================================================================
// DISPLAY
// ============================================================================

function displayResult(
  result
) {
  separator();

  console.log(
    `[${result.status}] ${result.provider}`
  );

  if (
    result.latencyMs !==
    undefined &&
    result.latencyMs !==
    null
  ) {
    console.log(
      `Latency: ${result.latencyMs} ms`
    );
  }

  if (result.detail) {
    console.log(
      `Detail: ${result.detail}`
    );
  }

  if (result.reason) {
    console.log(
      `Reason: ${result.reason}`
    );
  }

  if (result.test) {
    console.log(
      "Test:",
      result.test
    );
  }

  if (result.health) {
    console.log(
      "Health:",
      result.health
    );
  }

  if (result.error) {
    console.log(
      "Error:",
      result.error
    );
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(
    "\nAIRA — LIVE CORE CONNECTOR VALIDATION"
  );

  console.log(
    "===================================="
  );

  const validators = [
    validateDatadog,
    validateAws,
    validateAzure,
    validateGcp,
  ];

  const results = [];

  /*
   * Run sequentially so provider output is easy to read
   * and failures cannot interfere with one another.
   */
  for (
    const validate
    of validators
  ) {
    let result;

    try {
      result =
        await validate();
    } catch (error) {
      result =
        buildResult(
          "unknown",
          STATUS.FAIL,
          {
            error:
              safeError(
                error
              ),
          }
        );
    }

    results.push(
      result
    );

    displayResult(
      result
    );
  }

  separator();

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  const passed =
    results.filter(
      (result) =>
        result.status ===
        STATUS.PASS
    );

  const failed =
    results.filter(
      (result) =>
        result.status ===
        STATUS.FAIL
    );

  const skipped =
    results.filter(
      (result) =>
        result.status ===
        STATUS
          .SKIPPED_NOT_CONFIGURED
    );

  console.log(
    "\nSUMMARY\n"
  );

  console.table(
    results.map(
      (result) => ({
        provider:
          result.provider,

        status:
          result.status,

        latencyMs:
          result.latencyMs ??
          "-",

        detail:
          result.detail ||
          result.reason ||
          result.error
            ?.message ||
          "-",
      })
    )
  );

  console.log(
    `PASS: ${passed.length}`
  );

  console.log(
    `FAIL: ${failed.length}`
  );

  console.log(
    `SKIPPED: ${skipped.length}`
  );

  // ==========================================================================
  // FINAL STATUS
  // ==========================================================================

  if (
    failed.length >
    0
  ) {
    console.error(
      "\n❌ LIVE CORE CONNECTOR VALIDATION FAILED"
    );

    console.error(
      "Fix the failing configured providers before marking them live."
    );

    process.exitCode =
      1;

    return;
  }

  if (
    passed.length ===
    0
  ) {
    console.log(
      "\n⚠️ NO LIVE PROVIDERS WERE CONFIGURED"
    );

    console.log(
      "Connector code is valid, but no real external account was tested."
    );

    /*
     * No failure exit code:
     *
     * Missing optional cloud credentials must not block
     * local development.
     */
    return;
  }

  console.log(
    "\n✅ AIRA LIVE CORE CONNECTOR VALIDATION PASSED"
  );

  if (
    skipped.length >
    0
  ) {
    console.log(
      `${skipped.length} provider(s) were skipped because credentials were not configured.`
    );
  }
}

main()
  .catch(
    (error) => {
      console.error(
        "\n❌ LIVE CONNECTOR VALIDATOR CRASHED"
      );

      console.error(
        error
      );

      process.exitCode =
        1;
    }
  );