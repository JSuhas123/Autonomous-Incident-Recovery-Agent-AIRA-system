"use strict";

const Joi =
  require("joi");

const {
  COVERAGE_CLASSIFICATIONS,
  COVERAGE_REASON_CODES,
} =
  require(
    "../../constants/coverage"
  );


const coverageSchema =
  Joi.object({
    resourceId:
      Joi.string()
        .required(),

    resourceType:
      Joi.string()
        .required(),

    failureModeId:
      Joi.string()
        .required(),

    failureModeVersion:
      Joi.string()
        .required(),

    classification:
      Joi.string()
        .valid(
          ...Object.values(
            COVERAGE_CLASSIFICATIONS
          )
        )
        .required(),

    reasons:
      Joi.array()
        .items(
          Joi.string().valid(
            ...Object.values(
              COVERAGE_REASON_CODES
            )
          )
        )
        .required(),

    readiness:
      Joi.object()
        .required(),

    confidence:
      Joi.number()
        .min(0)
        .max(1)
        .required(),

    evaluatedAt:
      Joi.date()
        .required(),

    executionAuthorized:
      Joi.boolean()
        .valid(false)
        .required(),
  });


function assertValidCoverage(
  input
) {
  const {
    error,
    value,
  } =
    coverageSchema.validate(
      input,
      {
        abortEarly:
          false,

        allowUnknown:
          false,
      }
    );


  if (
    error
  ) {
    throw Object.assign(
      new Error(
        error.message
      ),
      {
        code:
          "COVERAGE_CONTRACT_INVALID",

        executionAuthorized:
          false,
      }
    );
  }


  return {
    ...value,

    executionAuthorized:
      false,
  };
}


module.exports = {
  coverageSchema,

  assertValidCoverage,
};