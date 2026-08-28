"use strict";


const Joi =
  require(
    "joi"
  );


const {
  RESOURCE_CAPABILITY_VALUES,
} =
  require(
    "../../constants/resourceCapabilities"
  );


const capabilitySchema =
  Joi
    .object({

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

      capability:
        Joi
          .string()
          .valid(
            ...RESOURCE_CAPABILITY_VALUES
          )
          .required(),

      available:
        Joi
          .boolean()
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

      observedAt:
        Joi
          .date()
          .iso()
          .required(),

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


function validateCapability(
  value
) {
  return capabilitySchema
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


function assertValidCapability(
  value
) {
  const {
    error,
    value:
      validated,
  } =
    validateCapability(
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
      "RESOURCE_CAPABILITY_CONTRACT_INVALID";


    validationError.details =
      error.details;


    throw validationError;
  }


  return validated;
}


module.exports = {
  capabilitySchema,

  validateCapability,

  assertValidCapability,
};