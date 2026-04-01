/**
 * Kill Switch Middleware Unit Tests
 * 
 * Tests enforcement of kill switches for actions, learning, and emergency mode
 * Ensures safety gates work correctly to prevent undesired system behavior
 * 
 * Coverage: 5 critical safety tests
 */

const {
  killSwitchEnforcementMiddleware,
  guardActions,
  guardLearning,
  guardActionType,
} = require('../../middleware/killSwitchMiddleware');

// Mock kill switch manager
jest.mock('../../config/killSwitches', () => ({
  getKillSwitchManager: jest.fn(),
}));

const { getKillSwitchManager } = require('../../config/killSwitches');

describe('killSwitchMiddleware', () => {
  let req, res, next;
  let mockKillSwitchManager;

  beforeEach(() => {
    req = {
      tenant: { id: 'test-tenant' },
      method: 'POST',
      path: '/api/test',
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();

    // Create mock kill switch manager
    mockKillSwitchManager = {
      getAllStatuses: jest.fn().mockReturnValue({
        ACTIONS_ENABLED: true,
        ENABLE_INCIDENT_LEARNING: true,
        EMERGENCY_MODE: false,
      }),
      areActionsEnabled: jest.fn().mockReturnValue(true),
      isLearningEnabled: jest.fn().mockReturnValue(true),
      isActionAllowed: jest.fn().mockReturnValue(true),
      isTenantActionsEnabled: jest.fn().mockReturnValue(true),
      globalKillSwitches: {
        EMERGENCY_MODE: false,
      },
    };

    getKillSwitchManager.mockReturnValue(mockKillSwitchManager);
    jest.clearAllMocks();
  });

  /**
   * Test 1: Enforcement middleware attaches kill switch utilities
   */
  test('should attach kill switch utilities to request', (done) => {
    // Setup
    const middleware = killSwitchEnforcementMiddleware();

    // Execute
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(req.killSwitches).toBeDefined();
    expect(req.areActionsEnabled).toBeDefined();
    expect(req.isLearningEnabled).toBeDefined();
    expect(req.isActionAllowed).toBeDefined();
    expect(req.isTenantActionsEnabled).toBeDefined();
    expect(req.isInEmergencyMode).toBeDefined();

    done();
  });

  /**
   * Test 2: guardActions blocks execution when ACTIONS_ENABLED=false
   */
  test('should block action execution when globally disabled', (done) => {
    // Setup: Actions disabled globally
    mockKillSwitchManager.areActionsEnabled.mockReturnValue(false);

    // Execute
    guardActions(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Action Execution Disabled',
        reason: 'ACTIONS_ENABLED=false',
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Test 3: guardActions respects tenant-specific disable
   */
  test('should block actions for disabled tenant', (done) => {
    // Setup: Tenant actions are disabled
    mockKillSwitchManager.areActionsEnabled.mockReturnValue(true);
    mockKillSwitchManager.isTenantActionsEnabled.mockReturnValue(false);

    // Execute
    guardActions(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Tenant Actions Disabled',
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Test 4: guardActions blocks all actions in emergency mode
   */
  test('should escalate all actions to human review in emergency mode', (done) => {
    // Setup: Emergency mode active
    mockKillSwitchManager.areActionsEnabled.mockReturnValue(true);
    mockKillSwitchManager.isTenantActionsEnabled.mockReturnValue(true);
    mockKillSwitchManager.globalKillSwitches.EMERGENCY_MODE = true;

    // Execute
    guardActions(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Emergency Mode Active',
        escalationRequired: true,
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Test 5: guardLearning blocks learning when disabled
   */
  test('should disable learning system when ENABLE_INCIDENT_LEARNING=false', (done) => {
    // Setup: Learning disabled
    mockKillSwitchManager.isLearningEnabled.mockReturnValue(false);

    // Execute
    guardLearning(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Learning System Disabled',
        learningEnabled: false,
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Bonus Test: guardActions allows action when all switches are enabled
   */
  test('should allow action execution when all conditions pass', (done) => {
    // Setup: All conditions met
    mockKillSwitchManager.areActionsEnabled.mockReturnValue(true);
    mockKillSwitchManager.isTenantActionsEnabled.mockReturnValue(true);
    mockKillSwitchManager.globalKillSwitches.EMERGENCY_MODE = false;

    // Execute
    guardActions(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    done();
  });

  /**
   * Bonus Test: guardLearning allows learning when enabled
   */
  test('should allow learning when system is enabled', (done) => {
    // Setup
    mockKillSwitchManager.isLearningEnabled.mockReturnValue(true);

    // Execute
    guardLearning(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    done();
  });

  /**
   * Bonus Test: guardActionType blocks specific action types
   */
  test('should block specific action types when restricted', (done) => {
    // Setup: restart action is blocked
    mockKillSwitchManager.isActionAllowed.mockImplementation((action) => {
      return action !== 'restart';
    });

    const middleware = guardActionType('restart');

    // Execute
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Action Type Restricted',
        action: 'restart',
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Bonus Test: guardActionType allows specific action when enabled
   */
  test('should allow specific action type when enabled', (done) => {
    // Setup: restart action is allowed
    mockKillSwitchManager.isActionAllowed.mockImplementation((action) => {
      return action === 'restart';
    });

    const middleware = guardActionType('restart');

    // Execute
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    done();
  });
});
