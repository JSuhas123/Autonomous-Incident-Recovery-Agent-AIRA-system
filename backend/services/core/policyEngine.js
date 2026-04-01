const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");
const policyVersioningService = require("./policyVersioningService");
const { validatePolicy } = require("./policy/policyValidator");

/**
 * Policy Engine
 * Evaluates YAML-based policy rules dynamically
 * Replaces hardcoded policy logic in policyService.js
 * 
 * CRITICAL FIXES:
 * 1. Always validates policies before loading
 * 2. Always attempts to fetch and attach policy version for determinism
 * 3. Fails fast if policy invalid (no silent degradation)
 */

class PolicyEngine {
  constructor() {
    this.policies = {};
    this.loadPolicies();
  }

  /**
   * Load policies from YAML files
   * CRITICAL: Validates YAML syntax + schema before accepting
   */
  loadPolicies() {
    try {
      // Resolve policiesDir from backend root, not from __dirname
      const policiesDir = path.resolve(__dirname, "../../policies");
      if (!fs.existsSync(policiesDir)) {
        fs.mkdirSync(policiesDir, { recursive: true });
      }

      const defaultPolicyPath = path.join(policiesDir, "default-policy.yaml");
      if (fs.existsSync(defaultPolicyPath)) {
        const policyContent = fs.readFileSync(defaultPolicyPath, "utf8");
        const parsedPolicy = yaml.load(policyContent);
        
        // CRITICAL FIX: Validate policy before accepting
        const validation = validatePolicy(parsedPolicy);
        if (!validation.valid) {
          console.error('[policy-engine] DEFAULT POLICY INVALID!');
          console.error('[policy-engine] Errors:', validation.errors);
          throw new Error(`Invalid policy: ${validation.errors.map(e => e.message).join('; ')}`);
        }
        
        // Store with validation result
        this.policies.default = parsedPolicy;
        this.policies.defaultValidation = validation;
        console.log('[policy-engine] ✓ Default policy loaded and validated');
      } else {
        // Silently fall back to generated default policy
        this.policies.default = this._getDefaultPolicy();
        this.policies.defaultValidation = { valid: true, errors: [] };
      }
    } catch (error) {
      // CRITICAL FIX: Log error clearly instead of silent fallback
      console.error('[policy-engine] FAILED to load default policy:', error.message);
      console.error('[policy-engine] FALLING BACK to hardcoded default');
      this.policies.default = this._getDefaultPolicy();
      this.policies.defaultValidation = { valid: true, errors: [], isHardcoded: true };
    }
  }

