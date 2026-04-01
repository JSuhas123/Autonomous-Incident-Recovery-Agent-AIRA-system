const mongoose = require('mongoose');

/**
 * Webhook Ingestion Service
 * 
 * Receives alerts from external monitoring systems and triggers AIRA decisions
 */

const webhookEventSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  source: { type: String, required: true }, // datadog, pagerduty, prometheus, custom
  eventId: { type: String, unique: true },
  timestamp: { type: Date, default: Date.now, index: true },
  
  // Alert content
  alert: {
    name: String,
    service: String,
    pattern: String,
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    description: String,
    metrics: mongoose.Schema.Types.Mixed
  },
  
  // AIRA response
  aiiraDecision: {
    action: String,
    confidence: Number,
    reasoning: String,
    decisionTraceId: String
  },
  
  // Status
  status: { type: String, enum: ['received', 'processing', 'actioned', 'skipped', 'failed'], default: 'received' },
  processingTimeMs: Number,
  error: String,
  
  // Source metadata
  sourceMetadata: mongoose.Schema.Types.Mixed
});

const webhookConfigSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true, unique: true },
  sources: [{
    name: String,
    type: { type: String, enum: ['datadog', 'pagerduty', 'prometheus', 'custom'] },
    enabled: Boolean,
    apiKey: String,
    apiKeyEncrypted: Boolean,
    endpoints: [String],
    mappings: mongoose.Schema.Types.Mixed // Custom field mappings
  }],
  autoAction: { type: Boolean, default: false },
  severityThreshold: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  createdAt: { type: Date, default: Date.now }
});

class WebhookIngestionService {
  constructor() {
    this.WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema, 'webhook_events');
    this.WebhookConfig = mongoose.model('WebhookConfig', webhookConfigSchema, 'webhook_configs');
  }

  /**
   * Register webhook source for tenant
   */
  async registerWebhookSource(tenantId, sourceConfig) {
    try {
      let config = await this.WebhookConfig.findOne({ tenantId });

      if (!config) {
        config = new this.WebhookConfig({
          tenantId,
          sources: [sourceConfig]
        });
      } else {
        config.sources.push(sourceConfig);
      }

      await config.save();
      return { success: true, source: sourceConfig.name };
    } catch (error) {
      throw new Error(`Failed to register webhook source: ${error.message}`);
    }
  }

  /**
   * Ingest webhook event from external source
   */
  async ingestEvent(tenantId, source, webhookPayload) {
    try {
      const startTime = Date.now();

      // Create event record
      const event = new this.WebhookEvent({
        tenantId,
        source,
        eventId: webhookPayload.eventId || `${source}_${Date.now()}`,
        alert: {
          name: webhookPayload.alertName,
          service: webhookPayload.service,
          pattern: this.inferPattern(webhookPayload),
          severity: webhookPayload.severity || 'medium',
          description: webhookPayload.description,
          metrics: webhookPayload.metrics || {}
        },
        sourceMetadata: webhookPayload
      });

      await event.save();

      // Check if we should auto-action
      const config = await this.WebhookConfig.findOne({ tenantId });
      if (config && config.autoAction && 
          this.shouldAction(event.alert.severity, config.severityThreshold)) {
        
        // Would be called from main AIRA decision engine
        event.status = 'processing';
      } else {
        event.status = 'received';
      }

      event.processingTimeMs = Date.now() - startTime;
      await event.save();

      return event;
    } catch (error) {
      throw new Error(`Failed to ingest event: ${error.message}`);
    }
  }

  /**
   * Record AIRA decision for webhook event
   */
  async recordAiiraDecision(eventId, decision) {
    try {
      const event = await this.WebhookEvent.findOne({ eventId });
      if (!event) {
        throw new Error('Event not found');
      }

      event.aiiraDecision = {
        action: decision.action,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        decisionTraceId: decision.decisionTraceId
      };

      event.status = 'actioned';
      await event.save();

      return event;
    } catch (error) {
      throw new Error(`Failed to record decision: ${error.message}`);
    }
  }

  /**
   * Get webhook event history
   */
  async getEventHistory(tenantId, source = null, limit = 50) {
    try {
      const query = { tenantId };
      if (source) query.source = source;

      return await this.WebhookEvent.find(query)
        .sort({ timestamp: -1 })
        .limit(limit);
    } catch (error) {
      throw new Error(`Failed to get event history: ${error.message}`);
    }
  }

  /**
   * Get webhook statistics
   */
  async getStatistics(tenantId) {
    try {
      const events = await this.WebhookEvent.aggregate([
        { $match: { tenantId } },
        {
          $group: {
            _id: '$source',
            total: { $sum: 1 },
            processed: {
              $sum: { $cond: [{ $in: ['$status', ['actioned', 'skipped']] }, 1, 0] }
            },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            avgProcessingTime: { $avg: '$processingTimeMs' }
          }
        }
      ]);

      return events;
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  // Helper methods
  inferPattern(payload) {
    if (payload.metricName && payload.metricName.includes('error')) return 'high-error-rate';
    if (payload.metricName && payload.metricName.includes('latency')) return 'high-latency';
    if (payload.metricName && payload.metricName.includes('cpu')) return 'high-cpu';
    if (payload.metricName && payload.metricName.includes('memory')) return 'memory-leak';
    return 'unknown-pattern';
  }

  shouldAction(severity, threshold) {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return levels[severity] >= levels[threshold];
  }
}

module.exports = new WebhookIngestionService();
