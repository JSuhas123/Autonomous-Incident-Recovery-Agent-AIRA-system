'use strict';

const { MockReasoningProvider, SafeReasoningProvider } = require('../runtime/reasoningProvider');

describe('MockReasoningProvider', () => {
  test('returns registered mock response', async () => {
    const provider = new MockReasoningProvider({
      responses: {
        'testTask': { result: 'ok', confidence: 0.9 },
      },
    });
    const res = await provider.reason({ task: 'testTask', structuredInput: {} });
    expect(res.output.result).toBe('ok');
    expect(res.fallbackUsed).toBe(false);
  });

  test('returns minimal output for unregistered task', async () => {
    const provider = new MockReasoningProvider();
    const res = await provider.reason({
      task: 'unknownTask',
      structuredInput: {},
      outputSchema: {
        properties: { foo: { type: 'string' }, bar: { type: 'number' } },
      },
    });
    expect(res.fallbackUsed).toBe(true);
    expect(typeof res.output).toBe('object');
  });

  test('logs calls', async () => {
    const provider = new MockReasoningProvider();
    await provider.reason({ task: 'task1', structuredInput: {} });
    await provider.reason({ task: 'task2', structuredInput: {} });
    expect(provider.getCallLog()).toHaveLength(2);
  });

  test('accepts function as mock response', async () => {
    const provider = new MockReasoningProvider();
    provider.registerResponse('dynamic', (input) => ({ value: input.x * 2 }));
    const res = await provider.reason({ task: 'dynamic', structuredInput: { x: 5 } });
    expect(res.output.value).toBe(10);
  });
});

describe('SafeReasoningProvider', () => {
  test('returns manualRequired sentinel when inner throws', async () => {
    const broken = {
      reason: async () => { throw new Error('LLM down'); },
      name: 'broken', version: '1',
      _timeoutMs: 5000,
    };
    const safe = new SafeReasoningProvider(broken, null, { maxRetries: 0 });
    const res  = await safe.reason({ task: 'x', structuredInput: {} });
    expect(res.manualRequired).toBe(true);
    expect(res.output).toBeNull();
  });

  test('retries on schema validation failure and falls back', async () => {
    let calls = 0;
    const flaky = {
      reason: async () => {
        calls++;
        return { output: { missing: 'required_field' }, modelMetadata: {}, fallbackUsed: false, warnings: [] };
      },
      name: 'flaky', version: '1', _timeoutMs: 5000,
    };
    const safe = new SafeReasoningProvider(flaky, null, { maxRetries: 2 });
    const res  = await safe.reason({
      task: 'x',
      structuredInput: {},
      outputSchema: { required: ['foo'], properties: { foo: { type: 'string' } } },
    });
    // 3 attempts (0 + 2 retries), all fail schema validation
    expect(calls).toBe(3);
    expect(res.manualRequired).toBe(true);
  });

  test('returns fallback provider output when primary fails', async () => {
    const broken   = { reason: async () => { throw new Error('fail'); }, name: 'b', version: '1', _timeoutMs: 1000 };
    const fallback = new MockReasoningProvider({ responses: { 'x': { ok: true } } });
    const safe     = new SafeReasoningProvider(broken, fallback, { maxRetries: 0 });
    const res      = await safe.reason({ task: 'x', structuredInput: {} });
    expect(res.fallbackUsed).toBe(true);
    expect(res.output.ok).toBe(true);
  });
});
