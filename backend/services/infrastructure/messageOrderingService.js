/**
 * Message Ordering Service
 * Ensures FIFO message ordering per correlation ID
 */

const messages = new Map(); // In-memory queue: { correlationId: [messages] }

class MessageOrderingService {
  /**
   * Enqueue message for a correlation ID
   */
  static async enqueueMessage(tenantId, correlationId, message) {
    const key = `${tenantId}:${correlationId}`;
    
    if (!messages.has(key)) {
      messages.set(key, []);
    }

    messages.get(key).push({
      ...message,
      enqueuedAt: Date.now(),
      sequence: messages.get(key).length + 1,
    });

    return { status: 'enqueued', sequence: messages.get(key).length };
  }

  /**
   * Dequeue message (maintaining FIFO order)
   */
  static async dequeueMessage(tenantId, correlationId) {
    const key = `${tenantId}:${correlationId}`;

    if (!messages.has(key) || messages.get(key).length === 0) {
      return null;
    }

    return messages.get(key).shift();
  }

  /**
   * Peek at next message without removing
   */
  static async peekMessage(tenantId, correlationId) {
    const key = `${tenantId}:${correlationId}`;

    if (!messages.has(key) || messages.get(key).length === 0) {
      return null;
    }

    return messages.get(key)[0];
  }

  /**
   * Get message count
   */
  static async getMessageCount(tenantId, correlationId) {
    const key = `${tenantId}:${correlationId}`;
    return messages.has(key) ? messages.get(key).length : 0;
  }

  /**
   * Clear all messages for correlation ID
   */
  static async clearQueue(tenantId, correlationId) {
    const key = `${tenantId}:${correlationId}`;
    if (messages.has(key)) {
      messages.delete(key);
    }
  }
}

module.exports = MessageOrderingService;
