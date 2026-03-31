const SEVERITY_LEVELS = ["low", "medium", "high"];

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toSeverityIndex(severity) {
  const index = SEVERITY_LEVELS.indexOf(severity);
  return index === -1 ? 0 : index;
}

function escalateSeverity(severity, steps = 1) {
  const index = toSeverityIndex(severity);
  return SEVERITY_LEVELS[Math.min(SEVERITY_LEVELS.length - 1, index + steps)];
}

function downgradeSeverity(severity, steps = 1) {
  const index = toSeverityIndex(severity);
  return SEVERITY_LEVELS[Math.max(0, index - steps)];
}

function deriveBaseSeverity(metrics) {
  if (metrics.errorRate >= 45 || metrics.averageResponseTime >= 1600) {
    return "high";
  }

  if (metrics.errorRate >= 25 || metrics.averageResponseTime >= 1100) {
    return "medium";
  }

  return "low";
}

function getAdaptiveSeverity({ baseSeverity, metrics, occurrenceCount }) {
  let severity = baseSeverity;
  const notes = [];

  if (occurrenceCount >= 3) {
    severity = escalateSeverity(severity, 1);
    notes.push("Repeated failure detected. Escalating severity.");
  }

  if (occurrenceCount >= 6) {
    severity = "high";
    notes.push("Incident has become chronic across multiple cycles.");
  }

  if (occurrenceCount <= 1 && metrics.errorRate < 30 && metrics.averageResponseTime < 1300) {
    severity = downgradeSeverity(severity, 1);
    notes.push("Issue appears rare with moderate impact. Reducing severity.");
  }

  if (metrics.errorRate >= 40 && occurrenceCount >= 2) {
    severity = "high";
    notes.push("High error rate combined with recurrence indicates critical instability.");
  }

  return {
    severity,
    note: notes.join(" "),
  };
}

function getConfidenceScore({ metrics, occurrenceCount, baseConfidence = 58 }) {
  const metricBoost = metrics.errorRate * 0.6 + (metrics.averageResponseTime / 2000) * 24;
  const recurrenceBoost = Math.min(occurrenceCount, 8) * 4;

  return clampScore(baseConfidence + metricBoost + recurrenceBoost);
}

module.exports = {
  deriveBaseSeverity,
  getAdaptiveSeverity,
  getConfidenceScore,
};
