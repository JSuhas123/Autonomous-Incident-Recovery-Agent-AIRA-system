"use strict";

const {
  RunbookExecution,
} = require(
  "../persistence/operational/legacyModels"
);
/**
 * Runbook Routes â€” Phase M
 *
 * All routes enforce:
 *   - Tenant isolation: every write scoped to tenantId from req.params
 *   - RBAC via existing authMiddleware (jwtAuthMiddleware + orgAuthMiddleware)
 *
 * Mounted at: /api/tenants/:tenantId/runbooks
 */

const express      = require('express');
const router       = express.Router({ mergeParams: true });

const { getRunbookRegistry, RegistryError } = require('../runbooks/registry/runbookRegistry');
const { getRunbookExecutionEngine }          = require('../runbooks/execution/runbookExecutionEngine');
const { getActionHandlerRegistry }           = require('../runbooks/actions/actionHandlerRegistry');
const { VALIDATION_PURPOSE }                 = require('../runbooks/validators/runbookValidator');
function registry() { return getRunbookRegistry(); }
function engine()   { return getRunbookExecutionEngine(); }

function handleRegistryError(err, res) {
  if (err instanceof RegistryError) {
    const httpStatus = {
      NOT_FOUND:                    404,
      DUPLICATE_VERSION:            409,
      IMPORT_VALIDATION_FAILED:     422,
      ACTIVATION_VALIDATION_FAILED: 422,
      VALIDATION_FAILED:            422,
      INVALID_TRANSITION:           409,
      TRANSITION_CONFLICT:          409,
      POLICY_DENIED:                403,
      NOT_EXECUTABLE:               409,
      TENANT_REQUIRED:              400,
      INVALID_VERSION:              400,
    }[err.code] || 400;
    return res.status(httpStatus).json({
      error:       err.message,
      code:        err.code,
      diagnostics: err.detail?.diagnostics,
    });
  }
  throw err;
}

/**
 * GET /api/tenants/:tenantId/runbooks
 * List all runbooks for a tenant
 * Query params: incidentType, enabled
 */
// â”€â”€ Capabilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/capabilities', (req, res) => {
  const report = getActionHandlerRegistry().report();
  res.json({ capabilities: report, count: report.length });
});

// â”€â”€ List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { lifecycle, ownerType } = req.query;
    const runbooks = await registry().list({ lifecycle, ownerType }, tenantId);
    res.json({ tenantId, count: runbooks.length, runbooks });
  } catch (err) { next(err); }
});

// â”€â”€ Get by ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/executions/:executionId', async (req, res, next) => {
  try {
    const { tenantId, executionId } = req.params;
    const execution = await RunbookExecution.findOne({ executionId, tenantId }).lean();
    if (!execution) return res.status(404).json({ error: 'Execution not found', executionId });
    res.json({ execution });
  } catch (err) { next(err); }
});

router.get('/:runbookId/executions', async (req, res, next) => {
  try {
    const { tenantId, runbookId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const filter = { tenantId, runbookId };
    if (req.query.status) filter.status = req.query.status;
    const executions = await RunbookExecution.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ tenantId, runbookId, count: executions.length, executions });
  } catch (err) { next(err); }
});

router.get('/:runbookId/:semver', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    try {
      const runbook = await registry().getVersion(runbookId, semver, tenantId);
      res.json({ runbook });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

router.get('/:runbookId', async (req, res, next) => {
  try {
    const { tenantId, runbookId } = req.params;
    try {
      const versions = await registry().getById(runbookId, tenantId);
      res.json({ runbookId, versions });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

// â”€â”€ Import / Register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/import', async (req, res, next) => {
  try {
    const { tenantId }   = req.params;
    const { definition } = req.body;
    if (!definition) return res.status(400).json({ error: 'definition is required' });
    try {
      const { runbook, validation } = await registry().importDefinition(definition, {
        tenantId, initiatedBy: req.user?.sub || 'api',
      });
      res.status(201).json({ success: true, runbook, validation: { diagnostics: validation.diagnostics } });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

router.post('/register', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    try {
      const runbook = await registry().register(req.body, {
        tenantId, initiatedBy: req.user?.sub || 'api',
      });
      res.status(201).json({ success: true, runbook });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

// â”€â”€ Lifecycle transitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/:runbookId/:semver/validate', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    const purpose = req.query.purpose || VALIDATION_PURPOSE.AUTHORING;
    try {
      const result = await registry().validate(runbookId, semver, tenantId, purpose);
      res.json({ valid: result.valid, diagnostics: result.diagnostics });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

router.post('/:runbookId/:semver/approve', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    try {
      const runbook = await registry().approve(runbookId, semver, tenantId, { initiatedBy: req.user?.sub || 'api' });
      res.json({ success: true, runbook });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

router.post('/:runbookId/:semver/activate', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    try {
      const runbook = await registry().activate(runbookId, semver, tenantId, { initiatedBy: req.user?.sub || 'api' });
      res.json({ success: true, runbook });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

router.post('/:runbookId/:semver/disable', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    try {
      const runbook = await registry().disable(runbookId, semver, tenantId, { initiatedBy: req.user?.sub || 'api' });
      res.json({ success: true, runbook });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

router.post('/:runbookId/:semver/deprecate', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    try {
      const runbook = await registry().deprecate(runbookId, semver, tenantId, { initiatedBy: req.user?.sub || 'api' });
      res.json({ success: true, runbook });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

router.post('/:runbookId/:semver/version', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    const { newSemver, changes }          = req.body;
    if (!newSemver) return res.status(400).json({ error: 'newSemver is required' });
    try {
      const runbook = await registry().createVersion(
        runbookId, semver, newSemver, changes || {}, tenantId,
        { initiatedBy: req.user?.sub || 'api' },
      );
      res.status(201).json({ success: true, runbook });
    } catch (err) { return handleRegistryError(err, res); }
  } catch (err) { next(err); }
});

// â”€â”€ Execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/:runbookId/:semver/execute', async (req, res, next) => {
  try {
    const { tenantId, runbookId, semver } = req.params;
    const input = req.body || {};
    let runbookDef;
    try {
      runbookDef = await registry().getExecutionDefinition(runbookId, semver, tenantId);
    } catch (err) { return handleRegistryError(err, res); }

    const execution = await engine().execute(runbookDef, {
      ...input,
      tenantId,
      initiatedBy:   req.user?.sub || input.initiatedBy || 'api',
      initiatorType: req.user ? 'user' : 'api',
    });

    const httpStatus = execution.status === 'WAITING_FOR_APPROVAL' ? 202 : 200;
    res.status(httpStatus).json({ success: true, execution });
  } catch (err) { next(err); }
});

module.exports = router;

