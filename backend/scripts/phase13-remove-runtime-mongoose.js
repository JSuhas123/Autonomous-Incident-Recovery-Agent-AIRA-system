const fs = require("node:fs");

function update(
  file,
  transform
) {
  let source =
    fs.readFileSync(
      file,
      "utf8"
    );

  const before =
    source;

  source =
    transform(
      source
    );

  if (
    source === before
  ) {
    throw new Error(
      `No changes made to ${file}`
    );
  }

  fs.writeFileSync(
    file,
    source,
    "utf8"
  );

  console.log(
    `[updated] ${file}`
  );
}


update(
  "services/diagnosis/investigationContextService.js",
  (source) => {
    source =
      source.replace(
        /const\s+mongoose\s*=\s*require\s*\(\s*["']mongoose["']\s*\)\s*;?/,
        `const {\n  isLegacyObjectId,\n} = require(\n  "../../persistence/operational/identifierCompat"\n);`
      );

    source =
      source.replace(
        /mongoose\.Types\.ObjectId\s*\.isValid\s*\(/g,
        "isLegacyObjectId("
      );

    return source;
  }
);


update(
  "services/signals/signalEnrichmentService.js",
  (source) => {
    source =
      source.replace(
        /const\s+mongoose\s*=\s*require\s*\(\s*["']mongoose["']\s*\)\s*;?/,
        `const {\n  isLegacyObjectId,\n} = require(\n  "../../persistence/operational/identifierCompat"\n);`
      );

    source =
      source.replace(
        /mongoose\.Types\.ObjectId\s*\.isValid\s*\(/g,
        "isLegacyObjectId("
      );

    return source;
  }
);

console.log(
  "[phase13] Mongoose identifier dependency removed"
);
