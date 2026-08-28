"use strict";


const Joi =
  require(
    "joi"
  );


const {
  KNOWN_GOOD_STATUS_VALUES,
} =
  require(
    "../../constants/resourceStateTypes"
  );


const knownGoodStateSchema =
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

      resourceStateId:
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

      validFrom:
        Joi
          .date()
          .iso()
          .required(),

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

      confidence:
        Joi
          .number()
          .min(
            0
          )
          .max(
            1
          )
          .required(),

      evidenceCount:
        Joi
          .number()
          .integer()
          .min(
            1
          )
          .required(),

      healthEvidence:
        Joi
          .object()
          .unknown(
            true
          )
          .required(),

      reason:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            4096
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

      approvedByHuman:
        Joi
          .boolean()
          .default(
            false
          ),

      supersededBy:
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
          )
          .default(
            null
          ),

      status:
        Joi
          .string()
          .valid(
            ...KNOWN_GOOD_STATUS_VALUES
          )
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
    .custom(
      (
        value,
        helpers
      ) => {

        if (
          value.validUntil &&
          new Date(
            value.validUntil
          ) <=
          new Date(
            value.validFrom
          )
        ) {
          return helpers.error(
            "date.greater"
          );
        }


        return value;
      },
      "AIRA known-good validation"
    )
    .unknown(
      false
    );


function validateKnownGoodState(
  value
) {
  return knownGoodStateSchema
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


function assertValidKnownGoodState(
  value
) {
  const {
    error,
    value:
      validated,
  } =
    validateKnownGoodState(
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
      "KNOWN_GOOD_STATE_CONTRACT_INVALID";


    validationError.details =
      error.details;


    throw validationError;
  }


  return validated;
}


module.exports = {
  knownGoodStateSchema,

  validateKnownGoodState,

  assertValidKnownGoodState,
};