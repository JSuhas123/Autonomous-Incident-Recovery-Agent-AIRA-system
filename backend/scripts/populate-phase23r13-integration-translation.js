"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  RealityIntegrationTranslationCorpusService,
} =
  require(
    "../services/reality/realityIntegrationTranslationCorpusService"
  );


function argumentValue(
  name
) {
  const index =
    process.argv
      .indexOf(
        name
      );


  if (
    index ===
      -1 ||
    index + 1 >=
      process.argv.length
  ) {
    return null;
  }


  return process.argv[
    index + 1
  ];
}


function safeFileName(
  value
) {
  return String(
    value
  )
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-"
    )
    .toLowerCase();
}


async function main() {
  const dataRoot =
    argumentValue(
      "--data-root"
    )
    ||
    process.env
      .AIRA_DATA_ROOT;


  if (
    !dataRoot
  ) {
    throw Object.assign(
      new Error(
        "--data-root or AIRA_DATA_ROOT is required"
      ),
      {
        code:
          "AIRA_DATA_ROOT_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  const outputDirectory =
    path.resolve(
      dataRoot,

      "generated",

      "integration-translation"
    );


  fs.mkdirSync(
    outputDirectory,
    {
      recursive:
        true,
    }
  );


  const service =
    new RealityIntegrationTranslationCorpusService();


  const corpus =
    service.generateCorpus();


  for (
    const group
    of corpus.groups
  ) {
    for (
      const translation
      of group.translations
    ) {
      const filename =
        (
          safeFileName(
            translation
              .parentCaseId
          )
          +
          "--"
          +
          safeFileName(
            translation
              .provider
          )
          +
          ".json"
        );


      fs.writeFileSync(
        path.join(
          outputDirectory,
          filename
        ),

        (
          JSON.stringify(
            translation,
            null,
            2
          )
          +
          "\n"
        ),

        "utf8"
      );
    }
  }


  const manifestPath =
    path.join(
      outputDirectory,

      "phase23r13-integration-translation-manifest.json"
    );


  fs.writeFileSync(
    manifestPath,

    (
      JSON.stringify(
        corpus.manifest,
        null,
        2
      )
      +
      "\n"
    ),

    "utf8"
  );


  console.log(
    "AIRA Phase 23R.13S.2 integration translation population complete"
  );


  console.log(
    `Output: ${outputDirectory}`
  );


  console.log(
    `Scenarios: ${corpus.manifest.scenarioCount}`
  );


  console.log(
    `Translations: ${corpus.manifest.translationCount}`
  );


  console.log(
    (
      "Providers: "
      +
      corpus.manifest
        .providers
        .join(
          ", "
        )
    )
  );


  console.log(
    `Manifest: ${manifestPath}`
  );


  console.log(
    "Execution authorized: false"
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        error.code
        ||
        "PHASE23R13_INTEGRATION_TRANSLATION_FAILED",

        error.message
      );


      process.exitCode =
        1;
    }
  );