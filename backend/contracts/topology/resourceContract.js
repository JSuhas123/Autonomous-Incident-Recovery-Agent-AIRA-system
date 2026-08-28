"use strict";


const Joi =
  require(
    "joi"
  );


const {
  RESOURCE_TYPE_PATTERN,
} =
  require(
    "../../constants/resourceTypes"
  );


const nullableString =
  Joi
    .string()
    .trim()
    .min(
      1
    )
    .max(
      1024
    )
    .allow(
      null
    );


const resourceSchema =
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

      environmentId:
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

      resourceType:
        Joi
          .string()
          .pattern(
            RESOURCE_TYPE_PATTERN
          )
          .required(),

      provider:
        nullableString
          .default(
            null
          ),

      externalId:
        nullableString
          .default(
            null
          ),

      name:
        nullableString
          .default(
            null
          ),

      displayName:
        nullableString
          .default(
            null
          ),

      namespace:
        nullableString
          .default(
            null
          ),

      region:
        nullableString
          .default(
            null
          ),

      zone:
        nullableString
          .default(
            null
          ),

      serviceId:
        nullableString
          .default(
            null
          ),

      labels:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

      attributes:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

      status:
        nullableString
          .default(
            null
          ),

      discoveredAt:
        Joi
          .date()
          .iso()
          .allow(
            null
          )
          .default(
            null
          ),

      firstSeenAt:
        Joi
          .date()
          .iso()
          .allow(
            null
          )
          .default(
            null
          ),

      lastSeenAt:
        Joi
          .date()
          .iso()
          .allow(
            null
          )
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
    })
    .unknown(
      false
    );


function validateResource(
  value
) {
  return resourceSchema
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


function assertValidResource(
  value
) {
  const {
    error,
    value:
      validated,
  } =
    validateResource(
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
      "RESOURCE_CONTRACT_INVALID";


    validationError.details =
      error.details;


    throw validationError;
  }


  return validated;
}


module.exports = {
  resourceSchema,

  validateResource,

  assertValidResource,
};