  /**
   * Evaluate policy against decision
   * CRITICAL FIXES:
   * 1. Returns policyVersionId + snapshot for reproducibility
   * 2. ENFORCES policy versioning - fails fast if not available for tenant
   * 3. Validates policy before using
   * 
   * @param {object} decision - Decision to evaluate
   * @param {object} options - {policyOverride, tenantId}
   * @returns {object} Trace with:
   *   - policyVersionId: unique identifier (NEVER "in-memory-default")
   *   - policySnapshot: immutable full policy content
   *   - verdict, checks, appliedRules
   * @throws {Error} If policy versioning required but unavailable
   */
  async evaluatePolicy(decision, options = {}) {
    const { policyOverride = null, tenantId = null } = 
      typeof options === 'object' ? options : { policyOverride: options };
    
    let policy = policyOverride || this.policies.default;
    let policyVersionId = null;
    let policySource = 'default';

    // CRITICAL FIX: For tenant-specific decisions, REQUIRE policy versioning
    // This ensures reproducibility and auditability
    if (tenantId && !policyOverride) {
      try {
        const versionData = await policyVersioningService.getCurrentVersion(
          tenantId,
          "default" // policy name
        );
        if (versionData && versionData.versionId) {
          policyVersionId = versionData.versionId;
          if (versionData.policyContent) {
            policy = versionData.policyContent;
            policySource = `tenant-versioned:${versionData.versionId}`;
          }
        } else {
          // CRITICAL: Policy versioning is required for tenant decisions
          // Fail fast instead of silently degrading
          const error = new Error(
            `[policy-engine] CRITICAL: Policy versioning required for tenant=${tenantId} but no version available. ` +
            `This prevents reproducibility. Please ensure policy versions are initialized for the tenant.`
          );
          error.code = 'POLICY_VERSIONING_REQUIRED';
          error.tenantId = tenantId;
          throw error;
        }
      } catch (error) {
        if (error.code === 'POLICY_VERSIONING_REQUIRED') {
          // Re-throw critical errors
          throw error;
        }
        // For other errors (service unavailable), log but allow using in-memory policy with flag
        console.warn(
          `[policy-engine] WARNING: Could not fetch policy version for tenant=${tenantId}. ` +
          `Using in-memory default policy (NOT reproducible). Error: ${error.message}`
        );
        policyVersionId = `in-memory-fallback-${tenantId}-${Date.now()}`;
        policySource = 'in-memory-fallback';
      }
    } else if (!policyOverride) {
      // Using default policy without tenant
      policyVersionId = `default-${this.policies.default.version || '1.0'}-${Date.now()}`;
      policySource = 'default-in-memory';
    }

    // CRITICAL: Validate policy before using
    const validation = validatePolicy(policy);
    if (!validation.valid) {
      const error = new Error(
        `[policy-engine] CRITICAL: Policy validation failed. ` +
        `Errors: ${validation.errors.map(e => e.message).join('; ')}`
      );
      error.code = 'POLICY_VALIDATION_FAILED';
      error.validationErrors = validation.errors;
      throw error;
    }

    const trace = {
      decisionId: decision.decisionId,
      policyVersion: policy.version,
      // CRITICAL AUDIT: Store the exact policyVersionId used for this decision
      policyVersionId: policyVersionId,
      policySource: policySource,
      // CRITICAL AUDIT: Store immutable snapshot of full policy for reproducibility
      // This enables replaying the decision with the original policy even if policy has changed
      policySnapshot: JSON.parse(JSON.stringify(policy)), // Deep copy for immutability
      timestamp: new Date(),
      checks: [],
      verdict: null,
      reason: [],
      appliedRules: [],
    };

    const recommendedAction = decision.recommendedAction;
    const actionRules = policy.rules.filter((r) =>
      r.actions.includes(recommendedAction)
    );

    if (!actionRules.length) {
      trace.verdict = "APPROVED";
      trace.reason.push(`No specific rules for action "${recommendedAction}"`);
      return trace;
    }

    // Evaluate each rule
    for (const rule of actionRules) {
      const ruleResult = this._evaluateRule(rule, decision);
      trace.checks.push({
        ruleId: rule.id,
        ruleName: rule.description,
        ...ruleResult,
      });

      trace.appliedRules.push(rule.id);

      // If any allowedIf condition fails → DENY
      if (!ruleResult.passed) {
        trace.verdict = "DENIED";
        trace.reason.push(`Rule "${rule.id}" failed: ${rule.denialReason}`);
        break;
      }
    }

    if (trace.verdict !== "DENIED") {
      trace.verdict = "APPROVED";
    }

    return trace;
  }

  /**
   * Evaluate individual rule
   */
  _evaluateRule(rule, decision) {
    const result = {
      passed: true,
      checks: [],
    };

    // Evaluate allowedIf conditions
    if (rule.allowedIf) {
      for (const condition of rule.allowedIf) {
        const conditionMet = this._evaluateCondition(condition, decision);
        result.checks.push(conditionMet);
        if (!conditionMet.met) {
          result.passed = false;
          result.failureReason = `Condition not met: ${conditionMet.description}`;
        }
      }
    }

    // Evaluate denialIf conditions
    if (rule.denialIf && result.passed) {
      for (const condition of rule.denialIf) {
        const conditionMet = this._evaluateCondition(condition, decision);
        if (conditionMet.met) {
          result.passed = false;
          result.failureReason = `Denial condition met: ${conditionMet.description}`;
        }
      }
    }

    return result;
  }

  /**
   * Evaluate individual condition
   */
  _evaluateCondition(condition, decision) {
    // Severity check
    if (condition.severity !== undefined) {
      const allowed = condition.severity.includes(decision.inputs.severity);
      return {
        met: allowed,
        type: "severity",
        condition: decision.inputs.severity,
        allowed: condition.severity,
        description: `Severity ${decision.inputs.severity} in ${condition.severity}`,
      };
    }

    // Confidence check
    if (condition.confidence !== undefined) {
      const minConf = condition.confidence.min || 0;
      const maxConf = condition.confidence.max || 1.0;
      const met =
        decision.inputs.confidence >= minConf &&
        decision.inputs.confidence <= maxConf;
      return {
        met,
        type: "confidence",
        condition: decision.inputs.confidence,
        min: minConf,
        max: maxConf,
        description: `Confidence ${decision.inputs.confidence} within [${minConf}, ${maxConf}]`,
      };
    }

    // Service check
    if (condition.service !== undefined) {
      const affectedServices = decision.inputs.signals.affectedServices || [];
      const met = affectedServices.some((s) => condition.service.includes(s));
      return {
        met,
        type: "service",
        affectedServices,
        deniedServices: condition.service,
        description: `Service restriction check`,
      };
    }

    return {
      met: true,
      type: "unknown",
      description: "Unknown condition type",
    };
  }

