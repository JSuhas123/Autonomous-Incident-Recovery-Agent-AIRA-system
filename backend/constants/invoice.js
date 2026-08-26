"use strict";


const INVOICE_STATUS =
  Object.freeze({

    DRAFT:
      "DRAFT",

    OPEN:
      "OPEN",

    PAID:
      "PAID",

    VOID:
      "VOID",

    UNCOLLECTIBLE:
      "UNCOLLECTIBLE",
  });


const INVOICE_ITEM_TYPES =
  Object.freeze({

    SUBSCRIPTION:
      "SUBSCRIPTION",

    USAGE:
      "USAGE",

    ADJUSTMENT:
      "ADJUSTMENT",

    CREDIT:
      "CREDIT",

    DISCOUNT:
      "DISCOUNT",

    TAX:
      "TAX",
  });


const INVOICE_GENERATION_VERSION =
  1;


function calculateInvoiceTotal({
  subtotalMinor,

  discountMinor =
    0,

  creditMinor =
    0,

  taxMinor =
    0,
}) {
  const subtotal =
    Number(
      subtotalMinor
    );

  const discount =
    Number(
      discountMinor
    );

  const credit =
    Number(
      creditMinor
    );

  const tax =
    Number(
      taxMinor
    );


  const values =
    [
      subtotal,
      discount,
      credit,
      tax,
    ];


  if (
    values.some(
      (
        value
      ) =>
        !Number.isSafeInteger(
          value
        ) ||
        value <
          0
    )
  ) {
    const error =
      new Error(
        "Invoice amounts must be non-negative safe integers"
      );

    error.code =
      "INVOICE_AMOUNT_INVALID";

    error.status =
      422;

    throw error;
  }


  return Math.max(
    0,

    subtotal -
    discount -
    credit +
    tax
  );
}


module.exports = {
  INVOICE_STATUS,

  INVOICE_ITEM_TYPES,

  INVOICE_GENERATION_VERSION,

  calculateInvoiceTotal,
};