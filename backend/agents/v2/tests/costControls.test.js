'use strict';

const { getAgentBudgets, resetAgentBudgets, DEFAULT_BUDGETS } = require('../config/agentBudgets');
const { reduceEvidenceItem, reduceEvidencePackage } = require('../agents/investigationAgent');

describe('agentBudgets', () => {
  afterEach(() => resetAgentBudgets());

  test('returns defaults when no env overrides', () => {
    const b = getAgentBudgets();
    expect(b.maxModelCallsPerIncident).toBe(DEFAULT_BUDGETS.maxModelCallsPerIncident);
    expect(b.agentTimeoutMs).toBe(DEFAULT_BUDGETS.agentTimeoutMs);
    expect(b.maxLogLines).toBe(DEFAULT_BUDGETS.maxLogLines);
  });

  test('returns same singleton on repeated calls', () => {
    expect(getAgentBudgets()).toBe(getAgentBudgets());
  });

  test('resetAgentBudgets forces reload', () => {
    const first = getAgentBudgets();
    resetAgentBudgets();
    const second = getAgentBudgets();
    // Different objects but same values
    expect(second).not.toBe(first);
    expect(second.maxLogLines).toBe(first.maxLogLines);
  });

  test('respects AIRA_BUDGET_MAX_LOG_LINES env override', () => {
    process.env.AIRA_BUDGET_MAX_LOG_LINES = '42';
    const b = getAgentBudgets();
    expect(b.maxLogLines).toBe(42);
    delete process.env.AIRA_BUDGET_MAX_LOG_LINES;
    resetAgentBudgets();
  });
});

describe('reduceEvidenceItem', () => {
  const budgets = { maxEvidenceItemBytes: 4096, maxLogLines: 5, maxLogLineChars: 20 };

  test('truncates long log arrays', () => {
    const item = {
      id: 'ev-1', type: 'LOG',
      structuredData: {
        logs: Array.from({ length: 20 }, (_, i) => `line ${i}`),
      },
    };
    const reduced = reduceEvidenceItem(item, budgets);
    expect(reduced.structuredData.logs.length).toBeLessThanOrEqual(5);
    expect(reduced.structuredData._logsReduced).toBe(true);
  });

  test('truncates long log line characters', () => {
    const longLine = 'x'.repeat(200);
    const item = {
      id: 'ev-2', type: 'LOG',
      structuredData: { logs: [longLine] },
    };
    const reduced = reduceEvidenceItem(item, { ...budgets, maxLogLineChars: 10 });
    expect(reduced.structuredData.logs[0].length).toBeLessThanOrEqual(11); // 10 + '…'
  });

  test('respects maxEvidenceItemBytes budget', () => {
    const bigData = { data: 'a'.repeat(10_000) };
    const item = { id: 'ev-3', type: 'METRIC', summary: 'big item', structuredData: bigData };
    const reduced = reduceEvidenceItem(item, { maxEvidenceItemBytes: 100, maxLogLines: 100, maxLogLineChars: 512 });
    expect(reduced.structuredData._truncated).toBe(true);
    expect(reduced.structuredData.summary).toBe('big item');
  });

  test('passes through small items unchanged', () => {
    const item = { id: 'ev-4', type: 'METRIC', structuredData: { errorRate: 5 } };
    const reduced = reduceEvidenceItem(item, budgets);
    expect(reduced.structuredData.errorRate).toBe(5);
  });
});

describe('reduceEvidencePackage', () => {
  test('limits to maxEvidenceItems', () => {
    const items = Array.from({ length: 80 }, (_, i) => ({ id: `ev-${i}`, type: 'LOG', structuredData: {} }));
    const budgets = { maxEvidenceItems: 10, maxLogLines: 100, maxLogLineChars: 512, maxEvidenceItemBytes: 4096 };
    const reduced = reduceEvidencePackage(items, budgets);
    expect(reduced.length).toBe(10);
  });
});
