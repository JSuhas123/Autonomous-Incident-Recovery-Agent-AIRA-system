"use strict";
/**
 * Unit tests for SAFE_MODE enforcement.
 *
 * These tests verify that:
 *   1. SAFE_MODE=true makes systemHealthService.canExecuteActions() return false
 *   2. SAFE_MODE=true makes featureFlags.ENABLE_KUBERNETES_EXECUTOR disabled
 *   3. SAFE_MODE=true makes featureFlags.ENABLE_AUTO_REMEDIATION disabled
 *   4. runbookExecutionService.executeRunbook returns status=SIMULATED when SAFE_MODE=true
 *   5. Without SAFE_MODE, execution proceeds normally
 */

describe("SAFE_MODE enforcement", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear module cache so constructors re-read env vars
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── 1. systemHealthService ────────────────────────────────────────────

  describe("systemHealthService", () => {
    test("canExecuteActions() returns false when SAFE_MODE=true", () => {
      process.env.SAFE_MODE = "true";
      jest.resetModules();
      const { SystemHealthService } = require("../../services/infrastructure/systemHealthService");
      const shs = new SystemHealthService();
      expect(shs.canExecuteActions()).toBe(false);
    });

    test("canExecuteActions() returns true when SAFE_MODE is not set", () => {
      delete process.env.SAFE_MODE;
      jest.resetModules();
      const { SystemHealthService } = require("../../services/infrastructure/systemHealthService");
      const shs = new SystemHealthService();
      expect(shs.canExecuteActions()).toBe(true);
    });

    test("isSafeMode is true when SAFE_MODE=true", () => {
      process.env.SAFE_MODE = "true";
      jest.resetModules();
      const { SystemHealthService } = require("../../services/infrastructure/systemHealthService");
      const shs = new SystemHealthService();
      expect(shs.isSafeMode).toBe(true);
    });

    test("envSafeMode stays true even after Redis reconnects", () => {
      process.env.SAFE_MODE = "true";
      jest.resetModules();
      const { SystemHealthService } = require("../../services/infrastructure/systemHealthService");
      const shs = new SystemHealthService();
      // Simulate Redis going down and coming back up
      shs.redisFailureStartTime = Date.now() - 1000;
      shs.reportRedisStatus(true); // Redis "reconnected"
      expect(shs.isSafeMode).toBe(true);
    });

    test("getHealthStatus safeModeSource is env-var when SAFE_MODE=true", () => {
      process.env.SAFE_MODE = "true";
      jest.resetModules();
      const { SystemHealthService } = require("../../services/infrastructure/systemHealthService");
      const shs = new SystemHealthService();
      const status = shs.getHealthStatus();
      expect(status.safeMode).toBe(true);
      expect(status.safeModeSource).toBe("env-var");
    });
  });

  // ── 2. featureFlags ───────────────────────────────────────────────────

  describe("featureFlags", () => {
    test("ENABLE_KUBERNETES_EXECUTOR is false when SAFE_MODE=true even if env says true", () => {
      process.env.SAFE_MODE = "true";
      process.env.ENABLE_KUBERNETES_EXECUTOR = "true";
      jest.resetModules();
      const { FeatureFlags } = require("../../config/featureFlags");
      const ff = new FeatureFlags();
      expect(ff.isEnabled("ENABLE_KUBERNETES_EXECUTOR")).toBe(false);
    });

    test("ENABLE_AUTO_REMEDIATION is false when SAFE_MODE=true even if env says true", () => {
      process.env.SAFE_MODE = "true";
      process.env.ENABLE_AUTO_REMEDIATION = "true";
      jest.resetModules();
      const { FeatureFlags } = require("../../config/featureFlags");
      const ff = new FeatureFlags();
      expect(ff.isEnabled("ENABLE_AUTO_REMEDIATION")).toBe(false);
    });

    test("ENABLE_KUBERNETES_EXECUTOR respects env when SAFE_MODE is not set", () => {
      delete process.env.SAFE_MODE;
      process.env.ENABLE_KUBERNETES_EXECUTOR = "true";
      jest.resetModules();
      const { FeatureFlags } = require("../../config/featureFlags");
      const ff = new FeatureFlags();
      expect(ff.isEnabled("ENABLE_KUBERNETES_EXECUTOR")).toBe(true);
    });
  });

  // ── 3. runbookExecutionService ────────────────────────────────────────

  describe("runbookExecutionService", () => {
    test("executeRunbook returns SIMULATED status when SAFE_MODE=true", async () => {
      process.env.SAFE_MODE = "true";
      jest.resetModules();
      jest.mock("../../models/RunbookExecution", () => {
        function MockExecution(data) { Object.assign(this, data); this.save = jest.fn().mockResolvedValue({}); }
        MockExecution.findById = jest.fn().mockResolvedValue(null);
        return MockExecution;
      });
      const { runbookExecutionService } = require("../../services/execution");

      const runbook = {
        name: "test-runbook",
        steps: [{ name: "step1", action: "RESTART_POD", params: { pod: "my-pod" } }],
      };

      const result = await runbookExecutionService.executeRunbook("test-tenant", "corr-001", runbook, {});
      expect(result.status).toBe("SIMULATED");
      expect(result.executionMode).toBe("simulated");
      expect(result.steps[0].status).toBe("simulated");
    });

    test("executeRunbook does NOT return SIMULATED when SAFE_MODE is not set", async () => {
      delete process.env.SAFE_MODE;
      jest.resetModules();
      jest.mock("../../models/RunbookExecution", () => {
        function MockExecution(data) {
          Object.assign(this, data);
          this._id = "mock-id";
          this.executionId = this._id;
          this.save = jest.fn().mockResolvedValue({});
        }
        MockExecution.findById = jest.fn().mockResolvedValue(null);
        return MockExecution;
      });
      const { runbookExecutionService } = require("../../services/execution");

      const runbook = {
        name: "real-runbook",
        steps: [{ name: "log-step", action: "LOG", params: { message: "test" } }],
      };

      const result = await runbookExecutionService.executeRunbook("test-tenant", "corr-002", runbook, {});
      expect(result.status).not.toBe("SIMULATED");
    });
  });
});
