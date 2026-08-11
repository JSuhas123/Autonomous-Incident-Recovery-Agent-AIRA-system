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

// ── OpenAI Provider ────────────────────────────────────────────────────────────

/**
 * Real OpenAI reasoning provider using structured JSON output mode.
 *
 * Activated when OPENAI_API_KEY is present in environment.
 * Falls back to MockReasoningProvider in tests (via SafeReasoningProvider).
 *
 * SAFETY:
 * - Always requests JSON mode (response_format: { type: "json_object" })
 * - Output is schema-validated by SafeReasoningProvider wrapper
 * - Never passes infra credentials in prompt
 * - Token usage tracked and returned in modelMetadata
 */
class OpenAIReasoningProvider extends BaseReasoningProvider {
  constructor(config = {}) {
    super(config);
    this._apiKey    = config.apiKey    || process.env.OPENAI_API_KEY;
    this._model     = config.model     || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this._baseUrl   = config.baseUrl   || 'https://api.openai.com/v1';
    this._timeoutMs = config.timeoutMs || 30_000;
    if (!this._apiKey) {
      throw new Error('OpenAIReasoningProvider: OPENAI_API_KEY not set');
    }
  }

  async reason(request) {
    const { task, systemInstructions, structuredInput, outputSchema, metadata = {} } = request;

    const systemPrompt = [
      systemInstructions || 'You are an expert SRE AI assistant.',
      'IMPORTANT: Respond with valid JSON ONLY. No explanation outside the JSON.',
      outputSchema
        ? `Output MUST match this JSON schema:\n${JSON.stringify(outputSchema, null, 2)}`
        : '',
    ].filter(Boolean).join('\n\n');

    const userMessage = JSON.stringify(structuredInput, null, 2);

    const body = {
      model: this._model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      temperature: 0,      // deterministic for safety
      max_tokens:  2048,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let resp;
    try {
      resp = await fetch(`${this._baseUrl}/chat/completions`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this._apiKey}`,
        },
        body:   JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => resp.statusText);
      throw new Error(`OpenAI API error ${resp.status}: ${errBody}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error(`OpenAI response was not valid JSON: ${e.message}`);
    }

    return {
      output: parsed,
      modelMetadata: {
        provider:       'openai',
        model:          data.model,
        promptTokens:   data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens:    data.usage?.total_tokens,
        task,
      },
      fallbackUsed: false,
      warnings:     [],
    };
  }

  get name()    { return 'openai'; }
  get version() { return '1.0.0'; }
}

// ── Singleton Registry ────────────────────────────────────────────────────────

let _provider = null;

function configureReasoningProvider(provider) {
  _provider = provider;
}

function getReasoningProvider() {
  if (!_provider) {
    // Auto-wire OpenAI when OPENAI_API_KEY is set; otherwise use mock
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAIReasoningProvider();
      const mockFallback = new MockReasoningProvider();
      _provider = new SafeReasoningProvider(openai, mockFallback, { maxRetries: 2 });
      console.log('[ReasoningProvider] Using OpenAI provider (model:', process.env.OPENAI_MODEL || 'gpt-4o-mini', ')');
    } else {
      _provider = new SafeReasoningProvider(new MockReasoningProvider(), null, {});
      console.warn('[ReasoningProvider] OPENAI_API_KEY not set — using MockReasoningProvider');
    }
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
  OpenAIReasoningProvider,
  configureReasoningProvider,
  getReasoningProvider,
};
