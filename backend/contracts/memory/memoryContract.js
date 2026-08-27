"use strict";


const Joi =
  require(
    "joi"
  );


const {
  MEMORY_TYPE_VALUES,
} =
  require(
    "../../constants/memoryTypes"
  );


const {
  MEMORY_SCOPES,
  MEMORY_SCOPE_VALUES,
} =
  require(
    "../../constants/memoryScopes"
  );


const {
  MEMORY_STATUSES,
  MEMORY_STATUS_VALUES,
} =
  require(
    "../../constants/memoryLifecycle"
  );


const nullableId =
  Joi
    .string()
    .trim()
    .min(
      1
    )
    .max(
      512
    )
    .allow(
      null
    );


const probability =
  Joi
    .number()
    .min(
      0
    )
    .max(
      1
    );


const baseMemorySchema =
  Joi
    .object({

      publicId:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            512
          )
          .required(),

      organizationId:
        nullableId
          .default(
            null
          ),

      environmentId:
        nullableId
          .default(
            null
          ),

      serviceId:
        nullableId
          .default(
            null
          ),

      resourceId:
        nullableId
          .default(
            null
          ),

      incidentId:
        nullableId
          .default(
            null
          ),

      memoryType:
        Joi
          .string()
          .valid(
            ...MEMORY_TYPE_VALUES
          )
          .required(),

      scopeType:
        Joi
          .string()
          .valid(
            ...MEMORY_SCOPE_VALUES
          )
          .required(),

      title:
        Joi
          .string()
          .trim()
          .max(
            1024
          )
          .allow(
            "",
            null
          )
          .default(
            null
          ),

      summary:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            10000
          )
          .required(),

      content:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

      confidence:
        probability
          .default(
            0
          ),

      trustScore:
        probability
          .default(
            0
          ),

      importance:
        probability
          .default(
            0.5
          ),

      status:
        Joi
          .string()
          .valid(
            ...MEMORY_STATUS_VALUES
          )
          .default(
            MEMORY_STATUSES.ACTIVE
          ),

      sourceType:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            255
          )
          .required(),

      sourceCount:
        Joi
          .number()
          .integer()
          .min(
            0
          )
          .default(
            0
          ),

      evidenceCount:
        Joi
          .number()
          .integer()
          .min(
            0
          )
          .default(
            0
          ),

      observationCount:
        Joi
          .number()
          .integer()
          .min(
            1
          )
          .default(
            1
          ),

      observedAt:
        Joi
          .date()
          .iso()
          .allow(
            null
          )
          .default(
            null
          ),

      validFrom:
        Joi
          .date()
          .iso()
          .allow(
            null
          )
          .default(
            null
          ),

      validUntil:
        Joi
          .date()
          .iso()
          .allow(
            null
          )
          .default(
            null
          ),

      supersedesMemoryId:
        nullableId
          .default(
            null
          ),

      legacySourceType:
        nullableId
          .default(
            null
          ),

      legacySourceId:
        nullableId
          .default(
            null
          ),

      metadata:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

      schemaVersion:
        Joi
          .number()
          .integer()
          .min(
            1
          )
          .default(
            1
          ),
    })
    .custom(
      (
        value,
        helpers
      ) => {

        const fail =
          (
            message
          ) =>
            helpers
              .message(
                message
              );


        switch (
          value.scopeType
        ) {

          case MEMORY_SCOPES.GLOBAL:

            if (
              value.organizationId ||
              value.environmentId ||
              value.serviceId ||
              value.resourceId ||
              value.incidentId
            ) {
              return fail(
                "GLOBAL memory cannot contain tenant or infrastructure scope identifiers"
              );
            }

            break;


          case MEMORY_SCOPES.TENANT:

            if (
              !value.organizationId ||
              value.environmentId ||
              value.serviceId ||
              value.resourceId ||
              value.incidentId
            ) {
              return fail(
                "TENANT memory requires only organizationId"
              );
            }

            break;


          case MEMORY_SCOPES.ENVIRONMENT:

            if (
              !value.organizationId ||
              !value.environmentId ||
              value.serviceId ||
              value.resourceId ||
              value.incidentId
            ) {
              return fail(
                "ENVIRONMENT memory requires organizationId and environmentId"
              );
            }

            break;


          case MEMORY_SCOPES.SERVICE:

            if (
              !value.organizationId ||
              !value.environmentId ||
              !value.serviceId ||
              value.resourceId ||
              value.incidentId
            ) {
              return fail(
                "SERVICE memory requires organizationId, environmentId and serviceId"
              );
            }

            break;


          case MEMORY_SCOPES.RESOURCE:

            if (
              !value.organizationId ||
              !value.environmentId ||
              !value.resourceId ||
              value.incidentId
            ) {
              return fail(
                "RESOURCE memory requires organizationId, environmentId and resourceId"
              );
            }

            break;


          case MEMORY_SCOPES.INCIDENT:

            if (
              !value.organizationId ||
              !value.environmentId ||
              !value.incidentId
            ) {
              return fail(
                "INCIDENT memory requires organizationId, environmentId and incidentId"
              );
            }

            break;


          default:
            return fail(
              "Unknown memory scope"
            );
        }


        if (
          value.validFrom &&
          value.validUntil &&
          new Date(
            value.validUntil
          ) <=
          new Date(
            value.validFrom
          )
        ) {
          return fail(
            "validUntil must be later than validFrom"
          );
        }


        return value;
      },
      "AIRA memory scope validation"
    );


function validateMemory(
  value
) {
  return baseMemorySchema
    .validate(
      value,
      {
        abortEarly:
          false,

        allowUnknown:
          false,

        stripUnknown:
          false,
      }
    );
}


function assertValidMemory(
  value
) {
  const {
    error,
    value:
      validated,
  } =
    validateMemory(
      value
    );


  if (
    error
  ) {
    const validationError =
      new Error(
        error.message
      );

    validationError.code =
      "MEMORY_CONTRACT_INVALID";

    validationError.details =
      error.details;

    throw validationError;
  }


  return validated;
}


module.exports = {
  baseMemorySchema,

  validateMemory,

  assertValidMemory,
};