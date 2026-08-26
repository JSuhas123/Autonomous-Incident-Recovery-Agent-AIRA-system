"use strict";

/**
 * ============================================================================
 * AIRA PLATFORM DATA ARCHITECTURE
 * ============================================================================
 *
 * This file freezes responsibility boundaries between AIRA's persistence,
 * analytical, graph, cache, transport and payment systems.
 *
 * CRITICAL:
 *
 * PostgreSQL is the authoritative operational and financial source of truth.
 *
 * No cache, queue, analytics engine, graph database, vector database,
 * object store or payment provider may become authoritative for:
 *
 * - plans
 * - prices
 * - subscriptions
 * - entitlements
 * - usage charges
 * - invoices
 * - credits
 * - payments
 * - refunds
 *
 * This contract allows AIRA to scale or replace auxiliary infrastructure
 * without rewriting the billing domain.
 * ============================================================================
 */


const DATA_STORES =
  Object.freeze({
    POSTGRESQL:
      "postgresql",

    REDIS:
      "redis",

    RABBITMQ:
      "rabbitmq",

    CLICKHOUSE:
      "clickhouse",

    NEO4J:
      "neo4j",

    QDRANT:
      "qdrant",

    OBJECT_STORAGE:
      "object_storage",
  });


const PAYMENT_PROVIDERS =
  Object.freeze({
    RAZORPAY:
      "razorpay",

    STRIPE:
      "stripe",
  });


const DATA_STORE_ROLES =
  Object.freeze({
    [DATA_STORES.POSTGRESQL]: {
      authoritative:
        true,

      roles: [
        "identity",
        "tenancy",
        "subscriptions",
        "commercial_catalogue",
        "prices",
        "entitlements",
        "usage_ledger",
        "usage_aggregates",
        "invoices",
        "credits",
        "discounts",
        "payments",
        "refunds",
        "webhook_ledger",
        "reconciliation",
        "audit",
        "incidents",
        "execution_state",
        "human_operations",
      ],
    },


    [DATA_STORES.REDIS]: {
      authoritative:
        false,

      roles: [
        "entitlement_cache",
        "quota_hot_counters",
        "rate_limits",
        "distributed_locks",
        "temporary_idempotency",
        "checkout_session_cache",
        "hot_usage_snapshots",
      ],
    },


    [DATA_STORES.RABBITMQ]: {
      authoritative:
        false,

      roles: [
        "billing_events",
        "usage_events_transport",
        "aggregation_jobs",
        "invoice_jobs",
        "payment_jobs",
        "webhook_processing",
        "reconciliation_jobs",
        "async_retries",
        "economics_jobs",
      ],
    },


    [DATA_STORES.CLICKHOUSE]: {
      authoritative:
        false,

      roles: [
        "massive_usage_analytics",
        "tenant_economics_analysis",
        "high_volume_cost_analysis",
        "historical_operational_analytics",
        "billing_analytics_copy",
      ],
    },


    [DATA_STORES.NEO4J]: {
      authoritative:
        false,

      roles: [
        "infrastructure_dependency_graph",
        "service_relationship_graph",
        "blast_radius_graph",
        "incident_dependency_analysis",
      ],
    },


    [DATA_STORES.QDRANT]: {
      authoritative:
        false,

      roles: [
        "semantic_memory",
        "incident_similarity",
        "runbook_retrieval",
        "playbook_retrieval",
        "knowledge_embeddings",
      ],
    },


    [DATA_STORES.OBJECT_STORAGE]: {
      authoritative:
        false,

      roles: [
        "incident_evidence",
        "forensic_artifacts",
        "large_logs",
        "exports",
        "dumps",
        "large_attachments",
      ],
    },
  });


const FINANCIAL_SOURCE_OF_TRUTH =
  DATA_STORES
    .POSTGRESQL;


const ANALYTICS_SINK =
  DATA_STORES
    .CLICKHOUSE;


const INFRASTRUCTURE_GRAPH_STORE =
  DATA_STORES
    .NEO4J;


function isAuthoritativeStore(
  store
) {
  return DATA_STORE_ROLES[
    store
  ]
    ?.authoritative ===
    true;
}


function assertFinancialStore(
  store
) {
  if (
    store !==
      FINANCIAL_SOURCE_OF_TRUTH
  ) {
    const error =
      new Error(
        "Financial truth must remain in PostgreSQL"
      );

    error.code =
      "FINANCIAL_STORE_NOT_AUTHORITATIVE";

    error.store =
      store;

    throw error;
  }

  return true;
}


module.exports = {
  DATA_STORES,

  PAYMENT_PROVIDERS,

  DATA_STORE_ROLES,

  FINANCIAL_SOURCE_OF_TRUTH,

  ANALYTICS_SINK,

  INFRASTRUCTURE_GRAPH_STORE,

  isAuthoritativeStore,

  assertFinancialStore,
};