"use strict";

const crypto =
  require(
    "node:crypto"
  );


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


class EmbeddingProviderService {

  constructor(
    options = {}
  ) {
    this.fetchImpl =
      options.fetchImpl ||
      global.fetch;
  }


  getConfig() {
    return {
      enabled:
        String(
          process.env
            .MEMORY_EMBEDDING_ENABLED ||
          "false"
        )
          .toLowerCase() ===
        "true",

      provider:
        String(
          process.env
            .MEMORY_EMBEDDING_PROVIDER ||
          "deterministic_test"
        )
          .trim()
          .toLowerCase(),

      model:
        String(
          process.env
            .MEMORY_EMBEDDING_MODEL ||
          "aira-deterministic-test-v1"
        )
          .trim(),

      dimensions:
        positiveInteger(
          process.env
            .MEMORY_EMBEDDING_DIMENSIONS,
          384
        ),

      version:
        positiveInteger(
          process.env
            .MEMORY_EMBEDDING_VERSION,
          1
        ),
    };
  }


  createError(
    message,
    code,
    status =
      500
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  normalizeVector(
    vector
  ) {
    const magnitude =
      Math.sqrt(
        vector.reduce(
          (
            total,
            value
          ) =>
            total +
            (
              value *
              value
            ),
          0
        )
      );


    if (
      magnitude ===
      0
    ) {
      return vector;
    }


    return vector.map(
      (
        value
      ) =>
        value /
        magnitude
    );
  }


  deterministicEmbedding(
    text,
    dimensions
  ) {
    /**
     * TEST / LOCAL DEVELOPMENT ONLY.
     *
     * This is not semantic embedding intelligence.
     *
     * It gives the pipeline a deterministic fixed-size vector so we can test:
     *
     * PostgreSQL
     *   -> representation
     *   -> embedding
     *   -> Qdrant
     *
     * without requiring a paid external embedding API.
     */
    const vector =
      new Array(
        dimensions
      )
        .fill(
          0
        );


    const tokens =
      String(
        text
      )
        .toLowerCase()
        .split(
          /\s+/
        )
        .filter(
          Boolean
        );


    for (
      const token
      of tokens
    ) {
      const hash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            token
          )
          .digest();


      for (
        let i = 0;
        i < 8;
        i += 1
      ) {
        const index =
          hash
            .readUInt32BE(
              i * 4
            ) %
          dimensions;


        const sign =
          hash[
            31 -
            i
          ] %
            2 ===
          0
            ? 1
            : -1;


        vector[
          index
        ] +=
          sign;
      }
    }


    return this
      .normalizeVector(
        vector
      );
  }


  async openAiEmbedding(
    text
  ) {
    if (
      typeof this.fetchImpl !==
        "function"
    ) {
      throw this.createError(
        "Fetch implementation unavailable for embedding provider",
        "EMBEDDING_FETCH_UNAVAILABLE"
      );
    }


    const apiKey =
      process.env
        .OPENAI_EMBEDDING_API_KEY;


    const model =
      process.env
        .OPENAI_EMBEDDING_MODEL ||
      "text-embedding-3-small";


    const dimensions =
      positiveInteger(
        process.env
          .OPENAI_EMBEDDING_DIMENSIONS,
        1536
      );


    if (
      !apiKey
    ) {
      throw this.createError(
        "OpenAI embedding API key is required",
        "OPENAI_EMBEDDING_API_KEY_REQUIRED"
      );
    }


    const response =
      await this.fetchImpl(
        "https://api.openai.com/v1/embeddings",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              model,

              input:
                text,

              dimensions,
            }),
        }
      );


    const body =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      !response.ok
    ) {
      throw this.createError(
        body
          ?.error
          ?.message ||
        "Embedding provider request failed",
        "OPENAI_EMBEDDING_REQUEST_FAILED",
        502
      );
    }


    const vector =
      body
        ?.data
        ?.[0]
        ?.embedding;


    if (
      !Array.isArray(
        vector
      ) ||
      vector.length ===
        0
    ) {
      throw this.createError(
        "Embedding provider returned no vector",
        "EMBEDDING_VECTOR_MISSING",
        502
      );
    }


    return {
      provider:
        "openai",

      model,

      dimensions:
        vector.length,

      vector,
    };
  }


  async embed(
    text
  ) {
    const config =
      this
        .getConfig();


    if (
      !config.enabled
    ) {
      throw this.createError(
        "Memory embedding generation is disabled",
        "MEMORY_EMBEDDING_DISABLED",
        503
      );
    }


    if (
      typeof text !==
        "string" ||
      text.trim().length ===
        0
    ) {
      throw this.createError(
        "Embedding text is required",
        "MEMORY_EMBEDDING_TEXT_REQUIRED",
        422
      );
    }


    switch (
      config.provider
    ) {

      case "deterministic_test":

        if (
          process.env.NODE_ENV ===
            "production"
        ) {
          throw this.createError(
            "Deterministic test embeddings are forbidden in production",
            "DETERMINISTIC_EMBEDDING_FORBIDDEN",
            500
          );
        }


        return {
          provider:
            "deterministic_test",

          model:
            config.model,

          dimensions:
            config.dimensions,

          version:
            config.version,

          vector:
            this
              .deterministicEmbedding(
                text,
                config.dimensions
              ),
        };


      case "openai": {
        const result =
          await this
            .openAiEmbedding(
              text
            );


        return {
          ...result,

          version:
            config.version,
        };
      }


      default:

        throw this.createError(
          "Unknown memory embedding provider",
          "MEMORY_EMBEDDING_PROVIDER_UNKNOWN",
          500
        );
    }
  }
}


const embeddingProviderService =
  new EmbeddingProviderService();


module.exports = {
  EmbeddingProviderService,

  embeddingProviderService,
};