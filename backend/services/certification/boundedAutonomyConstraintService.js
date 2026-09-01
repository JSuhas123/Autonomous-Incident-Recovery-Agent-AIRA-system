"use strict";


class BoundedAutonomyConstraintService {
  evaluate(
    input = {}
  ) {
    const constraints =
      normalizeConstraints(
        input.constraints
      );


    const context =
      input.context ||
      {};


    if (
      input.executionAuthorized ===
        true
    ) {
      throw constraintError(
        "BOUNDED_AUTONOMY_AUTHORITY_LEAK",

        "Bounded autonomy constraints cannot grant execution authorization"
      );
    }


    const results =
      constraints.map(
        constraint =>
          evaluateConstraint(
            constraint,
            context
          )
      );


    const failed =
      results.filter(
        result =>
          result.pass !==
            true
      );


    return Object.freeze({
      bounded:
        constraints.length >
        0,

      satisfied:
        failed.length ===
        0,

      constraintCount:
        constraints.length,

      results:
        Object.freeze(
          results
        ),

      failedConstraints:
        Object.freeze(
          failed.map(
            result =>
              result.constraintKey
          )
        ),

      executionAuthorized:
        false,

      productionCertified:
        false,
    });
  }
}


function normalizeConstraints(
  constraints
) {
  if (
    constraints ===
      undefined ||

    constraints ===
      null
  ) {
    return [];
  }


  if (
    !Array.isArray(
      constraints
    )
  ) {
    throw constraintError(
      "CERTIFICATE_CONSTRAINTS_INVALID",

      "constraints must be an array"
    );
  }


  return constraints.map(
    (
      constraint,
      index
    ) => {
      if (
        !constraint ||
        typeof constraint !==
          "object"
      ) {
        throw constraintError(
          "CERTIFICATE_CONSTRAINT_INVALID",

          `constraints[${index}] must be an object`
        );
      }


      const constraintKey =
        constraint.constraintKey ||
        constraint.constraint_key;


      const operator =
        constraint.operator;


      const constraintValue =
        constraint.constraintValue !==
          undefined
          ? constraint
              .constraintValue
          : constraint
              .constraint_value;


      if (
        !constraintKey ||
        !operator
      ) {
        throw constraintError(
          "CERTIFICATE_CONSTRAINT_FIELDS_REQUIRED",

          `constraints[${index}] requires constraintKey and operator`
        );
      }


      return {
        constraintKey,

        operator,

        constraintValue,
      };
    }
  );
}


function evaluateConstraint(
  constraint,
  context
) {
  const actual =
    resolvePath(
      context,
      constraint
        .constraintKey
    );


  const expected =
    constraint
      .constraintValue;


  let pass =
    false;


  switch (
    constraint.operator
  ) {
    case "EQ":
      pass =
        deepEqual(
          actual,
          expected
        );

      break;


    case "NEQ":
      pass =
        !deepEqual(
          actual,
          expected
        );

      break;


    case "IN":
      pass =
        Array.isArray(
          expected
        ) &&
        expected.some(
          value =>
            deepEqual(
              actual,
              value
            )
        );

      break;


    case "NOT_IN":
      pass =
        Array.isArray(
          expected
        ) &&
        !expected.some(
          value =>
            deepEqual(
              actual,
              value
            )
        );

      break;


    case "LTE":
      pass =
        isComparableNumber(
          actual
        ) &&
        isComparableNumber(
          expected
        ) &&
        Number(
          actual
        ) <=
        Number(
          expected
        );

      break;


    case "GTE":
      pass =
        isComparableNumber(
          actual
        ) &&
        isComparableNumber(
          expected
        ) &&
        Number(
          actual
        ) >=
        Number(
          expected
        );

      break;


    case "REQUIRED_TRUE":
      pass =
        actual ===
        true;

      break;


    case "REQUIRED_FALSE":
      pass =
        actual ===
        false;

      break;


    default:
      throw constraintError(
        "CERTIFICATE_CONSTRAINT_OPERATOR_INVALID",

        `Unsupported constraint operator ${constraint.operator}`
      );
  }


  return Object.freeze({
    constraintKey:
      constraint
        .constraintKey,

    operator:
      constraint.operator,

    expected,

    actual:
      actual ===
        undefined
        ? null
        : actual,

    pass,

    executionAuthorized:
      false,
  });
}


function resolvePath(
  object,
  path
) {
  return String(
    path
  )
    .split(
      "."
    )
    .filter(
      Boolean
    )
    .reduce(
      (
        current,
        part
      ) => {
        if (
          current ===
            undefined ||

          current ===
            null
        ) {
          return undefined;
        }


        return current[
          part
        ];
      },

      object
    );
}


function isComparableNumber(
  value
) {
  return (
    value !==
      null &&

    value !==
      "" &&

    Number.isFinite(
      Number(
        value
      )
    )
  );
}


function deepEqual(
  left,
  right
) {
  return JSON.stringify(
    normalize(
      left
    )
  ) ===
  JSON.stringify(
    normalize(
      right
    )
  );
}


function normalize(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      normalize
    );
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(
        value
      )
        .sort()
        .map(
          key => [
            key,

            normalize(
              value[key]
            ),
          ]
        )
    );
  }


  return value;
}


function constraintError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "BoundedAutonomyConstraintError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  BoundedAutonomyConstraintService,

  evaluateConstraint,

  resolvePath,
};