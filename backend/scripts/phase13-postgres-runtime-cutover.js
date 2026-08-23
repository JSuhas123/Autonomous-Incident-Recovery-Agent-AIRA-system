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


function rewriteServer() {
  const file =
    path.resolve(
      ROOT,
      "server.js"
    );

  let source =
    fs.readFileSync(
      file,
      "utf8"
    );


  /*
   * Remove top-level mongoose import if it still exists.
   */
  source =
    source.replace(
      /const\s+mongoose\s*=\s*require\s*\(\s*["']mongoose["']\s*\)\s*;?\s*/g,
      ""
    );


  /*
   * Compact historical form:
   *
   * await databaseOptimization.createIndexes(mongoose.connection.db);
   */
  source =
    source.replace(
      /await\s+databaseOptimization\s*\.\s*createIndexes\s*\(\s*mongoose\s*\.\s*connection\s*\.\s*db\s*\)\s*;?/g,
      "await databaseOptimization.createIndexes();"
    );


  /*
   * Multiline Phase-11 form:
   *
   * await databaseOptimization
   *   .createIndexes(
   *     mongoose
   *       .connection
   *       .db
   *   );
   */
  source =
    source.replace(
      /await\s+databaseOptimization\s*\r?\n\s*\.\s*createIndexes\s*\(\s*\r?\n\s*mongoose\s*\r?\n\s*\.\s*connection\s*\r?\n\s*\.\s*db\s*\r?\n\s*\)\s*;?/g,
      `await databaseOptimization
        .createIndexes();`
    );


  if (
    source.includes(
      "mongoose.connection.db"
    )
  ) {
    throw new Error(
      "server.js still contains mongoose.connection.db"
    );
  }


  fs.writeFileSync(
    file,
    source,
    "utf8"
  );


  console.log(
    "[postgres-runtime-cutover] server.js updated"
  );
}


try {
  rewriteServer();

  console.log(
    "[postgres-runtime-cutover] SUCCESS"
  );
} catch (
  error
) {
  console.error(
    "[postgres-runtime-cutover] FAILED"
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(
    1
  );
}