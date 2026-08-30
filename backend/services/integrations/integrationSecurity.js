"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.15
 * CENTRAL INTEGRATION SECURITY / REDACTION
 * ============================================================================
 */

const REDACTED =
  "[REDACTED]";


const OMIT =
  Symbol(
    "AIRA_INTEGRATION_SECURITY_OMIT"
  );


const SECRET_FIELDS =
  new Set([
    "password",
    "passwd",
    "pwd",

    "secret",
    "clientsecret",
    "apisecret",
    "webhooksecret",
    "signingsecret",

    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "bearertoken",

    "apikey",

    "privatekey",
    "privatekeypem",

    "credential",
    "credentials",
    "credentialvalue",
    "referencevalue",

    "authorization",
    "authorizationheader",
    "authheader",
    "proxyauthorization",

    "cookie",
    "setcookie",
  ]);


const OMIT_FIELDS =
  new Set([
    "decryptedsecret",
  ]);


function normalizeSecurityKey(
  key
) {
  return String(
    key ||
    ""
  )
    .replace(
      /[^a-z0-9]/gi,
      ""
    )
    .toLowerCase();
}


function classifySecurityField(
  key
) {
  const normalized =
    normalizeSecurityKey(
      key
    );


  if (
    OMIT_FIELDS.has(
      normalized
    )
  ) {
    return OMIT;
  }


  if (
    SECRET_FIELDS.has(
      normalized
    )
  ) {
    return REDACTED;
  }


  return null;
}


function sanitizeIntegrationValue(
  value,
  depth =
    0
) {
  if (
    depth >
    12
  ) {
    return "[MAX_DEPTH]";
  }


  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }


  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString();
  }


  if (
    Buffer.isBuffer(
      value
    )
  ) {
    return "[BUFFER_REDACTED]";
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      (
        item
      ) =>
        sanitizeIntegrationValue(
          item,
          depth +
            1
        )
    );
  }


  if (
    typeof value !==
      "object"
  ) {
    return value;
  }


  const safe =
    {};


  for (
    const [
      key,
      childValue,
    ]
    of Object.entries(
      value
    )
  ) {
    const classification =
      classifySecurityField(
        key
      );


    if (
      classification ===
      OMIT
    ) {
      continue;
    }


    if (
      classification ===
      REDACTED
    ) {
      safe[
        key
      ] =
        REDACTED;

      continue;
    }


    safe[
      key
    ] =
      sanitizeIntegrationValue(
        childValue,
        depth +
          1
      );
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        safe,
        "executionAuthorized"
      )
  ) {
    safe.executionAuthorized =
      false;
  }


  return safe;
}


function sanitizeIntegrationError(
  error
) {
  return {
    name:
      String(
        error?.name ||
        "Error"
      ),

    code:
      error?.code ||
      null,

    message:
      sanitizeErrorMessage(
        error?.message
      ),

    status:
      error?.status ||
      error?.statusCode ||
      null,

    executionAuthorized:
      false,
  };
}


function sanitizeErrorMessage(
  value
) {
  const message =
    String(
      value ||
      "Integration operation failed"
    );


  return message
    .replace(
      /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization|credential)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED]"
    )
    .slice(
      0,
      2000
    );
}


module.exports = {
  REDACTED,

  SECRET_FIELDS,

  sanitizeIntegrationValue,

  sanitizeIntegrationError,

  sanitizeErrorMessage,

  normalizeSecurityKey,
};