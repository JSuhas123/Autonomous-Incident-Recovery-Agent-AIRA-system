"use strict";


const CREDIT_STATUS =
  Object.freeze({

    ACTIVE:
      "ACTIVE",

    EXPIRED:
      "EXPIRED",

    REVOKED:
      "REVOKED",
  });


const DISCOUNT_TYPES =
  Object.freeze({

    FIXED:
      "FIXED",

    PERCENTAGE:
      "PERCENTAGE",
  });


const DISCOUNT_STATUS =
  Object.freeze({

    ACTIVE:
      "ACTIVE",

    EXPIRED:
      "EXPIRED",

    REVOKED:
      "REVOKED",
  });


const FINANCIAL_ADJUSTMENT_TYPES =
  Object.freeze({

    CREDIT:
      "CREDIT",

    DEBIT:
      "DEBIT",
  });


const FINANCIAL_ADJUSTMENT_STATUS =
  Object.freeze({

    PENDING:
      "PENDING",

    APPLIED:
      "APPLIED",

    VOID:
      "VOID",
  });


const FINANCIAL_APPLICATION_TYPES =
  Object.freeze({

    CREDIT:
      "CREDIT",

    DISCOUNT:
      "DISCOUNT",

    ADJUSTMENT_CREDIT:
      "ADJUSTMENT_CREDIT",

    ADJUSTMENT_DEBIT:
      "ADJUSTMENT_DEBIT",
  });


function calculatePercentageDiscount({
  subtotalMinor,

  percentageBasisPoints,
}) {
  const subtotal =
    Number(
      subtotalMinor
    );


  const basisPoints =
    Number(
      percentageBasisPoints
    );


  if (
    !Number.isSafeInteger(
      subtotal
    ) ||
    subtotal <
      0
  ) {
    const error =
      new Error(
        "Discount subtotal must be a non-negative safe integer"
      );

    error.code =
      "DISCOUNT_SUBTOTAL_INVALID";

    error.status =
      422;

    throw error;
  }


  if (
    !Number.isInteger(
      basisPoints
    ) ||
    basisPoints <=
      0 ||
    basisPoints >
      10000
  ) {
    const error =
      new Error(
        "Discount basis points must be between 1 and 10000"
      );

    error.code =
      "DISCOUNT_PERCENTAGE_INVALID";

    error.status =
      422;

    throw error;
  }


  return Math.floor(
    (
      subtotal *
      basisPoints
    ) /
    10000
  );
}


module.exports = {
  CREDIT_STATUS,

  DISCOUNT_TYPES,

  DISCOUNT_STATUS,

  FINANCIAL_ADJUSTMENT_TYPES,

  FINANCIAL_ADJUSTMENT_STATUS,

  FINANCIAL_APPLICATION_TYPES,

  calculatePercentageDiscount,
};