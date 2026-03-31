/**
 * Learning Services Domain
 * Feedback collection, confidence management, weight optimization, memory/context, risk simulation
 */

module.exports = {
  feedbackService: require("./feedbackService"),
  confidenceService: require("./confidenceService"),
  confidenceWeightOptimizer: require("./confidenceWeightOptimizer"),
  memoryService: require("./memoryService"),
  simulationService: require("./simulationService"),
  riskImpactSimulator: require("./riskImpactSimulator"),
};
