"use strict";


module.exports = {
  testEnvironment:
    "node",


  setupFiles: [
    "<rootDir>/tests/setup-test-env.js",
  ],


  watchman:
    false,


  testTimeout:
    120000,


  verbose:
    true,


  collectCoverage:
    false,


  testMatch: [
    /*
     * ================================================================
     * PHASE 25 — DIRECT PRODUCT CONTRACT
     * ================================================================
     */

    "<rootDir>/tests/unit/phase25OrganizationProfile.test.js",

    "<rootDir>/tests/unit/phase25ProductContext.test.js",

    "<rootDir>/tests/unit/phase25ProductContextRoutes.test.js",

    "<rootDir>/tests/unit/phase25ProductOrganizationProfileRoutes.test.js",

    "<rootDir>/tests/unit/phase25ProductPersonaContract.test.js",

    "<rootDir>/tests/unit/phase25ProductRegistrationService.test.js",

    "<rootDir>/tests/unit/phase25ProductRouteContext.test.js",

    "<rootDir>/tests/unit/phase25RegistrationProductBootstrap.test.js",


    /*
     * ================================================================
     * INHERITED ENTERPRISE AUTHORIZATION CONTRACT
     * ================================================================
     */

    "<rootDir>/tests/unit/phase14AuthorizationBoundary.test.js",

    "<rootDir>/tests/unit/phase14RouteAuthorizationGuard.test.js",


    /*
     * ================================================================
     * NOTIFICATION != EXECUTION
     * ================================================================
     */

    "<rootDir>/tests/unit/phase20NotificationExecutionBoundary.test.js",


    /*
     * ================================================================
     * MULTI-TENANT SAFETY
     * ================================================================
     */

    "<rootDir>/tests/unit/phase21FinalMultiTenantCertification.test.js",


    /*
     * ================================================================
     * AUTONOMY / AUTHORIZATION SAFETY
     * ================================================================
     */

    "<rootDir>/tests/unit/phase22SafetyCriticalApiAndAdversarial.test.js",


    /*
     * ================================================================
     * HUMAN CONTROL / ADVERSARIAL CONTRACT
     * ================================================================
     */

    "<rootDir>/tests/unit/phase23AdversarialCertification.test.js",


    /*
     * ================================================================
     * LEARNING / KNOWLEDGE TENANT BOUNDARY
     * ================================================================
     */

    "<rootDir>/tests/unit/phase24TenantKnowledgeIsolation.test.js",

    "<rootDir>/tests/unit/phase24CrossTenantRetrievalIsolation.test.js",
  ],


  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$":
      "$1",

    "^isomorphic-dompurify$":
      "<rootDir>/tests/__mocks__/dompurify.js",
  },


  /*
   * A Phase-25 freeze must never silently skip a contract because of
   * accidental test-path discovery.
   *
   * Explicitly listing every suite above makes the certification set
   * deterministic.
   */
  passWithNoTests:
    false,
};