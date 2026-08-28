"use strict";

const KubernetesResourceNormalizer =
  require(
    "./KubernetesResourceNormalizer"
  );


class ResourceNormalizerRegistry {
  constructor(
    options = {}
  ) {
    this.normalizers =
      new Map();


    this.register(
      "kubernetes",
      options.kubernetes ||
      new KubernetesResourceNormalizer()
    );
  }


  register(
    provider,
    normalizer
  ) {
    if (
      !provider ||
      typeof provider !==
        "string"
    ) {
      throw registryError(
        "Normalizer provider is required",
        "RESOURCE_NORMALIZER_PROVIDER_REQUIRED"
      );
    }


    if (
      !normalizer ||
      typeof normalizer.normalize !==
        "function"
    ) {
      throw registryError(
        "Normalizer must expose normalize()",
        "RESOURCE_NORMALIZER_INVALID"
      );
    }


    this.normalizers.set(
      provider
        .trim()
        .toLowerCase(),
      normalizer
    );


    return this;
  }


  get(
    provider
  ) {
    const key =
      String(
        provider ||
        ""
      )
        .trim()
        .toLowerCase();


    const normalizer =
      this.normalizers.get(
        key
      );


    if (
      !normalizer
    ) {
      throw registryError(
        `No Resource normalizer registered for provider: ${key || "unknown"}`,
        "RESOURCE_NORMALIZER_NOT_FOUND"
      );
    }


    return normalizer;
  }


  normalize(
    provider,
    input
  ) {
    return this
      .get(
        provider
      )
      .normalize(
        input
      );
  }
}


function registryError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}


module.exports =
  ResourceNormalizerRegistry;