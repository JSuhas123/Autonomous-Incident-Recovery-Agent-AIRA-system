/**
 * Feature Flags Configuration
 * Controls optional behaviors that are NOT required for core operation
 * 
 * ALL FLAGS DEFAULT TO FALSE (safe mode)
 * Explicitly enable only in development or when validated for production
 */

class FeatureFlags {
  constructor() {
    this.flags = {
      // Analysis Features
      ENABLE_OPENAI_ANALYSIS: {
        enabled: process.env.ENABLE_OPENAI_ANALYSIS === 'true',
        description: 'Use OpenAI for incident classification (non-deterministic, adds latency)',
        risk: 'HIGH - breaks reproducibility and determinism claims',
        fallback: 'Rule-based analysis (always available)',
      },

      ENABLE_INCIDENT_LEARNING: {
        enabled: process.env.ENABLE_INCIDENT_LEARNING === 'true',
        description: 'Adaptive behavior learning from incident outcomes',
        risk: 'MEDIUM - requires feedback loop integration',
        fallback: 'Static policy rules',
      },

      ENABLE_COST_OPTIMIZATION: {
        enabled: process.env.ENABLE_COST_OPTIMIZATION === 'true',
        description: 'Cost-aware decision making (blocks expensive actions in low-severity incidents)',
        risk: 'LOW',
        fallback: 'All approved actions execute',
      },

      ENABLE_ML_CONFIDENCE_BOOST: {
        enabled: process.env.ENABLE_ML_CONFIDENCE_BOOST === 'true',
        description: 'Use ML to adjust confidence scores (experimental)',
        risk: 'MEDIUM - not yet validated',
        fallback: 'Rule-based confidence scoring',
      },

      ENABLE_CROSS_TENANT_CORRELATION: {
        enabled: process.env.ENABLE_CROSS_TENANT_CORRELATION === 'true',
        description: 'Correlate incidents across tenants (identifies cascading failures)',
        risk: 'HIGH - potential tenant data leak if buggy',
        fallback: 'Per-tenant analysis only',
      },

      // Execution Features
      ENABLE_KUBERNETES_EXECUTOR: {
        enabled: process.env.ENABLE_KUBERNETES_EXECUTOR === 'true',
        description: 'Actually execute actions on Kubernetes cluster',
        risk: 'CRITICAL - real infrastructure changes',
        fallback: 'Dry-run only (decision without execution)',
      },

      ENABLE_AUTO_REMEDIATION: {
        enabled: process.env.ENABLE_AUTO_REMEDIATION === 'true',
        description: 'Automatically execute approved actions (vs manual approval)',
        risk: 'CRITICAL - decisions become real',
        fallback: 'Manual approval required',
      },

      // Safety Features
      REQUIRE_MANUAL_APPROVAL_FOR_RESTART: {
        enabled: process.env.REQUIRE_MANUAL_APPROVAL_FOR_RESTART === 'true',
        description: 'Restart actions require human approval before execution',
        risk: 'LOW - safety gate',
        fallback: 'Auto-execute per policy',
      },

      // Observability Features
      ENABLE_DISTRIBUTED_TRACING: {
        enabled: process.env.ENABLE_DISTRIBUTED_TRACING === 'true',
        description: 'Full distributed tracing (Jaeger/DataDog)',
        risk: 'LOW - observability only',
        fallback: 'Correlation IDs only',
      },
    };
  }

  /**
   * Check if feature is enabled
   * CRITICAL: Always returns FALSE if env var not explicitly set to 'true'
   */
  isEnabled(flagName) {
    if (!this.flags[flagName]) {
      throw new Error(`Unknown feature flag: ${flagName}`);
    }
    return this.flags[flagName].enabled;
  }

  /**
   * Get all flags and their status
   */
  getAllFlags() {
    return Object.entries(this.flags).map(([name, config]) => ({
      name,
      enabled: config.enabled,
      description: config.description,
      risk: config.risk,
      fallback: config.fallback,
    }));
  }

  /**
   * Safety check: warn if high-risk flags are enabled
   */
  validateProductionSetup() {
    const warnings = [];
    const errors = [];

    // CRITICAL: These should NEVER be enabled in production without explicit approval
    if (this.isEnabled('ENABLE_KUBERNETES_EXECUTOR')) {
      warnings.push(
        'PRODUCTION WARNING: ENABLE_KUBERNETES_EXECUTOR is ON. Real infrastructure changes will occur.'
      );
    }

    if (
      this.isEnabled('ENABLE_AUTO_REMEDIATION') &&
      !this.isEnabled('REQUIRE_MANUAL_APPROVAL_FOR_RESTART')
    ) {
      errors.push(
        'CRITICAL: Auto-remediation enabled WITHOUT manual approval gate. This is unsafe.'
      );
    }

    if (this.isEnabled('ENABLE_OPENAI_ANALYSIS')) {
      warnings.push(
        'PRODUCTION WARNING: OpenAI analysis enabled. Decisions are NOT deterministic.'
      );
    }

    if (this.isEnabled('ENABLE_CROSS_TENANT_CORRELATION')) {
      warnings.push(
        'PRODUCTION WARNING: Cross-tenant correlation enabled. Ensure tenant isolation is verified.'
      );
    }

    return {
      safe: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Log all active flags on startup
   */
  logStartupStatus(logger = console) {
    logger.log('\n═══════════════════════════════════════════');
    logger.log('FEATURE FLAGS STATUS (STARTUP)');
    logger.log('═══════════════════════════════════════════');

    this.getAllFlags().forEach(({ name, enabled, risk }) => {
      const status = enabled ? '✓ ENABLED' : '✗ DISABLED';
      logger.log(`${status} | ${name} [${risk}]`);
    });

    const validation = this.validateProductionSetup();
    if (validation.warnings.length > 0) {
      logger.warn('\nWARNINGS:');
      validation.warnings.forEach((w) => logger.warn(`  ⚠️  ${w}`));
    }

    if (validation.errors.length > 0) {
      logger.error('\nERRORS:');
      validation.errors.forEach((e) => logger.error(`  ❌ ${e}`));
      throw new Error('Feature flag validation failed - unsafe configuration');
    }

    logger.log('═══════════════════════════════════════════\n');
  }
}

module.exports = new FeatureFlags();
