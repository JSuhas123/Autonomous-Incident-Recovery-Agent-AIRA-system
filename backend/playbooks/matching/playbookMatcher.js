'use strict';

/**
 * Playbook Matcher
 *
 * Deterministic, score-based playbook matching against an incident context.
 * NO LLM. NO arbitrary code. Pure function.
 *
 * Scoring weights:
 *   incidentType match:      0.30
 *   trigger match:           0.25
 *   severity match:          0.20
 *   environment match:       0.10
 *   requiredEvidence avail:  0.10
 *   provider match:          0.05
 *
 * Total: 1.00
 *
 * Hard disqualifications (score 0, eligible: false):
 *   - lifecycle !== ACTIVE
 *   - provider mismatch (when playbook specifies providers and incident has provider)
 *   - environment mismatch (when both specify environment)
 *   - required evidence missing
 */

const { PLAYBOOK_LIFECYCLE } = require('../../constants/playbook');
const { EXECUTION_OUTCOME, MANUAL_REASON } = require('../../constants/executionOutcomes');

// ── Weights ────────────────────────────────────────────────────────────────

const WEIGHTS = Object.freeze({
  INCIDENT_TYPE:        0.30,
  TRIGGER:              0.25,
  SEVERITY:             0.20,
  ENVIRONMENT:          0.10,
  REQUIRED_EVIDENCE:    0.10,
  PROVIDER:             0.05,
});

// ── Main matcher ───────────────────────────────────────────────────────────

/**
 * @param {object[]} playbooks - Array of playbook definitions (from registry)
 * @param {object}   incident  - Incident context object
 * @param {object}   [options]
 * @param {number}   [options.minScore=0.3] - Minimum score to be considered eligible
 * @param {number}   [options.maxResults=10] - Maximum results to return
 * @returns {MatchResult[]}
 */
function matchPlaybooks(playbooks, incident, options = {}) {
  const minScore   = options.minScore  ?? 0.3;
  const maxResults = options.maxResults ?? 10;

  if (!Array.isArray(playbooks) || !incident) {
    return [];
  }

  const results = playbooks.map(pb => _scorePlaybook(pb, incident, minScore));
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, maxResults);
}

// ── Scoring ────────────────────────────────────────────────────────────────

