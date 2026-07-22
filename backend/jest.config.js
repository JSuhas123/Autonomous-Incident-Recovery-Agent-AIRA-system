module.exports = {
  testEnvironment: 'node',
  // Provide a safe AUDIT_SECRET for all test runs so that any code path that
  // calls auditService._computeSignature() does not throw due to a missing env var.
  testEnvironmentOptions: {},
  // globalSetup runs once before the test suite in the Node process.
  // We inject the env var here so it is available before any module is required.
  setupFiles: ['<rootDir>/tests/setup-test-env.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'services/**/*.js',
    'agents/**/*.js',
    'models/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
  ],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/?(*.)+(spec|test).js',
  ],
  testTimeout: 120000,
  verbose: true,
  collectCoverage: false,
  transformIgnorePatterns: [
    'node_modules/(?!(@csstools|isomorphic-dompurify)/)',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^isomorphic-dompurify$': '<rootDir>/tests/__mocks__/dompurify.js',
  },
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
