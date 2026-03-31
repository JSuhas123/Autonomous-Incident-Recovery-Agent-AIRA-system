const IncidentMemory = require("../../models/IncidentMemory");

/**
 * Circuit Breaker Service
 * Prevents repeated failures by opening circuit after threshold
 * Tracks failure patterns per service/action
 */

class CircuitBreakerService {
  /**
   * Check circuit breaker status for service
   */
  async getStatus(tenantId, service, action = null) {
    try {
      // Query recent action history
      const recentWindow = Date.now() - 60 * 60 * 1000; // 1 hour

      const statusKey = `${service}:${action || "all"}`;

      // In production, use Redis for speed. For now use IncidentMemory as fallback.
      const memory = await IncidentMemory.findOne({
        tenantId,
        patternId: service,
      });

      if (!memory || !memory.circuitBreaker) {
        return {
          service,
          action,
          status: "CLOSED",
          failureCount: 0,
          successCount: 0,
          failureRate: 0,
          isOpen: false,
        };
      }

      const cb = memory.circuitBreaker;

      return {
        service,
        action,
        status: cb.status,
        failureCount: cb.failureCount,
        successCount: cb.successCount,
        totalAttempts: cb.failureCount + cb.successCount,
        failureRate:
          cb.failureCount + cb.successCount > 0
            ? cb.failureCount / (cb.failureCount + cb.successCount)
            : 0,
        isOpen: cb.status === "OPEN",
        failureThreshold: cb.failureThreshold,
        failureWindow: cb.failureWindow,
        openedAt: cb.openedAt,
        trialsRemaining: cb.trialsRemaining,
      };
    } catch (error) {
      console.error("[circuit-breaker] Error getting status:", error);
      // Default to CLOSED on error (pessimistic would be OPEN)
      return {
        service,
        action,
        status: "CLOSED",
        failureCount: 0,
        successCount: 0,
        failureRate: 0,
        isOpen: false,
      };
    }
  }

  /**
   * Record action success
   */
  async recordSuccess(tenantId, service, action) {
    try {
      let memory = await IncidentMemory.findOne({
        tenantId,
        patternId: service,
      });

      if (!memory) {
        memory = new IncidentMemory({
          tenantId,
          patternId: service,
          patternType: "circuit-breaker",
          patternName: `Circuit Breaker: ${service}`,
        });
      }

      if (!memory.circuitBreaker) {
        memory.circuitBreaker = {
          status: "CLOSED",
          failureCount: 0,
          successCount: 0,
          failureThreshold: 3,
          failureWindow: "1h",
        };
      }

      // Reset circuit if it's in half-open and success confirmed
      if (memory.circuitBreaker.status === "HALF_OPEN") {
        memory.circuitBreaker.status = "CLOSED";
        memory.circuitBreaker.failureCount = 0;
        memory.circuitBreaker.successCount = 0;
        console.log(`[circuit-breaker] Circuit CLOSED after success: ${service}`);
      } else {
        memory.circuitBreaker.successCount++;
      }

      await memory.save();

      return memory.circuitBreaker;
    } catch (error) {
      console.error("[circuit-breaker] Error recording success:", error);
      throw error;
    }
  }

  /**
   * Record action failure
   */
  async recordFailure(tenantId, service, action, reason = null) {
    try {
      let memory = await IncidentMemory.findOne({
        tenantId,
        patternId: service,
      });

      if (!memory) {
        memory = new IncidentMemory({
          tenantId,
          patternId: service,
          patternType: "circuit-breaker",
          patternName: `Circuit Breaker: ${service}`,
        });
      }

      if (!memory.circuitBreaker) {
        memory.circuitBreaker = {
          status: "CLOSED",
          failureCount: 0,
          successCount: 0,
          failureThreshold: 3,
          failureWindow: "1h",
        };
      }

      memory.circuitBreaker.failureCount++;

      // Open circuit if threshold exceeded
      if (
        memory.circuitBreaker.failureCount >=
        memory.circuitBreaker.failureThreshold
      ) {
        memory.circuitBreaker.status = "OPEN";
        memory.circuitBreaker.openedAt = new Date();
        memory.circuitBreaker.trialsRemaining = 1; // Allow 1 trial in HALF_OPEN state
        console.log(
          `[circuit-breaker] Circuit OPENED: ${service} (${memory.circuitBreaker.failureCount} failures)`
        );
      }

      await memory.save();

      return memory.circuitBreaker;
    } catch (error) {
      console.error("[circuit-breaker] Error recording failure:", error);
      throw error;
    }
  }

