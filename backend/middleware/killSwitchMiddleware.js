/**
 * Kill Switch Enforcement Middleware
 * 
 * Protects production by ensuring that:
 * 1. No actions execute if ACTIONS_ENABLED=false
 * 2. Learning system is disabled unless explicitly enabled
 * 3. Emergency mode escalates all decisions to humans
 * 4. Per-tenant action controls are respected
 * 
 * This middleware runs BEFORE action execution logic
 * Acts as a safety gate that can be toggled without code changes
 */

const { getKillSwitchManager } = require('../config/killSwitches');

/**
 * Middleware: Enforce kill switches before action execution
 * Usage: app.use(killSwitchEnforcementMiddleware());
 */
const killSwitchEnforcementMiddleware = () => {
  return (req, res, next) => {
    // Attach kill switch manager to request for easy access
    const killSwitchManager = getKillSwitchManager();
    req.killSwitches = killSwitchManager.getAllStatuses();

    // Add kill switch enforcement utility functions
    req.areActionsEnabled = () => killSwitchManager.areActionsEnabled();
    req.isLearningEnabled = () => killSwitchManager.isLearningEnabled();
    req.isActionAllowed = (actionName) => killSwitchManager.isActionAllowed(actionName);
    req.isTenantActionsEnabled = (tenantId) => killSwitchManager.isTenantActionsEnabled(tenantId);
    req.isInEmergencyMode = () => killSwitchManager.globalKillSwitches.EMERGENCY_MODE;

    next();
  };
};

/**
 * Route guard: Prevent action execution if disabled
 * Usage: router.post('/actions', guardActions, handler)
 */
const guardActions = (req, res, next) => {
  const killSwitchManager = getKillSwitchManager();
  const tenantId = req.tenant?.id;

  // Check global actions enabled
  if (!killSwitchManager.areActionsEnabled()) {
    console.warn(`[Guard] Action execution BLOCKED: Global ACTIONS_ENABLED=false`);
    return res.status(503).json({
      error: 'Action Execution Disabled',
      message: 'System administrator has disabled automatic action execution',
      reason: 'ACTIONS_ENABLED=false',
      retryAfter: 'Contact system administrator',
    });
  }

  // Check tenant-specific actions enabled
  if (tenantId && !killSwitchManager.isTenantActionsEnabled(tenantId)) {
    console.warn(`[Guard] Action execution BLOCKED for tenant ${tenantId}: Tenant ACTIONS_ENABLED=false`);
    return res.status(403).json({
      error: 'Tenant Actions Disabled',
      message: 'Actions are disabled for this tenant',
      tenantId,
    });
  }

  // Check emergency mode
  if (killSwitchManager.globalKillSwitches.EMERGENCY_MODE) {
    console.warn(`[Guard] Action execution BLOCKED: EMERGENCY_MODE active`);
    return res.status(503).json({
      error: 'Emergency Mode Active',
      message: 'System is in emergency mode - all decisions escalated to human review',
      escalationRequired: true,
    });
  }

  next();
};

/**
 * Route guard: Prevent learning if disabled
 * Usage: router.post('/learning', guardLearning, handler)
 */
const guardLearning = (req, res, next) => {
  const killSwitchManager = getKillSwitchManager();

  if (!killSwitchManager.isLearningEnabled()) {
    console.info(`[Guard] Learning system DISABLED: ENABLE_INCIDENT_LEARNING=false`);
    return res.status(503).json({
      error: 'Learning System Disabled',
      message: 'The learning system is disabled - using static policy rules only',
      learningEnabled: false,
    });
  }

  next();
};

/**
 * Route guard: Block specific action types
 * Usage: router.post('/actions', guardActionType('restart'), handler)
 */
const guardActionType = (actionName) => {
  return (req, res, next) => {
    const killSwitchManager = getKillSwitchManager();

    if (!killSwitchManager.isActionAllowed(actionName)) {
      console.warn(`[Guard] Action type BLOCKED: ${actionName} is restricted`);
      return res.status(403).json({
        error: 'Action Type Restricted',
        message: `The ${actionName} action type is currently restricted`,
        action: actionName,
      });
    }

    next();
  };
};

/**
 * Middleware to check and log kill switch status
 * Useful for debugging - logs status on every request
 */
const killSwitchStatusMiddleware = () => {
  return (req, res, next) => {
    const killSwitchManager = getKillSwitchManager();
    const status = killSwitchManager.getAllStatuses();

    // Log detailed status if any kill switch is active
    if (
      !status.actionsEnabled ||
      status.emergencyMode ||
      status.requireManualApproval ||
      status.restrictedActions.length > 0
    ) {
      console.info(`[Kill Switches Status]`, JSON.stringify(status, null, 2));
    }

    next();
  };
};

/**
 * API endpoint: Get current kill switch status
 * Usage: app.get('/api/v1/kill-switches/status', killSwitchStatusEndpoint)
 */
const killSwitchStatusEndpoint = (req, res) => {
  const killSwitchManager = getKillSwitchManager();
  const status = killSwitchManager.getAllStatuses();

  res.json({
    timestamp: status.timestamp,
    status: {
      actionsEnabled: status.actionsEnabled,
      learningEnabled: status.learningEnabled,
      emergencyMode: status.emergencyMode,
      requireManualApproval: status.requireManualApproval,
    },
    restrictions: {
      restrictedActions: status.restrictedActions,
      tenantRestrictions: status.tenantSwitches.filter((t) => !t.actionsEnabled),
    },
  });
};

/**
 * API endpoint: Activate/deactivate kill switches
 * Usage: app.post('/api/v1/kill-switches/actions', killSwitchControlEndpoint)
 * 
 * Body: { enabled: boolean, reason: string }
 */
const killSwitchControlEndpoint = (req, res) => {
  // Requires authentication - check earlier middleware
  const { enabled, component, reason } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'enabled must be a boolean',
    });
  }

  const killSwitchManager = getKillSwitchManager();
  const auditLog = {
    timestamp: new Date(),
    component: component || 'ACTIONS',
    operator: req.user?.id || 'unknown',
    reason: reason || 'No reason provided',
  };

  if (component === 'LEARNING') {
    killSwitchManager.setLearningEnabled(enabled, reason);
  } else if (component === 'EMERGENCY') {
    if (enabled) {
      killSwitchManager.activateEmergencyMode(reason);
    } else {
      killSwitchManager.deactivateEmergencyMode(reason);
    }
  } else {
    // Default: control global actions
    killSwitchManager.setActionsEnabled(enabled, reason);
  }

  res.json({
    success: true,
    message: `${component || 'Actions'} ${enabled ? 'enabled' : 'disabled'}`,
    auditLog,
    status: killSwitchManager.getAllStatuses(),
  });
};

module.exports = {
  killSwitchEnforcementMiddleware,
  guardActions,
  guardLearning,
  guardActionType,
  killSwitchStatusMiddleware,
  killSwitchStatusEndpoint,
  killSwitchControlEndpoint,
};
