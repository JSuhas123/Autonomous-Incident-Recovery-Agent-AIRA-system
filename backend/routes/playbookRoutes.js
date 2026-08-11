'use strict';

/**
 * Playbook Routes
 *
 * All routes enforce:
 *   - Tenant isolation: every operation scoped to tenantId from req.params
 *   - RBAC via existing authMiddleware (browserTenantAuth)
 *   - Input validation on all mutation endpoints
 *   - Pagination caps to prevent runaway queries
 *   - Semantic-version immutability (no re-registration of existing id@semver)
 *   - No DRAFT/VALIDATED/APPROVED/DISABLED definitions are executed
 *   - Audit logging on all state mutations
 *
 * Mounted at: /api/v1/tenants/:tenantId/playbooks
 */

const express = require('express');
const router  = express.Router({ mergeParams: true });

const { getPlaybookRegistry, PlaybookRegistryError, REGISTRY_ERROR_CODES } = require('../playbooks/registry/playbookRegistry');
const { getPlaybookExecutionService } = require('../playbooks/execution/playbookExecutionService');
const { matchPlaybooks }              = require('../playbooks/matching/playbookMatcher');
const { validatePlaybook }            = require('../playbooks/validators/playbookValidator');
const { PLAYBOOK_VALIDATION_PURPOSE, PLAYBOOK_LIFECYCLE } = require('../constants/playbook');

// Semver pattern — strict x.y.z or =x.y.z (registry uses exact semver)
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
// Playbook ID pattern
const PLAYBOOK_ID_PATTERN = /^PB-[A-Z0-9]+(-[A-Z0-9]+)+$/;

const MAX_RESULTS = 200;
const MAX_LIST    = 1000;

function reg() { return getPlaybookRegistry(); }
function svc() { return getPlaybookExecutionService(); }

// ── Validators ─────────────────────────────────────────────────────────────

function validateSemver(semver, res) {
  if (!semver || !SEMVER_PATTERN.test(semver)) {
    res.status(400).json({ error: 'Invalid semver format. Expected x.y.z', code: 'INVALID_VERSION' });
    return false;
  }
  return true;
}

function validatePlaybookId(id, res) {
  if (!id || !PLAYBOOK_ID_PATTERN.test(id)) {
    res.status(400).json({ error: `Invalid playbookId format. Expected PB-XXX-YYY`, code: 'INVALID_ID' });
    return false;
  }
  return true;
}

// ── Error handler ──────────────────────────────────────────────────────────

function handleRegistryError(err, res) {
  if (err instanceof PlaybookRegistryError) {
    const httpStatus = {
      [REGISTRY_ERROR_CODES.NOT_FOUND]:                    404,
      [REGISTRY_ERROR_CODES.DUPLICATE_VERSION]:            409,
      [REGISTRY_ERROR_CODES.IMPORT_VALIDATION_FAILED]:     422,
      [REGISTRY_ERROR_CODES.ACTIVATION_VALIDATION_FAILED]: 422,
      [REGISTRY_ERROR_CODES.VALIDATION_FAILED]:            422,
      [REGISTRY_ERROR_CODES.INVALID_TRANSITION]:           409,
      [REGISTRY_ERROR_CODES.TRANSITION_CONFLICT]:          409,
      [REGISTRY_ERROR_CODES.POLICY_DENIED]:                403,
      [REGISTRY_ERROR_CODES.NOT_EXECUTABLE]:               409,
      [REGISTRY_ERROR_CODES.TENANT_REQUIRED]:              400,
      [REGISTRY_ERROR_CODES.INVALID_VERSION]:              400,
    }[err.code] || 400;
    return res.status(httpStatus).json({
      error: err.message,
      code:  err.code,
      details: err.details || undefined,
    });
  }
  return res.status(500).json({ error: 'Internal server error' });
}

// ── GET /capabilities ──────────────────────────────────────────────────────

