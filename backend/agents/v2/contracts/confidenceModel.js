'use strict';

/**
 * Confidence Model
 *
 * Separate confidence dimensions — no single global confidence.
 * Each dimension has configurable thresholds.
 *
 * SAFETY INVARIANT: Low confidence in any critical dimension triggers
 * MANUAL_REQUIRED before reaching V1 execution.
 */

const CONFIDENCE_DIMENSION = Object.freeze({
  CORRELATION:             'correlationConfidence',
  EVIDENCE_COMPLETENESS:   'evidenceCompleteness',
  DIAGNOSIS:               'diagnosisConfidence',
  PLAYBOOK_SELECTION:      'playbookSelectionConfidence',
  PARAMETER:               'parameterConfidence',
  RECOVERY_OBSERVATION:    'recoveryObservationConfidence',
});

/**
 * Default thresholds (can be overridden via environment/config).
 *
 * Values are 0–1 floats.
 * Below MIN → MANUAL_REQUIRED
 * Below WARN → proceed with warnings
 * Above AUTO → allow autonomous path
 */
const DEFAULT_THRESHOLDS = Object.freeze({
  [CONFIDENCE_DIMENSION.CORRELATION]: {
    min: 0.30, warn: 0.50, auto: 0.70,
  },
  [CONFIDENCE_DIMENSION.EVIDENCE_COMPLETENESS]: {
    min: 0.40, warn: 0.60, auto: 0.75,
  },
  [CONFIDENCE_DIMENSION.DIAGNOSIS]: {
    min: 0.40, warn: 0.60, auto: 0.75,
  },
  [CONFIDENCE_DIMENSION.PLAYBOOK_SELECTION]: {
    min: 0.50, warn: 0.65, auto: 0.80,
  },
  [CONFIDENCE_DIMENSION.PARAMETER]: {
    min: 0.70, warn: 0.80, auto: 0.90,
  },
  [CONFIDENCE_DIMENSION.RECOVERY_OBSERVATION]: {
    min: 0.20, warn: 0.40, auto: 0.70,
  },
});

class ConfidenceModel {
  constructor(overrides = {}) {
    this._thresholds = { ...DEFAULT_THRESHOLDS };
    for (const [dim, vals] of Object.entries(overrides)) {
      if (this._thresholds[dim]) {
        this._thresholds[dim] = { ...this._thresholds[dim], ...vals };
      }
    }
  }

  /**
   * Evaluate a confidence value for a given dimension.
   * Returns { ok, warn, belowMin, tier }
   */
  evaluate(dimension, value) {
    const t = this._thresholds[dimension];
    if (!t) throw new Error(`Unknown confidence dimension: ${dimension}`);

    const v = typeof value === 'number' ? value : 0;
    const belowMin = v < t.min;
    const warn     = !belowMin && v < t.warn;
    const auto     = v >= t.auto;
    const tier     = belowMin ? 'MANUAL_REQUIRED'
                   : warn     ? 'WARN'
                   : auto     ? 'AUTO'
                   :            'BORDERLINE';

    return { dimension, value: v, belowMin, warn, auto, tier, thresholds: t };
  }

  /**
   * Bulk evaluate. Returns array of evaluations.
   */
  evaluateAll(scores = {}) {
    return Object.entries(scores).map(([dim, val]) => this.evaluate(dim, val));
  }

  /**
   * Check if all dimensions allow autonomous execution.
   */
  allClear(scores = {}) {
    const evals = this.evaluateAll(scores);
    const blocking = evals.filter(e => e.belowMin);
    const warnings = evals.filter(e => e.warn);
    return {
      canProceed: blocking.length === 0,
      blocking,
      warnings,
      evals,
    };
  }

  thresholds() {
    return { ...this._thresholds };
  }
}

let _instance = null;
function getConfidenceModel(overrides) {
  if (!_instance || overrides) {
    _instance = new ConfidenceModel(overrides || {});
  }
  return _instance;
}

module.exports = { ConfidenceModel, getConfidenceModel, CONFIDENCE_DIMENSION, DEFAULT_THRESHOLDS };
