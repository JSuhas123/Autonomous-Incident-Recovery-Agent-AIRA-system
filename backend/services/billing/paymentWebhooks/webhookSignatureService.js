"use strict";

const crypto =
  require(
    "node:crypto"
  );


function createError(
  message,
  code,
  status =
    400
) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.status =
    status;

  error.executionAuthorized =
    false;

  return error;
}


function normalizeRawBody(
  rawBody
) {
  if (
    Buffer.isBuffer(
      rawBody
    )
  ) {
    return rawBody;
  }


  if (
    typeof rawBody ===
      "string"
  ) {
    return Buffer.from(
      rawBody,
      "utf8"
    );
  }


  throw createError(
    "Raw webhook body is required",
    "WEBHOOK_RAW_BODY_REQUIRED"
  );
}


function safeHexEqual(
  left,
  right
) {
  if (
    typeof left !==
      "string" ||
    typeof right !==
      "string"
  ) {
    return false;
  }


  let leftBuffer;
  let rightBuffer;


  try {
    leftBuffer =
      Buffer.from(
        left,
        "hex"
      );


    rightBuffer =
      Buffer.from(
        right,
        "hex"
      );
  } catch (
    _error
  ) {
    return false;
  }


  if (
    leftBuffer.length ===
      0 ||
    leftBuffer.length !==
      rightBuffer.length
  ) {
    return false;
  }


  return crypto
    .timingSafeEqual(
      leftBuffer,
      rightBuffer
    );
}


function verifyRazorpaySignature({
  rawBody,

  signature,

  secret =
    process.env
      .RAZORPAY_WEBHOOK_SECRET,
}) {
  if (
    !secret
  ) {
    throw createError(
      "Razorpay webhook secret is not configured",
      "RAZORPAY_WEBHOOK_SECRET_REQUIRED",
      500
    );
  }


  if (
    typeof signature !==
      "string" ||
    signature.trim().length ===
      0
  ) {
    throw createError(
      "Razorpay webhook signature is required",
      "RAZORPAY_WEBHOOK_SIGNATURE_REQUIRED"
    );
  }


  const body =
    normalizeRawBody(
      rawBody
    );


  const expected =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(
        body
      )
      .digest(
        "hex"
      );


  const valid =
    safeHexEqual(
      expected,
      signature.trim()
    );


  if (
    !valid
  ) {
    throw createError(
      "Invalid Razorpay webhook signature",
      "RAZORPAY_WEBHOOK_SIGNATURE_INVALID"
    );
  }


  return true;
}


function verifyStripeSignature({
  rawBody,

  signature,

  secret =
    process.env
      .STRIPE_WEBHOOK_SECRET,
}) {
  if (
    !secret
  ) {
    throw createError(
      "Stripe webhook secret is not configured",
      "STRIPE_WEBHOOK_SECRET_REQUIRED",
      500
    );
  }


  if (
    typeof signature !==
      "string" ||
    signature.trim().length ===
      0
  ) {
    throw createError(
      "Stripe webhook signature is required",
      "STRIPE_WEBHOOK_SIGNATURE_REQUIRED"
    );
  }


  const body =
    normalizeRawBody(
      rawBody
    );


  let Stripe;


  try {
    Stripe =
      require(
        "stripe"
      );
  } catch (
    _error
  ) {
    throw createError(
      "Stripe SDK is unavailable",
      "STRIPE_SDK_UNAVAILABLE",
      500
    );
  }


  const stripe =
    new Stripe(
      process.env
        .STRIPE_SECRET_KEY ||
      "sk_test_placeholder"
    );


  try {
    return stripe
      .webhooks
      .constructEvent(
        body,
        signature,
        secret
      );

  } catch (
    _error
  ) {
    throw createError(
      "Invalid Stripe webhook signature",
      "STRIPE_WEBHOOK_SIGNATURE_INVALID"
    );
  }
}


module.exports = {
  normalizeRawBody,

  safeHexEqual,

  verifyRazorpaySignature,

  verifyStripeSignature,
};