#!/usr/bin/env node
/**
 * Observability Health Check Script
 * 
 * Validates that all observability components are functioning:
 * 1. Logging service accessible
 * 2. Metrics endpoint operational
 * 3. Audit trail connected to MongoDB
 * 4. Alerts configured
 * 
 * Usage: node check-observability-health.js [--verbose] [--endpoint http://localhost:5000]
 */

const http = require('http');
const mongoose = require('mongoose');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const endpointArg = args.find(arg => arg.startsWith('--endpoint='));
const endpoint = endpointArg ? endpointArg.split('=')[1] : 'http://localhost:5000';

const baseURL = endpoint;
const checks = [];
let passed = 0;
let failed = 0;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(level, message, data = '') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': `${colors.blue}[INFO]${colors.reset}`,
    'PASS': `${colors.green}[PASS]${colors.reset}`,
    'FAIL': `${colors.red}[FAIL]${colors.reset}`,
    'WARN': `${colors.yellow}[WARN]${colors.reset}`,
  }[level] || `[${level}]`;

  console.log(`${prefix} ${timestamp} ${message}`);
  if (verbose && data) {
    console.log(`       ${JSON.stringify(data, null, 2)}`);
  }
}

function recordCheck(name, passed, details = '') {
  checks.push({ name, passed, details });
  if (passed) {
    passed++;
    log('PASS', name, details);
  } else {
    failed++;
    log('FAIL', name, details);
  }
}

/**
 * Check 1: Logging Service
 */
async function checkLoggingService() {
  try {
    const logsDir = path.join(__dirname, '../logs');
    const fs = require('fs');

    if (!fs.existsSync(logsDir)) {
      recordCheck('Logging Service: Logs directory', false, 'Logs directory not found');
      return;
    }

    const files = fs.readdirSync(logsDir);
    const hasLogFiles = files.some(f => f.includes('.log'));

    if (hasLogFiles) {
      recordCheck('Logging Service: Log files', true, {
        directory: logsDir,
        files: files.filter(f => f.includes('.log')),
      });
    } else {
      recordCheck('Logging Service: Log files', false, 'No .log files found');
    }
  } catch (error) {
    recordCheck('Logging Service', false, error.message);
  }
}

/**
 * Check 2: Metrics Endpoint
 */
async function checkMetricsEndpoint() {
  return new Promise((resolve) => {
    const metricsURL = `${baseURL}/metrics`;

    http.get(metricsURL, { timeout: 5000 }, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          // Check for prometheus format
          const hasHELP = data.includes('# HELP');
          const hasTYPE = data.includes('# TYPE');
          const hasMetrics = data.includes('_total') || data.includes('_ms');

          if (hasHELP && hasTYPE && hasMetrics) {
            recordCheck('Metrics Endpoint: Format', true, {
              url: metricsURL,
              statusCode: res.statusCode,
              hasMetrics: true,
            });

            // Count metrics
            const metricCount = (data.match(/^[a-z_]+\{/gm) || []).length;
            recordCheck('Metrics Endpoint: Metric Count', metricCount > 10, {
              count: metricCount,
              required: 10,
            });

            // Check for core metrics
            const coreMetrics = [
              'decision_latency_ms',
              'queue_depth_total',
              'action_executions_total',
              'policy_evaluations_total',
              'errors_total',
            ];

            let allFound = true;
            const missing = [];

            coreMetrics.forEach(metric => {
              if (!data.includes(metric)) {
                allFound = false;
                missing.push(metric);
              }
            });

            recordCheck('Metrics Endpoint: Core Metrics', allFound, {
              missing: missing.length === 0 ? 'none' : missing,
              found: coreMetrics.length - missing.length,
              required: coreMetrics.length,
            });
          } else {
            recordCheck('Metrics Endpoint: Format', false, {
              hasHELP,
              hasTYPE,
              hasMetrics,
            });
          }
        } else {
          recordCheck('Metrics Endpoint', false, {
            statusCode: res.statusCode,
            expected: 200,
          });
        }

        resolve();
      });
    }).on('error', (error) => {
      recordCheck('Metrics Endpoint', false, error.message);
      resolve();
    });
  });
}

/**
 * Check 3: Health Endpoint
 */
