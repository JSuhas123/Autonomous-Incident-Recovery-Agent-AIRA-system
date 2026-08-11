'use strict';

const incidentService = require('./incidentService');
const { IncidentPlaybookService, getIncidentPlaybookService } = require('./incidentPlaybookService');

// Singleton instance used by AgentOrchestrator and other consumers
const incidentPlaybookService = getIncidentPlaybookService();

module.exports = {
  incidentService,
  incidentPlaybookService,
  IncidentPlaybookService,
  getIncidentPlaybookService,
};
