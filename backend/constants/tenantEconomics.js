"use strict";


const ECONOMICS_REVENUE_SOURCES =
  Object.freeze({

    SUBSCRIPTION_ESTIMATE:
      "SUBSCRIPTION_ESTIMATE",

    INVOICE:
      "INVOICE",

    MIXED:
      "MIXED",
  });


const ECONOMICS_COST_SOURCES =
  Object.freeze({

    COST_LEDGER:
      "COST_LEDGER",
  });


const ECONOMICS_CALCULATION_VERSION =
  1;


/**
 * Margin is represented in basis points.
 *
 * 10000 = 100.00%
 *  7500 =  75.00%
 *     0 =   0.00%
 * -2500 = -25.00%
 *
 * Revenue = 0 produces NULL because margin is undefined.
 */
function calculateGrossMarginBasisPoints({
  revenueMinor,

  grossProfitMinor,
}) {
  const revenue =
    Number(
      revenueMinor
    );

  const grossProfit =
    Number(
      grossProfitMinor
    );


  if (
    !Number.isSafeInteger(
      revenue
    ) ||
    !Number.isSafeInteger(
      grossProfit
    )
  ) {
    const error =
      new Error(
        "Economics values must be safe integers"
      );

    error.code =
      "ECONOMICS_AMOUNT_INVALID";

    error.status =
      422;

    throw error;
  }


  if (
    revenue ===
      0
  ) {
    return null;
  }


  return Math.round(
    (
      grossProfit *
      10000
    ) /
    revenue
  );
}


function calculateGrossProfitMinor({
  revenueMinor,

  costMinor,
}) {
  const revenue =
    Number(
      revenueMinor
    );

  const cost =
    Number(
      costMinor
    );


  if (
    !Number.isSafeInteger(
      revenue
    ) ||
    !Number.isSafeInteger(
      cost
    )
  ) {
    const error =
      new Error(
        "Economics values must be safe integers"
      );

    error.code =
      "ECONOMICS_AMOUNT_INVALID";

    error.status =
      422;

    throw error;
  }


  return (
    revenue -
    cost
  );
}


module.exports = {
  ECONOMICS_REVENUE_SOURCES,

  ECONOMICS_COST_SOURCES,

  ECONOMICS_CALCULATION_VERSION,

  calculateGrossMarginBasisPoints,

  calculateGrossProfitMinor,
};