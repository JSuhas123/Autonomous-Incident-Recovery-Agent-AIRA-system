"use strict";

/**
 * Phase 18 — Canonical Knowledge Domain Taxonomy
 *
 * IMPORTANT:
 *
 * This is NOT the ResourceType taxonomy.
 *
 * Phase 17 ResourceTypes answer:
 *   "What kind of infrastructure resource is this?"
 *
 * Phase 18 KnowledgeDomains answer:
 *   "Which operational-knowledge domain owns this failure knowledge?"
 *
 * The knowledge engine remains domain-neutral.
 * Domain-specific behaviour belongs in domain packs.
 */

const KNOWLEDGE_DOMAINS =
  Object.freeze({

    KUBERNETES:
      "kubernetes",

    CONTAINERS:
      "containers",

    LINUX:
      "linux",

    DATABASE_POSTGRES:
      "database.postgres",

    DATABASE_MYSQL:
      "database.mysql",

    DATABASE_MONGODB:
      "database.mongodb",

    DATABASE_REDIS:
      "database.redis",

    MESSAGING_KAFKA:
      "messaging.kafka",

    MESSAGING_RABBITMQ:
      "messaging.rabbitmq",

    NETWORK:
      "network",

    DNS:
      "dns",

    STORAGE:
      "storage",

    CLOUD_AWS:
      "cloud.aws",

    CLOUD_AZURE:
      "cloud.azure",

    CLOUD_GCP:
      "cloud.gcp",

    OBSERVABILITY:
      "observability",

    CICD:
      "cicd",

    SECURITY:
      "security",

    APPLICATION:
      "application",
  });


const KNOWLEDGE_DOMAIN_VALUES =
  Object.freeze(
    Object.values(
      KNOWLEDGE_DOMAINS
    )
  );


/**
 * Allows future domain packs without requiring the core engine
 * to be rewritten.
 *
 * Examples:
 *
 * robotics.amr
 * robotics.lidar
 * database.elasticsearch
 * cloud.aws.eks
 */
const KNOWLEDGE_DOMAIN_PATTERN =
  /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;


function isKnownKnowledgeDomain(
  value
) {
  return (
    typeof value ===
      "string" &&
    KNOWLEDGE_DOMAIN_VALUES
      .includes(
        value
      )
  );
}


function isValidKnowledgeDomain(
  value
) {
  return (
    typeof value ===
      "string" &&
    KNOWLEDGE_DOMAIN_PATTERN
      .test(
        value
      )
  );
}


module.exports = {
  KNOWLEDGE_DOMAINS,

  KNOWLEDGE_DOMAIN_VALUES,

  KNOWLEDGE_DOMAIN_PATTERN,

  isKnownKnowledgeDomain,

  isValidKnowledgeDomain,
};