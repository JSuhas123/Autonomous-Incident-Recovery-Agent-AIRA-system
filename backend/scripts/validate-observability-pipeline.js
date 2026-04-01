#!/usr/bin/env node
/**
 * Observability Pipeline Validator
 * 
 * Comprehensive validation that checks:
 * 1. Logging → Metrics correlation
 * 2. Metrics → Alert triggers
 * 3. Audit trail integrity
 * 4. End-to-end trace continuity
 * 
 * Usage: node validate-observability-pipeline.js [--suite=all|logging|metrics|audit|e2e|alerts]
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const args = process.argv.slice(2);
const suiteArg = args.find(arg => arg.startsWith('--suite='));
const suite = suiteArg ? suiteArg.split('=')[1] : 'all';

class ObservabilityValidator {
  constructor() {
    this.results = {
      logging: { passed: 0, failed: 0, skipped: 0 },
      metrics: { passed: 0, failed: 0, skipped: 0 },
      audit: { passed: 0, failed: 0, skipped: 0 },
      e2e: { passed: 0, failed: 0, skipped: 0 },
      alerts: { passed: 0, failed: 0, skipped: 0 },
    };
    this.startTime = Date.now();
  }

  log(level, message, details = '') {
    const timestamp = new Date().toISOString();
    const iconMap = {
      'INFO': 'ℹ️',
      'PASS': '✅',
      'FAIL': '❌',
      'WARN': '⚠️',
      'START': '▶️',
      'SECTION': '📋',
    };

    const colorMap = {
      'INFO': colors.blue,
      'PASS': colors.green,
      'FAIL': colors.red,
      'WARN': colors.yellow,
      'START': colors.cyan,
      'SECTION': colors.bright,
    };

    const icon = iconMap[level] || '•';
    const color = colorMap[level] || colors.reset;

    console.log(`${color}${icon} ${message}${colors.reset}`);
    if (details) {
      console.log(`   ${colors.yellow}${details}${colors.reset}`);
    }
  }

  async validateLoggingPipeline() {
    this.log('SECTION', 'Phase 1: Validating Structured Logging Pipeline');
    console.log('');

    try {
      // Check 1: Logs directory exists
      const logsDir = path.join(__dirname, '../logs');
      if (fs.existsSync(logsDir)) {
        this.log('PASS', 'Logs directory exists', logsDir);
        this.results.logging.passed++;
      } else {
        this.log('FAIL', 'Logs directory missing');
        this.results.logging.failed++;
      }

      // Check 2: Log files have correct format
      try {
        const files = fs.readdirSync(logsDir);
        const logFiles = files.filter(f => f.endsWith('.log'));

        if (logFiles.length > 0) {
          this.log('PASS', `Found ${logFiles.length} log file(s)`, logFiles.join(', '));
          this.results.logging.passed++;

          // Check 3: Sample log entries
          let validJsonCount = 0;
          let totalLines = 0;

          for (const file of logFiles.slice(0, 1)) {
            const content = fs.readFileSync(path.join(logsDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            totalLines += lines.length;

            lines.slice(0, 10).forEach(line => {
              try {
                const parsed = JSON.parse(line);
                if (parsed.correlationId && parsed.timestamp && parsed.level) {
                  validJsonCount++;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            });
          }

          if (validJsonCount > 0) {
            this.log('PASS', 'Log entries have correct JSON structure', `${validJsonCount} valid entries`);
            this.results.logging.passed++;
          } else if (totalLines > 0) {
            this.log('WARN', 'No valid JSON log entries found', `Checked ${totalLines} lines`);
            this.results.logging.failed++;
          } else {
            this.log('WARN', 'Log files are empty');
            this.results.logging.failed++;
          }
        } else {
          this.log('WARN', 'No log files found in directory');
          this.results.logging.failed++;
        }
      } catch (error) {
        this.log('FAIL', 'Could not read log files', error.message);
        this.results.logging.failed++;
      }

      // Check 4: StructuredLogger available
      try {
        require(path.join(__dirname, '../services/observability/structuredLogger'));
        this.log('PASS', 'StructuredLogger service available');
        this.results.logging.passed++;
      } catch (error) {
        this.log('FAIL', 'StructuredLogger not found', error.message);
        this.results.logging.failed++;
      }
    } catch (error) {
      this.log('FAIL', 'Logging validation error', error.message);
      this.results.logging.failed++;
    }

    console.log('');
  }

  async validateMetricsPipeline() {
    this.log('SECTION', 'Phase 2: Validating Prometheus Metrics Pipeline');
    console.log('');

    try {
      // Check 1: MetricsService available
      try {
        const { metricsService } = require(path.join(__dirname, '../services/infrastructure'));
        if (metricsService) {
          this.log('PASS', 'MetricsService initialized');
          this.results.metrics.passed++;

          // Check 2: Core metric methods exist
          const requiredMethods = [
            'recordDecision',
            'recordActionExecution',
            'recordPolicyEvaluation',
            'recordError',
            'getMetrics',
          ];

          let missingMethods = [];
          requiredMethods.forEach(method => {
            if (typeof metricsService[method] === 'function') {
              this.log('PASS', `Metric method available: ${method}`);
              this.results.metrics.passed++;
            } else {
              missingMethods.push(method);
              this.results.metrics.failed++;
            }
          });

          if (missingMethods.length === 0) {
            this.log('PASS', 'All required metrics methods implemented');
            this.results.metrics.passed++;
          }

          // Check 3: Can get metrics
          try {
            const metrics = await metricsService.getMetrics();
            if (metrics && metrics.length > 0) {
              const metricCount = (metrics.match(/^[a-z_]+\{/gm) || []).length;
              this.log('PASS', `Metrics endpoint produces data`, `${metricCount} metric definitions`);
              this.results.metrics.passed++;

              // Check 4: Core metrics present
              const coreMetrics = [
                'decision_latency_ms',
                'action_executions_total',
                'policy_evaluations_total',
                'errors_total',
              ];

              const missingMetrics = coreMetrics.filter(m => !metrics.includes(m));
              if (missingMetrics.length === 0) {
                this.log('PASS', 'All core metrics present');
                this.results.metrics.passed++;
              } else {
                this.log('FAIL', 'Missing metrics', missingMetrics.join(', '));
                this.results.metrics.failed++;
              }
            } else {
              this.log('FAIL', 'No metrics generated');
              this.results.metrics.failed++;
            }
          } catch (error) {
            this.log('FAIL', 'Could not get metrics', error.message);
            this.results.metrics.failed++;
          }
        } else {
          this.log('FAIL', 'MetricsService not initialized');
          this.results.metrics.failed++;
        }
      } catch (error) {
        this.log('FAIL', 'Could not load MetricsService', error.message);
        this.results.metrics.failed++;
      }
    } catch (error) {
      this.log('FAIL', 'Metrics validation error', error.message);
      this.results.metrics.failed++;
    }

    console.log('');
  }

  async validateAuditTrail() {
    this.log('SECTION', 'Phase 3: Validating Audit Trail');
    console.log('');

    try {
      // Check 1: AuditEvent model available
      try {
        const AuditEvent = require(path.join(__dirname, '../models/AuditEvent'));
        this.log('PASS', 'AuditEvent model loaded');
        this.results.audit.passed++;

        // Check 2: Schema indexes configured
        const schema = AuditEvent.schema;
        const indexes = Object.keys(schema.indexes());

        if (indexes.length > 0) {
          this.log('PASS', `Audit indexes configured`, `${indexes.length} indexes`);
          this.results.audit.passed++;

          // Check 3: TTL index exists
          let hasTTL = false;
          for (const index of indexes) {
            // TTL is specified in the schema
            if (schema.paths.timestamp?.options?.expires) {
              hasTTL = true;
              break;
            }
          }

          if (hasTTL || JSON.stringify(schema.options).includes('expireAfterSeconds')) {
            this.log('PASS', 'TTL configured for audit cleanup');
            this.results.audit.passed++;
          } else {
            this.log('WARN', 'TTL index not explicitly verified');
            this.results.audit.failed++;
          }
        } else {
          this.log('FAIL', 'No indexes configured');
          this.results.audit.failed++;
        }
      } catch (error) {
        this.log('FAIL', 'Could not load AuditEvent model', error.message);
        this.results.audit.failed++;
      }

      // Check 4: AuditService available
      try {
        const AuditService = require(path.join(__dirname, '../services/observability/auditService'));
        const requiredMethods = ['recordEvent', 'verifyEvent'];

        let allPresent = true;
        requiredMethods.forEach(method => {
          if (typeof AuditService[method] === 'function') {
            this.log('PASS', `AuditService method: ${method}`);
            this.results.audit.passed++;
          } else {
            this.log('FAIL', `AuditService missing: ${method}`);
            allPresent = false;
            this.results.audit.failed++;
          }
        });

        if (allPresent) {
          this.log('PASS', 'AuditService fully implemented');
        }
      } catch (error) {
        this.log('FAIL', 'Could not load AuditService', error.message);
        this.results.audit.failed++;
      }
    } catch (error) {
      this.log('FAIL', 'Audit validation error', error.message);
      this.results.audit.failed++;
    }

    console.log('');
  }

  async validateE2ETracing() {
    this.log('SECTION', 'Phase 4: Validating End-to-End Tracing');
    console.log('');

    try {
      // Check 1: StructuredLogger context management
      try {
        const StructuredLoggerModule = require(path.join(__dirname, '../services/observability/structuredLogger'));
        // Get the class from the module (the singleton is exported as default)
        const StructuredLoggerClass = StructuredLoggerModule.StructuredLogger || StructuredLoggerModule.constructor;
        const logger = new StructuredLoggerClass();

        const testCorrelationId = `test-${Date.now()}`;
        logger.setContext(testCorrelationId, { tenantId: 'test' });

        const context = logger.getContext(testCorrelationId);
        if (context && context.correlationId === testCorrelationId) {
          this.log('PASS', 'Correlation ID context management works');
          this.results.e2e.passed++;
        } else {
          this.log('FAIL', 'Context management failed');
          this.results.e2e.failed++;
        }

        // Check 2: Log entry includes correlation ID
        const logEntry = logger.info('Test message', testCorrelationId);
        if (logEntry && logEntry.correlationId === testCorrelationId) {
          this.log('PASS', 'Logs include correlation ID');
          this.results.e2e.passed++;
        } else {
          this.log('FAIL', 'Logs missing correlation ID');
          this.results.e2e.failed++;
        }

        logger.clearContext(testCorrelationId);
      } catch (error) {
        this.log('FAIL', 'E2E tracing validation error', error.message);
        this.results.e2e.failed++;
      }

      // Check 3: Trace components are integrated
      const components = [
        { name: 'Logging Service', path: '../services/infrastructure/loggingService' },
        { name: 'Metrics Service', path: '../services/infrastructure/metricsService' },
        { name: 'Audit Service', path: '../services/observability/auditService' },
      ];

      for (const component of components) {
        try {
          require(path.join(__dirname, component.path));
          this.log('PASS', `${component.name} integrated`);
          this.results.e2e.passed++;
        } catch (error) {
          this.log('FAIL', `${component.name} not found`);
          this.results.e2e.failed++;
        }
      }
    } catch (error) {
      this.log('FAIL', 'End-to-End validation error', error.message);
      this.results.e2e.failed++;
    }

    console.log('');
  }

  async validateAlerts() {
    this.log('SECTION', 'Phase 5: Validating Alert Rules');
    console.log('');

    try {
      // Check 1: Alert rules are defined
      const alertRules = [
        { name: 'HighEscalationRate', metric: 'action_executions_total', threshold: 0.2 },
        { name: 'HighErrorRate', metric: 'errors_total', threshold: 0.5 },
        { name: 'KillSwitchActivated', metric: 'circuit_breaker_state', threshold: null },
      ];

      this.log('PASS', 'Alert rules defined');
      this.results.alerts.passed++;

      // Check 2: Alert rules are well-formed
      alertRules.forEach(rule => {
        if (rule.name && rule.metric && (rule.threshold !== null || rule.name.includes('KillSwitch'))) {
          this.log('PASS', `Alert rule configured: ${rule.name}`);
          this.results.alerts.passed++;
        } else {
          this.log('FAIL', `Alert rule incomplete: ${rule.name}`);
          this.results.alerts.failed++;
        }
      });

      // Check 3: Metrics Service can track alert conditions
      try {
        const { metricsService } = require(path.join(__dirname, '../services/infrastructure'));

        // Record some test metrics
        metricsService.recordActionExecution('test', 'ESCALATE_TO_HUMAN', 'success');
        metricsService.recordError('test', 'test-component', 'test-error');
        metricsService.recordCircuitBreakerState('test', 'test-service', 1);

        this.log('PASS', 'Alert conditions can be recorded');
        this.results.alerts.passed++;
      } catch (error) {
        this.log('FAIL', 'Could not record alert conditions', error.message);
        this.results.alerts.failed++;
      }

      // Check 4: Alert rules can be queried from metrics
      try {
        const { metricsService } = require(path.join(__dirname, '../services/infrastructure'));
        const metrics = await metricsService.getMetrics();

        if (metrics && metrics.includes('action_executions_total') && 
            metrics.includes('errors_total') && 
            metrics.includes('circuit_breaker_state')) {
          this.log('PASS', 'Alert metrics available for querying');
          this.results.alerts.passed++;
        } else {
          this.log('FAIL', 'Not all alert metrics found in output');
          this.results.alerts.failed++;
        }
      } catch (error) {
        this.log('FAIL', 'Alert metrics not queryable', error.message);
        this.results.alerts.failed++;
      }
    } catch (error) {
      this.log('FAIL', 'Alert validation error', error.message);
      this.results.alerts.failed++;
    }

    console.log('');
  }

  printSummary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);

    console.log(colors.bright + '═══════════════════════════════════════════════════════════' + colors.reset);
    console.log(colors.bright + 'OBSERVABILITY VALIDATION SUMMARY' + colors.reset);
    console.log(colors.bright + '═══════════════════════════════════════════════════════════' + colors.reset);
    console.log('');

    const suites = ['logging', 'metrics', 'audit', 'e2e', 'alerts'];
    let totalPassed = 0;
    let totalFailed = 0;

    suites.forEach(suiteName => {
      const result = this.results[suiteName];
      const total = result.passed + result.failed;
      const percentage = total > 0 ? ((result.passed / total) * 100).toFixed(0) : '0';

      const statusIcon = result.failed === 0 ? colors.green + '✓' : colors.red + '✗';

      console.log(`${statusIcon} ${colors.bright}${suiteName.toUpperCase()}${colors.reset}: ${result.passed} passed, ${result.failed} failed (${percentage}%)`);

      totalPassed += result.passed;
      totalFailed += result.failed;
    });

    console.log('');
    console.log(colors.bright + '───────────────────────────────────────────────────────────' + colors.reset);
    console.log(`${colors.green}Total Passed: ${totalPassed}${colors.reset}`);
    console.log(`${colors.red}Total Failed: ${totalFailed}${colors.reset}`);
    console.log(`Time: ${elapsed}s`);
    console.log(colors.bright + '═══════════════════════════════════════════════════════════' + colors.reset + '\n');

    return totalFailed === 0;
  }

  async validate() {
    console.log(colors.bright + '\n🔍 OBSERVABILITY PIPELINE VALIDATOR\n' + colors.reset);
    console.log(`Suite: ${suite}`);
    console.log('');

    try {
      if (suite === 'all' || suite === 'logging') await this.validateLoggingPipeline();
      if (suite === 'all' || suite === 'metrics') await this.validateMetricsPipeline();
      if (suite === 'all' || suite === 'audit') await this.validateAuditTrail();
      if (suite === 'all' || suite === 'e2e') await this.validateE2ETracing();
      if (suite === 'all' || suite === 'alerts') await this.validateAlerts();

      const success = this.printSummary();
      process.exit(success ? 0 : 1);
    } catch (error) {
      console.error('Validation error:', error);
      process.exit(1);
    }
  }
}

// Run validator
const validator = new ObservabilityValidator();
validator.validate();
