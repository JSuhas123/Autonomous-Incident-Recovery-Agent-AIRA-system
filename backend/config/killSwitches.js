/**
 * Global Kill Switches Configuration
 * 
 * Production safety mechanism to immediately disable:
 * 1. ALL action execution (ACTIONS_ENABLED)
 * 2. Learning system (ENABLE_INCIDENT_LEARNING)
 * 3. Specific action types if needed
 * 4. Per-tenant controls
 * 
 * CRITICAL: Kill switches take effect IMMEDIATELY
 * No restart required - checked on every request
 */

class KillSwitchManager {
  constructor() {
    // Global kill switches - read from environment
    this.globalKillSwitches = {
      // Master switch: If false, NO actions execute at all
      ACTIONS_ENABLED: process.env.ACTIONS_ENABLED !== 'false', // Default: true

      // Learning system: If false, system uses static rules only
      ENABLE_INCIDENT_LEARNING: process.env.ENABLE_INCIDENT_LEARNING === 'true', // Default: false

      // Emergency mode: Escalate everything to human, no auto-execution
      EMERGENCY_MODE: process.env.EMERGENCY_MODE === 'true', // Default: false

      // Feature flags that affect safety
      REQUIRE_MANUAL_APPROVAL: process.env.REQUIRE_MANUAL_APPROVAL === 'true', // Default: false
    };

    // Per-tenant kill switches (stored in Redis or memory)
    this.tenantKillSwitches = new Map();

    // Action type restrictions (block specific actions)
    this.restrictedActions = new Set(
      (process.env.RESTRICTED_ACTIONS || '').split(',').filter(Boolean)
    );

    // Audit trail of kill switch changes
    this.auditTrail = [];
  }

  /**
   * Check if actions are globally enabled
   */
  areActionsEnabled() {
    return this.globalKillSwitches.ACTIONS_ENABLED && !this.globalKillSwitches.EMERGENCY_MODE;
  }

  /**
   * Check if learning is enabled
   */
  isLearningEnabled() {
    return this.globalKillSwitches.ENABLE_INCIDENT_LEARNING && this.areActionsEnabled();
  }

  /**
   * Check if specific action is allowed
   */
  isActionAllowed(actionName) {
    if (!this.areActionsEnabled()) {
      return false;
    }

    if (this.restrictedActions.has(actionName)) {
      return false;
    }

    return true;
  }

  /**
   * Check if tenant has actions enabled
   */
  isTenantActionsEnabled(tenantId) {
    const tenantKillSwitch = this.tenantKillSwitches.get(tenantId);
    if (tenantKillSwitch !== undefined) {
      return tenantKillSwitch;
    }

    // Fall back to global setting if no tenant-specific switch
    return this.areActionsEnabled();
  }

  /**
   * Enable/disable actions globally
   */
  setActionsEnabled(enabled, reason = '') {
    const oldValue = this.globalKillSwitches.ACTIONS_ENABLED;
    this.globalKillSwitches.ACTIONS_ENABLED = enabled;

    this.auditTrail.push({
      timestamp: new Date(),
      component: 'GLOBAL_KILL_SWITCH',
      action: enabled ? 'ENABLED_ACTIONS' : 'DISABLED_ACTIONS',
      reason,
      changedBy: 'SYSTEM',
      oldValue,
      newValue: enabled,
    });

    console.warn(
      `[KILL SWITCH] ${enabled ? 'ENABLED' : 'DISABLED'} global action execution. Reason: ${reason}`
    );
  }

  /**
   * Enable/disable learning system globally
   */
  setLearningEnabled(enabled, reason = '') {
    const oldValue = this.globalKillSwitches.ENABLE_INCIDENT_LEARNING;
    this.globalKillSwitches.ENABLE_INCIDENT_LEARNING = enabled;

    this.auditTrail.push({
      timestamp: new Date(),
      component: 'LEARNING_KILL_SWITCH',
      action: enabled ? 'ENABLED_LEARNING' : 'DISABLED_LEARNING',
      reason,
      changedBy: 'SYSTEM',
      oldValue,
      newValue: enabled,
    });

    console.warn(
      `[KILL SWITCH] ${enabled ? 'ENABLED' : 'DISABLED'} learning system. Reason: ${reason}`
    );
  }

  /**
   * Enable/disable actions for specific tenant
   */
  setTenantActionsEnabled(tenantId, enabled, reason = '') {
    const oldValue = this.tenantKillSwitches.get(tenantId);
    this.tenantKillSwitches.set(tenantId, enabled);

    this.auditTrail.push({
      timestamp: new Date(),
      component: 'TENANT_KILL_SWITCH',
      action: enabled ? 'ENABLED_TENANT_ACTIONS' : 'DISABLED_TENANT_ACTIONS',
      tenantId,
      reason,
      changedBy: 'SYSTEM',
      oldValue,
      newValue: enabled,
    });

    console.warn(
      `[KILL SWITCH] ${enabled ? 'ENABLED' : 'DISABLED'} actions for tenant ${tenantId}. Reason: ${reason}`
    );
  }

  /**
   * Activate emergency mode (all decisions escalated to human)
   */
  activateEmergencyMode(reason = '') {
    this.globalKillSwitches.EMERGENCY_MODE = true;

    this.auditTrail.push({
      timestamp: new Date(),
      component: 'EMERGENCY_MODE',
      action: 'ACTIVATED_EMERGENCY_MODE',
      reason,
      changedBy: 'SYSTEM',
    });

    console.error(`[EMERGENCY MODE] ACTIVATED. All decisions now escalated to human review. Reason: ${reason}`);
  }

  /**
   * Deactivate emergency mode
   */
  deactivateEmergencyMode(reason = '') {
    this.globalKillSwitches.EMERGENCY_MODE = false;

    this.auditTrail.push({
      timestamp: new Date(),
      component: 'EMERGENCY_MODE',
      action: 'DEACTIVATED_EMERGENCY_MODE',
      reason,
      changedBy: 'SYSTEM',
    });

    console.warn(`[EMERGENCY MODE] DEACTIVATED. Reason: ${reason}`);
  }

  /**
   * Get all kill switch statuses
   */
  getAllStatuses() {
    return {
      timestamp: new Date().toISOString(),
      actionsEnabled: this.areActionsEnabled(),
      learningEnabled: this.isLearningEnabled(),
      emergencyMode: this.globalKillSwitches.EMERGENCY_MODE,
      requireManualApproval: this.globalKillSwitches.REQUIRE_MANUAL_APPROVAL,
      restrictedActions: Array.from(this.restrictedActions),
      tenantSwitches: Array.from(this.tenantKillSwitches.entries()).map(([tenantId, enabled]) => ({
        tenantId,
        actionsEnabled: enabled,
      })),
    };
  }

  /**
   * Get audit trail of kill switch changes
   */
  getAuditTrail(limit = 100) {
    return this.auditTrail.slice(-limit);
  }

  /**
   * Reset audit trail (for testing)
   */
  clearAuditTrail() {
    this.auditTrail = [];
  }
}

// Singleton instance
let killSwitchManager = null;

function getKillSwitchManager() {
  if (!killSwitchManager) {
    killSwitchManager = new KillSwitchManager();
  }
  return killSwitchManager;
}

module.exports = {
  KillSwitchManager,
  getKillSwitchManager,
};
