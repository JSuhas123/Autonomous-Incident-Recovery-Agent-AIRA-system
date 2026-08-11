'use strict';

/**
 * Reasoning Provider Abstraction
 *
 * Decouples agents from any specific LLM/AI SDK.
 *
 * SAFETY INVARIANTS:
 * - Structured JSON output ONLY — free text never reaches action handlers
 * - Model responses are schema-validated before use
 * - On parse/schema failure: bounded retry, then MANUAL_REQUIRED
 * - Never inject infrastructure credentials into model calls
 * - Never feed model output directly to ActionHandlerRegistry
 */

const { AGENT_MANUAL_REASON } = require('../contracts/agentContracts');

// ── Base Provider ─────────────────────────────────────────────────────────────

class BaseReasoningProvider {
  constructor(config = {}) {
    this._config = config;
    this._maxRetries = config.maxRetries || 2;
    this._timeoutMs  = config.timeoutMs  || 30_000;
  }

  /**
   * Core reasoning call.
   *
   * @param {object} request
   * @param {string} request.task             - Human-readable task label for logging
   * @param {string} request.systemInstructions
   * @param {object} request.structuredInput  - JSON-serialisable input
   * @param {object} request.outputSchema     - JSON Schema for expected output
   * @param {number} [request.timeout]        - Override timeout
   * @param {object} [request.metadata]       - Logging/cost metadata
   * @returns {Promise<{output, modelMetadata, fallbackUsed, warnings}>}
   */
  async reason(request) {
    throw new Error('BaseReasoningProvider.reason() must be implemented');
  }

  get name()    { return 'base'; }
  get version() { return '0.0.0'; }
}

// ── Mock Provider (for tests + fallback) ─────────────────────────────────────

class MockReasoningProvider extends BaseReasoningProvider {
  constructor(config = {}) {
    super(config);
    // Pre-registered mock responses keyed by task name
    this._responses = new Map(Object.entries(config.responses || {}));
    this._callLog   = [];
  }

  async reason(request) {
    const { task, structuredInput, outputSchema, metadata = {} } = request;

    this._callLog.push({ task, structuredInput, calledAt: new Date().toISOString() });

    const mockResponse = this._responses.get(task);
    if (!mockResponse) {
      // Return minimal deterministic response
      return {
        output: _minimalOutput(outputSchema),
        modelMetadata: { provider: 'mock', model: 'mock-v1', tokenEstimate: 0 },
        fallbackUsed: true,
        warnings: [`No mock registered for task "${task}" — using minimal output`],
      };
    }

    const output = typeof mockResponse === 'function'
      ? mockResponse(structuredInput)
      : mockResponse;

    return {
      output,
      modelMetadata: { provider: 'mock', model: 'mock-v1', tokenEstimate: 0 },
      fallbackUsed: false,
      warnings: [],
    };
  }

  registerResponse(task, response) {
    this._responses.set(task, response);
  }

  getCallLog() { return [...this._callLog]; }

  get name()    { return 'mock'; }
  get version() { return '1.0.0'; }
}

// ── Safe Provider Wrapper ─────────────────────────────────────────────────────

/**
 * Wraps any provider with:
 *  - timeout enforcement
 *  - bounded retry on parse failure
 *  - schema validation
 *  - fallback to deterministic result
 */
class SafeReasoningProvider {
  constructor(inner, fallbackProvider = null, config = {}) {
    this._inner    = inner;
    this._fallback = fallbackProvider;
    this._maxRetries = config.maxRetries || 2;
  }

  async reason(request) {
    let lastError;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        const timeoutMs = request.timeout || this._inner._timeoutMs || 30_000;
        const result = await _withTimeout(
          this._inner.reason(request),
          timeoutMs,
          `Reasoning timeout for task "${request.task}"`,
        );

        // Validate output matches expected schema shape
        if (request.outputSchema) {
          const validationError = _validateAgainstSchema(result.output, request.outputSchema);
          if (validationError) {
            lastError = new Error(`Schema validation failed: ${validationError}`);
            continue; // retry
          }
        }

        return result;
      } catch (err) {
        lastError = err;
        if (attempt < this._maxRetries) {
          await _sleep(200 * (attempt + 1)); // back-off
        }
      }
    }

    // All retries exhausted — try fallback
    if (this._fallback) {
      try {
        const fallbackResult = await this._fallback.reason(request);
        return { ...fallbackResult, fallbackUsed: true,
          warnings: [...(fallbackResult.warnings || []), `Primary provider failed: ${lastError?.message}`] };
      } catch (_) { /* swallow */ }
    }

    // Return MANUAL_REQUIRED sentinel
    return {
      output: null,
      modelMetadata: { provider: 'none', error: lastError?.message },
      fallbackUsed: true,
      manualRequired: true,
      manualReason: AGENT_MANUAL_REASON.REASONING_FAILED,
      warnings: [`All reasoning attempts failed: ${lastError?.message}`],
    };
  }

  get name()    { return `safe(${this._inner.name})`; }
  get version() { return this._inner.version; }
}

// ── Singleton Registry ────────────────────────────────────────────────────────

let _provider = null;

function configureReasoningProvider(provider) {
  _provider = provider;
}

function getReasoningProvider() {
  if (!_provider) {
    // Default to mock for safety — production must explicitly configure
    _provider = new SafeReasoningProvider(new MockReasoningProvider(), null, {});
  }
  return _provider;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _validateAgainstSchema(output, schema) {
  if (!output || typeof output !== 'object') return 'Output is not an object';
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in output)) return `Missing required field: ${field}`;
    }
  }
  return null; // valid
}

function _minimalOutput(schema) {
  if (!schema || !schema.properties) return {};
  const out = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    if (def.type === 'array')   out[key] = [];
    else if (def.type === 'string')  out[key] = '';
    else if (def.type === 'number')  out[key] = 0;
    else if (def.type === 'boolean') out[key] = false;
    else out[key] = null;
  }
  return out;
}

module.exports = {
  BaseReasoningProvider,
  MockReasoningProvider,
  SafeReasoningProvider,
  configureReasoningProvider,
  getReasoningProvider,
};
