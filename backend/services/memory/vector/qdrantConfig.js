"use strict";


function booleanEnv(
  value,
  fallback =
    false
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }


  return String(
    value
  )
    .trim()
    .toLowerCase() ===
    "true";
}


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }


  return parsed;
}


function getQdrantConfig() {
  return {
    enabled:
      booleanEnv(
        process.env
          .QDRANT_ENABLED,
        false
      ),

    url:
      String(
        process.env
          .QDRANT_URL ||
        "http://127.0.0.1:6333"
      )
        .trim(),

    apiKey:
      process.env
        .QDRANT_API_KEY ||
      null,

    collection:
      String(
        process.env
          .QDRANT_COLLECTION ||
        "aira_memories_v1"
      )
        .trim(),

    vectorDistance:
      String(
        process.env
          .QDRANT_VECTOR_DISTANCE ||
        "Cosine"
      )
        .trim(),

    timeoutMs:
      positiveInteger(
        process.env
          .QDRANT_REQUEST_TIMEOUT_MS,
        10000
      ),
  };
}


function assertQdrantConfig() {
  const config =
    getQdrantConfig();


  if (
    !config.enabled
  ) {
    const error =
      new Error(
        "Qdrant memory retrieval is disabled"
      );

    error.code =
      "QDRANT_DISABLED";

    error.status =
      503;

    throw error;
  }


  if (
    !config.url
  ) {
    const error =
      new Error(
        "Qdrant URL is required"
      );

    error.code =
      "QDRANT_URL_REQUIRED";

    error.status =
      500;

    throw error;
  }


  if (
    !config.collection
  ) {
    const error =
      new Error(
        "Qdrant collection is required"
      );

    error.code =
      "QDRANT_COLLECTION_REQUIRED";

    error.status =
      500;

    throw error;
  }


  return config;
}


module.exports = {
  booleanEnv,

  positiveInteger,

  getQdrantConfig,

  assertQdrantConfig,
};