  /**
   * Attempt recovery (HALF_OPEN state)
   */
  async attemptRecovery(tenantId, service) {
    try {
      const memory = await IncidentMemory.findOne({
        tenantId,
        patternId: service,
      });

      if (!memory || !memory.circuitBreaker) {
        return { recovered: false, reason: "No circuit breaker found" };
      }

      const cb = memory.circuitBreaker;

      if (cb.status !== "OPEN") {
        return {
          recovered: false,
          reason: `Circuit not open (status: ${cb.status})`,
        };
      }

      // Check if recovery window has passed (e.g., 5 minutes)
      const recoveryWindowMs = 5 * 60 * 1000;
      const timeSinceOpenMs = Date.now() - new Date(cb.openedAt).getTime();

      if (timeSinceOpenMs < recoveryWindowMs) {
        return {
          recovered: false,
          reason: `Recovery window not ready. Try again in ${Math.ceil(
            (recoveryWindowMs - timeSinceOpenMs) / 1000
          )}s`,
        };
      }

      // Transition to HALF_OPEN
      memory.circuitBreaker.status = "HALF_OPEN";
      memory.circuitBreaker.trialsRemaining = 1;
      await memory.save();

      console.log(`[circuit-breaker] Circuit HALF_OPEN: ${service}`);

      return {
        recovered: true,
        status: "HALF_OPEN",
        message: `1 trial allowed. Next action will determine if circuit closes or reopens.`,
      };
    } catch (error) {
      console.error("[circuit-breaker] Error attempting recovery:", error);
      throw error;
    }
  }

  /**
   * Check if action should be allowed based on circuit state
   */
  async canExecute(tenantId, service, action) {
    try {
      const status = await this.getStatus(tenantId, service, action);

      if (status.status === "CLOSED") {
        return { allowed: true, reason: "Circuit is CLOSED" };
      }

      if (status.status === "OPEN") {
        return {
          allowed: false,
          reason: `Circuit is OPEN (${status.failureCount} recent failures). Waiting for recovery window.`,
        };
      }

      if (status.status === "HALF_OPEN") {
        return {
          allowed: true,
          reason: `Circuit is HALF_OPEN. Action allowed as recovery trial.`,
          trial: true,
        };
      }

      return { allowed: true, reason: "Unknown circuit state" };
    } catch (error) {
      console.error("[circuit-breaker] Error checking execution:", error);
      return { allowed: false, reason: "Error checking circuit breaker" };
    }
  }

  /**
   * Get summary of all circuit breakers for tenant
   */
  async getStatusAll(tenantId) {
    try {
      const memories = await IncidentMemory.find({
        tenantId,
        "circuitBreaker.status": { $ne: "CLOSED" },
      });

      return memories
        .filter((m) => m.circuitBreaker)
        .map((m) => ({
          service: m.patternId,
          status: m.circuitBreaker.status,
          failureCount: m.circuitBreaker.failureCount,
          openedAt: m.circuitBreaker.openedAt,
        }));
    } catch (error) {
      console.error("[circuit-breaker] Error getting all statuses:", error);
      return [];
    }
  }

  /**
   * Reset circuit (for testing or manual override)
   */
  async reset(tenantId, service) {
    try {
      const memory = await IncidentMemory.findOne({
        tenantId,
        patternId: service,
      });

      if (!memory) {
        return { reset: false, reason: "Service not found" };
      }

      if (memory.circuitBreaker) {
        memory.circuitBreaker.status = "CLOSED";
        memory.circuitBreaker.failureCount = 0;
        memory.circuitBreaker.successCount = 0;
        memory.circuitBreaker.openedAt = null;
        await memory.save();

        console.log(`[circuit-breaker] Circuit RESET: ${service}`);
        return { reset: true, message: `Circuit reset for ${service}` };
      }

      return { reset: false, reason: "No circuit breaker for this service" };
    } catch (error) {
      console.error("[circuit-breaker] Error resetting circuit:", error);
      throw error;
    }
  }
}

module.exports = new CircuitBreakerService();
