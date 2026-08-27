"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const {
  MEMORY_TYPES,
  MEMORY_TYPE_VALUES,
  isKnownMemoryType,
} =
  require(
    "../../constants/memoryTypes"
  );


const {
  MEMORY_SCOPES,
  MEMORY_SCOPE_VALUES,
  isKnownMemoryScope,
} =
  require(
    "../../constants/memoryScopes"
  );


const {
  MEMORY_STATUSES,
  isKnownMemoryStatus,
} =
  require(
    "../../constants/memoryLifecycle"
  );


const {
  assertValidMemory,
} =
  require(
    "../../contracts/memory/memoryContract"
  );


const {
  assertValidEpisodicMemory,
} =
  require(
    "../../contracts/memory/episodicMemoryContract"
  );


const {
  assertValidSemanticMemory,
} =
  require(
    "../../contracts/memory/semanticMemoryContract"
  );


const {
  assertValidProceduralMemory,
} =
  require(
    "../../contracts/memory/proceduralMemoryContract"
  );


const {
  assertValidOutcomeMemory,
} =
  require(
    "../../contracts/memory/outcomeMemoryContract"
  );


const {
  assertValidHumanMemory,
} =
  require(
    "../../contracts/memory/humanMemoryContract"
  );


const {
  assertValidBehaviouralMemory,
} =
  require(
    "../../contracts/memory/behaviouralMemoryContract"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0060_operational_memory_foundation.sql"
  );