function _scorePlaybook(playbook, incident, minScore) {
  const reasons          = [];
  const disqualifications = [];
  let score              = 0;

  // ── Hard disqualification: lifecycle ──────────────────────────────────────
  if (playbook.lifecycle !== PLAYBOOK_LIFECYCLE.ACTIVE) {
    disqualifications.push(`Lifecycle is "${playbook.lifecycle}", not ACTIVE`);
    return _buildResult(playbook, 0, false, reasons, disqualifications);
  }

  // ── Incident type matching ─────────────────────────────────────────────────
  const pbTypes  = _toArray(playbook.incident?.types);
  const incTypes = _toArray(incident.type || incident.incidentType || incident.types);

  if (pbTypes.length > 0) {
    if (incTypes.length > 0) {
      const matches = incTypes.filter(t => pbTypes.includes(t));
      if (matches.length === 0) {
        // No type overlap — partial disqualification
        score += 0;
        reasons.push('No incident type match');
      } else {
        score += WEIGHTS.INCIDENT_TYPE;
        reasons.push(`Incident type match: ${matches.join(', ')}`);
      }
    } else {
      // Incident has no type info — penalize slightly
      score += WEIGHTS.INCIDENT_TYPE * 0.3;
      reasons.push('Partial incident type match (incident has no type)');
    }
  } else {
    // Playbook accepts any type
    score += WEIGHTS.INCIDENT_TYPE * 0.5;
    reasons.push('Playbook accepts any incident type');
  }

  // ── Severity matching ──────────────────────────────────────────────────────
  const pbSeverities  = _toArray(playbook.incident?.severities);
  const incSeverity   = incident.severity || incident.urgency;

  if (pbSeverities.length > 0 && incSeverity) {
    if (pbSeverities.includes(incSeverity)) {
      score += WEIGHTS.SEVERITY;
      reasons.push(`Severity match: ${incSeverity}`);
    } else {
      reasons.push(`Severity mismatch: playbook requires [${pbSeverities.join(', ')}], got ${incSeverity}`);
    }
  } else {
    score += WEIGHTS.SEVERITY * 0.5;
    reasons.push('Severity not constrained');
  }

  // ── Environment matching ──────────────────────────────────────────────────
  const pbEnvs  = _toArray(playbook.incident?.environments);
  const incEnv  = incident.environment || incident.env;

  if (pbEnvs.length > 0) {
    if (!incEnv) {
      // Environment required by playbook but not in incident
      score += WEIGHTS.ENVIRONMENT * 0.5;
      reasons.push('Environment not specified in incident');
    } else if (pbEnvs.includes(incEnv)) {
      score += WEIGHTS.ENVIRONMENT;
      reasons.push(`Environment match: ${incEnv}`);
    } else {
      // Hard disqualification: wrong environment
      disqualifications.push(`Environment mismatch: playbook requires [${pbEnvs.join(', ')}], got "${incEnv}"`);
      return _buildResult(playbook, 0, false, reasons, disqualifications);
    }
  } else {
    score += WEIGHTS.ENVIRONMENT * 0.5;
    reasons.push('Playbook accepts any environment');
  }

  // ── Provider matching ──────────────────────────────────────────────────────
  const pbProviders  = _toArray(playbook.incident?.providers);
  const incProvider  = incident.provider || incident.cloudProvider;

  if (pbProviders.length > 0) {
    if (!incProvider) {
      score += WEIGHTS.PROVIDER * 0.5;
      reasons.push('Provider not specified in incident');
    } else if (pbProviders.includes(incProvider)) {
      score += WEIGHTS.PROVIDER;
      reasons.push(`Provider match: ${incProvider}`);
    } else {
      // Hard disqualification
      disqualifications.push(`Provider mismatch: playbook requires [${pbProviders.join(', ')}], got "${incProvider}"`);
      return _buildResult(playbook, 0, false, reasons, disqualifications);
    }
  } else {
    score += WEIGHTS.PROVIDER * 0.5;
    reasons.push('Playbook accepts any provider');
  }

  // ── Required evidence ──────────────────────────────────────────────────────
  const requiredEvidence = _toArray(playbook.requiredEvidence);

  if (requiredEvidence.length > 0) {
    const available = _getAvailableEvidenceKeys(incident);
    const missing   = requiredEvidence.filter(e => !_evidenceAvailable(e, available, incident));

    if (missing.length > 0) {
      // Hard disqualification
      disqualifications.push(`Missing required evidence: ${missing.join(', ')}`);
      return _buildResult(playbook, 0, false, reasons, disqualifications);
    }
    score += WEIGHTS.REQUIRED_EVIDENCE;
    reasons.push(`All required evidence present: ${requiredEvidence.join(', ')}`);
  } else {
    score += WEIGHTS.REQUIRED_EVIDENCE * 0.5;
    reasons.push('No required evidence specified');
  }

  // ── Trigger matching ──────────────────────────────────────────────────────
  const triggerScore = _evaluateTriggers(playbook.triggers, incident);
  score += triggerScore * WEIGHTS.TRIGGER;
  if (triggerScore > 0) {
    reasons.push(`Trigger conditions matched (score: ${triggerScore.toFixed(2)})`);
  } else {
    reasons.push('No trigger conditions matched or not specified');
    score += WEIGHTS.TRIGGER * 0.3; // baseline
  }

  // Round to 4 decimal places
  score = Math.round(score * 10000) / 10000;
  const eligible = score >= minScore;

  return _buildResult(playbook, score, eligible, reasons, disqualifications);
}

// ── Trigger evaluation ────────────────────────────────────────────────────

function _evaluateTriggers(triggers, incident) {
  if (!triggers || typeof triggers !== 'object') return 0.5;

  const incidentData = JSON.stringify(incident).toLowerCase();
  let matched = 0;
  let total   = 0;

  // ALL conditions must match
  const allConds = _toArray(triggers.all);
  for (const cond of allConds) {
    total++;
    if (_conditionMatches(cond, incident, incidentData)) matched++;
    else return 0; // ALL failed
  }

  // ANY condition: at least one must match
  const anyConds = _toArray(triggers.any);
  if (anyConds.length > 0) {
    total++;
    const anyMatch = anyConds.some(c => _conditionMatches(c, incident, incidentData));
    if (anyMatch) matched++;
  }

  // NONE conditions: none must match
  const noneConds = _toArray(triggers.none);
  for (const cond of noneConds) {
    total++;
    if (!_conditionMatches(cond, incident, incidentData)) matched++;
  }

  if (total === 0) return 0.5; // no triggers defined → neutral
  return matched / total;
}

function _conditionMatches(cond, incident, incidentData) {
  if (typeof cond === 'string') {
    return incidentData.includes(cond.toLowerCase());
  }
  if (typeof cond === 'object' && cond !== null) {
    const { field, operator, value } = cond;
    if (field && value != null) {
      const fieldVal = _getNestedValue(incident, field);
      switch (operator) {
        case 'equals':   return fieldVal == value;
        case 'contains': return String(fieldVal || '').toLowerCase().includes(String(value).toLowerCase());
        case 'gt':       return Number(fieldVal) > Number(value);
        case 'lt':       return Number(fieldVal) < Number(value);
        case 'gte':      return Number(fieldVal) >= Number(value);
        case 'lte':      return Number(fieldVal) <= Number(value);
        default:         return fieldVal == value;
      }
    }
  }
  return false;
}

// ── Evidence helpers ──────────────────────────────────────────────────────

