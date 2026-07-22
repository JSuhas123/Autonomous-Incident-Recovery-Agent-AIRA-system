const AuditEvent = require("../../models/AuditEvent");
const crypto = require("crypto");

class AuditService {
  /**
   * Record an audit event with tamper signature
   * @param {string} tenantId - Tenant identifier
   * @param {string} eventType - Type of event (decision_made, action_executed, etc.)
   * @param {object} payload - Event data to audit
   * @param {object} context - {userId, ipAddress, correlationId, etc.}
   */
  static async recordEvent(tenantId, eventType, payload, context = {}) {
    try {
      // Get previous event hash for chain-of-custody
      const lastEvent = await AuditEvent.findOne({ tenantId }).sort({
        timestamp: -1,
      });

      const previousEventHash = lastEvent ? lastEvent.eventHash : null;

      // Create event ID
      const eventId = crypto.randomUUID();
      const timestamp = Date.now();

      // Compute signature
      const signature = this._computeSignature(tenantId, payload, timestamp);

      // Create audit event
      const auditEvent = new AuditEvent({
        eventId,
        tenantId,
        eventType,
        payload,
        signature,
        previousEventHash,
        principal: context.principal || 'system', // Default to system if not provided
        principalId: context.principalId || (context.userId || 'system'),
        userId: context.userId,
        ipAddress: context.ipAddress,
        correlationId: context.correlationId || crypto.randomUUID(),
        timestamp,
        status: "created",
      });

      // Compute event hash for next event's chain
      auditEvent.eventHash = this._computeEventHash(auditEvent);

      await auditEvent.save();

      console.log(
        `[audit] ✓ Recorded ${eventType} | eventId=${eventId} | tenant=${tenantId}`
      );

      return auditEvent;
    } catch (error) {
      console.error("[audit] Error recording event:", error.message);
      throw error;
    }
  }

  /**
   * Compute HMAC-SHA256 signature for event
   * @private
   */
  static _computeSignature(tenantId, payload, timestamp) {
    // Normalize timestamp to milliseconds (number) regardless of input type
    const timestampMs = timestamp instanceof Date ? timestamp.getTime() : timestamp;
    const message = JSON.stringify(payload) + tenantId + timestampMs;
    const secret = process.env.AUDIT_SECRET;
    if (!secret) {
      throw new Error(
        "AUDIT_SECRET environment variable is not set. " +
        "Cannot compute audit signature without a secret."
      );
    }
    return crypto.createHmac("sha256", secret).update(message).digest("hex");
  }

  /**
   * Compute hash of entire event for chain-of-custody
   * @private
   */
  static _computeEventHash(event) {
    const data =
      event.eventId +
      event.tenantId +
      event.eventType +
      JSON.stringify(event.payload) +
      event.signature;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Verify an audit event has not been tampered with
   * @param {object} event - AuditEvent document
   */
  static async verifyEvent(event) {
    try {
      // Recompute signature
      const expectedSignature = this._computeSignature(
        event.tenantId,
        event.payload,
        event.timestamp
      );

      const signatureValid = crypto.timingSafeEqual(
        Buffer.from(event.signature),
        Buffer.from(expectedSignature)
      );

      if (!signatureValid) {
        console.warn(
          `[audit] Signature mismatch for event ${event.eventId} | tenant=${event.tenantId}`
        );
        return {
          valid: false,
          reason: "Signature mismatch",
          eventId: event.eventId,
        };
      }

      // Verify chain-of-custody (if not first event)
      if (event.previousEventHash) {
        const previousEvent = await AuditEvent.findOne({
          tenantId: event.tenantId,
          eventHash: event.previousEventHash,
        });

        if (!previousEvent) {
          console.warn(
            `[audit] Chain-of-custody broken for event ${event.eventId}`
          );
          return {
            valid: false,
            reason: "Chain-of-custody broken",
            eventId: event.eventId,
          };
        }
      }

      // Mark as verified
      event.status = "verified";
      await event.save();

      console.log(`[audit] ✓ Verified event ${event.eventId}`);

      return {
        valid: true,
        eventId: event.eventId,
      };
    } catch (error) {
      console.error("[audit] Error verifying event:", error.message);
      return {
        valid: false,
        reason: error.message,
        eventId: event?.eventId,
      };
    }
  }

  /**
   * Get audit trail for a correlation ID (trace incident through pipeline)
   * @param {string} tenantId - Tenant identifier
   * @param {string} correlationId - Correlation ID across incident pipeline
   */
  static async getAuditTrail(tenantId, correlationId) {
    try {
      const events = await AuditEvent.find({
        tenantId,
        correlationId,
      }).sort({ timestamp: 1 });

      console.log(
        `[audit] Retrieved ${events.length} events for correlationId=${correlationId}`
      );

      // Verify each event
      const verified = [];
      for (const event of events) {
        const verification = await this.verifyEvent(event);
        verified.push({
          ...event.toJSON(),
          verification,
        });
      }

      return verified;
    } catch (error) {
      console.error("[audit] Error getting audit trail:", error.message);
      throw error;
    }
  }

  /**
   * Verify entire audit trail integrity (all events valid and chained)
   * @param {string} tenantId - Tenant identifier
   */
  static async verifyAuditIntegrity(tenantId) {
    try {
      const events = await AuditEvent.find({ tenantId }).sort({
        timestamp: 1,
      });

      let integrityValid = true;
      let verificationResults = [];

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const verification = await this.verifyEvent(event);

        verificationResults.push(verification);

        if (!verification.valid) {
          integrityValid = false;
        }

        // Verify chain
        if (i > 0) {
          const previousEvent = events[i - 1];
          if (event.previousEventHash !== previousEvent.eventHash) {
            console.warn(
              `[audit] Chain broken between events ${previousEvent.eventId} → ${event.eventId}`
            );
            integrityValid = false;
            verificationResults[i].chainValid = false;
          } else {
            verificationResults[i].chainValid = true;
          }
        }
      }

      const report = {
        tenantId,
        totalEvents: events.length,
        integrityValid,
        verificationResults,
        timestamp: Date.now(),
      };

      console.log(
        `[audit] ✓ Integrity check: ${integrityValid ? "VALID" : "INVALID"} (${events.length} events)`
      );

      return report;
    } catch (error) {
      console.error("[audit] Error verifying integrity:", error.message);
      throw error;
    }
  }