describe(
  "Phase 16.0-16.2 operational memory foundation",
  () => {

    test(
      "defines exactly six canonical memory types",
      () => {
        expect(
          MEMORY_TYPE_VALUES
        ).toEqual(
          expect.arrayContaining([
            "EPISODIC",
            "SEMANTIC",
            "PROCEDURAL",
            "OUTCOME",
            "HUMAN",
            "BEHAVIOURAL",
          ])
        );


        expect(
          MEMORY_TYPE_VALUES
        ).toHaveLength(
          6
        );


        expect(
          isKnownMemoryType(
            MEMORY_TYPES.EPISODIC
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "defines the System DNA memory hierarchy",
      () => {
        expect(
          MEMORY_SCOPE_VALUES
        ).toEqual(
          expect.arrayContaining([
            "GLOBAL",
            "TENANT",
            "ENVIRONMENT",
            "SERVICE",
            "RESOURCE",
            "INCIDENT",
          ])
        );


        expect(
          isKnownMemoryScope(
            MEMORY_SCOPES.RESOURCE
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "defines controlled memory lifecycle states",
      () => {
        expect(
          isKnownMemoryStatus(
            MEMORY_STATUSES.ACTIVE
          )
        ).toBe(
          true
        );


        expect(
          isKnownMemoryStatus(
            MEMORY_STATUSES.SUPERSEDED
          )
        ).toBe(
          true
        );


        expect(
          isKnownMemoryStatus(
            "DELETED_FOREVER"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "canonical contract accepts tenant memory",
      () => {
        const memory =
          assertValidMemory({
            publicId:
              "mem_test_tenant_001",

            organizationId:
              "org-test",

            memoryType:
              MEMORY_TYPES.SEMANTIC,

            scopeType:
              MEMORY_SCOPES.TENANT,

            summary:
              "Connection saturation frequently precedes latency incidents.",

            sourceType:
              "TEST",
          });


        expect(
          memory.scopeType
        ).toBe(
          MEMORY_SCOPES.TENANT
        );


        expect(
          memory.status
        ).toBe(
          MEMORY_STATUSES.ACTIVE
        );
      }
    );


    test(
      "global memory cannot contain tenant identity",
      () => {
        expect(
          () =>
            assertValidMemory({
              publicId:
                "mem_invalid_global",

              organizationId:
                "org-a",

              memoryType:
                MEMORY_TYPES.SEMANTIC,

              scopeType:
                MEMORY_SCOPES.GLOBAL,

              summary:
                "Invalid global memory.",

              sourceType:
                "TEST",
            })
        ).toThrow();
      }
    );


    test(
      "incident memory requires tenant environment and incident scope",
      () => {
        expect(
          () =>
            assertValidMemory({
              publicId:
                "mem_invalid_incident",

              organizationId:
                "org-a",

              memoryType:
                MEMORY_TYPES.EPISODIC,

              scopeType:
                MEMORY_SCOPES.INCIDENT,

              summary:
                "Missing environment and incident.",

              sourceType:
                "TEST",
            })
        ).toThrow();
      }
    );


    test(
      "typed contracts force their canonical memory type",
      () => {
        const base = {
          publicId:
            "mem_type_test",

          organizationId:
            "org-a",

          scopeType:
            MEMORY_SCOPES.TENANT,

          summary:
            "Typed memory.",

          sourceType:
            "TEST",
        };


        expect(
          assertValidEpisodicMemory({
            ...base,
            publicId:
              "mem_episode",
          }).memoryType
        ).toBe(
          MEMORY_TYPES.EPISODIC
        );


        expect(
          assertValidSemanticMemory({
            ...base,
            publicId:
              "mem_semantic",
          }).memoryType
        ).toBe(
          MEMORY_TYPES.SEMANTIC
        );


        expect(
          assertValidProceduralMemory({
            ...base,
            publicId:
              "mem_procedure",
          }).memoryType
        ).toBe(
          MEMORY_TYPES.PROCEDURAL
        );


        expect(
          assertValidOutcomeMemory({
            ...base,
            publicId:
              "mem_outcome",
          }).memoryType
        ).toBe(
          MEMORY_TYPES.OUTCOME
        );


        expect(
          assertValidHumanMemory({
            ...base,
            publicId:
              "mem_human",
          }).memoryType
        ).toBe(
          MEMORY_TYPES.HUMAN
        );


        expect(
          assertValidBehaviouralMemory({
            ...base,
            publicId:
              "mem_behaviour",
          }).memoryType
        ).toBe(
          MEMORY_TYPES.BEHAVIOURAL
        );
      }
    );


    test(
      "confidence trust and importance are bounded",
      () => {
        expect(
          () =>
            assertValidMemory({
              publicId:
                "mem_bad_confidence",

              organizationId:
                "org-a",

              memoryType:
                MEMORY_TYPES.OUTCOME,

              scopeType:
                MEMORY_SCOPES.TENANT,

              summary:
                "Invalid confidence.",

              sourceType:
                "TEST",

              confidence:
                1.5,
            })
        ).toThrow();
      }
    );


    test(
      "migration creates authoritative memory schema",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "CREATE SCHEMA IF NOT EXISTS memory"
        );


        expect(
          source
        ).toContain(
          "memory.memories"
        );


        expect(
          source
        ).toContain(
          "memory.memory_sources"
        );


        expect(
          source
        ).toContain(
          "memory.memory_relations"
        );


        expect(
          source
        ).toContain(
          "memory.memory_versions"
        );
      }
    );


    test(
      "migration freezes PostgreSQL as authoritative memory",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "PostgreSQL is the authoritative source of truth for AIRA memory"
        );


        expect(
          source
        ).toContain(
          "Qdrant is NOT authoritative"
        );
      }
    );


    test(
      "migration enforces tenant row level security",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "tenancy.current_organization_id()"
        );
      }
    );


    test(
      "migration protects environment resource and incident ownership",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "MEMORY_ORGANIZATION_ENVIRONMENT_SCOPE_MISMATCH"
        );


        expect(
          source
        ).toContain(
          "MEMORY_ORGANIZATION_RESOURCE_SCOPE_MISMATCH"
        );


        expect(
          source
        ).toContain(
          "MEMORY_ORGANIZATION_INCIDENT_SCOPE_MISMATCH"
        );
      }
    );


    test(
      "migration establishes provenance and supersession",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "supersedes_memory_id"
        );


        expect(
          source
        ).toContain(
          "evidence_role"
        );


        expect(
          source
        ).toContain(
          "CONTRADICTING"
        );


        expect(
          source
        ).toContain(
          "HUMAN_CONFIRMED"
        );
      }
    );
  }
);