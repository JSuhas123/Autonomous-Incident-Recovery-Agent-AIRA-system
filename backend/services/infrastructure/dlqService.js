/**
 * Dead Letter Queue (DLQ) Service
 * Handles failed message processing with exponential backoff
 */

const FailedMessage = require('../../models/FailedMessage');
const { v4: uuidv4 } = require('uuid');

class DLQService {
  /**
   * Add failed message to DLQ
   */
  static async addToQueue(tenantId, message, error, attemptNumber = 1) {
    try {
      const entry = new FailedMessage({
        tenantId,
        eventId: message.eventId || uuidv4(),
        correlationId: message.correlationId || uuidv4(),
        originalMessage: message,
        errorMessage: error.message,
        errorStack: error.stack,
        failureCount: attemptNumber,
        nextRetryTime: new Date(Date.now() + this.getBackoffDelay(attemptNumber)),
        status: 'retriable',
      });

      await entry.save();
      return entry;
    } catch (err) {
      console.error('[dlq] Error adding to queue:', err.message);
      throw err;
    }
  }

  /**
   * Calculate backoff delay in milliseconds
   */
  static getBackoffDelay(attempt) {
    // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc. capped at 1 hour
    const delayMs = Math.min(100 * Math.pow(2, attempt - 1), 3600000);
    return delayMs;
  }

  /**
   * Get messages ready for retry
   */
  static async getRetryableMessages(tenantId) {
    const now = new Date();
    return await FailedMessage.find({
      tenantId,
      status: 'retriable',
      nextRetryTime: { $lte: now },
    }).sort({ failureCount: 1 });
  }

  /**
   * Update DLQ entry
   */
  static async updateEntry(entry) {
    return await FailedMessage.findByIdAndUpdate(entry._id, entry, { new: true });
  }

  /**
   * Get all DLQ entries for tenant
   */
  static async getQueue(tenantId) {
    return await FailedMessage.find({ tenantId }).sort({ createdAt: -1 });
  }

  /**
   * Clear resolved messages
   */
  static async clearResolved(tenantId) {
    const result = await FailedMessage.deleteMany({
      tenantId,
      status: 'RESOLVED',
    });
    return result;
  }
}

module.exports = DLQService;
