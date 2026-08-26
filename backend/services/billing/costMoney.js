"use strict";


function createError(
  message,
  code
) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.status =
    422;

  return error;
}


function normalizeCurrency(
  currency
) {
  const normalized =
    String(
      currency ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    ![
      "USD",
      "INR",
    ].includes(
      normalized
    )
  ) {
    throw createError(
      "Unsupported cost currency",
      "COST_CURRENCY_INVALID"
    );
  }


  return normalized;
}


/**
 * Converts a DECIMAL STRING into minor units.
 *
 * Examples:
 *
 * "1.25" USD
 *      ↓
 * 125
 *
 * "239.99" INR
 *      ↓
 * 23999
 *
 * Do not pass arbitrary floating-point results from calculations.
 * Prefer provider/API decimal strings where possible.
 */
function decimalToMinorUnits(
  value,
  currency
) {
  normalizeCurrency(
    currency
  );


  const normalized =
    String(
      value
    )
      .trim();


  if (
    !/^\d+(?:\.\d{1,2})?$/
      .test(
        normalized
      )
  ) {
    throw createError(
      "Cost amount must be a non-negative decimal with at most two decimal places",
      "COST_DECIMAL_INVALID"
    );
  }


  const [
    whole,
    fraction =
      "",
  ] =
    normalized
      .split(
        "."
      );


  const paddedFraction =
    fraction
      .padEnd(
        2,
        "0"
      );


  const minor =
    (
      BigInt(
        whole
      ) *
      100n
    ) +
    BigInt(
      paddedFraction ||
      "0"
    );


  if (
    minor >
      BigInt(
        Number
          .MAX_SAFE_INTEGER
      )
  ) {
    throw createError(
      "Cost amount exceeds safe integer range",
      "COST_AMOUNT_TOO_LARGE"
    );
  }


  return Number(
    minor
  );
}


function validateMinorUnits(
  value
) {
  const normalized =
    Number(
      value
    );


  if (
    !Number.isSafeInteger(
      normalized
    ) ||
    normalized <
      0
  ) {
    throw createError(
      "Cost amountMinor must be a non-negative safe integer",
      "COST_MINOR_AMOUNT_INVALID"
    );
  }


  return normalized;
}


module.exports = {
  normalizeCurrency,

  decimalToMinorUnits,

  validateMinorUnits,
};