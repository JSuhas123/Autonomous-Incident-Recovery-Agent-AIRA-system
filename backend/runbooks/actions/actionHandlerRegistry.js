'use strict';

/**
 * AIRA Action Handler Registry — Phase E/F
 *
 * The authoritative registry for all deterministic action handlers.
 *
 * - Unknown action = hard error. No shell fallback. No arbitrary execution.
 * - Each handler declares metadata (automationSafe, idempotent, etc.).
 * - Handlers implement validate(), execute(), and optionally capturePreState(),
 *   verify(), and rollback().
 *
 * Registry key: `${type}/${action}` (lower-snake)
 */


const HANDLER_STATUS = Object.freeze({
  IMPLEMENTED:     'IMPLEMENTED',
  MISSING_HANDLER: 'MISSING_HANDLER',
});

class ActionHandlerRegistry {
  constructor() {
    this._handlers = new Map();   // key → HandlerEntry
    this._byAction  = new Map();  // action → type  (for cross-type lookup)
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a handler.
   *
   * @param {object} entry - { type, action, metadata, validate, execute,
   *                           capturePreState?, verify?, rollback? }
   */
  register(entry) {
    if (!entry || !entry.type || !entry.action) {
      throw new TypeError('ActionHandlerRegistry.register: entry must have type and action');
    }
    if (typeof entry.execute !== 'function') {
      throw new TypeError(`Handler ${entry.type}/${entry.action} must implement execute()`);
    }
    const key = _key(entry.type, entry.action);
    if (this._handlers.has(key)) {
      throw new Error(`Handler already registered for ${key}`);
    }
    this._handlers.set(key, {
      type:     entry.type,
      action:   entry.action,
      status:   HANDLER_STATUS.IMPLEMENTED,
      metadata: Object.freeze({ ...entry.metadata }),
      validate:        entry.validate        || (() => ({ valid: true, errors: [] })),
      execute:         entry.execute,
      capturePreState: entry.capturePreState || null,
      verify:          entry.verify          || null,
      rollback:        entry.rollback        || null,
    });
    this._byAction.set(entry.action, entry.type);
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /**
   * Resolve handler metadata.  Returns null when not found.
   * Interface expected by semantic / security validators.
   */
  resolve(type, action) {
    const entry = this._handlers.get(_key(type, action));
    return entry ? entry.metadata : null;
  }

  /**
   * Resolve by action name alone (ignoring type).
   * Returns { type, ...metadata } or null.
   */
  resolveByAction(action) {
    const type = this._byAction.get(action);
    if (!type) return null;
    const meta = this.resolve(type, action);
    return meta ? { type, ...meta } : null;
  }

  /**
   * Get the full handler entry (including execute/rollback functions).
   * Throws if the handler is not registered.
   */
  getHandler(type, action) {
    const entry = this._handlers.get(_key(type, action));
    if (!entry) {
      throw new Error(
        `No handler registered for action "${type}/${action}". ` +
        'Register the handler or remove this step from the Runbook.',
      );
    }
    return entry;
  }

  /**
   * Return true iff a handler is registered.
   */
  has(type, action) {
    return this._handlers.has(_key(type, action));
  }

  /**
   * Capability report — all registered actions with status.
   */
  report() {
    const rows = [];
    for (const [key, entry] of this._handlers) {
      rows.push({
        key,
        type:   entry.type,
        action: entry.action,
        status: entry.status,
        ...entry.metadata,
      });
    }
    return rows;
  }

  /**
   * Return all registered type/action keys.
   */
  keys() {
    return [...this._handlers.keys()];
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _registry = null;

/**
 * Get (or lazily create) the singleton Action Handler Registry, pre-loaded
 * with all currently implemented handlers.
 */
function getActionHandlerRegistry() {
  if (_registry) return _registry;
  _registry = new ActionHandlerRegistry();
  _loadBuiltinHandlers(_registry);
  return _registry;
}

/** Reset singleton (for tests). */
function resetActionHandlerRegistry() {
  _registry = null;
}

// ── Loader ─────────────────────────────────────────────────────────────────

function _loadBuiltinHandlers(
  registry
) {
  const k8s =
    require(
      './handlers/kubernetesHandlers'
    );

  const wait =
    require(
      './handlers/waitHandlers'
    );

  const database =
    require(
      './handlers/databaseHandlers'
    );

  const networking =
    require(
      './handlers/networkingHandlers'
    );

  const observability =
  require(
    './handlers/observabilityHandlers'
  );  

  const messaging =
  require(
    './handlers/messagingHandlers'
  );

  const containers =
  require(
    './handlers/containerHandlers'
  );


  for (
  const handler
  of containers.handlers
) {
  registry.register(
    handler
  );
}

  for (
  const handler
  of messaging.handlers
) {
  registry.register(
    handler
  );
}

  for (
  const handler
  of observability.handlers
) {
  registry.register(
    handler
  );
}

  for (
    const handler
    of k8s.handlers
  ) {
    registry.register(
      handler
    );
  }

  for (
    const handler
    of wait.handlers
  ) {
    registry.register(
      handler
    );
  }

  for (
    const handler
    of database.handlers
  ) {
    registry.register(
      handler
    );
  }

  for (
    const handler
    of networking.handlers
  ) {
    registry.register(
      handler
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _key(type, action) {
  return `${type}/${action}`;
}

module.exports = {
  ActionHandlerRegistry,
  getActionHandlerRegistry,
  resetActionHandlerRegistry,
  HANDLER_STATUS,
};
