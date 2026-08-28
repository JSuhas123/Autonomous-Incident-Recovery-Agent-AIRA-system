"use strict";


const RELATIONSHIP_TYPES =
  Object.freeze({

    DEPENDS_ON:
      "DEPENDS_ON",

    CONNECTS_TO:
      "CONNECTS_TO",

    RUNS_ON:
      "RUNS_ON",

    MANAGES:
      "MANAGES",

    ROUTES_TO:
      "ROUTES_TO",

    READS_FROM:
      "READS_FROM",

    WRITES_TO:
      "WRITES_TO",

    PUBLISHES_TO:
      "PUBLISHES_TO",

    CONSUMES_FROM:
      "CONSUMES_FROM",

    REPLICATES_TO:
      "REPLICATES_TO",

    BACKED_BY:
      "BACKED_BY",

    MEMBER_OF:
      "MEMBER_OF",

    HOSTED_BY:
      "HOSTED_BY",

    USES:
      "USES",

    CONTROLS:
      "CONTROLS",

    OBSERVES:
      "OBSERVES",

    USES_SENSOR:
      "USES_SENSOR",
  });


const RELATIONSHIP_TYPE_VALUES =
  Object.freeze(
    Object.values(
      RELATIONSHIP_TYPES
    )
  );


const RELATIONSHIP_TYPE_PATTERN =
  /^[A-Z][A-Z0-9_]*$/;


function isValidRelationshipType(
  value
) {
  return (
    typeof value ===
      "string" &&
    RELATIONSHIP_TYPE_PATTERN
      .test(
        value
      )
  );
}


function isKnownRelationshipType(
  value
) {
  return (
    typeof value ===
      "string" &&
    RELATIONSHIP_TYPE_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  RELATIONSHIP_TYPES,

  RELATIONSHIP_TYPE_VALUES,

  RELATIONSHIP_TYPE_PATTERN,

  isValidRelationshipType,

  isKnownRelationshipType,
};