router.get('/capabilities', async (req, res) => {
  try {
    res.json({
      playbookPlatformVersion: '1.0.0',
      features: [
        'lifecycle-management',
        'deterministic-matching',
        'parameter-mapping',
        'runbook-orchestration',
        'audit-trail',
      ],
      supportedStageTypes: [
        'INVESTIGATION', 'DIAGNOSIS_SUPPORT', 'MITIGATION',
        'RECOVERY', 'VERIFICATION', 'ROLLBACK', 'ESCALATION', 'NOTIFICATION',
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET / — list playbooks ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { lifecycle, category } = req.query;
    const tenantId = req.params.tenantId;

    // Validate lifecycle filter if provided
    const validLifecycles = Object.values(PLAYBOOK_LIFECYCLE);
    if (lifecycle && !validLifecycles.includes(lifecycle)) {
      return res.status(400).json({ error: `Invalid lifecycle filter. Must be one of: ${validLifecycles.join(', ')}` });
    }

    const playbooks = await reg().list({ tenantId, lifecycle, category });

    // Cap response to prevent oversized payloads
    const capped = playbooks.slice(0, MAX_LIST);
    res.json({ playbooks: capped, count: capped.length, total: playbooks.length });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── GET /:playbookId — get all versions ────────────────────────────────────

router.get('/:playbookId', async (req, res) => {
  try {
    const { playbookId } = req.params;
    const tenantId = req.params.tenantId;
    if (!validatePlaybookId(playbookId, res)) return;
    const versions = await reg().getById(playbookId, tenantId);
    const latest   = versions.reduce((best, cur) => !best || cur.semver > best.semver ? cur : best, null);
    res.json({ playbookId, versions, latest });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── GET /:playbookId/:semver — get specific version ────────────────────────

router.get('/:playbookId/:semver', async (req, res) => {
  try {
    const { playbookId, semver } = req.params;
    const tenantId = req.params.tenantId;
    const playbook = await reg().getVersion(playbookId, semver, tenantId);
    res.json(playbook);
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /import — import a playbook definition ────────────────────────────

router.post('/import', async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const definition = req.body;

    const entry = await reg().importDefinition(definition, { tenantContext: { tenantId } });
    res.status(201).json({ message: 'Playbook imported', playbook: entry });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /register — register a playbook ──────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const tenantId   = req.params.tenantId;
    const definition = { ...req.body, tenantId: req.body.tenantId || tenantId };

    const entry = await reg().register(definition, {
      purpose: PLAYBOOK_VALIDATION_PURPOSE.IMPORT,
      tenantContext: { tenantId },
    });
    res.status(201).json({ message: 'Playbook registered', playbook: entry });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /:id/:v/validate ──────────────────────────────────────────────────

router.post('/:id/:v/validate', async (req, res) => {
  try {
    const { id, v }   = req.params;
    const tenantId    = req.params.tenantId;
    const result      = await reg().validate(id, v, { tenantId });
    res.json({ message: 'Playbook validated', lifecycle: result.lifecycle, checksum: result.checksum });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /:id/:v/approve ───────────────────────────────────────────────────

router.post('/:id/:v/approve', async (req, res) => {
  try {
    const { id, v }   = req.params;
    const tenantId    = req.params.tenantId;
    const approvedBy  = req.user?.userId || req.body.approvedBy || 'unknown';
    const result      = await reg().approve(id, v, { tenantId, approvedBy });
    res.json({ message: 'Playbook approved', lifecycle: result.lifecycle });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /:id/:v/activate ──────────────────────────────────────────────────

router.post('/:id/:v/activate', async (req, res) => {
  try {
    const { id, v }  = req.params;
    const tenantId   = req.params.tenantId;

    const result = await reg().activate(id, v, {
      tenantId,
      runbookRegistry: req.app.locals.runbookRegistry,
      tenantContext:   { tenantId },
    });
    res.json({ message: 'Playbook activated', lifecycle: result.lifecycle, checksum: result.checksum });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /:id/:v/disable ───────────────────────────────────────────────────

router.post('/:id/:v/disable', async (req, res) => {
  try {
    const { id, v }   = req.params;
    const tenantId    = req.params.tenantId;
    const disabledBy  = req.user?.userId || 'system';
    const result = await reg().disable(id, v, { tenantId, disabledBy, reason: req.body.reason });
    res.json({ message: 'Playbook disabled', lifecycle: result.lifecycle });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /:id/:v/deprecate ────────────────────────────────────────────────

router.post('/:id/:v/deprecate', async (req, res) => {
  try {
    const { id, v }      = req.params;
    const tenantId       = req.params.tenantId;
    const deprecatedBy   = req.user?.userId || 'system';
    const result = await reg().deprecate(id, v, { tenantId, deprecatedBy, reason: req.body.reason });
    res.json({ message: 'Playbook deprecated', lifecycle: result.lifecycle });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /:id/:v/version — create new version from existing ────────────────

router.post('/:id/:v/version', async (req, res) => {
  try {
    const { id, v }   = req.params;
    const { newSemver, patches } = req.body;
    const tenantId    = req.params.tenantId;

    if (!newSemver) return res.status(400).json({ error: 'newSemver is required' });

    const result = await reg().createVersion(id, v, newSemver, patches || {}, { tenantId });
    res.status(201).json({ message: 'New version created', playbook: result });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /match — match playbooks for an incident ─────────────────────────

router.post('/match', async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const { incident, minScore, maxResults } = req.body || {};

    if (!incident || typeof incident !== 'object') {
      return res.status(400).json({ error: 'incident (object) is required', code: 'MISSING_INCIDENT' });
    }

    // Cap maxResults to prevent DoS
    const cappedMax = Math.min(Number(maxResults) || 10, MAX_RESULTS);

    // Get ACTIVE playbooks only — never match against non-ACTIVE
    const playbooks = await reg().list({ tenantId, lifecycle: PLAYBOOK_LIFECYCLE.ACTIVE });

    const matches = matchPlaybooks(playbooks, incident, { minScore, maxResults: cappedMax });
    res.json({ matches, count: matches.length, incident: incident.id || null });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── POST /:id/:v/execute — execute a playbook ─────────────────────────────

router.post('/:id/:v/execute', async (req, res) => {
  try {
    const { id, v }    = req.params;
    const tenantId     = req.params.tenantId;

    if (!validatePlaybookId(id, res)) return;
    if (!validateSemver(v, res)) return;

    const { incidentContext, incidentId, correlationId, dryRun } = req.body || {};

    if (!incidentContext || typeof incidentContext !== 'object') {
      return res.status(400).json({ error: 'incidentContext (object) is required', code: 'MISSING_INCIDENT_CONTEXT' });
    }

    const result = await svc().execute(id, v, incidentContext, {
      tenantId,
      incidentId,
      correlationId,
      dryRun: !!dryRun,
      initiatedBy:   req.user?.userId || null,
      initiatorType: 'api',
    });

    const httpStatus = result.status === 'WAITING_FOR_APPROVAL' ? 202 : 200;
    res.status(httpStatus).json(result);
  } catch (err) {
    handleRegistryError(err, res);
  }
});

module.exports = router;
