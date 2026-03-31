/**
 * Observability Services Domain
 * Audit trails, decision pipeline observability, notifications, metrics, logging
 */

module.exports = {
  auditService: require("./auditService"),
  decisionPipelineObservability: require("./decisionPipelineObservability"),
  
  // PHASE 2: Enhanced Observability Services
  getStructuredLoggingService: require("./structuredLoggingService").getStructuredLoggingService,
  getPrometheusMetricsService: require("./prometheusMetricsService").getPrometheusMetricsService,
  getActionAuditService: require("./actionAuditService").getActionAuditService,
};
