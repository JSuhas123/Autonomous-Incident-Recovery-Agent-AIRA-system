"use strict";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isDatabaseIdentifier(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return OBJECT_ID_PATTERN.test(normalized) || UUID_PATTERN.test(normalized) || PUBLIC_ID_PATTERN.test(normalized);
}

module.exports = { isDatabaseIdentifier };
