"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const ROOT =
  process.cwd();


const TARGETS = [
  {
    file:
      "services/core/actionEffectivenessService.js",

    replacement:
      "../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/core/executionModesService.js",

    replacement:
      "../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/core/reportingService.js",

    replacement:
      "../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/core/confidence/confidenceCalibrationService.js",

    replacement:
      "../../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/core/confidence/confidenceHistoryService.js",

    replacement:
      "../../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/core/policy/policyRollbackService.js",

    replacement:
      "../../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/integrations/slackService.js",

    replacement:
      "../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/integrations/opentelemetryIngestionService.js",

    replacement:
      "../../persistence/operational/mongooseCompat",
  },

  {
    file:
      "services/integrations/webhookIngestionService.js",

    replacement:
      "../../persistence/operational/mongooseCompat",
  },
];


function absolute(
  file
) {
  return path.resolve(
    ROOT,
    file
  );
}


function rewrite(
  target
) {
  const filename =
    absolute(
      target.file
    );

  if (
    !fs.existsSync(
      filename
    )
  ) {
    console.log(
      `[inline-mongoose] skip missing ${target.file}`
    );

    return;
  }

  let source =
    fs.readFileSync(
      filename,
      "utf8"
    );


  const before =
    source;


  /*
   * Single-line:
   *
   * const mongoose = require("mongoose");
   * const mongoose = require('mongoose');
   */
  source =
    source.replace(
      /require\s*\(\s*["']mongoose["']\s*\)/g,
      `require("${target.replacement}")`
    );


  /*
   * Multiline:
   *
   * const mongoose =
   *   require(
   *     "mongoose"
   *   );
   */
  source =
    source.replace(
      /require\s*\(\s*\r?\n\s*["']mongoose["']\s*\r?\n\s*\)/g,
      `require("${target.replacement}")`
    );


  if (
    source ===
    before
  ) {
    console.log(
      `[inline-mongoose] no mongoose import found in ${target.file}`
    );

    return;
  }


  if (
    /require\s*\(\s*["']mongoose["']\s*\)/
      .test(
        source
      )
  ) {
    throw new Error(
      `mongoose import still remains: ${target.file}`
    );
  }


  fs.writeFileSync(
    filename,
    source,
    "utf8"
  );


  console.log(
    `[inline-mongoose] updated ${target.file}`
  );
}


try {
  for (
    const target
    of TARGETS
  ) {
    rewrite(
      target
    );
  }


  console.log(
    "[inline-mongoose] SUCCESS"
  );
} catch (
  error
) {
  console.error(
    "[inline-mongoose] FAILED"
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(
    1
  );
}