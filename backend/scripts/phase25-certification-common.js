"use strict";

const crypto =
  require(
    "node:crypto"
  );

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase25"
  );


function ensureArtifactDirectory() {
  fs.mkdirSync(
    ARTIFACT_DIRECTORY,
    {
      recursive:
        true,
    }
  );

  return ARTIFACT_DIRECTORY;
}


function nowStamp() {
  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
    );
}


function hashObject(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        value
      )
    )
    .digest(
      "hex"
    );
}


function assertCondition(
  condition,
  code,
  message,
  details =
    null
) {
  if (
    condition
  ) {
    return;
  }


  throw Object.assign(
    new Error(
      message
    ),
    {
      code,
      details,

      executionAuthorized:
        false,
    }
  );
}


function makeCheck(
  name,
  passed,
  details =
    null
) {
  return {
    name,

    passed:
      passed ===
      true,

    details,
  };
}


function writeArtifact(
  prefix,
  artifact
) {
  ensureArtifactDirectory();


  const payload = {
    ...artifact,

    generatedAt:
      artifact.generatedAt ||
      new Date()
        .toISOString(),

    executionAuthorized:
      false,
  };


  payload.certificationHash =
    hashObject(
      payload
    );


  const filename =
    `${prefix}-${nowStamp()}.json`;


  const filePath =
    path.join(
      ARTIFACT_DIRECTORY,
      filename
    );


  fs.writeFileSync(
    filePath,

    JSON.stringify(
      payload,
      null,
      2
    ),

    "utf8"
  );


  return {
    filename,
    filePath,
    artifact:
      payload,
  };
}


function listArtifacts(
  prefix
) {
  ensureArtifactDirectory();


  return fs
    .readdirSync(
      ARTIFACT_DIRECTORY
    )
    .filter(
      (
        name
      ) =>
        name.startsWith(
          `${prefix}-`
        ) &&
        name.endsWith(
          ".json"
        )
    )
    .sort();
}


function readLatestArtifact(
  prefix
) {
  const files =
    listArtifacts(
      prefix
    );


  if (
    files.length ===
    0
  ) {
    return null;
  }


  const filename =
    files[
      files.length -
      1
    ];


  const filePath =
    path.join(
      ARTIFACT_DIRECTORY,
      filename
    );


  return {
    filename,
    filePath,

    artifact:
      JSON.parse(
        fs.readFileSync(
          filePath,
          "utf8"
        )
      ),
  };
}


function recursivelyAssertNoAuthority(
  value,
  pathLabel =
    "root"
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return;
  }


  if (
    Array.isArray(
      value
    )
  ) {
    value.forEach(
      (
        item,
        index
      ) =>
        recursivelyAssertNoAuthority(
          item,
          `${pathLabel}[${index}]`
        )
    );

    return;
  }


  if (
    typeof value !==
    "object"
  ) {
    return;
  }


  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      key ===
      "executionAuthorized"
    ) {
      assertCondition(
        child ===
          false,

        "PHASE25_AUTHORITY_LEAK",

        `executionAuthorized must remain false at ${pathLabel}.${key}`
      );
    }


    recursivelyAssertNoAuthority(
      child,
      `${pathLabel}.${key}`
    );
  }
}


function printHeader(
  title
) {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    title
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "CAPABILITY != CERTIFICATION != AUTHORIZATION"
  );

  console.log(
    "PERSONA != PERMISSION != EXECUTION AUTHORITY"
  );

  console.log(
    "NOTIFICATION READ != ACKNOWLEDGEMENT != AUTHORIZATION"
  );

  console.log(
    "Production unrestricted autonomy: prohibited"
  );

  console.log(
    ""
  );
}


function printChecks(
  checks
) {
  for (
    const check
    of checks
  ) {
    const prefix =
      check.passed
        ? "PASS"
        : "FAIL";


    const detail =
      check.details
        ? ` — ${check.details}`
        : "";


    console.log(
      `${prefix}  ${check.name}${detail}`
    );
  }
}


module.exports = {
  ARTIFACT_DIRECTORY,

  assertCondition,
  hashObject,
  listArtifacts,
  makeCheck,
  printChecks,
  printHeader,
  readLatestArtifact,
  recursivelyAssertNoAuthority,
  writeArtifact,
};