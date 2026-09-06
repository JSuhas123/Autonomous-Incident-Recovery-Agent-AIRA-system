"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.1C
 * PRODUCT REGISTRATION COMPOSITION SERVICE
 * ============================================================================
 *
 * Canonical flow:
 *
 * authService.register()
 *        ↓
 * RegistrationProductBootstrapService.bootstrap()
 *        ↓
 * enriched first-entry response
 *
 * This avoids duplicating authentication or organization provisioning.
 *
 * During final Phase 25 server integration, authRoutes can invoke this
 * composition instead of invoking authService.register() directly.
 * ============================================================================
 */

const authService =
  require(
    "../identity/authService"
  );

const {
  RegistrationProductBootstrapService,
} = require(
  "./registrationProductBootstrapService"
);


class ProductRegistrationService {
  constructor(
    options = {}
  ) {
    this.registerIdentity =
      options.registerIdentity ||
      authService.register;

    this.bootstrapService =
      options.bootstrapService ||
      new RegistrationProductBootstrapService(
        options.bootstrapOptions ||
        {}
      );
  }


  async register(
    data,
    requestMetadata = {}
  ) {
    /*
     * Identity + tenant bootstrap remains the first authority.
     */
    const authResult =
      await this
        .registerIdentity(
          data,
          requestMetadata
        );


    /*
     * Only after identity registration succeeds do we establish
     * product-facing state.
     */
    const productBootstrap =
      await this
        .bootstrapService
        .bootstrap(
          authResult
        );


    return {
      ...authResult,

      productBootstrap,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  ProductRegistrationService,
};