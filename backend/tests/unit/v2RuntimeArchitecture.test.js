'use strict';

/**
 * V2 Runtime Architecture Guardrails
 *
 * These tests protect AIRA's production architecture.
 *
 * They intentionally verify structural invariants rather than business logic.
 *
 * Production invariants:
 *
 * 1. Legacy analysis / decision / action agents must not exist.
 * 2. Production routes/services must not construct their own orchestrator.
 * 3. Only server startup may initialize the authoritative orchestrator.
 * 4. Production consumers must obtain the initialized runtime instance.
 * 5. Legacy decisionExecutionPublisher must not exist.
 * 6. Machine ingestion must flow through the V2 runtime.
 * 7. Hard-coded buildTieredDecision must not return as an execution path.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '../..');

const AGENTS_ROOT = path.join(BACKEND_ROOT, 'agents');
const ROUTES_ROOT = path.join(BACKEND_ROOT, 'routes');
const SERVICES_ROOT = path.join(BACKEND_ROOT, 'services');

function fileExists(relativePath) {
  return fs.existsSync(
    path.join(BACKEND_ROOT, relativePath)
  );
}

function readFile(relativePath) {
  return fs.readFileSync(
    path.join(BACKEND_ROOT, relativePath),
    'utf8'
  );
}

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const output = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const absolutePath = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      // Tests may construct isolated orchestrators.
      if (
        entry.name === 'tests' ||
        entry.name === '__tests__' ||
        entry.name === 'node_modules'
      ) {
        continue;
      }

      output.push(
        ...collectJavaScriptFiles(absolutePath)
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js')
    ) {
      output.push(absolutePath);
    }
  }

  return output;
}

function relative(filePath) {
  return path
    .relative(BACKEND_ROOT, filePath)
    .replace(/\\/g, '/');
}

function findMatches(files, matcher) {
  return files
    .map((filePath) => {
      const source = fs.readFileSync(
        filePath,
        'utf8'
      );

      return {
        file: relative(filePath),
        source,
      };
    })
    .filter(({ source }) =>
      matcher(source)
    )
    .map(({ file }) => file);
}

describe('AIRA V2 runtime architecture guardrails', () => {
  test('legacy runtime agent files do not exist', () => {
    expect(
      fileExists('agents/analysisAgent.js')
    ).toBe(false);

    expect(
      fileExists('agents/decisionAgent.js')
    ).toBe(false);

    expect(
      fileExists('agents/actionAgent.js')
    ).toBe(false);
  });

  test('legacy decision execution publisher does not exist', () => {
    expect(
      fileExists(
        'services/execution/decisionExecutionPublisher.js'
      )
    ).toBe(false);
  });

  test('server initializes the authoritative V2 runtime', () => {
    const source = readFile('server.js');

    expect(source).toContain(
      'initializeAgentOrchestrator'
    );

    expect(source).not.toContain(
      'startAnalysisAgent'
    );

    expect(source).not.toContain(
      'startDecisionAgent'
    );

    expect(source).not.toContain(
      'startActionAgent'
    );
  });

  test('production routes do not construct new orchestrators', () => {
    const routeFiles =
      collectJavaScriptFiles(
        ROUTES_ROOT
      );

    const offenders =
      findMatches(
        routeFiles,
        (source) =>
          /\bbuildAgentOrchestrator\s*\(/.test(
            source
          )
      );

    expect(offenders).toEqual([]);
  });

  test('production services do not construct new orchestrators', () => {
    const serviceFiles =
      collectJavaScriptFiles(
        SERVICES_ROOT
      );

    const offenders =
      findMatches(
        serviceFiles,
        (source) =>
          /\bbuildAgentOrchestrator\s*\(/.test(
            source
          )
      );

    expect(offenders).toEqual([]);
  });

  test('only V2 factory code or tests may reference buildAgentOrchestrator', () => {
    const productionFiles = [
      ...collectJavaScriptFiles(
        ROUTES_ROOT
      ),
      ...collectJavaScriptFiles(
        SERVICES_ROOT
      ),
    ];

    const offenders =
      findMatches(
        productionFiles,
        (source) =>
          source.includes(
            'buildAgentOrchestrator'
          )
      );

    expect(offenders).toEqual([]);
  });

  test('agent intelligence route uses authoritative runtime instance', () => {
    const source = readFile(
      'routes/agentIntelligenceRoutes.js'
    );

    expect(source).toContain(
      'getAgentOrchestratorInstance'
    );

    expect(source).not.toContain(
      'buildAgentOrchestrator'
    );
  });

  test('machine ingestion uses authoritative runtime instance', () => {
    const source = readFile(
      'routes/machineIngestionRoutes.js'
    );

    expect(source).toContain(
      'getAgentOrchestratorInstance'
    );

    expect(source).not.toContain(
      'buildAgentOrchestrator'
    );

    expect(source).not.toContain(
      'decisionExecutionPublisher'
    );

    expect(source).not.toContain(
      'buildTieredDecision'
    );
  });

  test('legacy execution publisher is not referenced by production routes', () => {
    const routeFiles =
      collectJavaScriptFiles(
        ROUTES_ROOT
      );

    const offenders =
      findMatches(
        routeFiles,
        (source) =>
          source.includes(
            'decisionExecutionPublisher'
          )
      );

    expect(offenders).toEqual([]);
  });

  test('legacy execution publisher is not referenced by production services', () => {
    const serviceFiles =
      collectJavaScriptFiles(
        SERVICES_ROOT
      );

    const offenders =
      findMatches(
        serviceFiles,
        (source) =>
          source.includes(
            'decisionExecutionPublisher'
          )
      );

    expect(offenders).toEqual([]);
  });

  test('legacy agent modules are not imported anywhere in production', () => {
    const productionFiles = [
      ...collectJavaScriptFiles(
        ROUTES_ROOT
      ),
      ...collectJavaScriptFiles(
        SERVICES_ROOT
      ),
      ...collectJavaScriptFiles(
        AGENTS_ROOT
      ),
      path.join(
        BACKEND_ROOT,
        'server.js'
      ),
    ];

    const legacyPatterns = [
      /analysisAgent/,
      /decisionAgent/,
      /actionAgent/,
    ];

    const offenders = [];

    for (const filePath of productionFiles) {
      if (
        !fs.existsSync(filePath)
      ) {
        continue;
      }

      // The guardrail test itself is outside these
      // production directories, so no exclusion required.
      const source = fs.readFileSync(
        filePath,
        'utf8'
      );

      if (
        legacyPatterns.some(
          (pattern) =>
            pattern.test(source)
        )
      ) {
        offenders.push(
          relative(filePath)
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  test('hard-coded tiered decision builder is absent from production routes', () => {
    const routeFiles =
      collectJavaScriptFiles(
        ROUTES_ROOT
      );

    const offenders =
      findMatches(
        routeFiles,
        (source) =>
          /\bbuildTieredDecision\b/.test(
            source
          )
      );

    expect(offenders).toEqual([]);
  });

  test('V2 runtime exposes separate build, initialize and get APIs', () => {
    const v2 = require(
      '../../agents/v2'
    );

    expect(
      typeof v2.buildAgentOrchestrator
    ).toBe('function');

    expect(
      typeof v2.initializeAgentOrchestrator
    ).toBe('function');

    expect(
      typeof v2.getAgentOrchestratorInstance
    ).toBe('function');
  });

  test('getAgentOrchestratorInstance fails closed before initialization', () => {
    const v2 = require(
      '../../agents/v2'
    );

    if (
      typeof v2.resetAgentOrchestratorInstance ===
      'function'
    ) {
      v2.resetAgentOrchestratorInstance();
    }

    expect(() =>
      v2.getAgentOrchestratorInstance()
    ).toThrow(
      /has not been initialized/i
    );
  });

  test('runtime initialization is singleton', () => {
    const v2 = require(
      '../../agents/v2'
    );

    if (
      typeof v2.resetAgentOrchestratorInstance ===
      'function'
    ) {
      v2.resetAgentOrchestratorInstance();
    }

    const first =
      v2.initializeAgentOrchestrator(
        {},
        {}
      );

    const second =
      v2.initializeAgentOrchestrator(
        {},
        {}
      );

    expect(first).toBe(second);
  });
  test(
  'AgentOrchestrator runtime class does not own a second production singleton',
  () => {
    const source =
      readFile(
        'agents/v2/runtime/agentOrchestrator.js'
      );

    expect(
      source
    ).not.toContain(
      'function getAgentOrchestrator('
    );

    expect(
      source
    ).not.toContain(
      'let _instance = null'
    );

    expect(
      source
    ).not.toContain(
      'resetAgentOrchestrator()'
    );

    expect(
      source
    ).toContain(
      'module.exports = {'
    );

    expect(
      source
    ).toContain(
      'AgentOrchestrator'
    );
  }
);

test(
  'server initializes agent runtime after core services and before startup recovery',
  () => {
    const source =
      readFile(
        'server.js'
      );

    const initializeServicesPosition =
      source.indexOf(
        'await initializeServices();'
      );

    const agentRuntimePosition =
      source.indexOf(
        'initializeAgentOrchestrator('
      );

    const startupRecoveryPosition =
      source.indexOf(
        'await runStartupRecovery();'
      );

    expect(
      initializeServicesPosition
    ).toBeGreaterThan(
      -1
    );

    expect(
      agentRuntimePosition
    ).toBeGreaterThan(
      initializeServicesPosition
    );

    expect(
      startupRecoveryPosition
    ).toBeGreaterThan(
      agentRuntimePosition
    );
  }
);

test(
  'production intelligence routes use canonical diagnosis before recovery continuation',
  () => {
    const manualRoute =
      readFile(
        'routes/agentIntelligenceRoutes.js'
      );

    const machineRoute =
      readFile(
        'routes/machineIngestionRoutes.js'
      );

    expect(
      manualRoute
    ).toContain(
      'diagnosisLifecycleService'
    );

    expect(
      manualRoute
    ).toContain(
      '.continueFromDiagnosis('
    );

    expect(
      machineRoute
    ).toContain(
      'diagnosisLifecycleService'
    );

    expect(
      machineRoute
    ).toContain(
      '.continueFromDiagnosis('
    );
  }
);

});