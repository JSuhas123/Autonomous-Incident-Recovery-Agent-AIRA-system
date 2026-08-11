'use strict';

/**
 * Playbook Routes
 *
 * All routes enforce:
 *   - Tenant isolation: every operation scoped to tenantId from req.params
 *   - RBAC via existing authMiddleware (browserTenantAuth)
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

function reg() { return getPlaybookRegistry(); }
function svc() { return getPlaybookExecutionService(); }

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
  return res.status(500).json({ error: 'Internal server error', details: err.message });
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
    const playbooks = await reg().list({ tenantId, lifecycle, category });
    res.json({ playbooks, count: playbooks.length });
  } catch (err) {
    handleRegistryError(err, res);
  }
});

// ── GET /:playbookId — get all versions ────────────────────────────────────

router.get('/:playbookId', async (req, res) => {
  try {
    const { playbookId } = req.params;
    const tenantId = req.params.tenantId;
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
    const { incident, minScore, maxResults } = req.body;

    if (!incident) return res.status(400).json({ error: 'incident context is required' });

    // Get ACTIVE playbooks
    const playbooks = await reg().list({ tenantId, lifecycle: PLAYBOOK_LIFECYCLE.ACTIVE });

    const matches = matchPlaybooks(playbooks, incident, { minScore, maxResults });
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
    const { incidentContext, incidentId, correlationId, dryRun } = req.body;

    const result = await svc().execute(id, v, incidentContext || {}, {
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
