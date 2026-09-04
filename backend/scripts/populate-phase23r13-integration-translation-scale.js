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
  PROVIDERS,
  DEFAULT_SCENARIOS,
  stableHash,
  RealityIntegrationTranslationCorpusService,
} =
  require(
    "../services/reality/realityIntegrationTranslationCorpusService"
  );


const SCALE_VERSION =
  "23R.13S.6.0";

const DEFAULT_TARGET =
  1000;


function argumentValue(
  name
) {
  const index =
    process.argv.indexOf(
      name
    );

  if (
    index === -1
    ||
    index + 1 >= process.argv.length
  ) {
    return null;
  }

  return process.argv[
    index + 1
  ];
}


function positiveInteger(
  value,
  fallback
) {
  if (
    value === null
    ||
    value === undefined
    ||
    value === ""
  ) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      String(
        value
      ),
      10
    );

  if (
    !Number.isInteger(
      parsed
    )
    ||
    parsed < 1
  ) {
    throw new Error(
      "target count must be a positive integer"
    );
  }

  return parsed;
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


function stableJson(
  value
) {
  return (
    JSON.stringify(
      value,
      null,
      2
    )
    +
    "\n"
  );
}


function buildScenario(
  base,
  index
) {
  const generation =
    Math.floor(
      index
      /
      DEFAULT_SCENARIOS.length
    );

  const baseIndex =
    index
    %
    DEFAULT_SCENARIOS.length;

  return {
    ...base,

    scenarioId:
      (
        `${base.scenarioId}`
        +
        `-scale-${String(generation).padStart(4, "0")}`
        +
        `-${baseIndex}`
      ),

    title:
      `${base.title} [scale ${generation}]`,

    metricValue:
      (
        Number(
          base.metricValue
          ||
          0
        )
        +
        generation
      ),

    deterministicSeed:
      23013000
      +
      index,

    transformationVersion:
      SCALE_VERSION,
  };
}


function scaleTranslation(
  translation,
  index
) {
  const core = {
    ...translation,

    populationVersion:
      SCALE_VERSION,

    transformationVersion:
      SCALE_VERSION,

    deterministicSeed:
      23130000
      +
      index,

    independentEvidence:
      false,

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };


  delete core.translationId;
  delete core.translationHash;


  const translationHash =
    stableHash(
      core
    );


  return {
    ...core,

    translationId:
      (
        "translation-"
        +
        translationHash.slice(
          0,
          24
        )
      ),

    translationHash,
  };
}


async function main() {
  const dataRoot =
    argumentValue(
      "--data-root"
    )
    ||
    process.env.AIRA_DATA_ROOT;


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


  const targetCount =
    positiveInteger(
      argumentValue(
        "--target-count"
      ),
      DEFAULT_TARGET
    );


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


  /*
   * Replace the old 28-record physical population.
   * This does not alter the frozen adapter service.
   */
  for (
    const entry
    of fs.readdirSync(
      outputDirectory,
      {
        withFileTypes:
          true,
      }
    )
  ) {
    if (
      entry.isFile()
      &&
      entry.name.endsWith(
        ".json"
      )
    ) {
      fs.unlinkSync(
        path.join(
          outputDirectory,
          entry.name
        )
      );
    }
  }


  const service =
    new RealityIntegrationTranslationCorpusService();


  const translations =
    [];

  const parentIds =
    new Set();


  let scenarioIndex =
    0;


  while (
    translations.length
    <
    targetCount
  ) {
    const base =
      DEFAULT_SCENARIOS[
        scenarioIndex
        %
        DEFAULT_SCENARIOS.length
      ];


    const canonical =
      buildScenario(
        base,
        scenarioIndex
      );


    /*
     * IMPORTANT:
     *
     * Every scaled record still passes through
     * the frozen real integration adapters.
     *
     * We are not inventing normalized payloads.
     */
    const group =
      service.generateScenario(
        canonical,
        PROVIDERS
      );


    parentIds.add(
      group.parentCaseId
    );


    for (
      const item
      of group.translations
    ) {
      if (
        translations.length
        >=
        targetCount
      ) {
        break;
      }


      translations.push(
        scaleTranslation(
          item,
          translations.length
        )
      );
    }


    scenarioIndex +=
      1;
  }


  const ids =
    new Set(
      translations.map(
        item =>
          item.translationId
      )
    );


  if (
    ids.size
    !==
    translations.length
  ) {
    throw new Error(
      "scaled translation corpus contains duplicate translationId"
    );
  }


  for (
    const translation
    of translations
  ) {
    const filename =
      (
        safeFileName(
          translation.translationId
        )
        +
        "--"
        +
        safeFileName(
          translation.provider
        )
        +
        ".json"
      );


    fs.writeFileSync(
      path.join(
        outputDirectory,
        filename
      ),

      stableJson(
        translation
      ),

      "utf8"
    );
  }


  const providerCounts =
    {};

  const providerFamilyCounts =
    {};


  for (
    const item
    of translations
  ) {
    providerCounts[
      item.provider
    ] =
      (
        providerCounts[
          item.provider
        ]
        ||
        0
      )
      +
      1;


    providerFamilyCounts[
      item.providerFamily
    ] =
      (
        providerFamilyCounts[
          item.providerFamily
        ]
        ||
        0
      )
      +
      1;
  }


  const manifestCore = {
    version:
      SCALE_VERSION,

    sourceVersion:
      "23R.13S.2.0",

    targetCount,

    scenarioCount:
      parentIds.size,

    translationCount:
      translations.length,

    providers: [
      ...PROVIDERS,
    ],

    providerFamilies: [
      ...new Set(
        translations.map(
          item =>
            item.providerFamily
        )
      ),
    ].sort(),

    providerCounts,

    providerFamilyCounts,

    transformationVersion:
      SCALE_VERSION,

    independentEvidence:
      false,

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,

    translations:
      translations.map(
        item => ({
          translationId:
            item.translationId,

          translationHash:
            item.translationHash,

          parentCaseId:
            item.parentCaseId,

          provider:
            item.provider,

          providerFamily:
            item.providerFamily,

          deterministicSeed:
            item.deterministicSeed,
        })
      ),
  };


  const manifest = {
    ...manifestCore,

    manifestHash:
      stableHash(
        manifestCore
      ),
  };


  const manifestPath =
    path.join(
      outputDirectory,

      "phase23r13-integration-translation-manifest.json"
    );


  fs.writeFileSync(
    manifestPath,

    stableJson(
      manifest
    ),

    "utf8"
  );


  console.log(
    JSON.stringify(
      {
        version:
          SCALE_VERSION,

        status:
          "PASS",

        outputDirectory,

        targetCount,

        scenarioCount:
          manifest.scenarioCount,

        translationCount:
          manifest.translationCount,

        providerCounts,

        manifestPath,

        manifestHash:
          manifest.manifestHash,

        independentEvidence:
          false,

        groundTruthAgentVisible:
          false,

        executionAuthorized:
          false,

        productionCertified:
          false,
      },
      null,
      2
    )
  );
}


main()
  .catch(
    error => {
      console.error(
        error.code
        ||
        "PHASE23R13_INTEGRATION_TRANSLATION_SCALE_FAILED",

        error.message
      );

      process.exitCode =
        1;
    }
  );