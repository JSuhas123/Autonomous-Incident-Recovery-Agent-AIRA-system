#!/usr/bin/env node
/**
 * Generate Sample Observability Data
 * 
 * Creates realistic incident lifecycle data for observability testing:
 * - Structured logs with correlation IDs
 * - Prometheus metrics recordings
 * - Audit trail events
 * - End-to-end traces
 * 
 * Usage: node generate-observability-samples.js [--count=10] [--tenant=test-tenant]
 */

const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');

// Configuration
const args = process.argv.slice(2);
const countArg = args.find(arg => arg.startsWith('--count='));
const tenantArg = args.find(arg => arg.startsWith('--tenant='));

const SAMPLE_COUNT = countArg ? parseInt(countArg.split('=')[1]) : 10;
const TEST_TENANT = tenantArg ? tenantArg.split('=')[1] : 'sample-tenant';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
};

/**
 * Incident Patterns (realistic scenarios)
 */
const INCIDENT_PATTERNS = [
  {
    name: 'High Error Rate in API',
    severity: 'HIGH',
    signals: { errorRate: 8.5, affectedServices: ['api-server', 'gateway'] },
    action: 'INCREASE_RESOURCES',
  },
  {
    name: 'Database Query Slowdown',
    severity: 'MEDIUM',
    signals: { queryTime: 500, affectedServices: ['database'] },
    action: 'OPTIMIZE_QUERIES',
  },
  {
    name: 'Memory Leak Detected',
    severity: 'HIGH',
    signals: { memoryUsage: 95, affectedServices: ['cache-worker'] },
    action: 'RESTART_SERVICE',
  },
  {
    name: 'Cache Miss Rate High',
    severity: 'LOW',
    signals: { cacheMissRate: 45, affectedServices: ['cache'] },
    action: 'WARM_CACHE',
  },
  {
    name: 'Disk Space Critical',
    severity: 'CRITICAL',
    signals: { diskUsage: 98, affectedServices: ['database', 'logs'] },
    action: 'CLEANUP_DISK',
  },
];

const ACTIONS = [
  'RESTART_SERVICE',
  'INCREASE_RESOURCES',
  'SCALE_HORIZONTALLY',
  'DRAIN_TRAFFIC',
  'OPTIMIZE_QUERIES',
  'ROLLBACK_DEPLOYMENT',
  'CLEANUP_DISK',
];

/**
 * Generate realistic incident lifecycle
 */
