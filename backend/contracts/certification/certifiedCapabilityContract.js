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


const {
  CERTIFICATION_DOMAIN_VALUES,
} =
  require(
    "../../constants/recoveryCertification"
  );


const SAFE_KEY_PATTERN =
  /^[A-Z0-9][A-Z0-9_.:-]*$/;


const certifiedCapabilitySchema =
  Joi
    .object({
      capabilityKey:
        Joi
          .string()
          .trim()
          .min(
            3
          )
          .max(
            255
          )
          .pattern(
            SAFE_KEY_PATTERN
          )
          .required(),

      provider:
        Joi
          .string()
          .trim()
          .lowercase()
          .min(
            1
          )
          .max(
            128
          )
          .required(),

      resourceType:
        Joi
          .string()
          .trim()
          .lowercase()
          .min(
            1
          )
          .max(
            255
          )
          .required(),

      failureMode:
        Joi
          .string()
          .trim()
          .lowercase()
          .min(
            1
          )
          .max(
            255
          )
          .required(),

      recoveryStrategy:
        Joi
          .string()
          .trim()
          .lowercase()
          .min(
            1
          )
          .max(
            255
          )
          .required(),

      resourceCapability:
        Joi
          .string()
          .valid(
            ...RESOURCE_CAPABILITY_VALUES
          )
          .required(),

      playbookId:
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

      playbookVersion:
        Joi
          .alternatives()
          .try(
            Joi
              .string()
              .trim()
              .min(
                1
              )
              .max(
                128
              ),

            Joi
              .number()
              .integer()
              .positive()
          )
          .required(),

      domain:
        Joi
          .string()
          .valid(
            ...CERTIFICATION_DOMAIN_VALUES
          )
          .required(),

      constraints:
        Joi
          .object()
          .unknown(
            true
          )
          .default(
            {}
          ),

      executionAuthorized:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),
    })
    .unknown(
      false
    );


function validateCertifiedCapability(
  value
) {
  return certifiedCapabilitySchema
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


function assertValidCertifiedCapability(
  value
) {
  const {
    error,
    value:
      validated,
  } =
    validateCertifiedCapability(
      value
    );


  if (
    error
  ) {
    const validationError =
      new Error(
        error.message
      );

    validationError.name =
      "CertifiedCapabilityContractError";

    validationError.code =
      "CERTIFIED_CAPABILITY_CONTRACT_INVALID";

    validationError.details =
      error.details;

    validationError.executionAuthorized =
      false;

    throw validationError;
  }


  return Object.freeze({
    ...validated,

    executionAuthorized:
      false,
  });
}


module.exports = {
  certifiedCapabilitySchema,

  validateCertifiedCapability,

  assertValidCertifiedCapability,
};