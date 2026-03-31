/**
 * Mock Queue Service for Development/Testing
 * Provides in-memory queue functionality when RabbitMQ is unavailable
 */

class MockQueueService {
  constructor() {
    this.queues = new Map();
    this.topics = {
      SIGNAL_RECEIVED: "signal.received",
      TELEMETRY_INGESTED: "telemetry.ingested",
      INCIDENT_DETECTED: "incident.detected",
      INCIDENT_ANALYZED: "incident.analyzed",
      DECISION_PROPOSED: "decision.proposed",
      ACTION_APPROVED: "action.approved",
      ACTION_REJECTED: "action.rejected",
      ACTION_EXECUTED: "action.executed",
      ACTION_FAILED: "action.failed",
      AUDIT_EVENTS: "audit.events",
      ALERT_CREATED: "alert.created",
    };
    this.connected = true;
  }

  /**
   * Connect to queue service (mock - always succeeds)
   */
  async connect(url) {
    console.log("[mock-queue] Connected (in-memory mock)");
    this.connected = true;
    return true;
  }

  /**
   * Publish a message to a topic
   */
  async publish(topic, message) {
    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }
    this.queues.get(topic).push({
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date(),
      payload: message,
    });
    return true;
  }

  /**
   * Publish an event to a topic (alias for publish)
   */
  async publishEvent(topic, message) {
    return this.publish(topic, message);
  }

  /**
   * Subscribe to a topic
   */
  async subscribe(topic, handler) {
    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }
    console.log(`[mock-queue] Subscribed to topic: ${topic}`);
    return { unsubscribe: () => {} };
  }

  /**
   * Get queue size
   */
  getQueueSize(topic) {
    return this.queues.get(topic)?.length || 0;
  }

  /**
   * Clear a queue
   */
  clearQueue(topic) {
    this.queues.delete(topic);
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queues: Array.from(this.queues.keys()),
      totalMessages: Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0),
      connected: this.connected,
    };
  }

  /**
   * Consume events from topics (mock implementation)
   */
  async consumeEvents(topics, handlers) {
    console.log(`[mock-queue] Consuming events from topics: ${Array.isArray(topics) ? topics.join(', ') : topics}`);
    // In mock mode, we don't actually consume - just set up handlers
    return true;
  }
}

// Singleton instance
let mockInstance = null;

function getMockQueueService() {
  if (!mockInstance) {
    mockInstance = new MockQueueService();
  }
  return mockInstance;
}

module.exports = getMockQueueService();