function generateIncidentData() {
  const pattern = INCIDENT_PATTERNS[Math.floor(Math.random() * INCIDENT_PATTERNS.length)];
  const correlationId = `incident-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const decisionId = crypto.randomUUID();
  const actionId = crypto.randomUUID();

  return {
    correlationId,
    decisionId,
    actionId,
    timestamp: new Date(),
    incident: {
      name: pattern.name,
      severity: pattern.severity,
      signals: pattern.signals,
    },
    decision: {
      verdict: 'EXECUTE_ACTION',
      action: pattern.action,
      confidence: 0.85 + Math.random() * 0.14, // 0.85-0.99
    },
    execution: {
      status: Math.random() > 0.1 ? 'success' : 'failed',
      duration: Math.floor(Math.random() * 30000) + 5000, // 5-35s
      outcome: Math.random() > 0.1 ? 'Service recovered' : 'Escalated to human',
    },
  };
}

/**
 * Create structured logs
 */
function createStructuredLogs(incident) {
  const { correlationId, incident: inc, decision, execution } = incident;

  const logs = [
    {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      correlationId,
      tenantId: TEST_TENANT,
      component: 'incident-detector',
      message: 'Incident detected',
      context: {
        incidentName: inc.name,
        severity: inc.severity,
        signals: inc.signals,
      },
    },
    {
      timestamp: new Date(Date.now() + 50).toISOString(),
      level: 'INFO',
      correlationId,
      tenantId: TEST_TENANT,
      component: 'analysis-agent',
      message: 'Analyzing incident patterns',
      context: {
        patterns: [inc.severity.toLowerCase() + '_severity'],
        anomalies: Object.keys(inc.signals),
      },
    },
    {
      timestamp: new Date(Date.now() + 100).toISOString(),
      level: 'INFO',
      correlationId,
      tenantId: TEST_TENANT,
      component: 'decision-agent',
      message: 'Making decision',
      context: {
        verdict: decision.verdict,
        action: decision.action,
        confidence: decision.confidence.toFixed(4),
      },
    },
    {
      timestamp: new Date(Date.now() + 150).toISOString(),
      level: 'INFO',
      correlationId,
      tenantId: TEST_TENANT,
      component: 'action-agent',
      message: 'Executing action',
      context: {
        actionType: decision.action,
        status: execution.status,
        duration: execution.duration,
      },
    },
  ];

  if (execution.status === 'failed') {
    logs.push({
      timestamp: new Date(Date.now() + 200).toISOString(),
      level: 'ERROR',
      correlationId,
      tenantId: TEST_TENANT,
      component: 'action-agent',
      message: 'Action execution failed',
      context: {
        error: 'Service unreachable',
        errorCode: 'SERVICE_TIMEOUT',
        retryAttempt: 1,
      },
    });
  }

  return logs;
}

/**
 * Create audit events
 */
async function createAuditEvents(incident) {
  try {
    const AuditService = require(path.join(__dirname, '../services/observability/auditService'));
    const { correlationId, decisionId, actionId, decision, execution } = incident;

    // Record decision event
    await AuditService.recordEvent(
      TEST_TENANT,
      'decision_made',
      {
        decisionId,
        verdict: decision.verdict,
        action: decision.action,
        confidence: decision.confidence,
        reasoning: `Incident '${incident.incident.name}' requires ${decision.action}`,
      },
      {
        userId: 'system',
        ipAddress: '127.0.0.1',
        correlationId,
      }
    );

    // Record action event
    await AuditService.recordEvent(
      TEST_TENANT,
      'action_executed',
      {
        actionId,
        actionType: decision.action,
        status: execution.status,
        duration: execution.duration,
        outcome: execution.outcome,
      },
      {
        userId: 'system',
        correlationId,
      }
    );

    return true;
  } catch (error) {
    console.error('Failed to create audit events:', error.message);
    return false;
  }
}

/**
 * Record metrics
 */
function recordMetrics(incident) {
  try {
    const { metricsService } = require(path.join(__dirname, '../services/infrastructure'));
    const { incident: inc, decision, execution } = incident;

    // Record decision latency
    const latencyMs = Math.floor(Math.random() * 1000) + 100;
    metricsService.recordDecisionLatency(
      TEST_TENANT,
      inc.severity,
      execution.status,
      latencyMs
    );

    // Record policy evaluation with latency
    const policyLatencyMs = Math.floor(Math.random() * 100) + 10;
    metricsService.recordPolicyEvaluation(TEST_TENANT, 'allowed', policyLatencyMs);

    // Record action execution
    const actionLatencyMs = Math.floor(Math.random() * 5000) + 500;
    metricsService.recordActionExecution(
      TEST_TENANT,
      decision.action,
      execution.status,
      actionLatencyMs
    );

    // Record error if action failed
    if (execution.status === 'failed') {
      metricsService.recordError(
        TEST_TENANT,
        'action-agent',
        'execution_failed'
      );
    }

    return true;
  } catch (error) {
    console.error('Failed to record metrics:', error.message);
    return false;
  }
}

/**
 * Generate and save samples
 */
async function generateSamples() {
  const fs = require('fs');

  console.log(colors.blue + '\n📊 Observability Sample Data Generator' + colors.reset);
  console.log(`\nConfiguration:`);
  console.log(`  - Samples to generate: ${SAMPLE_COUNT}`);
  console.log(`  - Test tenant: ${TEST_TENANT}`);
  console.log(`\n${colors.yellow}Starting generation...${colors.reset}\n`);

  const logs = [];
  const sampleData = [];

  // Connect to MongoDB if available
  let connected = false;
  try {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/incident-recovery-test';
    await mongoose.connect(mongoUrl);
    connected = true;
    console.log(`${colors.green}✓${colors.reset} Connected to MongoDB`);
  } catch (error) {
    console.log(`${colors.yellow}⚠${colors.reset} MongoDB not available: ${error.message}`);
    console.log(`  Audit events will not be recorded`);
  }

  // Generate samples
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    process.stdout.write(`\r  Generating sample ${i + 1}/${SAMPLE_COUNT}...`);

    const incident = generateIncidentData();
    sampleData.push(incident);

    // Create structured logs
    const incidentLogs = createStructuredLogs(incident);
    logs.push(...incidentLogs);

    // Record metrics
    recordMetrics(incident);

    // Create audit events (if connected)
    if (connected) {
      await createAuditEvents(incident);
    }
  }

  console.log(`\r  ✓ Generated ${SAMPLE_COUNT} samples\n`);

  // Save logs to file
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logsFile = path.join(logsDir, `samples-${Date.now()}.log`);
  logs.forEach(log => {
    fs.appendFileSync(logsFile, JSON.stringify(log) + '\n');
  });

  console.log(`${colors.green}✓${colors.reset} Logs saved to: ${logsFile}`);

  // Save sample data
  const samplesFile = path.join(__dirname, `samples-${Date.now()}.json`);
  fs.writeFileSync(samplesFile, JSON.stringify(sampleData, null, 2));

  console.log(`${colors.green}✓${colors.reset} Sample data saved to: ${samplesFile}`);

  // Print summary
  console.log('\n' + colors.blue + 'Generated Data Summary:' + colors.reset);
  console.log(`  - Total incidents: ${SAMPLE_COUNT}`);
  console.log(`  - Total log entries: ${logs.length}`);

  const severityCount = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };

  sampleData.forEach(sample => {
    severityCount[sample.incident.severity]++;
  });

  console.log(`\n  Incidents by severity:`);
  Object.entries(severityCount).forEach(([severity, count]) => {
    if (count > 0) {
      console.log(`    - ${severity}: ${count}`);
    }
  });

  const successCount = sampleData.filter(s => s.execution.status === 'success').length;
  console.log(`\n  Action execution results:`);
  console.log(`    - Successful: ${successCount}`);
  console.log(`    - Failed: ${SAMPLE_COUNT - successCount}`);

  if (connected) {
    console.log(`\n  ✓ Audit events recorded to MongoDB`);
  }

  // Cleanup
  if (connected) {
    await mongoose.disconnect();
  }

  console.log(colors.green + '\n✓ Sample generation complete!' + colors.reset + '\n');
}

// Run generator
generateSamples().catch(error => {
  console.error(colors.yellow + 'Generator error:' + colors.reset, error.message);
  process.exit(1);
});
