"use strict";

const fs =
  require("fs");

const path =
  require("path");


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


function source(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}


describe(
  "Phase 18 master architecture certification",
  () => {
    test(
      "canonical knowledge schema exists",
      () => {
        expect(
          fs.existsSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0070_production_knowledge_foundation.sql"
            )
          )
        ).toBe(true);
      }
    );


    test(
      "immutable Playbook version integrity migration exists",
      () => {
        expect(
          fs.existsSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0071_playbook_version_integrity.sql"
            )
          )
        ).toBe(true);
      }
    );


    test(
      "immutable Runbook version integrity migration exists",
      () => {
        expect(
          fs.existsSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0072_runbook_version_integrity.sql"
            )
          )
        ).toBe(true);
      }
    );


    test(
      "canonical execution history migration exists",
      () => {
        expect(
          fs.existsSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0073_execution_history_foundation.sql"
            )
          )
        ).toBe(true);
      }
    );


    test(
      "execution version binding integrity migration exists",
      () => {
        expect(
          fs.existsSync(
            path.join(
              ROOT,
              "persistence/postgres/migrations/0074_execution_version_binding_integrity.sql"
            )
          )
        ).toBe(true);
      }
    );


    test(
      "AI boundary forbids operational composition",
      () => {
        const ai =
          source(
            "knowledge/strategy/AiRecoveryStrategyBoundary.js"
          );

        expect(
          ai
        ).toMatch(
          /AI_OPERATIONAL_COMPOSITION_FORBIDDEN/
        );

        expect(
          ai
        ).toMatch(
          /executionAuthorized\s*:\s*false/
        );
      }
    );


    test(
      "Playbook composition is deterministic",
      () => {
        const composer =
          source(
            "knowledge/strategy/DeterministicPlaybookComposer.js"
          );

        expect(
          composer
        ).toMatch(
          /AMBIGUOUS_RUNBOOK_VERSION/
        );

        expect(
          composer
        ).toMatch(
          /containsAiGeneratedOperations\s*:\s*false/
        );
      }
    );


    test(
      "historical effectiveness cannot authorize",
      () => {
        expect(
          source(
            "knowledge/reasoning/HistoricalEffectivenessEngine.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "Memory integration cannot authorize",
      () => {
        expect(
          source(
            "knowledge/reasoning/MemoryEvidenceAdapter.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "Resource Graph integration cannot authorize",
      () => {
        const graph =
          source(
            "knowledge/reasoning/ResourceGraphEvidenceAdapter.js"
          );

        expect(
          graph
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );

        expect(
          graph
        ).toMatch(
          /correlationIsCausation\s*:\s*false/
        );
      }
    );


    test(
      "capability evaluation cannot authorize",
      () => {
        expect(
          source(
            "knowledge/reasoning/CapabilityRequirementEngine.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "verification remains distinct from command success",
      () => {
        expect(
          source(
            "knowledge/reasoning/VerificationDefinitionEngine.js"
          )
        ).toMatch(
          /commandSuccessIsVerification\s*:\s*false/
        );
      }
    );


    test(
      "human escalation remains available",
      () => {
        expect(
          source(
            "knowledge/reasoning/EscalationDefinitionEngine.js"
          )
        ).toMatch(
          /humanEscalationAvailable\s*:\s*true/
        );
      }
    );


    test(
      "customer MongoDB support remains present",
      () => {
        expect(
          source(
            "knowledge/strategy/ProductionDomainPackPolicy.js"
          )
        ).toMatch(
          /database\.mongodb/
        );
      }
    );
  }
);