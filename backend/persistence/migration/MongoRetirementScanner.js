"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

class MongoRetirementScanner {
  constructor(
    options = {}
  ) {
    this.root =
      path.resolve(
        options.root ||
        process.cwd()
      );

    this.runtimeRoots =
      options.runtimeRoots || [
        "controllers",
        "routes",
        "services",
        "workers",
        "middleware",
      ];

    this.runtimeFiles =
      options.runtimeFiles || [
        "server.js",
        "app.js",
      ];
  }

  scan() {
    const files =
      this.collectRuntimeFiles();

    const findings = [];

    for (
      const file
      of files
    ) {
      const content =
        fs.readFileSync(
          file,
          "utf8"
        );

      const relativePath =
        path
          .relative(
            this.root,
            file
          )
          .replace(
            /\\/g,
            "/"
          );

      const fileFindings =
        this.scanFile(
          relativePath,
          content
        );

      findings.push(
        ...fileFindings
      );
    }

    const directModelImports =
      findings.filter(
        finding =>
          finding.type ===
          "DIRECT_MODEL_IMPORT"
      );

    const mongooseRuntimeImports =
      findings.filter(
        finding =>
          finding.type ===
          "MONGOOSE_RUNTIME_IMPORT"
      );

    const mongooseConnections =
      findings.filter(
        finding =>
          finding.type ===
          "MONGOOSE_CONNECTION"
      );

    const directModelFiles =
      unique(
        directModelImports.map(
          finding =>
            finding.file
        )
      );

    const mongooseRuntimeFiles =
      unique(
        mongooseRuntimeImports.map(
          finding =>
            finding.file
        )
      );

    const mongooseConnectionFiles =
      unique(
        mongooseConnections.map(
          finding =>
            finding.file
        )
      );

    return {
      ready:
        directModelImports.length ===
          0 &&
        mongooseRuntimeImports.length ===
          0 &&
        mongooseConnections.length ===
          0,

      summary: {
        scannedFiles:
          files.length,

        directModelImports:
          directModelImports.length,

        directModelFiles:
          directModelFiles.length,

        mongooseRuntimeImports:
          mongooseRuntimeImports.length,

        mongooseRuntimeFiles:
          mongooseRuntimeFiles.length,

        mongooseConnections:
          mongooseConnections.length,

        mongooseConnectionFiles:
          mongooseConnectionFiles.length,

        totalBlockers:
          findings.length,
      },

      files: {
        directModelFiles,

        mongooseRuntimeFiles,

        mongooseConnectionFiles,
      },

      findings,
    };
  }

  collectRuntimeFiles() {
    const output = [];

    for (
      const rootName
      of this.runtimeRoots
    ) {
      const absoluteRoot =
        path.join(
          this.root,
          rootName
        );

      if (
        !fs.existsSync(
          absoluteRoot
        )
      ) {
        continue;
      }

      this.walk(
        absoluteRoot,
        output
      );
    }

    for (
      const fileName
      of this.runtimeFiles
    ) {
      const absoluteFile =
        path.join(
          this.root,
          fileName
        );

      if (
        fs.existsSync(
          absoluteFile
        ) &&
        fs.statSync(
          absoluteFile
        ).isFile()
      ) {
        output.push(
          absoluteFile
        );
      }
    }

    return unique(
      output
    ).sort();
  }

  walk(
    directory,
    output
  ) {
    const entries =
      fs.readdirSync(
        directory,
        {
          withFileTypes:
            true,
        }
      );

    for (
      const entry
      of entries
    ) {
      const absolute =
        path.join(
          directory,
          entry.name
        );

      if (
        entry.isDirectory()
      ) {
        if (
          this.shouldSkipDirectory(
            entry.name
          )
        ) {
          continue;
        }

        this.walk(
          absolute,
          output
        );

        continue;
      }

      if (
        !entry.isFile() ||
        !entry.name.endsWith(
          ".js"
        )
      ) {
        continue;
      }

      if (
        this.shouldSkipFile(
          entry.name
        )
      ) {
        continue;
      }

      output.push(
        absolute
      );
    }
  }

  shouldSkipDirectory(
    name
  ) {
    return [
      "__tests__",
      "node_modules",
      "coverage",
      "dist",
      "build",
    ].includes(
      name
    );
  }

  shouldSkipFile(
    name
  ) {
    return (
      name.endsWith(
        ".test.js"
      ) ||
      name.endsWith(
        ".spec.js"
      )
    );
  }

  scanFile(
    file,
    content
  ) {
    const findings = [];

    /*
     * ----------------------------------------------------------------------
     * DIRECT DOMAIN-MODEL IMPORTS
     * ----------------------------------------------------------------------
     *
     * Examples:
     *
     * require("../../models/Incident")
     * require("../models/User")
     * require("./models/Signal")
     */
    const modelImportRegex =
      /require\s*\(\s*["'][^"']*models\/[^"']+["']\s*\)/g;

    for (
      const match
      of content.matchAll(
        modelImportRegex
      )
    ) {
      findings.push({
        type:
          "DIRECT_MODEL_IMPORT",

        file,

        line:
          lineNumberAt(
            content,
            match.index
          ),

        expression:
          compact(
            match[0]
          ),
      });
    }

    /*
     * ----------------------------------------------------------------------
     * MONGOOSE RUNTIME DEPENDENCY
     * ----------------------------------------------------------------------
     */
    const mongooseImportRegex =
      /require\s*\(\s*["']mongoose["']\s*\)/g;

    for (
      const match
      of content.matchAll(
        mongooseImportRegex
      )
    ) {
      findings.push({
        type:
          "MONGOOSE_RUNTIME_IMPORT",

        file,

        line:
          lineNumberAt(
            content,
            match.index
          ),

        expression:
          compact(
            match[0]
          ),
      });
    }

    /*
     * ----------------------------------------------------------------------
     * EXPLICIT MONGOOSE CONNECTION
     * ----------------------------------------------------------------------
     */
    const connectionPatterns = [
      /mongoose\s*\.\s*connect\s*\(/g,
      /mongoose\s*\.\s*disconnect\s*\(/g,
      /mongoose\s*\.\s*connection\b/g,
    ];

    for (
      const pattern
      of connectionPatterns
    ) {
      for (
        const match
        of content.matchAll(
          pattern
        )
      ) {
        findings.push({
          type:
            "MONGOOSE_CONNECTION",

          file,

          line:
            lineNumberAt(
              content,
              match.index
            ),

          expression:
            compact(
              match[0]
            ),
        });
      }
    }

    return dedupeFindings(
      findings
    );
  }
}

function lineNumberAt(
  content,
  index
) {
  return (
    content
      .slice(
        0,
        index
      )
      .split(
        "\n"
      )
      .length
  );
}

function compact(
  value
) {
  return String(
    value
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function unique(
  values
) {
  return [
    ...new Set(
      values
    ),
  ];
}

function dedupeFindings(
  findings
) {
  const seen =
    new Set();

  return findings.filter(
    finding => {
      const key =
        [
          finding.type,
          finding.file,
          finding.line,
          finding.expression,
        ]
          .join(
            "::"
          );

      if (
        seen.has(
          key
        )
      ) {
        return false;
      }

      seen.add(
        key
      );

      return true;
    }
  );
}

module.exports =
  MongoRetirementScanner;