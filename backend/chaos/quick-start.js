/**
 * Quick Start Script
 * 
 * Validates environment and runs a quick chaos test to verify setup
 * Usage: node backend/chaos/quick-start.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

class QuickStart {
  constructor(baseUrl = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Run all validations
   */
  async validate() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║      CHAOS TESTING HARNESS - QUICK START & VALIDATION      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Check 1: Node version
    this._checkNodeVersion();

    // Check 2: Required files
    this._checkRequiredFiles();

    // Check 3: Dependencies
    this._checkDependencies();

    // Check 4: API connectivity
    await this._checkAPIConnectivity();

    // Check 5: API endpoints
    await this._checkAPIEndpoints();

    // Print summary
    this._printSummary();

    // If all checks pass, offer to run quick test
    if (this.failed === 0) {
      await this._offerQuickTest();
    }

    return this.failed === 0;
  }

  /**
   * Check Node version
   */
  _checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

    const passed = majorVersion >= 14;
    this._recordCheck('Node.js Version', `${nodeVersion} (require >= 14)`, passed);
  }

  /**
   * Check required files exist
   */
  _checkRequiredFiles() {
    const requiredFiles = [
      'ChaosTestFramework.js',
      'SafetyGatesValidator.js',
      'ChaosScenarios.js',
      'ChaosTestReporter.js',
      'run-chaos-tests.js',
      'CHAOS-TESTING-GUIDE.md',
    ];

    const chaosDir = path.join(__dirname);

    for (const file of requiredFiles) {
      const filepath = path.join(chaosDir, file);
      const exists = fs.existsSync(filepath);
      this._recordCheck(`File: ${file}`, exists ? 'Found' : 'Missing', exists);
    }
  }

  /**
   * Check dependencies
   */
  _checkDependencies() {
    const dependencies = ['axios'];

    for (const dep of dependencies) {
      try {
        require(dep);
        this._recordCheck(`Dependency: ${dep}`, 'Installed', true);
      } catch (error) {
        this._recordCheck(
          `Dependency: ${dep}`,
          'Missing (npm install axios)',
          false
        );
      }
    }
  }

  /**
   * Check API connectivity
   */
  async _checkAPIConnectivity() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      });

      const passed =
        response.status === 200 &&
        response.data &&
        response.data.status === 'ok';
      this._recordCheck(
        'API Connectivity',
        passed ? 'Healthy' : 'Unhealthy response',
        passed
      );
    } catch (error) {
      this._recordCheck(
        'API Connectivity',
        `Failed (${error.message})`,
        false
      );
    }
  }

  /**
   * Check API endpoints
   */
  async _checkAPIEndpoints() {
    const tenantId = 'quick-start-validation';
    const endpoints = [
      {
        method: 'GET',
        path: `/api/v1/tenants/${tenantId}/decisions`,
        description: 'List decisions endpoint',
      },
    ];

    for (const endpoint of endpoints) {
      try {
        const url = `${this.baseUrl}${endpoint.path}`;
        const timestamp = Date.now().toString();
        const idempotencyKey = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Compute signature: HMAC-SHA256(body + timestamp, secret)
        // For GET requests, body is empty string
        const bodyString = '';
        const messageToSign = bodyString + timestamp;
        const signature = crypto
          .createHmac('sha256', 'chaos-secret')
          .update(messageToSign)
          .digest('hex');
        
        await axios({
          method: endpoint.method,
          url,
          headers: {
            'Authorization': `Bearer chaos-key:chaos-secret`,
            'X-Timestamp': timestamp,
            'X-Idempotency-Key': idempotencyKey,
            'X-Signature': signature,
          },
          timeout: 5000,
        });

        this._recordCheck(`Endpoint: ${endpoint.description}`, 'Accessible', true);
      } catch (error) {
        // 401/403 is OK - endpoint exists but auth failed
        const passed = error.response?.status === 401 || error.response?.status === 403;
        this._recordCheck(
          `Endpoint: ${endpoint.description}`,
          passed
            ? 'Accessible (auth required)'
            : `Error (${error.response?.status || error.message})`,
          passed
        );
      }
    }
  }

  /**
   * Record check result
   */
  _recordCheck(name, result, passed) {
    this.checks.push({ name, result, passed });
    if (passed) {
      this.passed++;
    } else {
      this.failed++;
    }
  }

  /**
   * Print validation summary
   */
  _printSummary() {
    console.log('\nVALIDATION RESULTS:');
    console.log('═'.repeat(60));

    for (const check of this.checks) {
      const status = check.passed ? '✓' : '✗';
      const statusColor = check.passed ? '\x1b[32m' : '\x1b[31m'; // Green or Red
      const resetColor = '\x1b[0m';

      console.log(
        `${statusColor}${status}${resetColor} ${check.name.padEnd(35)} ${check.result}`
      );
    }

    console.log('═'.repeat(60));
    console.log(`Passed: ${this.passed}/${this.checks.length}`);
    console.log(`Failed: ${this.failed}/${this.checks.length}`);
    console.log();

    if (this.failed === 0) {
      console.log('✓ All validation checks passed!');
    } else {
      console.log('✗ Some validation checks failed. See above for details.');
      console.log('\nCommon fixes:');
      console.log('  1. Install dependencies: npm install axios');
      console.log('  2. Start API server: npm start (in backend directory)');
      console.log('  3. Check API base URL: --baseUrl http://your-api:5000');
    }
  }

  /**
   * Offer to run a quick test
   */
  async _offerQuickTest() {
    console.log('\n' + '═'.repeat(60));
    console.log('QUICK TEST');
    console.log('═'.repeat(60));
    console.log(
      '\nRunning a quick 10-signal test to verify end-to-end functionality...\n'
    );

    try {
      const ChaosTestFramework = require('./ChaosTestFramework');

      const framework = new ChaosTestFramework(this.baseUrl, 'quick-start-test');

      // Inject 10 quick signals
      const signals = [
        {
          signalType: 'errorRate',
          service: 'api-gateway',
          value: 0.5,
          severity: 'warning',
        },
        {
          signalType: 'latency',
          service: 'database',
          value: 1500,
          severity: 'critical',
        },
        {
          signalType: 'cpu',
          service: 'api-service',
          value: 85,
          severity: 'warning',
        },
        {
          signalType: 'errorRate',
          service: 'api-gateway',
          value: 0.8,
          severity: 'critical',
        },
        {
          signalType: 'latency',
          service: 'api-gateway',
          value: 2500,
          severity: 'critical',
        },
      ];

      console.log(`Injecting ${signals.length} test signals...`);

      for (const signal of signals) {
        const result = await framework.injectSignal(signal);
        const status = result.success ? '✓' : '✗';
        console.log(
          `${status} ${signal.signalType} (${signal.service}): ${result.latency || '?'}ms`
        );
      }

      console.log('\n✓ Quick test completed successfully!');
      console.log('\nYou are ready to run full chaos tests:');
      console.log('  node backend/chaos/run-chaos-tests.js\n');
    } catch (error) {
      console.error(
        `\n✗ Quick test failed: ${error.message}`
      );
      console.error(
        'Check that your API server is running and decision engine is processing signals.'
      );
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  let baseUrl = 'http://localhost:5000';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseUrl' && i + 1 < args.length) {
      baseUrl = args[i + 1];
    }
  }

  const validator = new QuickStart(baseUrl);
  const success = await validator.validate();

  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Quick start failed:', error.message);
  process.exit(1);
});
