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


function absolute(
  relative
) {
  return path.resolve(
    ROOT,
    relative
  );
}


function read(
  relative
) {
  const target =
    absolute(
      relative
    );

  if (
    !fs.existsSync(
      target
    )
  ) {
    throw new Error(
      `Missing file: ${relative}`
    );
  }

  return fs
    .readFileSync(
      target,
      "utf8"
    )
    .replace(
      /\r\n/g,
      "\n"
    );
}


function write(
  relative,
  source
) {
  fs.writeFileSync(
    absolute(
      relative
    ),
    source,
    "utf8"
  );

  console.log(
    `[canonical-runtime] updated ${relative}`
  );
}


function removeRequireContaining(
  source,
  modulePath
) {
  const lines =
    source.split(
      "\n"
    );

  const output = [];

  for (
    let index = 0;
    index <
      lines.length;
    index +=
      1
  ) {
    const line =
      lines[
        index
      ];

    if (
      line.includes(
        modulePath
      )
    ) {
      /*
       * Single-line declaration.
       */
      if (
        line.includes(
          "const "
        )
      ) {
        continue;
      }

      /*
       * Multiline declaration.
       *
       * Walk backwards until the opening const declaration.
       */
      while (
        output.length >
          0 &&
        !output[
          output.length -
            1
        ]
          .trim()
          .startsWith(
            "const "
          )
      ) {
        output.pop();
      }

      if (
        output.length >
        0
      ) {
        output.pop();
      }

      /*
       * Walk forward to the terminating semicolon.
       */
      while (
        index <
          lines.length -
            1 &&
        !/;\s*$/.test(
          lines[
            index
          ]
        )
      ) {
        index +=
          1;
      }

      continue;
    }

    output.push(
      line
    );
  }

  return output.join(
    "\n"
  );
}


function removeStrict(
  source
) {
  return source.replace(
    /^\s*["']use strict["'];?\s*/,
    ""
  );
}


function prepend(
  source,
  header
) {
  return (
    `"use strict";\n\n` +
    header.trim() +
    "\n\n" +
    removeStrict(
      source
    ).replace(
      /^\s+/,
      ""
    )
  );
}


function assertGone(
  file,
  source,
  values
) {
  const bad =
    values.filter(
      (
        value
      ) =>
        source.includes(
          value
        )
    );

  if (
    bad.length
  ) {
    throw new Error(
      [
        `Rewire incomplete: ${file}`,
        ...bad.map(
          (
            value
          ) =>
            `  ${value}`
        ),
      ].join(
        "\n"
      )
    );
  }
}


// ============================================================================
// MACHINE INGESTION
// ============================================================================

function machineIngestion() {
  const file =
    "routes/machineIngestionRoutes.js";

  let source =
    read(
      file
    );

  source =
    removeRequireContaining(
      source,
      "../models/Incident"
    );

  source =
    removeRequireContaining(
      source,
      "../models/AgentIntelligenceRun"
    );

  /*
   * Remove an old canonicalModels import if this script is rerun.
   */
  source =
    removeRequireContaining(
      source,
      "../persistence/operational/canonicalModels"
    );

  source =
    prepend(
      source,
      `
const {
  Incident,
  AgentIntelligenceRun,
} =
  require(
    "../persistence/operational/canonicalModels"
  );
`
    );

  assertGone(
    file,
    source,
    [
      "../models/Incident",
      "../models/AgentIntelligenceRun",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// KUBERNETES INVESTIGATION TOOL(S)
// ============================================================================

function kubernetesInvestigationTools() {
  const directory =
    absolute(
      "agents/v2/tools"
    );

  if (
    !fs.existsSync(
      directory
    )
  ) {
    return;
  }

  const candidates =
    fs
      .readdirSync(
        directory
      )
      .filter(
        (
          name
        ) =>
          /kubernetes.*investigation/i
            .test(
              name
            ) &&
          name.endsWith(
            ".js"
          )
      );

  for (
    const filename
    of candidates
  ) {
    const relative =
      path
        .join(
          "agents",
          "v2",
          "tools",
          filename
        )
        .replace(
          /\\/g,
          "/"
        );

    let source =
      read(
        relative
      );

    const targets = [
      "../../../models/KubernetesResource",
      "../../../models/KubernetesResourceRelation",

      "../../models/KubernetesResource",
      "../../models/KubernetesResourceRelation",
    ];

    const hadTarget =
      targets.some(
        (
          target
        ) =>
          source.includes(
            target
          )
      );

    if (
      !hadTarget
    ) {
      continue;
    }

    for (
      const target
      of targets
    ) {
      source =
        removeRequireContaining(
          source,
          target
        );
    }

    source =
      removeRequireContaining(
        source,
        "../../../persistence/operational/operationalModels"
      );

    source =
      prepend(
        source,
        `
const {
  KubernetesResource,
  KubernetesResourceRelation,
} =
  require(
    "../../../persistence/operational/operationalModels"
  );
`
      );

    assertGone(
      relative,
      source,
      [
        "models/KubernetesResource",
        "models/KubernetesResourceRelation",
      ]
    );

    write(
      relative,
      source
    );
  }
}


// ============================================================================
// MAIN
// ============================================================================

function main() {
  machineIngestion();

  kubernetesInvestigationTools();

  console.log(
    "[canonical-runtime] SUCCESS"
  );
}


try {
  main();
} catch (
  error
) {
  console.error(
    "[canonical-runtime] FAILED"
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(
    1
  );
}