  /**
   * Get events by type for audit queries
   * @param {string} tenantId - Tenant identifier
   * @param {string} eventType - Event type to filter
   * @param {number} limit - Max results
   */
  static async getEventsByType(tenantId, eventType, limit = 100) {
    try {
      const events = await AuditEvent.find({
        tenantId,
        eventType,
      })
        .sort({ timestamp: -1 })
        .limit(limit);

      console.log(
        `[audit] Retrieved ${events.length} ${eventType} events for tenant=${tenantId}`
      );

      return events;
    } catch (error) {
      console.error("[audit] Error getting events by type:", error.message);
      throw error;
    }
  }

  /**
   * Export audit log for compliance (e.g., regulatory reports)
   * @param {string} tenantId - Tenant identifier
   * @param {object} filters - {startDate, endDate, eventType, correlationId}
   */
  static async exportAuditLog(tenantId, filters = {}) {
    try {
      const query = { tenantId };

      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
          query.timestamp.$gte = new Date(filters.startDate).getTime();
        }
        if (filters.endDate) {
          query.timestamp.$lte = new Date(filters.endDate).getTime();
        }
      }

      if (filters.eventType) {
        query.eventType = filters.eventType;
      }

      if (filters.correlationId) {
        query.correlationId = filters.correlationId;
      }

      const events = await AuditEvent.find(query).sort({ timestamp: 1 });

      console.log(`[audit] Exported ${events.length} audit events for tenant=${tenantId}`);

      return events;
    } catch (error) {
      console.error("[audit] Error exporting audit log:", error.message);
      throw error;
    }
  }

  /**
   * Utility: Sign message data with secret (for tests and compatibility)
   * @param {object} data - Data to sign
   * @param {string} secret - Secret key
   */
  static signMessage(data, secret) {
    const message = JSON.stringify(data);
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  /**
   * Utility: Verify signature (for tests and compatibility)
   * @param {object} data - Data to verify
   * @param {string} signature - Signature to verify
   * @param {string} secret - Secret key
   */
  static verifySignature(data, signature, secret = process.env.AUDIT_SECRET) {
    if (!signature) return false;
    const expectedSignature = this.signMessage(data, secret);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Utility: Create audit entry (for tests and compatibility)
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {string} action - Action type
   * @param {string} resourceId - Resource ID
   * @param {object} changes - Changes made
   * @param {string} secret - Secret key for signing
   */
  static createAuditEntry(tenantId, userId, action, resourceId, changes, secret) {
    const timestamp = Date.now();
    const entry = {
      tenantId,
      userId,
      action,
      resourceId,
      changes,
      timestamp,
    };
    entry.signature = this.signMessage(entry, secret);
    return entry;
  }
}

module.exports = AuditService;
