"use strict";


const SCOPE_PRIORITY =
  Object.freeze({
    INCIDENT:
      600,

    RESOURCE:
      500,

    SERVICE:
      400,

    ENVIRONMENT:
      300,

    TENANT:
      200,

    GLOBAL:
      100,
  });


const SCOPE_ORDER =
  Object.freeze([
    "INCIDENT",
    "RESOURCE",
    "SERVICE",
    "ENVIRONMENT",
    "TENANT",
    "GLOBAL",
  ]);


class MemoryScopeResolver {

  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  normalizeString(
    value
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      return null;
    }


    const normalized =
      String(
        value
      ).trim();


    return normalized ||
      null;
  }


  normalizeScope(
    value
  ) {
    const scope =
      this
        .normalizeString(
          value
        )
        ?.toUpperCase();


    if (
      !scope ||
      !Object.prototype
        .hasOwnProperty
        .call(
          SCOPE_PRIORITY,
          scope
        )
    ) {
      throw this.createError(
        `Unsupported memory scope: ${scope}`,
        "MEMORY_SCOPE_UNSUPPORTED"
      );
    }


    return scope;
  }


  valueMatches(
    expected,
    actual
  ) {
    const normalizedExpected =
      this.normalizeString(
        expected
      );


    const normalizedActual =
      this.normalizeString(
        actual
      );


    return (
      normalizedExpected !==
        null &&
      normalizedActual !==
        null &&
      normalizedExpected ===
        normalizedActual
    );
  }


  getVerifiedIdentity({
    memory,

    publicField,

    canonicalField,
  }) {
    const verifiedPublic =
      this.normalizeString(
        memory[
          publicField
        ]
      );


    if (
      verifiedPublic
    ) {
      return verifiedPublic;
    }


    return this.normalizeString(
      memory[
        canonicalField
      ]
    );
  }


  resolve({
    memory,

    request,

    includeGlobal =
      false,
  }) {
    if (
      !memory ||
      typeof memory !==
        "object"
    ) {
      throw this.createError(
        "Memory is required for scope resolution",
        "MEMORY_SCOPE_MEMORY_REQUIRED"
      );
    }


    if (
      !request ||
      typeof request !==
        "object"
    ) {
      throw this.createError(
        "Memory context request is required",
        "MEMORY_SCOPE_REQUEST_REQUIRED"
      );
    }


    const scopeType =
      this.normalizeScope(
        memory.scopeType ||
        memory.scope_type
      );


    const requestOrganizationId =
      this.normalizeString(
        request.organizationId
      );


    const requestEnvironmentId =
      this.normalizeString(
        request.environmentId
      );


    const requestServiceId =
      this.normalizeString(
        request.serviceId
      );


    const requestResourceId =
      this.normalizeString(
        request.resourceId
      );


    const requestIncidentId =
      this.normalizeString(
        request.incidentId
      );


    /**
     * ==========================================================
     * VERIFIED PUBLIC IDENTITIES
     * ==========================================================
     *
     * Public identity takes precedence when it has been attached
     * after authoritative PostgreSQL hydration.
     *
     * Raw/canonical identity remains fallback for unit tests and
     * direct callers that already use the same identifier form.
     */
    const organizationId =
      this.getVerifiedIdentity({
        memory,

        publicField:
          "tenantPublicId",

        canonicalField:
          "organizationId",
      });


    const environmentId =
      this.getVerifiedIdentity({
        memory,

        publicField:
          "environmentPublicId",

        canonicalField:
          "environmentId",
      });


    const serviceId =
      this.getVerifiedIdentity({
        memory,

        publicField:
          "servicePublicId",

        canonicalField:
          "serviceId",
      });


    const resourceId =
      this.getVerifiedIdentity({
        memory,

        publicField:
          "resourcePublicId",

        canonicalField:
          "resourceId",
      });


    const incidentId =
      this.getVerifiedIdentity({
        memory,

        publicField:
          "incidentPublicId",

        canonicalField:
          "incidentId",
  });


    /**
     * GLOBAL memory has no tenant ownership.
     */
    if (
      scopeType ===
        "GLOBAL"
    ) {
      return {
        eligible:
          Boolean(
            includeGlobal
          ),

        scopeType,

        scopeScore:
          includeGlobal
            ? SCOPE_PRIORITY.GLOBAL
            : 0,

        matchLevel:
          includeGlobal
            ? "GLOBAL"
            : null,

        rejectionReason:
          includeGlobal
            ? null
            : "GLOBAL_MEMORY_NOT_REQUESTED",
      };
    }


    /**
     * Tenant validation always occurs before local scope ranking.
     */
    if (
      !this.valueMatches(
        requestOrganizationId,
        organizationId
      )
    ) {
      return {
        eligible:
          false,

        scopeType,

        scopeScore:
          0,

        matchLevel:
          null,

        rejectionReason:
          "TENANT_MISMATCH",
      };
    }


    switch (
      scopeType
    ) {

      case "INCIDENT": {
        if (
          !this.valueMatches(
            requestIncidentId,
            incidentId
          )
        ) {
          return {
            eligible:
              false,

            scopeType,

            scopeScore:
              0,

            matchLevel:
              null,

            rejectionReason:
              "INCIDENT_MISMATCH",
          };
        }


        return {
          eligible:
            true,

          scopeType,

          scopeScore:
            SCOPE_PRIORITY.INCIDENT,

          matchLevel:
            "INCIDENT",

          rejectionReason:
            null,
        };
      }


      case "RESOURCE": {
        if (
          !this.valueMatches(
            requestResourceId,
            resourceId
          )
        ) {
          return {
            eligible:
              false,

            scopeType,

            scopeScore:
              0,

            matchLevel:
              null,

            rejectionReason:
              "RESOURCE_MISMATCH",
          };
        }


        return {
          eligible:
            true,

          scopeType,

          scopeScore:
            SCOPE_PRIORITY.RESOURCE,

          matchLevel:
            "RESOURCE",

          rejectionReason:
            null,
        };
      }


      case "SERVICE": {
        if (
          !this.valueMatches(
            requestServiceId,
            serviceId
          )
        ) {
          return {
            eligible:
              false,

            scopeType,

            scopeScore:
              0,

            matchLevel:
              null,

            rejectionReason:
              "SERVICE_MISMATCH",
          };
        }


        return {
          eligible:
            true,

          scopeType,

          scopeScore:
            SCOPE_PRIORITY.SERVICE,

          matchLevel:
            "SERVICE",

          rejectionReason:
            null,
        };
      }


      case "ENVIRONMENT": {
        if (
          !this.valueMatches(
            requestEnvironmentId,
            environmentId
          )
        ) {
          return {
            eligible:
              false,

            scopeType,

            scopeScore:
              0,

            matchLevel:
              null,

            rejectionReason:
              "ENVIRONMENT_MISMATCH",
          };
        }


        return {
          eligible:
            true,

          scopeType,

          scopeScore:
            SCOPE_PRIORITY.ENVIRONMENT,

          matchLevel:
            "ENVIRONMENT",

          rejectionReason:
            null,
        };
      }


      case "TENANT": {
        return {
          eligible:
            true,

          scopeType,

          scopeScore:
            SCOPE_PRIORITY.TENANT,

          matchLevel:
            "TENANT",

          rejectionReason:
            null,
        };
      }


      default:
        throw this.createError(
          `Unsupported memory scope: ${scopeType}`,
          "MEMORY_SCOPE_UNSUPPORTED"
        );
    }
  }


  resolveMany({
    memories =
      [],

    request,

    includeGlobal =
      false,
  }) {
    if (
      !Array.isArray(
        memories
      )
    ) {
      throw this.createError(
        "Memories must be an array",
        "MEMORY_SCOPE_MEMORIES_INVALID"
      );
    }


    const accepted =
      [];

    const rejected =
      [];


    for (
      const memory
      of memories
    ) {
      const resolution =
        this.resolve({
          memory,

          request,

          includeGlobal,
        });


      const item = {
        memory,

        resolution,
      };


      if (
        resolution.eligible
      ) {
        accepted.push(
          item
        );

      } else {
        rejected.push(
          item
        );
      }
    }


    accepted.sort(
      (
        left,
        right
      ) =>
        right
          .resolution
          .scopeScore -
        left
          .resolution
          .scopeScore
    );


    return {
      accepted,

      rejected,

      diagnostics: {
        inputCount:
          memories.length,

        acceptedCount:
          accepted.length,

        rejectedCount:
          rejected.length,

        rejectionReasons:
          rejected.reduce(
            (
              accumulator,
              item
            ) => {
              const reason =
                item
                  .resolution
                  .rejectionReason ||
                "UNKNOWN";


              accumulator[
                reason
              ] =
                (
                  accumulator[
                    reason
                  ] ||
                  0
                ) +
                1;


              return accumulator;
            },
            {}
          ),
      },
    };
  }
}


const memoryScopeResolver =
  new MemoryScopeResolver();


module.exports = {
  SCOPE_PRIORITY,

  SCOPE_ORDER,

  MemoryScopeResolver,

  memoryScopeResolver,
};