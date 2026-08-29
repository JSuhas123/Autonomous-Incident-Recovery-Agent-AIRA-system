"use strict";

const Joi =
  require("joi");

const {
  COVERAGE_REASON_CODES,
} =
  require(
    "../../constants/coverage"
  );


const coverageReasonSchema =
  Joi.object({
    code:
      Joi.string()
        .valid(
          ...Object.values(
            COVERAGE_REASON_CODES
          )
        )
        .required(),

    message:
      Joi.string()
        .trim()
        .min(1)
        .required(),
  });


function assertValidCoverageReason(
  input
) {
  const {
    error,
    value,
  } =
    coverageReasonSchema.validate(
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
          "COVERAGE_REASON_INVALID",

        executionAuthorized:
          false,
      }
    );
  }


  return value;
}


module.exports = {
  coverageReasonSchema,

  assertValidCoverageReason,
};