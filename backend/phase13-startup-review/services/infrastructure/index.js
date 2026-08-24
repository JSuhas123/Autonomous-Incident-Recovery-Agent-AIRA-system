/**
 * Infrastructure Services Domain
 * Database, queues, idempotency, message ordering, DLQ, correlation,
 * metrics, logging, locking, retry handling, memory cleanup, system health
 */

module.exports = {
  // Core infrastructure - STABLE & TESTED
  dbService: require("./dbService"),
  queueService: require("./queueService"),
  idempotencyService: require("./idempotencyService").IdempotencyService,
  correlationEngine: require("./correlationEngine"),
  decisionMapperService: require("./decisionMapperService"),
  
  // Resilience & Safety - PRODUCTION READY
  retryHandler: require("./retryHandler"),
  retryProcessorJob: require("./retryProcessorJob"),
  distributedLockService: require("./distributedLockService"),
  memoryCleanupJob: require("./memoryCleanupJob"),
  circuitBreakerService:require("./circuitBreakerService"),
  dependencyIsolationService:require("./dependencyIsolationService"),
  // System Health & Safety - PRODUCTION READY
  systemHealthService: require("./systemHealthService"),
  
  // Observability - PRODUCTION READY
  metricsService: require("./metricsService"),
  loggingService: require("./loggingService"),
};
