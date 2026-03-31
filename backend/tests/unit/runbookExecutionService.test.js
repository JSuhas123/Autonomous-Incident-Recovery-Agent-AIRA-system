/**
 * Unit Tests: Runbook Execution Service
 * Tests multi-step remediation playbook execution and rollback
 */

const { runbookExecutionService } = require('../../services/execution');

describe('RunbookExecutionService', () => {
  const TEST_TENANT = 'test-tenant-runbook';

  describe('parseRunbook', () => {
    test('should parse valid runbook definition', async () => {
      const runbook = {
        name: 'RestartService',
        steps: [
          {
            name: 'stop-service',
            action: 'STOP_SERVICE',
            params: { serviceName: 'api-server' },
            timeout: 30,
          },
          {
            name: 'wait',
            action: 'WAIT',
            params: { duration: 10 },
          },
          {
            name: 'start-service',
            action: 'START_SERVICE',
            params: { serviceName: 'api-server' },
            timeout: 60,
          },
        ],
      };

      const parsed = await runbookExecutionService.parseRunbook(runbook);

      expect(parsed).toBeDefined();
      expect(parsed.steps.length).toBe(3);
      expect(parsed.steps[0].name).toBe('stop-service');
    });

    test('should validate runbook structure', async () => {
      const invalidRunbook = {
        // Missing name
        steps: [{ action: 'TEST' }],
      };

      const result = await runbookExecutionService.parseRunbook(invalidRunbook);
      expect(result.valid).toBe(false);
    });
  });

  describe('executeRunbook', () => {
    test('should execute runbook steps in sequence', async () => {
      const runbook = {
        name: 'TestRunbook',
        steps: [
          { name: 'step1', action: 'LOG', params: { message: 'Step 1' } },
          { name: 'step2', action: 'LOG', params: { message: 'Step 2' } },
          { name: 'step3', action: 'LOG', params: { message: 'Step 3' } },
        ],
      };

      const execution = await runbookExecutionService.executeRunbook(
        TEST_TENANT,
        'correlation-001',
        runbook
      );

      expect(execution).toBeDefined();
      expect(execution.status).toBe('RUNNING');
      expect(execution.currentStep).toBe(0);
      expect(execution.steps.length).toBe(3);
    });

    test('should track execution progress', async () => {
      const runbook = {
        name: 'ProgressTrack',
        steps: [
          { name: 'step1', action: 'LOG', params: { message: 'Test' } },
          { name: 'step2', action: 'LOG', params: { message: 'Test' } },
        ],
      };

      const execution = await runbookExecutionService.executeRunbook(
        TEST_TENANT,
        'correlation-002',
        runbook
      );

      expect(execution.executionId).toBeDefined();
      expect(execution.startTime).toBeDefined();
      expect(execution.steps).toBeDefined();
      expect(Array.isArray(execution.steps)).toBe(true);
    });
  });

  describe('executeStep', () => {
    test('should execute single step successfully', async () => {
      const step = {
        name: 'test-step',
        action: 'LOG',
        params: { message: 'Test execution' },
        timeout: 10,
      };

      const result = await runbookExecutionService.executeStep(TEST_TENANT, step, {});

      expect(result).toBeDefined();
      expect(result.status).toMatch(/SUCCESS|COMPLETED|RUNNING/);
    });

    test('should respect step timeout', async () => {
      const step = {
        name: 'slow-step',
        action: 'WAIT',
        params: { duration: 100 },
        timeout: 1, // 1 second timeout
      };

      const result = await runbookExecutionService.executeStep(TEST_TENANT, step, {});

      expect(result.status).toMatch(/TIMEOUT|FAILED/);
    });

    test('should pass parameters to step execution', async () => {
      const step = {
        name: 'param-test',
        action: 'EXECUTE',
        params: {
          serviceName: 'my-service',
          action: 'restart',
          delay: 5,
        },
        timeout: 30,
      };

      const result = await runbookExecutionService.executeStep(TEST_TENANT, step, {});

      expect(result.params).toMatchObject({
        serviceName: 'my-service',
        action: 'restart',
        delay: 5,
      });
    });
  });

  describe('rollback', () => {
    test('should execute rollback steps on failure', async () => {
      const runbook = {
        name: 'RollbackTest',
        steps: [
          { name: 'step1', action: 'CREATE', params: {} },
          { name: 'step2', action: 'MODIFY', params: {} },
        ],
        rollback: [
          { name: 'rollback1', action: 'DELETE', params: {} },
          { name: 'rollback2', action: 'RESTORE', params: {} },
        ],
      };

      let execution = await runbookExecutionService.executeRunbook(
        TEST_TENANT,
        'correlation-003',
        runbook
      );

      // Simulate failure and trigger rollback
      execution = await runbookExecutionService.rollback(TEST_TENANT, execution.executionId);

      expect(execution.status).toBe('ROLLED_BACK');
      expect(execution.rollbackSteps).toBeDefined();
    });

    test('should not execute rollback if runbook succeeded', async () => {
      const runbook = {
        name: 'NoRollback',
        steps: [{ name: 'step1', action: 'LOG', params: { message: 'Test' } }],
      };

      const execution = await runbookExecutionService.executeRunbook(
        TEST_TENANT,
        'correlation-004',
        runbook
      );

      // Mark as completed without error
      execution.status = 'COMPLETED';

      const rollbackResult = await runbookExecutionService.rollback(
        TEST_TENANT,
        execution.executionId
      );

      expect(rollbackResult.status).not.toBe('ROLLED_BACK');
    });
  });

  describe('getExecutionHistory', () => {
    test('should retrieve execution history for runbook', async () => {
      const history = await runbookExecutionService.getExecutionHistory(
        TEST_TENANT,
        'test-runbook',
        { limit: 10 }
      );

      expect(Array.isArray(history)).toBe(true);
    });

    test('should include execution status in history', async () => {
      const history = await runbookExecutionService.getExecutionHistory(TEST_TENANT, 'test', {
        limit: 5,
      });

      if (history.length > 0) {
        const exec = history[0];
        expect(exec.executionId).toBeDefined();
        expect(exec.status).toBeDefined();
        expect(exec.startTime).toBeDefined();
      }
    });
  });

  describe('getRunbookTemplate', () => {
    test('should retrieve pre-defined runbook template', async () => {
      const template = await runbookExecutionService.getRunbookTemplate(
        'RestartService'
      );

      expect(template).toBeDefined();
      expect(template.name).toBe('RestartService');
      expect(template.steps).toBeDefined();
    });

    test('should list available runbook templates', async () => {
      const templates = await runbookExecutionService.listRunbookTemplates();

      expect(Array.isArray(templates)).toBe(true);
      if (templates.length > 0) {
        expect(templates[0].name).toBeDefined();
        expect(templates[0].description).toBeDefined();
      }
    });
  });

  describe('validateRunbook', () => {
    test('should validate correct runbook structure', async () => {
      const runbook = {
        name: 'ValidRunbook',
        steps: [
          {
            name: 'step1',
            action: 'VALID_ACTION',
            params: {},
            timeout: 60,
          },
        ],
      };

      const validation = await runbookExecutionService.validateRunbook(runbook);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should catch validation errors in runbook', async () => {
      const invalidRunbook = {
        name: 'InvalidRunbook',
        steps: [
          {
            // Missing action
            name: 'step1',
            params: {},
          },
        ],
      };

      const validation = await runbookExecutionService.validateRunbook(invalidRunbook);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});
