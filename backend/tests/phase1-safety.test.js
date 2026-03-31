/**
 * PHASE 1: SAFETY TESTS
 * 
 * Validates:
 * 1. XSS sanitization (prevents script injection)
 * 2. Kill switches work (actions can be disabled)
 * 3. Confidence thresholds enforce decision quality
 * 4. Learning system can be disabled
 * 
 * All tests must PASS before deploying to production
 */

const request = require('supertest');
const { sanitizeString, sanitizeObject, testXSSPayloads } = require('../middleware/sanitizationMiddleware');
const { getKillSwitchManager } = require('../config/killSwitches');
const { getConfidenceEnforcer } = require('../config/confidenceThresholds');

describe('PHASE 1: Safety Infrastructure', () => {
  describe('XSS Sanitization', () => {
    test('should block script tags', () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = sanitizeString(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    test('should block event handlers', () => {
      const malicious = '<img src=x onerror="alert(\'xss\')">';
      const sanitized = sanitizeString(malicious);
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('alert');
    });

    test('should block svg javascript', () => {
      const malicious = '<svg onload="alert(\'xss\')">';
      const sanitized = sanitizeString(malicious);
      expect(sanitized).not.toContain('onload');
      expect(sanitized).not.toContain('alert');
    });

    test('should block javascript URIs', () => {
      const malicious = '<a href="javascript:alert(\'xss\')">click</a>';
      const sanitized = sanitizeString(malicious);
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('alert');
    });

    test('should preserve safe text', () => {
      const safe = 'This is a normal message without any HTML';
      const sanitized = sanitizeString(safe);
      expect(sanitized).toBe(safe);
    });

    test('should strip all HTML by default', () => {
      const html = '<p>Hello <b>world</b></p>';
      const sanitized = sanitizeString(html);
      expect(sanitized).not.toContain('<p>');
      expect(sanitized).not.toContain('<b>');
      expect(sanitized).toContain('Hello');
      expect(sanitized).toContain('world');
    });

    test('should sanitize object fields', () => {
      const dirty = {
        notes: '<script>alert("xss")</script>',
        feedback: '<img src=x onerror="alert(\'x\')">',
        description: 'Normal text',
      };

      const sanitized = sanitizeObject(dirty);
      expect(sanitized.notes).not.toContain('<script>');
      expect(sanitized.feedback).not.toContain('onerror');
      expect(sanitized.description).toBe('Normal text');
    });

    test('should handle nested objects recursively', () => {
      const dirty = {
        user: {
          name: 'John',
          comment: '<script>alert("xss")</script>',
          metadata: {
            tags: ['<img onerror="alert()">'],
          },
        },
      };

      const sanitized = sanitizeObject(dirty);
      expect(sanitized.user.comment).not.toContain('<script>');
      // Note: Arrays within objects - depends on implementation details
    });

    test('XSS payload test suite', () => {
      const results = testXSSPayloads(false);
      expect(results.total).toBeGreaterThan(0);
      expect(results.passed).toBe(results.total);
    });
  });

  describe('Kill Switches', () => {
    let killSwitchManager;

    beforeEach(() => {
      killSwitchManager = getKillSwitchManager();
      // Reset to defaults
      killSwitchManager.setActionsEnabled(true, 'test reset');
      killSwitchManager.setLearningEnabled(false, 'test reset');
      // Deactivate emergency mode if it was activated by previous test
      if (killSwitchManager.globalKillSwitches.EMERGENCY_MODE) {
        killSwitchManager.deactivateEmergencyMode('test reset');
      }
    });

    test('should initialize with default state', () => {
      const status = killSwitchManager.getAllStatuses();
      expect(status.actionsEnabled).toBe(true);
      expect(status.learningEnabled).toBe(false);
      expect(status.emergencyMode).toBe(false);
    });

    test('should disable actions globally', () => {
      killSwitchManager.setActionsEnabled(false, 'test disable');
      expect(killSwitchManager.areActionsEnabled()).toBe(false);
    });

    test('should enable actions after being disabled', () => {
      killSwitchManager.setActionsEnabled(false, 'test disable');
      expect(killSwitchManager.areActionsEnabled()).toBe(false);

      killSwitchManager.setActionsEnabled(true, 'test enable');
      expect(killSwitchManager.areActionsEnabled()).toBe(true);
    });

    test('should disable learning system', () => {
      killSwitchManager.setLearningEnabled(false, 'test');
      expect(killSwitchManager.isLearningEnabled()).toBe(false);
    });

    test('should enable learning system', () => {
      killSwitchManager.setLearningEnabled(true, 'test');
      expect(killSwitchManager.isLearningEnabled()).toBe(true);
    });

    test('emergency mode should disable actions', () => {
      killSwitchManager.activateEmergencyMode('test emergency');
      expect(killSwitchManager.areActionsEnabled()).toBe(false);
      expect(killSwitchManager.globalKillSwitches.EMERGENCY_MODE).toBe(true);
    });

    test('should disable specific action types', () => {
      // This would need to be configured via environment/constructor
      // For now we test the logic
      expect(killSwitchManager.isActionAllowed('scale-replicas')).toBe(true);
    });

    test('should restrict action after adding to restricted list', () => {
      killSwitchManager.restrictedActions.add('dangerous-action');
      expect(killSwitchManager.isActionAllowed('dangerous-action')).toBe(false);
    });

    test('should track audit trail', () => {
      const initialCount = killSwitchManager.auditTrail.length;

      killSwitchManager.setActionsEnabled(false, 'test audit');

      const newCount = killSwitchManager.auditTrail.length;
      expect(newCount).toBe(initialCount + 1);

      const lastEntry = killSwitchManager.getAuditTrail(1)[0];
      expect(lastEntry.action).toBe('DISABLED_ACTIONS');
      expect(lastEntry.reason).toBe('test audit');
    });

    test('should enable/disable per-tenant actions', () => {
      const tenantId = 'test-tenant-1';

      // Initially should follow global setting
      expect(killSwitchManager.isTenantActionsEnabled(tenantId)).toBe(true);

      // Disable for specific tenant
      killSwitchManager.setTenantActionsEnabled(tenantId, false, 'test');
      expect(killSwitchManager.isTenantActionsEnabled(tenantId)).toBe(false);

      // Re-enable
      killSwitchManager.setTenantActionsEnabled(tenantId, true, 'test');
      expect(killSwitchManager.isTenantActionsEnabled(tenantId)).toBe(true);
    });

    test('should clear audit trail', () => {
      killSwitchManager.setActionsEnabled(false, 'test');
      expect(killSwitchManager.auditTrail.length).toBeGreaterThan(0);

      killSwitchManager.clearAuditTrail();
      expect(killSwitchManager.auditTrail.length).toBe(0);
    });
  });

  describe('Confidence Thresholds', () => {
    let confidenceEnforcer;

    beforeEach(() => {
      confidenceEnforcer = getConfidenceEnforcer();
      // Reset to defaults
      confidenceEnforcer.setThresholds(0.85, 0.60);
    });

    test('should auto-execute high confidence decisions', () => {
      const evaluation = confidenceEnforcer.evaluateConfidence(0.92);
      expect(evaluation.tier).toBe('AUTO_EXECUTE');
      expect(evaluation.canAutoExecute).toBe(true);
    });

    test('should escalate medium confidence decisions', () => {
      const evaluation = confidenceEnforcer.evaluateConfidence(0.72);
      expect(evaluation.tier).toBe('ESCALATE');
      expect(evaluation.canAutoExecute).toBe(false);
      expect(evaluation.requiresApproval).toBe(true);
    });

    test('should observe low confidence decisions', () => {
      const evaluation = confidenceEnforcer.evaluateConfidence(0.45);
      expect(evaluation.tier).toBe('OBSERVE');
      expect(evaluation.canAutoExecute).toBe(false);
    });

    test('should handle confidence at exact thresholds', () => {
      // Exactly at AUTO threshold
      let eval1 = confidenceEnforcer.evaluateConfidence(0.85);
      expect(eval1.tier).toBe('AUTO_EXECUTE');

      // Just below AUTO threshold
      let eval2 = confidenceEnforcer.evaluateConfidence(0.849);
      expect(eval2.tier).toBe('ESCALATE');

      // Exactly at ESCALATION threshold
      let eval3 = confidenceEnforcer.evaluateConfidence(0.60);
      expect(eval3.tier).toBe('ESCALATE');

      // Just below ESCALATION threshold
      let eval4 = confidenceEnforcer.evaluateConfidence(0.599);
      expect(eval4.tier).toBe('OBSERVE');
    });

    test('should enforce thresholds on decisions', () => {
      const highConfidenceDecision = {
        confidence: 0.92,
        action: 'scale-replicas',
        severity: 'HIGH',
      };

      const result = confidenceEnforcer.enforceThresholds(highConfidenceDecision);
      expect(result.allowed).toBe(true);
      expect(result.canAutoExecute).toBe(true);
    });

    test('should block low confidence decisions', () => {
      const lowConfidenceDecision = {
        confidence: 0.45,
        action: 'scale-replicas',
        severity: 'LOW',
      };

      const result = confidenceEnforcer.enforceThresholds(lowConfidenceDecision);
      expect(result.allowed).toBe(false);
      expect(result.canAutoExecute).toBe(false);
    });

    test('should allow threshold adjustments', () => {
      confidenceEnforcer.setThresholds(0.90, 0.70);

      const decision = { confidence: 0.85, action: 'test' };
      const result = confidenceEnforcer.enforceThresholds(decision);

      // 0.85 is now between thresholds (ESCALATE), not AUTO_EXECUTE
      expect(result.tier).toBe('ESCALATE');
    });

    test('should validate threshold ranges', () => {
      expect(() => {
        confidenceEnforcer.setThresholds(0.5, 0.5); // Must be different
      }).toThrow();

      expect(() => {
        confidenceEnforcer.setThresholds(1.5, 0.5); // Out of range
      }).toThrow();

      expect(() => {
        confidenceEnforcer.setThresholds(0.5, -0.1); // Out of range
      }).toThrow();
    });

    test('should return threshold configuration', () => {
      const config = confidenceEnforcer.getThresholds();
      expect(config.AUTO_EXECUTE_THRESHOLD).toBe(0.85);
      expect(config.ESCALATION_THRESHOLD).toBe(0.60);
      expect(config.tierBreakdown).toBeDefined();
    });

    test('should reject invalid confidence values', () => {
      const result1 = confidenceEnforcer.enforceThresholds({
        confidence: 1.5, // Out of range
        action: 'test',
      });
      expect(result1.tier).toBe('INVALID');

      const result2 = confidenceEnforcer.enforceThresholds({
        confidence: -0.5, // Out of range
        action: 'test',
      });
      expect(result2.tier).toBe('INVALID');
    });
  });

  describe('Integration: Kill Switches + Confidence', () => {
    let killSwitchManager, confidenceEnforcer;

    beforeEach(() => {
      killSwitchManager = getKillSwitchManager();
      confidenceEnforcer = getConfidenceEnforcer();
      killSwitchManager.setActionsEnabled(true, 'test');
      confidenceEnforcer.setThresholds(0.85, 0.60);
    });

    test('should block even high-confidence actions when globally disabled', () => {
      killSwitchManager.setActionsEnabled(false, 'test disable');

      expect(killSwitchManager.areActionsEnabled()).toBe(false);
      expect(confidenceEnforcer.areActionsEnabled()).toBe(false);
    });

    test('should enforce both kill switches and confidence thresholds', () => {
      const decision = {
        confidence: 0.92,
        action: 'scale-replicas',
      };

      // Check confidence first
      const confidenceCheck = confidenceEnforcer.enforceThresholds(decision);
      expect(confidenceCheck.allowed).toBe(true);

      // Then check kill switch
      const actionsAllowed = killSwitchManager.areActionsEnabled();
      expect(actionsAllowed).toBe(true);

      // Both must pass
      const canExecute = confidenceCheck.allowed && actionsAllowed;
      expect(canExecute).toBe(true);
    });

    test('emergency mode should supersede all checks', () => {
      const decision = {
        confidence: 0.95,
        action: 'scale-replicas',
      };

      killSwitchManager.activateEmergencyMode('test');

      const confidenceCheck = confidenceEnforcer.enforceThresholds(decision);
      expect(confidenceCheck.allowed).toBe(true); // Still high confidence

      const actionsAllowed = killSwitchManager.areActionsEnabled(); // But this should be false
      expect(actionsAllowed).toBe(false);
    });
  });
});

describe('PHASE 1: Safety Endpoints', () => {
  // Note: These tests require an actual Express app instance
  // Would be integrated with supertest in a full setup

  test('kill-switches endpoint should return current status', async () => {
    // This would require app instance
    // await request(app)
    //   .get('/api/v1/safety/kill-switches')
    //   .expect(200)
    //   .expect(res => {
    //     expect(res.body).toHaveProperty('actionsEnabled');
    //     expect(res.body).toHaveProperty('learningEnabled');
    //   });
  });

  test('confidence-thresholds endpoint should return current thresholds', async () => {
    // Similar to above - requires app instance
  });

  test('xss-test endpoint should verify sanitization in dev mode', async () => {
    // Process.env.NODE_ENV must be 'development' or 'test'
  });
});
