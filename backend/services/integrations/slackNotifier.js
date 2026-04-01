/**
 * Slack Notifier Service
 * Sends decision alerts and action results to Slack
 * 
 * Features:
 * - Decision alerts (high-risk decisions, escalations)
 * - Action execution notifications
 * - Approval requests
 * - System health alerts
 * - Kill switch alerts
 */

const axios = require('axios');

class SlackNotifier {
  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
    this.enabled = !!this.webhookUrl;
    this.channel = process.env.SLACK_CHANNEL || '#aira-alerts';
    this.username = process.env.SLACK_USERNAME || 'AIRA';
  }

  /**
   * Send decision alert
   */
  async notifyDecision(decision) {
    if (!this.enabled) return;

    try {
      const color =
        decision.confidence >= 0.85
          ? '#28a745' // Green
          : decision.confidence >= 0.60
          ? '#ffc107' // Yellow
          : '#dc3545'; // Red

      const payload = {
        channel: this.channel,
        username: this.username,
        attachments: [
          {
            color,
            title: `Decision: ${decision.patternType}`,
            fields: [
              {
                title: 'Action',
                value: decision.recommendedAction,
                short: true,
              },
              {
                title: 'Confidence',
                value: `${(decision.confidence * 100).toFixed(1)}%`,
                short: true,
              },
              {
                title: 'Severity',
                value: decision.severity || 'UNKNOWN',
                short: true,
              },
              {
                title: 'Tier',
                value: decision.tier || 'OBSERVE',
                short: true,
              },
              {
                title: 'Decision ID',
                value: decision.decisionId,
                short: false,
              },
            ],
            footer: 'AIRA Decision Engine',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      await this._postToSlack(payload);
    } catch (error) {
      console.error(
        `[slack] Failed to notify decision: ${error.message}`
      );
    }
  }

  /**
   * Send action execution notification
   */
  async notifyActionExecution(execution) {
    if (!this.enabled) return;

    try {
      const color = execution.success ? '#28a745' : '#dc3545';
      const status = execution.success ? '✅ Success' : '❌ Failed';

      const payload = {
        channel: this.channel,
        username: this.username,
        attachments: [
          {
            color,
            title: `Action Execution: ${execution.action}`,
            text: status,
            fields: [
              {
                title: 'Resource',
                value: execution.resource,
                short: true,
              },
              {
                title: 'Duration',
                value: `${execution.duration}ms`,
                short: true,
              },
              {
                title: 'Result',
                value: execution.result || 'N/A',
                short: false,
              },
              {
                title: 'Execution ID',
                value: execution.executionId,
                short: false,
              },
            ],
            footer: 'AIRA Execution',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      if (execution.error) {
        payload.attachments[0].fields.push({
          title: 'Error',
          value: execution.error,
          short: false,
        });
      }

      await this._postToSlack(payload);
    } catch (error) {
      console.error(
        `[slack] Failed to notify action: ${error.message}`
      );
    }
  }

  /**
   * Send approval request
   */
  async notifyApprovalRequired(request) {
    if (!this.enabled) return;

    try {
      const payload = {
        channel: this.channel,
        username: this.username,
        text: '🔔 Approval Required',
        attachments: [
          {
            color: '#ffc107',
            title: `Approval needed for: ${request.action}`,
            fields: [
              {
                title: 'Incident Type',
                value: request.incidentType,
                short: true,
              },
              {
                title: 'Confidence',
                value: `${(request.confidence * 100).toFixed(1)}%`,
                short: true,
              },
              {
                title: 'Reason',
                value: request.reason || 'Manual review required',
                short: false,
              },
              {
                title: 'Decision ID',
                value: request.decisionId,
                short: false,
              },
            ],
            actions: [
              {
                type: 'button',
                text: '✅ Approve',
                url: `${process.env.AIRA_UI_URL}/approve/${request.decisionId}`,
              },
              {
                type: 'button',
                text: '❌ Deny',
                url: `${process.env.AIRA_UI_URL}/deny/${request.decisionId}`,
              },
            ],
            footer: 'AIRA Approval',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      await this._postToSlack(payload);
    } catch (error) {
      console.error(
        `[slack] Failed to notify approval: ${error.message}`
      );
    }
  }

  /**
   * Send system alert
   */
  async notifySystemAlert(alert) {
    if (!this.enabled) return;

    try {
      const color = alert.severity === 'CRITICAL' ? '#dc3545' : '#ffc107';

      const payload = {
        channel: this.channel,
        username: this.username,
        attachments: [
          {
            color,
            title: `⚠️ System Alert: ${alert.title}`,
            text: alert.message,
            fields: [
              {
                title: 'Severity',
                value: alert.severity,
                short: true,
              },
              {
                title: 'Component',
                value: alert.component || 'Unknown',
                short: true,
              },
            ],
            footer: 'AIRA System',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      if (alert.details) {
        payload.attachments[0].fields.push({
          title: 'Details',
          value: alert.details,
          short: false,
        });
      }

      await this._postToSlack(payload);
    } catch (error) {
      console.error(
        `[slack] Failed to notify alert: ${error.message}`
      );
    }
  }

  /**
   * Post payload to Slack
   * @private
   */
  async _postToSlack(payload) {
    try {
      await axios.post(this.webhookUrl, payload, {
        timeout: 5000,
      });
    } catch (error) {
      console.error(
        `[slack] Failed to post to webhook: ${error.message}`
      );
      // Don't throw - Slack failures should not break system
    }
  }

  /**
   * Check if Slack is configured
   */
  isConfigured() {
    return this.enabled;
  }
}

module.exports = {
  SlackNotifier,
  slackNotifier: new SlackNotifier(),
};
