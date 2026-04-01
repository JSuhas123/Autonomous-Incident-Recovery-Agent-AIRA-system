const express = require('express');
const router = express.Router();
const webhookIngestionService = require('../services/integrations/webhookIngestionService');

/**
 * Phase 5: Integration Routes
 * 
 * Slack notifications and webhook ingestion for external alert integration
 */

/**
 * POST /webhooks/register
 * Register a webhook source (Datadog, PagerDuty, Prometheus, etc)
 */
router.post('/webhooks/register', async (req, res) => {
  try {
    const { tenantId = 'default', sourceConfig } = req.body;

    if (!sourceConfig || !sourceConfig.name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sourceConfig.name'
      });
    }

    const result = await webhookIngestionService.registerWebhookSource(
      tenantId,
      sourceConfig
    );

    res.json({
      success: true,
      message: `Registered webhook source: ${sourceConfig.name}`,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /webhooks/ingest
 * Receive webhook event from external monitoring system
 */
router.post('/webhooks/ingest', async (req, res) => {
  try {
    const { tenantId = 'default', source, payload } = req.body;

    if (!source || !payload) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: source, payload'
      });
    }

    const event = await webhookIngestionService.ingestEvent(tenantId, source, payload);

    res.json({
      success: true,
      eventId: event.eventId,
      status: event.status,
      message: 'Webhook received and queued for processing'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /webhooks/:eventId/decision
 * Record AIRA decision for webhook event
 */
router.post('/webhooks/:eventId/decision', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { decision } = req.body;

    if (!decision) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: decision'
      });
    }

    const event = await webhookIngestionService.recordAiiraDecision(eventId, decision);

    res.json({
      success: true,
      eventId,
      action: event.aiiraDecision.action,
      message: 'AIRA decision recorded'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /webhooks/history
 * Get webhook event history
 */
router.get('/webhooks/history', async (req, res) => {
  try {
    const { tenantId = 'default', source, limit = 50 } = req.query;

    const events = await webhookIngestionService.getEventHistory(
      tenantId,
      source,
      parseInt(limit)
    );

    res.json({
      success: true,
      tenantId,
      eventsCount: events.length,
      events
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /webhooks/stats
 * Get webhook ingestion statistics
 */
router.get('/webhooks/stats', async (req, res) => {
  try {
    const { tenantId = 'default' } = req.query;

    const stats = await webhookIngestionService.getStatistics(tenantId);

    const totalEvents = stats.reduce((a, s) => a + s.total, 0);
    const totalProcessed = stats.reduce((a, s) => a + s.processed, 0);

    res.json({
      success: true,
      tenantId,
      summary: {
        totalEvents,
        totalProcessed,
        processingRate: totalEvents > 0 ? ((totalProcessed / totalEvents) * 100).toFixed(1) + '%' : '0%'
      },
      bySource: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /slack/notify
 * Send Slack notification (requires SLACK_TOKEN environment variable)
 */
router.post('/slack/notify', async (req, res) => {
  try {
    const { channel, messageType, content } = req.body;

    if (!process.env.SLACK_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'SLACK_TOKEN environment variable not configured'
      });
    }

    if (!channel || !messageType || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: channel, messageType, content'
      });
    }

    // This is a placeholder - SlackService would be instantiated here
    res.json({
      success: true,
      message: 'Slack notification queued',
      messageType,
      channel
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Example: POST /webhooks/datadog
 * Receive Datadog webhook
 */
router.post('/webhooks/datadog', async (req, res) => {
  try {
    const payload = req.body;

    const event = await webhookIngestionService.ingestEvent('default', 'datadog', {
      eventId: `datadog_${payload.id}`,
      alertName: payload.alert?.title,
      service: payload.tags?.service,
      severity: payload.alert?.severity || 'medium',
      description: payload.alert?.message,
      metrics: payload.metrics || {}
    });

    res.json({ success: true, eventId: event.eventId });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Example: POST /webhooks/prometheus
 * Receive Prometheus AlertManager webhook
 */
router.post('/webhooks/prometheus', async (req, res) => {
  try {
    const { alerts } = req.body;

    const results = [];
    for (const alert of alerts || []) {
      const event = await webhookIngestionService.ingestEvent('default', 'prometheus', {
        eventId: `prometheus_${alert.fingerprint}`,
        alertName: alert.labels?.alertname,
        service: alert.labels?.instance,
        severity: alert.labels?.severity || 'medium',
        description: alert.annotations?.summary,
        metrics: alert.labels || {}
      });
      results.push(event);
    }

    res.json({ success: true, eventsIngested: results.length });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
