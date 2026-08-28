"use strict";


const Joi =
  require(
    "joi"
  );


const {
  RESOURCE_HEALTH_VALUES,

  RESOURCE_LIFECYCLE_VALUES,
} =
  require(
    "../../constants/resourceStateTypes"
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


const resourceStateSchema =
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

      resourceId:
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

      observedAt:
        Joi
          .date()
          .iso()
          .required(),

      health:
        Joi
          .string()
          .valid(
            ...RESOURCE_HEALTH_VALUES
          )
          .required(),

      lifecycle:
        Joi
          .string()
          .valid(
            ...RESOURCE_LIFECYCLE_VALUES
          )
          .required(),

      configuration:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

      runtime:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

      metrics:
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

      version:
        nullableString
          .default(
            null
          ),

      fingerprint:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            256
          )
          .required(),

      source:
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

      evidence:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
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


function validateResourceState(
  value
) {
  return resourceStateSchema
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


function assertValidResourceState(
  value
) {
  const {
    error,
    value:
      validated,
  } =
    validateResourceState(
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
      "RESOURCE_STATE_CONTRACT_INVALID";


    validationError.details =
      error.details;


    throw validationError;
  }


  return validated;
}


module.exports = {
  resourceStateSchema,

  validateResourceState,

  assertValidResourceState,
};