function _getAvailableEvidenceKeys(incident) {
  // Flatten top-level keys + incident.evidence keys
  const keys = new Set(Object.keys(incident));
  if (incident.evidence && typeof incident.evidence === 'object') {
    Object.keys(incident.evidence).forEach(k => keys.add(k));
    Object.keys(incident.evidence).forEach(k => keys.add(`evidence.${k}`));
  }
  if (incident.resource && typeof incident.resource === 'object') {
    Object.keys(incident.resource).forEach(k => keys.add(`resource.${k}`));
  }
  return keys;
}

function _evidenceAvailable(evidenceKey, availableKeys, incident) {
  if (availableKeys.has(evidenceKey)) return true;
  // Support dot-notation paths
  const val = _getNestedValue(incident, evidenceKey);
  return val != null && val !== '';
}

// ── Utility ───────────────────────────────────────────────────────────────

function _toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val];
}

function _getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

function _buildResult(playbook, score, eligible, reasons, disqualifications) {
  return {
    playbookId:       playbook.playbookId,
    version:          playbook.semver,
    name:             playbook.name,
    score,
    eligible,
    reasons,
    disqualifications,
    lifecycle:        playbook.lifecycle,
    riskLevel:        playbook.risk?.level,
    approvalMode:     playbook.approval?.mode,
  };
}

module.exports = { matchPlaybooks, resolveMatchOutcome, WEIGHTS };

// ── No-safe-playbook path ─────────────────────────────────────────────────

/**
 * Evaluates match results and determines the overall execution outcome.
 *
 * Returns one of three outcomes (EXECUTION_OUTCOME enum):
 *   AUTO_RESOLVED        — at least one eligible ACTIVE playbook was matched
 *   WAITING_FOR_APPROVAL — a match was found but requires approval gate
 *   MANUAL_REQUIRED      — no safe playbook was found
 *
 * @param {MatchResult[]} matchResults - Output of matchPlaybooks()
 * @param {object}        incident     - Incident context
 * @returns {MatchOutcome}
 */
function resolveMatchOutcome(matchResults, incident) {
  const eligible   = matchResults.filter(r => r.eligible);
  const candidates = matchResults.filter(r => !r.eligible);

  if (eligible.length === 0) {
    // Determine the best reason code
    const hasInactive = candidates.some(
      r => r.disqualifications.some(d => d.includes('Lifecycle'))
    );
    const hasMissingEvidence = candidates.some(
      r => r.disqualifications.some(d => d.includes('evidence'))
    );
    const hasEnvMismatch = candidates.some(
      r => r.disqualifications.some(d => d.includes('Environment'))
    );

    let reason = MANUAL_REASON.NO_SAFE_PLAYBOOK;
    if (candidates.length > 0 && hasInactive) {
      reason = MANUAL_REASON.NO_ACTIVE_PLAYBOOK;
    } else if (hasMissingEvidence) {
      reason = MANUAL_REASON.MISSING_EVIDENCE;
    }

    // Collect all unique disqualification reasons across candidates
    const allDisqualifications = [
      ...new Set(candidates.flatMap(r => r.disqualifications)),
    ];

    // Collect missing evidence fields across candidates
    const missingEvidence = [
      ...new Set(
        candidates
          .flatMap(r => r.disqualifications)
          .filter(d => d.includes('evidence'))
          .flatMap(d => {
            const m = d.match(/Missing required evidence: (.+)/);
            return m ? m[1].split(', ') : [];
          })
      ),
    ];

    return {
      outcome:                 EXECUTION_OUTCOME.MANUAL_REQUIRED,
      reason,
      eligibleCount:           0,
      candidateCount:          candidates.length,
      candidates:              candidates,
      disqualifications:       allDisqualifications,
      missingEvidence,
      escalationRecommendation: _buildEscalationRecommendation(candidates, incident),
    };
  }

  // At least one eligible playbook — check if any require approval
  const requiresApproval = eligible.some(
    r => r.approvalMode === 'MANUAL' || r.approvalMode === 'CONDITIONAL'
  );

  if (requiresApproval) {
    return {
      outcome:        EXECUTION_OUTCOME.WAITING_FOR_APPROVAL,
      reason:         MANUAL_REASON.APPROVAL_REQUIRED,
      eligibleCount:  eligible.length,
      candidateCount: candidates.length,
      best:           eligible[0],
      eligible,
    };
  }

  return {
    outcome:        EXECUTION_OUTCOME.AUTO_RESOLVED,
    eligibleCount:  eligible.length,
    candidateCount: candidates.length,
    best:           eligible[0],
    eligible,
  };
}

function _buildEscalationRecommendation(candidates, incident) {
  if (candidates.length === 0) {
    return `No playbook catalogue entry matches incident type "${incident.type || incident.incidentType || 'unknown'}". Create a new playbook or escalate to on-call.`;
  }
  const topCandidate = candidates[0];
  return (
    `Closest match "${topCandidate.name || topCandidate.playbookId}" ` +
    `(lifecycle: ${topCandidate.lifecycle}) was disqualified: ` +
    topCandidate.disqualifications.join('; ') +
    '. Resolve disqualifications to enable automated recovery.'
  );
}
