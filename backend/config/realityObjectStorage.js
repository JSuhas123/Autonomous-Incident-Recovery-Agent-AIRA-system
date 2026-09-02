"use strict";


function parseBoolean(
  value,
  fallback =
    false
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return fallback;
  }


  return [
    "1",
    "true",
    "yes",
    "on",
  ].includes(
    String(
      value
    )
      .trim()
      .toLowerCase()
  );
}


function getRealityObjectStorageConfig(
  env =
    process.env
) {
  const production =
    String(
      env.NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() ===
    "production";


  const endpoint =
    String(
      env
        .REALITY_OBJECT_STORAGE_ENDPOINT ||
      "http://127.0.0.1:9000"
    )
      .trim();


  const config = {
    enabled:
      parseBoolean(
        env
          .REALITY_OBJECT_STORAGE_ENABLED,
        true
      ),


    region:
      String(
        env
          .REALITY_OBJECT_STORAGE_REGION ||
        "us-east-1"
      )
        .trim(),


    bucket:
      String(
        env
          .REALITY_OBJECT_STORAGE_BUCKET ||
        "aira-reality-evidence"
      )
        .trim(),


    endpoint:
      endpoint ||
      null,


    accessKeyId:
      env
        .REALITY_OBJECT_STORAGE_ACCESS_KEY ||
      (
        production
          ? null
          : "aira_minio"
      ),


    secretAccessKey:
      env
        .REALITY_OBJECT_STORAGE_SECRET_KEY ||
      (
        production
          ? null
          : "aira_minio_local_secret"
      ),


    forcePathStyle:
      parseBoolean(
        env
          .REALITY_OBJECT_STORAGE_FORCE_PATH_STYLE,
        Boolean(
          endpoint
        )
      ),


    autoCreateBucket:
      parseBoolean(
        env
          .REALITY_OBJECT_STORAGE_AUTO_CREATE_BUCKET,
        !production
      ),
  };


  validateRealityObjectStorageConfig(
    config,
    {
      production,
    }
  );


  return config;
}


function validateRealityObjectStorageConfig(
  config,
  {
    production =
      false,
  } =
    {}
) {
  if (
    !config.enabled
  ) {
    return true;
  }


  if (
    !config.region
  ) {
    throw storageConfigError(
      "REALITY_OBJECT_STORAGE_REGION_REQUIRED",
      "Reality object storage region is required"
    );
  }


  if (
    !config.bucket
  ) {
    throw storageConfigError(
      "REALITY_OBJECT_STORAGE_BUCKET_REQUIRED",
      "Reality object storage bucket is required"
    );
  }


  if (
    config.endpoint
  ) {
    let parsed;


    try {
      parsed =
        new URL(
          config.endpoint
        );
    } catch {
      throw storageConfigError(
        "REALITY_OBJECT_STORAGE_ENDPOINT_INVALID",
        "Reality object storage endpoint must be a valid HTTP(S) URL"
      );
    }


    if (
      ![
        "http:",
        "https:",
      ].includes(
        parsed.protocol
      )
    ) {
      throw storageConfigError(
        "REALITY_OBJECT_STORAGE_ENDPOINT_INVALID",
        "Reality object storage endpoint must use HTTP or HTTPS"
      );
    }


    if (
      production &&
      parsed.protocol !==
        "https:"
    ) {
      throw storageConfigError(
        "REALITY_OBJECT_STORAGE_TLS_REQUIRED",
        "Production reality object storage endpoint must use HTTPS"
      );
    }
  }


  if (
    !config.accessKeyId ||
    !config.secretAccessKey
  ) {
    throw storageConfigError(
      "REALITY_OBJECT_STORAGE_CREDENTIALS_REQUIRED",
      "Reality object storage credentials are required"
    );
  }


  return true;
}


function storageConfigError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status:
        500,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  parseBoolean,

  getRealityObjectStorageConfig,

  validateRealityObjectStorageConfig,
};