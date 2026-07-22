#!/usr/bin/env node
/**
 * Demo Tenant Seeder
 *
 * Creates a demo tenant with known API credentials for local development and testing.
 * DO NOT run in production.
 *
 * Usage:
 *   node backend/scripts/seed-demo-tenant.js
 *
 * Login credentials after running:
 *   Tenant ID : demo
 *   Key ID    : demo-key-1
 *   Secret    : demo-secret-2024
 */

"use strict";

require("dotenv").config();

if (process.env.NODE_ENV === "production") {
  process.stderr.write("[seed-demo] REFUSED: must not run in production.\n");
  process.exit(1);
}

const mongoose = require("mongoose");
const crypto = require("crypto");

async function run() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    "mongodb://localhost:27017/decision_engine";

  console.log("[seed-demo] Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("[seed-demo] Connected.");

  const TenantConfig = require("../models/TenantConfig");
  const Log = require("../models/Log");
  const DecisionTrace = require("../models/DecisionTrace");
  const Runbook = require("../models/Runbook");
  const RunbookExecution = require("../models/RunbookExecution");
  const IncidentMemory = require("../models/IncidentMemory");

  const tenantId = "demo";
  const keyId = "demo-key-1";
  const secret = "demo-secret-2024";

  // keyHash = HMAC-SHA256(keyId, secret) — same convention as seed-dev-data.js
  const keyHash = crypto.createHmac("sha256", secret).update(keyId).digest("hex");
  const secretHash = crypto.createHmac("sha256", keyId).update(secret).digest("hex");

  await TenantConfig.findOneAndUpdate(
    { tenantId },
    {
      tenantId,
      name: "Demo Tenant",
      status: "active",
      apiKeys: [
        {
          keyId,
          keyHash,
          secretHash,
          active: true,
          createdAt: new Date(),
          scopes: ["read:*", "write:*"],
        },
      ],
      settings: {
        maxEventsPerSecond: 10000,
        maxConcurrentIncidents: 100,
        maxConcurrentActions: 5,
        maxActionsPerHour: 10,
        auditRetentionDays: 2555,
      },
      policyVersion: 1,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log("[seed-demo] ✓ Demo tenant created/updated");

  // ── Sample logs ───────────────────────────────────────────────────────────
  await Log.deleteMany({ tenantId });
  await Log.insertMany([
    { tenantId, message: "High memory usage detected in API gateway",         status: "error",   level: "warn",  responseTime: 2350, timestamp: new Date(Date.now() -  60_000) },
    { tenantId, message: "Request timeout on payment service",                status: "error",   level: "error", responseTime: 5000, timestamp: new Date(Date.now() - 120_000) },
    { tenantId, message: "Database connection pool exhausted",                status: "error",   level: "error", responseTime: 3200, timestamp: new Date(Date.now() - 180_000) },
    { tenantId, message: "Cache invalidation completed successfully",         status: "success", level: "info",  responseTime:  450, timestamp: new Date(Date.now() - 240_000) },
    { tenantId, message: "Circuit breaker opened for downstream service",     status: "error",   level: "warn",  responseTime: 1200, timestamp: new Date(Date.now() - 300_000) },
    { tenantId, message: "Auto-scaling triggered - 5 new instances launched", status: "success", level: "info",  responseTime:  890, timestamp: new Date(Date.now() - 360_000) },
  ]);
  console.log("[seed-demo] ✓ Logs");

  // ── Incident memory ────────────────────────────────────────────────────────
  await IncidentMemory.deleteMany({ tenantId });
  await IncidentMemory.insertMany([
    {
      tenantId,
      patternId: crypto.randomUUID(),
      patternType: "high-error-rate",
      patternName: "Payment Service Error Spike",
      description: "Unusual spike in payment processing errors",
      occurrences: [{
        incidentId: crypto.randomUUID(),
        decisionId: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 120_000),
        resolvedWith: "Restart payment service pods",
        success: true,
        recoveryTimeMs: 45_000,
        confidence: 0.92,
        severity: "HIGH",
      }],
      stats: {
        totalOccurrences: 3,
        lastOccurrence: new Date(Date.now() - 120_000),
        firstOccurrence: new Date(Date.now() - 864_000_000),
        frequency: "1-2 times per week",
        actions: new Map([["Restart payment service pods", { successes: 3, failures: 0, totalAttempts: 3, successRate: 100, avgRecoveryTimeMs: 45_000 }]]),
        severityTrend: { avgSeverity: "HIGH", escalationPattern: false },
      },
    },
    {
      tenantId,
      patternId: crypto.randomUUID(),
      patternType: "high-latency",
      patternName: "Database Query Timeout",
      description: "Database queries exceeding timeout thresholds",
      occurrences: [{
        incidentId: crypto.randomUUID(),
        decisionId: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 180_000),
        resolvedWith: "Optimize slow queries and clear cache",
        success: true,
        recoveryTimeMs: 32_000,
        confidence: 0.85,
        severity: "MEDIUM",
      }],
      stats: {
        totalOccurrences: 5,
        lastOccurrence: new Date(Date.now() - 180_000),
        firstOccurrence: new Date(Date.now() - 2_592_000_000),
        frequency: "2-3 times per week",
        actions: new Map([["Optimize slow queries and clear cache", { successes: 4, failures: 1, totalAttempts: 5, successRate: 80, avgRecoveryTimeMs: 32_000 }]]),
        severityTrend: { avgSeverity: "MEDIUM", escalationPattern: false },
      },
    },
  ]);
  console.log("[seed-demo] ✓ Incident memory");

  // ── Decision traces ────────────────────────────────────────────────────────
  await DecisionTrace.deleteMany({ tenantId });
  await DecisionTrace.insertMany([
    {
      decisionId: crypto.randomUUID(),
      tenantId,
      correlationId: crypto.randomUUID(),
      signalType: "high-error-rate",
      inputs: {
        signals: { errorRate: 42.5, responseTime: 2500, affectedServices: ["payment-service"] },
        severity: "HIGH",
        confidence: 0.92,
        incidentMemory: { previousOccurrences: 3, lastResolution: "Restart payment service pods", successRate: 100, pattern: "high-error-rate" },
      },
      reasoning: {
        hypothesis: "Payment service pod is unhealthy and rejecting requests",
        evidenceFor: ["Error rate jumped from 2% to 42% in 30 seconds", "Same service had 3 similar incidents previously"],
        evidenceAgainst: ["No recent code deploy detected"],
      },
      decisionRationale: "High confidence (92%) in pod restart based on pattern history",
      recommendedAction: "Restart payment service pods in kubernetes cluster",
      confidence: 0.92,
      approvalStatus: "approved",
      timestamp: new Date(Date.now() - 120_000),
    },
    {
      decisionId: crypto.randomUUID(),
      tenantId,
      correlationId: crypto.randomUUID(),
      signalType: "high-latency",
      inputs: {
        signals: { errorRate: 12.3, responseTime: 4200, affectedServices: ["search-service"] },
        severity: "MEDIUM",
        confidence: 0.85,
        incidentMemory: { previousOccurrences: 5, lastResolution: "Optimize slow queries", successRate: 80, pattern: "high-latency" },
      },
      reasoning: {
        hypothesis: "Search database facing query performance issues",
        evidenceFor: ["Response times increased from 300ms to 4200ms", "Pattern repeats 2-3 times weekly"],
        evidenceAgainst: ["No recent traffic spike detected"],
      },
      decisionRationale: "Moderate confidence (85%) - pattern matches previous queries optimization",
      recommendedAction: "Optimize slow database queries and clear search cache",
      confidence: 0.85,
      approvalStatus: "pending",
      timestamp: new Date(Date.now() - 180_000),
    },
    {
      decisionId: crypto.randomUUID(),
      tenantId,
      correlationId: crypto.randomUUID(),
      signalType: "resource-exhaustion",
      inputs: {
        signals: { errorRate: 8.1, responseTime: 1800, affectedServices: ["api-gateway"] },
        severity: "LOW",
        confidence: 0.78,
        incidentMemory: { previousOccurrences: 2, lastResolution: "Scale API gateway instances", successRate: 100, pattern: "resource-exhaustion" },
      },
      reasoning: {
        hypothesis: "API gateway approaching resource limits under normal load",
        evidenceFor: ["Memory usage at 85% threshold", "CPU at 72% on multiple nodes"],
        evidenceAgainst: ["Traffic volume still within expected ranges"],
      },
      decisionRationale: "Low-moderate confidence (78%) - proactive scaling recommended",
      recommendedAction: "Scale API gateway instances from 3 to 5 replicas",
      confidence: 0.78,
      approvalStatus: "rejected",
      timestamp: new Date(Date.now() - 10_000),
    },
    {
      decisionId: crypto.randomUUID(),
      tenantId,
      correlationId: crypto.randomUUID(),
      signalType: "cascade-failure",
      inputs: {
        signals: { errorRate: 67.2, responseTime: 8900, affectedServices: ["auth-service", "user-service", "database"] },
        severity: "CRITICAL",
        confidence: 0.95,
      },
      reasoning: {
        hypothesis: "Cascading failure detected across core services",
        evidenceFor: ["Multiple services reporting errors simultaneously", "Database connection timeouts increasing exponentially"],
        evidenceAgainst: [],
      },
      decisionRationale: "Critical cascade detected, immediate escalation required",
      recommendedAction: "Escalate to on-call team and initiate incident response protocol",
      confidence: 0.95,
      approvalStatus: "pending",
      timestamp: new Date(Date.now() - 5_000),
    },
  ]);
  console.log("[seed-demo] ✓ Decision traces");

  // ── Runbooks ───────────────────────────────────────────────────────────────
  await Runbook.deleteMany({ tenantId });
  await RunbookExecution.deleteMany({ tenantId });

  const runbooks = await Runbook.insertMany([
    {
      tenantId,
      name: "Payment Service Recovery",
      incidentType: "high-error-rate",
      description: "Automated recovery for payment service failures",
      enabled: true,
      steps: [
        { stepNumber: 1, name: "Check pod status",       type: "kubernetes", action: "check_pod_health",  timeout: 30_000 },
        { stepNumber: 2, name: "Restart unhealthy pods", type: "kubernetes", action: "restart_pods",       timeout: 60_000 },
        { stepNumber: 3, name: "Verify service health",  type: "api",        action: "health_check",       timeout: 45_000 },
        { stepNumber: 4, name: "Monitor error rates",    type: "wait",       action: "wait_for_recovery",  timeout: 120_000 },
      ],
    },
    {
      tenantId,
      name: "Database Query Optimization",
      incidentType: "high-latency",
      description: "Optimize database queries and clear caches",
      enabled: true,
      steps: [
        { stepNumber: 1, name: "Identify slow queries",    type: "shell", action: "analyze_queries",   timeout: 45_000 },
        { stepNumber: 2, name: "Clear query cache",        type: "api",   action: "clear_cache",       timeout: 30_000 },
        { stepNumber: 3, name: "Verify response times",    type: "api",   action: "performance_check", timeout: 60_000 },
      ],
    },
    {
      tenantId,
      name: "API Gateway Scaling",
      incidentType: "resource-exhaustion",
      description: "Scale API gateway to handle increased load",
      enabled: true,
      steps: [
        { stepNumber: 1, name: "Assess resource usage",    type: "shell",      action: "check_resources",    timeout: 30_000 },
        { stepNumber: 2, name: "Scale up replicas",        type: "kubernetes", action: "scale_replicas",      timeout: 120_000 },
        { stepNumber: 3, name: "Verify load distribution", type: "api",        action: "verify_distribution", timeout: 60_000 },
      ],
    },
  ]);
  console.log("[seed-demo] ✓ Runbooks");

  await RunbookExecution.insertMany([
    {
      tenantId,
      runbookId: runbooks[0]._id,
      correlationId: crypto.randomUUID(),
      status: "success",
      startTime: new Date(Date.now() - 300_000),
      endTime: new Date(Date.now() - 255_000),
      result: { stepsCompleted: 4, totalSteps: 4, notes: "Payment service successfully recovered" },
    },
    {
      tenantId,
      runbookId: runbooks[1]._id,
      correlationId: crypto.randomUUID(),
      status: "success",
      startTime: new Date(Date.now() - 200_000),
      endTime: new Date(Date.now() - 125_000),
      result: { stepsCompleted: 3, totalSteps: 3, notes: "Database optimization completed" },
    },
    {
      tenantId,
      runbookId: runbooks[0]._id,
      correlationId: crypto.randomUUID(),
      status: "running",
      startTime: new Date(Date.now() - 60_000),
      endTime: null,
      result: { stepsCompleted: 2, totalSteps: 4, notes: "Currently restarting unhealthy pods" },
    },
  ]);
  console.log("[seed-demo] ✓ Runbook executions");

  await mongoose.disconnect();
  console.log("[seed-demo] ✓ Done. Disconnected.");
  console.log("");
  console.log("=== Demo Login Credentials ===");
  console.log("  Tenant ID : demo");
  console.log("  Key ID    : demo-key-1");
  console.log("  Secret    : demo-secret-2024");
  console.log("==============================");
}

run().catch((err) => {
  console.error("[seed-demo] FATAL:", err.message);
  process.exit(1);
});
