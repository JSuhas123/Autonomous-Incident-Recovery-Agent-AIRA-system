const axios = require('axios');
const mongoose = require("../../persistence/operational/mongooseCompat");

/**
 * Slack Notification Service
 * 
 * Integrates AIRA with Slack for sending notifications, alerts, and approval requests
 */

const slackNotificationSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  decisionTraceId: { type: String },
  messageType: { type: String, enum: ['decision', 'approval', 'alert', 'effectiveness', 'warning'] },
  slackChannel: { type: String, required: true },
  slackUserId: String,
  timestamp: { type: Date, default: Date.now },
  content: {
    action: String,
    service: String,
    status: String,
    confidence: Number,
    effectiveness: Number,
    requiredApproval: Boolean
  },
  slackMessageId: String,
  slackThreadId: String,
  status: { type: String, enum: ['sent', 'failed', 'acknowledged'], default: 'sent' },
  response: mongoose.Schema.Types.Mixed,
  error: String
});

class SlackService {
  constructor(slackToken) {
    this.slackToken = slackToken;
    this.SlackNotification = mongoose.model('SlackNotification', slackNotificationSchema, 'slack_notifications');
  }

  /**
   * Send decision notification to Slack
   */
  async notifyDecision(tenantId, decisionData) {
    try {
      const message = {
        channel: decisionData.channel,
        text: `AIRA Decision: ${decisionData.action}`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🤖 AIRA Decision' }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Action:*\n${decisionData.action}` },
              { type: 'mrkdwn', text: `*Service:*\n${decisionData.service}` },
              { type: 'mrkdwn', text: `*Confidence:*\n${(decisionData.confidence * 100).toFixed(1)}%` },
              { type: 'mrkdwn', text: `*Status:*\n${decisionData.status}` }
            ]
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: decisionData.reasoning || 'No additional details' }
          }
        ]
      };

      if (decisionData.requiredApproval) {
        message.blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve' },
              value: `approve_${decisionData.decisionTraceId}`,
              style: 'primary'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Reject' },
              value: `reject_${decisionData.decisionTraceId}`,
              style: 'danger'
            }
          ]
        });
      }

      const result = await this.sendMessage(message);

      // Log notification
      await this.SlackNotification.create({
        tenantId,
        decisionTraceId: decisionData.decisionTraceId,
        messageType: 'decision',
        slackChannel: decisionData.channel,
        slackMessageId: result.ts,
        content: decisionData,
        status: 'sent',
        response: result
      });

      return { success: true, slackMessageId: result.ts };
    } catch (error) {
      throw new Error(`Failed to send decision notification: ${error.message}`);
    }
  }

  /**
   * Send alert to Slack
   */
  async notifyAlert(tenantId, alertData) {
    try {
      const message = {
        channel: alertData.channel,
        text: `⚠️ AIRA Alert: ${alertData.pattern}`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '⚠️ Alert' }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Pattern:*\n${alertData.pattern}` },
              { type: 'mrkdwn', text: `*Service:*\n${alertData.service}` },
              { type: 'mrkdwn', text: `*Error Rate:*\n${alertData.errorRate}%` },
              { type: 'mrkdwn', text: `*Severity:*\n${alertData.severity}` }
            ]
          }
        ]
      };

      const result = await this.sendMessage(message);
      await this.SlackNotification.create({
        tenantId,
        messageType: 'alert',
        slackChannel: alertData.channel,
        slackMessageId: result.ts,
        content: alertData,
        status: 'sent'
      });

      return { success: true, slackMessageId: result.ts };
    } catch (error) {
      throw new Error(`Failed to send alert: ${error.message}`);
    }
  }

  /**
   * Send effectiveness summary to Slack
   */
  async notifyEffectiveness(tenantId, effectivenessData) {
    try {
      const scoreColor = effectivenessData.score >= 80 ? '#36a64f' 
        : effectivenessData.score >= 60 ? '#ff9d00'
        : '#ff3860';

      const message = {
        channel: effectivenessData.channel,
        text: `Action Effectiveness: ${effectivenessData.action}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Action Effectiveness Report*\n*${effectivenessData.action}* - Score: *${effectivenessData.score}%*`
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Error Reduction:*\n${effectivenessData.errorReduction}%` },
              { type: 'mrkdwn', text: `*Availability Gain:*\n${effectivenessData.availabilityGain}%` },
              { type: 'mrkdwn', text: `*Resolution Time:*\n${effectivenessData.resolutionTime}` },
              { type: 'mrkdwn', text: `*ROI:*\n${effectivenessData.roi}%` }
            ]
          }
        ]
      };

      const result = await this.sendMessage(message);
      return { success: true, slackMessageId: result.ts };
    } catch (error) {
      throw new Error(`Failed to send effectiveness notification: ${error.message}`);
    }
  }

  /**
   * Send raw message to Slack
   */
  async sendMessage(message) {
    try {
      const response = await axios.post('https://slack.com/api/chat.postMessage', message, {
        headers: { Authorization: `Bearer ${this.slackToken}` }
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data;
    } catch (error) {
      throw new Error(`Slack API error: ${error.message}`);
    }
  }

  /**
   * Update message in Slack
   */
  async updateMessage(channel, ts, blocks) {
    try {
      const response = await axios.post('https://slack.com/api/chat.update', {
        channel,
        ts,
        blocks
      }, {
        headers: { Authorization: `Bearer ${this.slackToken}` }
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data;
    } catch (error) {
      throw new Error(`Failed to update message: ${error.message}`);
    }
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(tenantId, limit = 50) {
    try {
      return await this.SlackNotification.find({ tenantId })
        .sort({ timestamp: -1 })
        .limit(limit);
    } catch (error) {
      throw new Error(`Failed to get notification history: ${error.message}`);
    }
  }
}

module.exports = SlackService;