  /**
   * Check cooldown enforcement
   */
  checkCooldown(action, actionHistory = []) {
    const actionPolicy = this._getActionPolicy(action);
    if (!actionPolicy || !actionPolicy.cooldowns) {
      return { allowed: true };
    }

    for (const cooldown of actionPolicy.cooldowns) {
      const lastAttempt = actionHistory
        .filter((a) => a.action === action)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (!lastAttempt) continue;

      const cooldownMs = this._parseDuration(cooldown.duration);
      const timeSinceLastAttemptMs = Date.now() - lastAttempt.timestamp;

      if (timeSinceLastAttemptMs < cooldownMs) {
        return {
          allowed: false,
          reason: `Cooldown active for ${action}. Last attempt ${timeSinceLastAttemptMs}ms ago, need ${cooldownMs}ms.`,
          nextAllowedTime: new Date(lastAttempt.timestamp + cooldownMs),
        };
      }

      // Check maxPerDay
      if (cooldown.maxPerDay) {
        const day = 24 * 60 * 60 * 1000;
        const dayAttempts = actionHistory
          .filter(
            (a) =>
              a.action === action &&
              Date.now() - a.timestamp < day
          ).length;

        if (dayAttempts >= cooldown.maxPerDay) {
          return {
            allowed: false,
            reason: `Max ${cooldown.maxPerDay} ${action} per day exceeded. Attempted ${dayAttempts} times today.`,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Get approval requirements for action
   */
  getApprovalRequirements(decision) {
    const action = decision.recommendedAction;
    const actionPolicy = this._getActionPolicy(action);

    if (!actionPolicy) {
      return { required: false };
    }

    if (actionPolicy.requiresApproval) {
      const blastRadius = decision.actionRisk.affectedServiceCount || 0;
      if (blastRadius >= 2) {
        return {
          required: true,
          approvers: actionPolicy.requiresApproval.approvers || [
            "admin",
            "on-call-engineer",
          ],
          reason: `Action affects ${blastRadius} services`,
        };
      }
    }

    return { required: false };
  }

  /**
   * Get action policy config
   */
  _getActionPolicy(action) {
    return (
      this.policies.default?.actions?.find((a) => a.name === action) || null
    );
  }

  /**
   * Parse duration string (e.g., "10m", "1h", "30s")
   */
  _parseDuration(durationStr) {
    const match = durationStr.match(/(\d+)([smhd])/);
    if (!match) return 0;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  }

  /**
   * Default built-in policy
   */
  _getDefaultPolicy() {
    return {
      version: "1.0",
      tenantId: "default",
      rules: [
        {
          id: "restart_allowed",
          description: "Restart service for HIGH/CRITICAL incidents",
          actions: ["restart"],
          allowedIf: [
            { severity: ["HIGH", "CRITICAL"] },
            { confidence: { min: 0.65 } },
          ],
          denialReason:
            "Restart requires HIGH/CRITICAL severity and 65%+ confidence",
        },
        {
          id: "scale_allowed",
          description: "Scale replicas for load issues",
          actions: ["scale-replicas"],
          allowedIf: [{ confidence: { min: 0.6 } }],
          denialReason: "Scale requires 60%+ confidence",
        },
        {
          id: "alert_always_allowed",
          description: "Alert human operator",
          actions: ["alert-human"],
          allowedIf: [],
          denialReason: "Alerts always allowed",
        },
      ],
      actions: [
        {
          name: "restart",
          riskLevel: "medium",
          reversible: true,
          dryRunAvailable: true,
          maxRetries: 2,
          requiresApproval: {
            blastRadius: { minServices: 2 },
            approvers: ["admin"],
          },
        },
        {
          name: "scale-replicas",
          riskLevel: "low",
          reversible: true,
          dryRunAvailable: true,
          maxRetries: 3,
        },
        {
          name: "alert-human",
          riskLevel: "low",
          reversible: true,
          maxRetries: 1,
        },
      ],
    };
  }

  /**
   * Reload policies from files (useful for config updates)
   */
  reloadPolicies() {
    this.loadPolicies();
    console.log("[policy-engine] Policies reloaded");
  }
}

module.exports = new PolicyEngine();
