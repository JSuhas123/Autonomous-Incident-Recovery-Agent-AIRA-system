"use strict";

const PostgresIntegrationInvocationAuditRepository =
  require(
    "../../persistence/postgres/PostgresIntegrationInvocationAuditRepository"
  );

const {
  sanitizeIntegrationValue,
} =
  require(
    "./integrationSecurity"
  );


class IntegrationInvocationAuditService {
  constructor(
    options = {}
  ) {
    this.repository =
      options
        .integrationInvocationAuditRepository ||
      new PostgresIntegrationInvocationAuditRepository(
        options
      );
  }


  async record(
    input
  ) {
    try {
      return await this
        .repository
        .append({
          ...input,

          metadata:
            sanitizeIntegrationValue(
              input.metadata ||
              {}
            ),

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      /*
       * An audit write failure must never transform provider failure into
       * success or silently grant authority.
       *
       * The runtime can still return/throw the actual provider result while
       * surfacing that audit persistence failed.
       */
      return {
        recorded:
          false,

        errorCode:
          error?.code ||
          "INTEGRATION_AUDIT_WRITE_FAILED",

        executionAuthorized:
          false,
      };
    }
  }
}


module.exports = {
  IntegrationInvocationAuditService,
};