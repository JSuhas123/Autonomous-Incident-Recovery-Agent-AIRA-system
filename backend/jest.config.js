module.exports = {
  testEnvironment:
    "node",

  testEnvironmentOptions:
    {},

  setupFiles: [
    "<rootDir>/tests/setup-test-env.js",
  ],

  // Explicit roots prevents jest-haste-map from missing files in large trees
  roots: [
    "<rootDir>/tests",

    "<rootDir>/services",

    "<rootDir>/middleware",

    "<rootDir>/models",

    "<rootDir>/knowledge",

    "<rootDir>/agents",

    // Phase 13 persistence layer
    "<rootDir>/persistence",
  ],

  // Disable watchman to force a full filesystem crawl on every run
  watchman:
    false,

  coverageDirectory:
    "coverage",

  collectCoverageFrom: [
    "services/**/*.js",

    "agents/**/*.js",

    "models/**/*.js",

    "middleware/**/*.js",

    "knowledge/**/*.js",

    "utils/**/*.js",

    // Phase 13 persistence code
    "persistence/**/*.js",

    "!**/node_modules/**",

    "!**/tests/**",

    "!**/__tests__/**",
  ],

  testMatch: [
    "**/tests/**/*.test.js",

    "**/__tests__/**/*.test.js",

    "**/?(*.)+(spec|test).js",
  ],

  testTimeout:
    120000,

  verbose:
    true,

  collectCoverage:
    false,

  transformIgnorePatterns: [
    "node_modules/(?!(@csstools|isomorphic-dompurify)/)",
  ],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$":
      "$1",

    "^isomorphic-dompurify$":
      "<rootDir>/tests/__mocks__/dompurify.js",
  },

  coverageThreshold: {
    global: {
      branches:
        60,

      functions:
        60,

      lines:
        60,

      statements:
        60,
    },
  },
};