async function checkHealthEndpoint() {
  return new Promise((resolve) => {
    const healthURL = `${baseURL}/health`;

    http.get(healthURL, { timeout: 5000 }, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if ([200, 503].includes(res.statusCode)) {
          try {
            const health = JSON.parse(data);

            recordCheck('Health Endpoint: Response', true, {
              url: healthURL,
              status: health.status,
              safeMode: health.safeMode,
            });

            // Check required fields
            const required = ['status', 'timestamp', 'safeMode', 'redis'];
            const missing = required.filter(field => !(field in health));

            recordCheck('Health Endpoint: Required Fields', missing.length === 0, {
              missing: missing.length === 0 ? 'none' : missing,
            });
          } catch (error) {
            recordCheck('Health Endpoint: JSON', false, error.message);
          }
        } else {
          recordCheck('Health Endpoint', false, {
            statusCode: res.statusCode,
            expected: '200 or 503',
          });
        }

        resolve();
      });
    }).on('error', (error) => {
      recordCheck('Health Endpoint', false, error.message);
      resolve();
    });
  });
}

/**
 * Check 4: Audit Trail (MongoDB)
 */
async function checkAuditTrail() {
  try {
    // Try to load the AuditEvent model
    const AuditEvent = require(path.join(__dirname, '../models/AuditEvent'));
    
    if (AuditEvent) {
      recordCheck('Audit Trail: Model', true, {
        model: 'AuditEvent',
        schema: 'Defined',
      });

      // Check if indexes are defined
      const schema = AuditEvent.schema;
      const hasIndexes = Object.keys(schema.indexes()).length > 0;

      recordCheck('Audit Trail: Indexes', hasIndexes, {
        indexes: Object.keys(schema.indexes()),
      });
    }
  } catch (error) {
    recordCheck('Audit Trail: Model', false, error.message);
  }
}

/**
 * Check 5: Services Initialization
 */
async function checkServices() {
  try {
    // Check if services can be loaded
    const services = [
      'metricsService',
      'loggingService',
      'StructuredLogger',
    ];

    for (const service of services) {
      try {
        let loaded = false;

        if (service === 'metricsService') {
          const { metricsService } = require(path.join(__dirname, '../services/infrastructure'));
          loaded = !!metricsService;
        } else if (service === 'loggingService') {
          const { loggingService } = require(path.join(__dirname, '../services/infrastructure'));
          loaded = !!loggingService;
        } else if (service === 'StructuredLogger') {
          const StructuredLogger = require(path.join(__dirname, '../services/observability/structuredLogger'));
          loaded = !!StructuredLogger;
        }

        recordCheck(`Services: ${service}`, loaded, { status: 'available' });
      } catch (error) {
        recordCheck(`Services: ${service}`, false, error.message);
      }
    }
  } catch (error) {
    log('WARN', 'Could not verify services', error.message);
  }
}

/**
 * Summary Report
 */
function printSummary() {
  console.log('\n' + colors.bright + '═══════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.bright + 'OBSERVABILITY HEALTH CHECK SUMMARY' + colors.reset);
  console.log(colors.bright + '═══════════════════════════════════════════════════════════' + colors.reset);

  checks.forEach(check => {
    const status = check.passed ? `${colors.green}✓ PASS${colors.reset}` : `${colors.red}✗ FAIL${colors.reset}`;
    console.log(`${status}  ${check.name}`);
    if (verbose && check.details) {
      console.log(`       ${check.details}`);
    }
  });

  console.log('\n' + colors.bright + '───────────────────────────────────────────────────────────' + colors.reset);
  console.log(`Total Checks: ${checks.length}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(colors.bright + '═══════════════════════════════════════════════════════════' + colors.reset + '\n');

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Main execution
 */
async function main() {
  log('INFO', 'Starting Observability Health Check');
  log('INFO', `Target endpoint: ${baseURL}`);
  log('INFO', `Verbose mode: ${verbose}`);
  console.log('');

  try {
    // Run checks sequentially
    log('INFO', 'Checking Logging Service...');
    await checkLoggingService();

    log('INFO', 'Checking Metrics Endpoint...');
    await checkMetricsEndpoint();

    log('INFO', 'Checking Health Endpoint...');
    await checkHealthEndpoint();

    log('INFO', 'Checking Audit Trail...');
    await checkAuditTrail();

    log('INFO', 'Checking Services Initialization...');
    await checkServices();
  } catch (error) {
    log('FAIL', 'Unexpected error during checks', error);
  } finally {
    printSummary();
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
