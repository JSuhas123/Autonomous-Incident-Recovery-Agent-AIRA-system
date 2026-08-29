"use strict";

const Joi =
  require("joi");


const coverageSummarySchema =
  Joi.object({
    resources:
      Joi.number()
        .integer()
        .min(0)
        .required(),

    applicableFailureModes:
      Joi.number()
        .integer()
        .min(0)
        .required(),

    covered:
      Joi.number()
        .integer()
        .min(0)
        .required(),

    partial:
      Joi.number()
        .integer()
        .min(0)
        .required(),

    humanOnly:
      Joi.number()
        .integer()
        .min(0)
        .required(),

    unknown:
      Joi.number()
        .integer()
        .min(0)
        .required(),

    coverage:
      Joi.number()
        .min(0)
        .max(100)
        .required(),

    executionAuthorized:
      Joi.boolean()
        .valid(false)
        .required(),
  })
  .custom(
    (
      value,
      helpers
    ) => {
      const classified =
        value.covered +
        value.partial +
        value.humanOnly +
        value.unknown;


      if (
        classified !==
        value.applicableFailureModes
      ) {
        return helpers.error(
          "coverage.countMismatch"
        );
      }


      const expectedCoverage =
        value
          .applicableFailureModes ===
        0
          ? 0
          : Number(
              (
                (
                  value.covered /
                  value.applicableFailureModes
                ) *
                100
              ).toFixed(1)
            );


      if (
        Math.abs(
          value.coverage -
          expectedCoverage
        ) >
        0.05
      ) {
        return helpers.error(
          "coverage.percentageMismatch"
        );
      }


      return value;
    }
  )
  .messages({
    "coverage.countMismatch":
      "Coverage classifications must sum to applicableFailureModes",

    "coverage.percentageMismatch":
      "Coverage percentage must equal covered / applicableFailureModes * 100",
  });


function assertValidCoverageSummary(
  input
) {
  const {
    error,
    value,
  } =
    coverageSummarySchema.validate(
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
          "COVERAGE_SUMMARY_INVALID",

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
  coverageSummarySchema,

  assertValidCoverageSummary,
};