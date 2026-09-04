"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  assertGeneralizationCannotAuthorize,
} =
  require(
    "../../contracts/humanLearningGeneralization"
  );


const SECRET_KEY_PATTERN =
  /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|credential|authorization)/i;


const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;


const IPV4_PATTERN =
  /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;


const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;


const PRIVATE_DOMAIN_PATTERN =
  /\b[a-z0-9][a-z0-9.-]*\.(?:internal|local|corp|lan)\b/gi;


function canonicalize(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      canonicalize
    );
  }


  if (
    value
    &&
    typeof value ===
      "object"
  ) {
    return Object
      .keys(
        value
      )
      .sort()
      .reduce(
        (
          output,
          key
        ) => {
          output[key] =
            canonicalize(
              value[key]
            );

          return output;
        },

        {}
      );
  }


  return value;
}


function digest(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        canonicalize(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}


function escapeRegExp(
  value
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


class LearningTenantDataScrubber {
  scrub(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
      input
    );


    const tenantIdentifiers =
      Array.from(
        new Set(
          (
            Array.isArray(
              input.tenantIdentifiers
            )
              ? input.tenantIdentifiers
              : []
          )
            .filter(
              (
                value
              ) =>
                typeof value ===
                  "string"
                &&
                value.trim()
            )
            .map(
              (
                value
              ) =>
                value.trim()
            )
        )
      );


    const redactions =
      [];


    const scrubString =
      (
        value,
        path
      ) => {
        let output =
          value;


        const replace =
          (
            pattern,
            replacement,
            type
          ) => {
            output =
              output.replace(
                pattern,

                (
                  match
                ) => {
                  redactions.push({
                    path,
                    type,

                    digest:
                      digest(
                        match
                      ),
                  });


                  return replacement;
                }
              );
          };


        replace(
          EMAIL_PATTERN,

          "[REDACTED_EMAIL]",

          "EMAIL"
        );


        replace(
          IPV4_PATTERN,

          "[REDACTED_IP]",

          "IP_ADDRESS"
        );


        replace(
          UUID_PATTERN,

          "[REDACTED_UUID]",

          "UUID"
        );


        replace(
          PRIVATE_DOMAIN_PATTERN,

          "[REDACTED_PRIVATE_DOMAIN]",

          "PRIVATE_DOMAIN"
        );


        for (
          const identifier
          of tenantIdentifiers
        ) {
          const pattern =
            new RegExp(
              escapeRegExp(
                identifier
              ),

              "gi"
            );


          replace(
            pattern,

            "[REDACTED_TENANT_IDENTIFIER]",

            "TENANT_IDENTIFIER"
          );
        }


        return output;
      };


    const walk =
      (
        value,
        path =
          "$"
      ) => {
        if (
          Array.isArray(
            value
          )
        ) {
          return value.map(
            (
              child,
              index
            ) =>
              walk(
                child,

                `${path}[${index}]`
              )
          );
        }


        if (
          value
          &&
          typeof value ===
            "object"
        ) {
          const output =
            {};


          for (
            const [
              key,
              child,
            ]
            of Object.entries(
              value
            )
          ) {
            const childPath =
              `${path}.${key}`;


            if (
              SECRET_KEY_PATTERN.test(
                key
              )
            ) {
              if (
                child !==
                  null
                &&
                child !==
                  undefined
              ) {
                redactions.push({
                  path:
                    childPath,

                  type:
                    "SECRET_FIELD",

                  digest:
                    digest(
                      child
                    ),
                });
              }


              output[key] =
                "[REDACTED_SECRET]";


              continue;
            }


            output[key] =
              walk(
                child,

                childPath
              );
          }


          return output;
        }


        if (
          typeof value ===
            "string"
        ) {
          return scrubString(
            value,

            path
          );
        }


        return value;
      };


    const scrubbed =
      walk(
        input.payload ||
        {}
      );


    return {
      scrubbed,

      redactionManifest: {
        redactionCount:
          redactions.length,

        redactions,

        rawValuesRetained:
          false,
      },

      scrubbedDigest:
        digest(
          scrubbed
        ),

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningTenantDataScrubber,

  canonicalize,

  digest,
};