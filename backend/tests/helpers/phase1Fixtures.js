"use strict";

const VALID_SERVICE = {
  name:
    "My API",

  type:
    "api",

  environment:
    "production",

  baseUrl:
    "https://api.example.com",

  description:
    "Main production API",

  tags: [
    "v2",
    "production",
  ],
};

const VALID_WEBSITE_SERVICE = {
  name:
    "My Website",

  type:
    "website",

  environment:
    "production",

  baseUrl:
    "https://example.com",
};

const VALID_MONITOR = {
  name:
    "Homepage check",

  type:
    "https",

  url:
    "https://example.com",
};

const HEALTHY_MONITOR_RESULT = {
  status:
    "healthy",

  statusCode:
    200,

  responseTimeMs:
    120,

  responseSizeBytes:
    1024,

  dnsTimeMs:
    10,

  tcpTimeMs:
    25,

  tlsTimeMs:
    50,

  firstByteTimeMs:
    80,

  sslValid:
    true,

  sslDaysRemaining:
    60,

  contentMatched:
    null,

  redirectCount:
    0,

  errorCode:
    null,

  sanitizedErrorMessage:
    null,

  checkerRegion:
    "default",
};

function monitorResult(
  overrides = {}
) {
  return {
    ...HEALTHY_MONITOR_RESULT,
    ...overrides,
  };
}

module.exports = {
  VALID_SERVICE,
  VALID_WEBSITE_SERVICE,
  VALID_MONITOR,
  HEALTHY_MONITOR_RESULT,
  monitorResult,
};