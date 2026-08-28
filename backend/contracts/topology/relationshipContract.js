"use strict";


const Joi =
  require(
    "joi"
  );


const {
  RELATIONSHIP_TYPE_PATTERN,
} =
  require(
    "../../constants/relationshipTypes"
  );


const relationshipSchema =
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

      sourceResourceId:
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

      targetResourceId:
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

      relationshipType:
        Joi
          .string()
          .pattern(
            RELATIONSHIP_TYPE_PATTERN
          )
          .required(),

      attributes:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

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
          .required(),

      validTo:
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
    .custom(
      (
        value,
        helpers
      ) => {

        if (
          value.sourceResourceId ===
          value.targetResourceId
        ) {
          return helpers.error(
            "any.invalid"
          );
        }


        if (
          value.validTo &&
          new Date(
            value.validTo
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
      "AIRA relationship validation"
    )
    .unknown(
      false
    );


function validateRelationship(
  value
) {
  return relationshipSchema
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


function assertValidRelationship(
  value
) {
  const {
    error,
    value:
      validated,
  } =
    validateRelationship(
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
      "RELATIONSHIP_CONTRACT_INVALID";


    validationError.details =
      error.details;


    throw validationError;
  }


  return validated;
}


module.exports = {
  relationshipSchema,

  validateRelationship,

  assertValidRelationship,
};