#!/usr/bin/env node

/**
 * AIRA CLI Tool
 * Command-line interface for managing AIRA policies and operations
 * 
 * Usage:
 *   aira policy validate <yaml-file>
 *   aira policy dry-run <incident-json> [--policy <yaml-file>]
 *   aira policy deploy <yaml-file> [--tenant <tenant-id>]
 *   aira policy rollback <policy-version> [--tenant <tenant-id>]
 *   aira policy list [--tenant <tenant-id>]
 *   aira policy show <policy-name> [--tenant <tenant-id>]
 *   aira status
 *   aira health [--verbose]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const axios = require('axios');

const packageJson = require('../package.json');

class AiraCLI {
  constructor() {
    this.apiUrl = process.env.AIRA_API_URL || 'http://localhost:5000';
    this.apiKey = process.env.AIRA_API_KEY || '';
    this.version = packageJson.version;
  }

  /**
   * Run CLI command
   */
  async run(args) {
    const [command, subcommand, ...rest] = args.slice(2);

    try {
      if (!command) {
        return this.printHelp();
      }

      if (command === 'policy') {
        return await this.handlePolicyCommand(subcommand, rest);
      } else if (command === 'status') {
        return await this.handleStatusCommand();
      } else if (command === 'health') {
        return await this.handleHealthCommand(rest);
      } else if (command === '--version' || command === '-v') {
        return console.log(`AIRA v${this.version}`);
      } else if (command === '--help' || command === '-h') {
        return this.printHelp();
      } else {
        console.error(`❌ Unknown command: ${command}`);
        this.printHelp();
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ CLI Error: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Handle policy commands
   */
  async handlePolicyCommand(subcommand, args) {
    switch (subcommand) {
      case 'validate':
        return await this.validatePolicy(args);
      case 'dry-run':
        return await this.dryRunPolicy(args);
      case 'deploy':
        return await this.deployPolicy(args);
      case 'rollback':
        return await this.rollbackPolicy(args);
      case 'list':
        return await this.listPolicies(args);
      case 'show':
        return await this.showPolicy(args);
      default:
        console.error(`❌ Unknown policy command: ${subcommand}`);
        console.log('Availablecommands: validate, dry-run, deploy, rollback, list, show');
        process.exit(1);
    }
  }

  /**
   * Validate policy YAML file
   */
  async validatePolicy(args) {
    if (args.length === 0) {
      console.error('❌ Usage: aira policy validate <yaml-file>');
      process.exit(1);
    }

    const filePath = args[0];

    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const policy = yaml.load(content);

      console.log('📋 Validating policy...\n');

      const errors = [];
      const warnings = [];

      // Basic structure validation
      if (!policy.version) {
        errors.push('Missing required field: version');
      }

      if (!policy.rules || !Array.isArray(policy.rules)) {
        errors.push('Missing or invalid rules array');
      } else if (policy.rules.length === 0) {
        warnings.push('Policy has no rules');
      } else {
        policy.rules.forEach((rule, idx) => {
          if (!rule.id) {
            errors.push(`Rule ${idx}: missing id`);
          }
          if (!rule.description) {
            errors.push(`Rule ${idx}: missing description`);
          }
          if (!rule.actions || !Array.isArray(rule.actions)) {
            errors.push(`Rule ${idx}: missing or invalid actions`);
          }
          if (rule.actions && rule.actions.length > 5) {
            warnings.push(
              `Rule ${idx}: has ${rule.actions.length} actions (recommended max 3)`
            );
          }
        });
      }

      if (errors.length > 0) {
        console.log('❌ VALIDATION FAILED\n');
        errors.forEach((err) => console.log(`  • ${err}`));
        process.exit(1);
      }

      if (warnings.length > 0) {
        console.log('⚠️  VALIDATION PASSED WITH WARNINGS\n');
        warnings.forEach((warn) => console.log(`  • ${warn}`));
      } else {
        console.log('✅ VALIDATION PASSED\n');
      }

      console.log(`Policy Details:`);
      console.log(`  Version: ${policy.version}`);
      console.log(`  Rules: ${policy.rules?.length || 0}`);
      console.log(`  Actions: ${new Set(policy.rules?.flatMap((r) => r.actions) || []).size}`);
    } catch (error) {
      console.error(`❌ Validation failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Dry-run policy against incident data
   */
  async dryRunPolicy(args) {
    if (args.length === 0) {
      console.error('❌ Usage: aira policy dry-run <incident-json> [--policy <yaml-file>]');
      process.exit(1);
    }

    const incidentFile = args[0];
    const policyFile = args.includes('--policy')
      ? args[args.indexOf('--policy') + 1]
      : null;

    if (!fs.existsSync(incidentFile)) {
      console.error(`❌ Incident file not found: ${incidentFile}`);
      process.exit(1);
    }

    try {
      const incidentData = JSON.parse(fs.readFileSync(incidentFile, 'utf8'));
      let policy = null;

      if (policyFile) {
        if (!fs.existsSync(policyFile)) {
          console.error(`❌ Policy file not found: ${policyFile}`);
          process.exit(1);
        }
        policy = yaml.load(fs.readFileSync(policyFile, 'utf8'));
      }

      console.log('🧪 Running policy dry-run...\n');
      console.log(`Incident: ${incidentData.type || 'Unknown'}`);
      console.log(`Severity: ${incidentData.severity || 'Unknown'}`);

      // Call API for dry-run
      const response = await this.apiCall('POST', '/decisions/dry-run', {
        incident: incidentData,
        policy,
      });

      console.log('\nDry-run Result:');
      console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      console.error(`❌ Dry-run failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Deploy policy to AIRA
   */
  async deployPolicy(args) {
    if (args.length === 0) {
      console.error('❌ Usage: aira policy deploy <yaml-file> [--tenant <id>]');
      process.exit(1);
    }

    const filePath = args[0];
    const tenantId = args.includes('--tenant')
      ? args[args.indexOf('--tenant') + 1]
      : 'default';

    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const policy = yaml.load(content);

      console.log(`📦 Deploying policy to tenant: ${tenantId}\n`);

      const response = await this.apiCall('POST', '/policies', {
        tenantId,
        policy,
      });

      console.log('✅ Policy deployed successfully\n');
      console.log(`Policy ID: ${response.policyId}`);
      console.log(`Version: ${response.version}`);
      console.log(`Deployed at: ${response.deployedAt}`);
    } catch (error) {
      console.error(`❌ Deployment failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Rollback policy to previous version
   */
  async rollbackPolicy(args) {
    if (args.length === 0) {
      console.error('❌ Usage: aira policy rollback <policyId:version> [--tenant <id>]');
      process.exit(1);
    }

    const [policyId, version] = args[0].split(':');
    const tenantId = args.includes('--tenant')
      ? args[args.indexOf('--tenant') + 1]
      : 'default';

    if (!version) {
      console.error('❌ Usage: aira policy rollback <policyId:version>');
      process.exit(1);
    }

    try {
      console.log(
        `⏮️  Rolling back policy ${policyId} to version ${version}...\n`
      );

      const response = await this.apiCall(
        'POST',
        `/policies/${policyId}/rollback`,
        {
          tenantId,
          version,
        }
      );

      console.log('✅ Rollback successful\n');
      console.log(`Rolled back to version: ${response.version}`);
      console.log(`Timestamp: ${response.rolledbackAt}`);
    } catch (error) {
      console.error(`❌ Rollback failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * List policies
   */
  async listPolicies(args) {
    const tenantId = args.includes('--tenant')
      ? args[args.indexOf('--tenant') + 1]
      : 'default';

    try {
      console.log('📋 Listing policies...\n');

      const response = await this.apiCall('GET', '/policies', {
        tenantId,
      });

      const policies = response.policies || [];
      if (policies.length === 0) {
        console.log('No policies found.');
      } else {
        policies.forEach((p) => {
          console.log(`  • ${p.id} (v${p.version}) - ${p.status}`);
        });
      }
    } catch (error) {
      console.error(`❌ Failed to list policies: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Show policy details
   */
  async showPolicy(args) {
    if (args.length === 0) {
      console.error('❌ Usage: aira policy show <policy-id> [--tenant <id>]');
      process.exit(1);
    }

    const policyId = args[0];
    const tenantId = args.includes('--tenant')
      ? args[args.indexOf('--tenant') + 1]
      : 'default';

    try {
      const response = await this.apiCall('GET', `/policies/${policyId}`, {
        tenantId,
      });

      console.log('📋 Policy Details:\n');
      console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      console.error(`❌ Failed to show policy: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Handle status command
   */
  async handleStatusCommand() {
    try {
      const response = await this.apiCall('GET', '/status');

      console.log('📊 AIRA System Status\n');
      console.log(`Status: ${response.status}\n`);
      console.log(`Components:`);
      console.log(`  • Database: ${response.database}`);
      console.log(`  • Redis: ${response.redis}`);
      console.log(`  • Kubernetes: ${response.kubernetes}`);
      console.log(`\nVersion: ${response.version}`);
    } catch (error) {
      console.error(`System unavailable: ${error.message}`);
    }
  }

  /**
   * Handle health command
   */
  async handleHealthCommand(args) {
    try {
      const verbose = args.includes('--verbose') || args.includes('-v');

      const response = await this.apiCall(
        'GET',
        verbose ? '/health/detailed' : '/health'
      );

      console.log('❤️  AIRA Health Check\n');
      console.log(`Status: ${response.status === 'ok' ? '✅ Healthy' : '⚠️  Degraded'}`);

      if (verbose && response.components) {
        console.log(`\nComponents:`);
        Object.entries(response.components).forEach(([key, value]) => {
          const status =
            value === 'connected' || value === 'running'
              ? '✅'
              : value === 'degraded'
              ? '⚠️'
              : '❌';
          console.log(`  ${status} ${key}: ${value}`);
        });
      }

      if (response.warnings && response.warnings.length > 0) {
        console.log(`\nWarnings:`);
        response.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
      }
    } catch (error) {
      console.error(`Health check failed: ${error.message}`);
    }
  }

  /**
   * Make API call
   */
  async apiCall(method, path, data = null) {
    try {
      const config = {
        method,
        url: `${this.apiUrl}${path}`,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (this.apiKey) {
        config.headers['X-API-Key'] = this.apiKey;
      }

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      const message =
        error.response?.data?.error ||
        error.message ||
        'Unknown API error';
      throw new Error(message);
    }
  }

  /**
   * Print help
   */
  printHelp() {
    console.log(`
🤖 AIRA (Autonomous Incident Recovery Agent) CLI v${this.version}

USAGE:
  aira [COMMAND] [SUBCOMMAND] [OPTIONS]

COMMANDS:

  policy          Policy management
    validate        Validate YAML policy file
    dry-run         Test policy against incident data
    deploy          Deploy policy to AIRA
    rollback        Rollback policy to previous version
    list            List policies
    show            Show policy details

  status          Show system status
  health          Check system health (--verbose for details)

  --version       Show version
  --help          Show this help

ENVIRONMENT:
  AIRA_API_URL    API endpoint (default: http://localhost:5000)
  AIRA_API_KEY    API key for authentication

EXAMPLES:
  aira policy validate ./my-policy.yaml
  aira policy dry-run ./incident.json --policy ./my-policy.yaml
  aira policy deploy ./my-policy.yaml --tenant prod
  aira policy rollback my-policy:v1 --tenant prod
  aira health --verbose
`);
  }
}

// Run CLI
const cli = new AiraCLI();
cli.run(process.argv).catch((error) => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});
