#!/usr/bin/env node
"use strict";


require(
  "dotenv"
).config();


const fs =
  require(
    "node:fs"
  );


const {
  spawnSync,
} =
  require(
    "node:child_process"
  );


const REPORT_PATH =
  "phase17-master-certification-results.txt";


const CERTIFICATION_DOC =
  "PHASE_17_CERTIFICATION.md";


const report =
  [];


const checks =
  [];


/*
 * ============================================================================
 * REPORTING
 * ============================================================================
 */

function log(
  value =
    ""
) {
  const text =
    typeof value ===
      "string"
      ? value
      : JSON.stringify(
          value,
          null,
          2
        );


  console.log(
    text
  );


  report.push(
    text
  );
}


function section(
  title
) {
  log(
    "\n" +
    "=".repeat(
      80
    )
  );

  log(
    title
  );

  log(
    "=".repeat(
      80
    )
  );
}


function check(
  name,
  passed
) {
  checks.push({
    name,
    passed:
      Boolean(
        passed
      ),
  });


  log(
    `${
      passed
        ? "✓"
        : "✗"
    } ${name}`
  );
}


/*
 * ============================================================================
 * COMMAND RUNNER
 * ============================================================================
 */

function runCommand(
  name,
  command,
  args
) {
  section(
    name
  );


  const result =
    spawnSync(
      command,
      args,
      {
        cwd:
          process.cwd(),

        encoding:
          "utf8",

        stdio:
          [
            "ignore",
            "pipe",
            "pipe",
          ],

        shell:
          process.platform ===
          "win32",
      }
    );


  if (
    result.stdout
  ) {
    log(
      result.stdout
    );
  }


  if (
    result.stderr
  ) {
    log(
      result.stderr
    );
  }


  const passed =
    result.status ===
      0;


  check(
    name,
    passed
  );


  return passed;
}


/*
 * ============================================================================
 * PHASE 17 TESTS
 * ============================================================================
 */

function runPhase17Tests() {
  return runCommand(
    "PHASE 17 COMPLETE REGRESSION",

    "npx",

    [
      "jest",

      "tests/unit/phase17ResourceGraphFoundation.test.js",

      "tests/integration/postgres/resourceRepository.test.js",

      "tests/unit/phase17ResourceStateImmutability.test.js",

      "tests/integration/postgres/resourceStateRepository.test.js",

      "tests/unit/phase17KnownGoodStateIntegrity.test.js",

      "tests/integration/postgres/knownGoodStateRepository.test.js",

      "tests/unit/phase17ResourceRelationshipIntegrity.test.js",

      "tests/integration/postgres/resourceRelationshipRepository.test.js",

      "tests/unit/phase17RelationshipHistoryImmutability.test.js",

      "tests/integration/postgres/temporalRelationshipRepository.test.js",

      "tests/unit/phase17StateIngestionNormalization.test.js",

      "tests/unit/phase17TemporalTopologyQuery.test.js",

      "tests/unit/phase17IncidentTopologyReconstruction.test.js",

      "tests/unit/phase17KnownGoodComparison.test.js",

      "tests/unit/phase17ChangeCorrelation.test.js",

      "tests/unit/phase17AgentResourceContext.test.js",

      "tests/unit/phase17ResourceGraphSystemDna.test.js",

      "--runInBand",

      "--forceExit",
    ]
  );
}


/*
 * ============================================================================
 * PHASE 16 REGRESSION
 * ============================================================================
 */

function runPhase16SystemDnaRegression() {
  return runCommand(
    "PHASE 16 SYSTEM DNA REGRESSION",

    "npx",

    [
      "jest",

      "tests/unit/phase16SystemDnaContract.test.js",

      "tests/unit/phase16SystemDnaAggregation.test.js",

      "tests/unit/phase16SystemDnaPersistence.test.js",

      "--runInBand",

      "--forceExit",
    ]
  );
}


/*
 * ============================================================================
 * LIVE POSTGRES CERTIFICATION
 * ============================================================================
 */

function runLiveCertification() {
  return runCommand(
    "PHASE 17 LIVE POSTGRESQL CERTIFICATION",

    "node",

    [
      "certify-phase17-live.js",
    ]
  );
}


/*
 * ============================================================================
 * CERTIFICATION DOCUMENT
 * ============================================================================
 */

function writeCertificationDocument(
  success
) {
  const date =
    new Date()
      .toISOString();


  const content =
`# AIRA Phase 17 Certification

## Status

**${success ? "CERTIFIED" : "NOT CERTIFIED"}**

Certification generated:

\`${date}\`

---

## Phase

**Phase 17 — Known-Good State + Temporal Resource Graph**

---

## Certified Architecture

Phase 17 establishes PostgreSQL as the authoritative Resource Graph.

The certified architecture includes:

- domain-neutral Resource identity;
- ResourceType and Capability contracts;
- immutable ResourceState history;
- evidence-backed Known-Good State;
- directed Resource relationships;
- immutable Relationship History;
- immutable Graph Change Events;
- provider normalization;
- temporal topology reconstruction;
- incident-time topology reconstruction;
- Known-Good comparison;
- change correlation;
- Agent Resource Context;
- Resource Graph evidence contribution to System DNA.

---

## Authority Boundaries

### Resource Graph

Resource Graph is the canonical authority for:

- Resource identity;
- Resource state history;
- Resource relationships;
- temporal topology;
- Known-Good State;
- infrastructure change evidence.

### System DNA

System DNA remains derived operational identity.

Resource Graph evidence may influence the System DNA fingerprint and derived traits, but System DNA does not replace PostgreSQL Resource Graph truth.

### Operational Memory

Phase 16 memory remains authoritative learned operational history.

Resource Graph evidence is not counted as a memory record and does not silently increase memory trust.

---

## Safety Invariants

Phase 17 certification requires:

1. Resource state is evidence, not authorization.
2. Known-Good State is evidence, not authorization.
3. Relationship changes are evidence, not proof of causation.
4. Change correlation is not proof of root cause.
5. Capability does not imply authorization.
6. Resource Graph cannot bypass policy.
7. Resource Graph cannot authorize execution.
8. System DNA graph evidence cannot authorize execution.
9. Immutable historical ResourceState must not be overwritten.
10. Immutable temporal relationship evidence must not be overwritten.
11. PostgreSQL remains canonical.
12. Future graph projections must remain secondary unless the architecture is explicitly changed.

---

## Phase Status

- 17.0 Resource Graph architecture contract — complete
- 17.1 PostgreSQL canonical topology schema — complete
- 17.2 ResourceType + Capability contracts — complete
- 17.3 Resource repository — complete
- 17.4 Resource state snapshots — complete
- 17.5 Known-Good State — complete
- 17.6 Relationships — complete
- 17.7 Relationship History / temporal graph — complete
- 17.8 State ingestion + normalization — complete
- 17.9 Temporal topology query engine — complete
- 17.10 Incident-time topology reconstruction — complete
- 17.11 Known-Good comparison/diff engine — complete
- 17.12 Change correlation — complete
- 17.13 Agent Resource Context — complete
- 17.14 Resource Graph ↔ System DNA integration — complete
- 17.15 Live + master certification — ${success ? "complete" : "failed"}

---

## Certification Evidence

The master certification executes:

1. Complete Phase 17 Jest regression.
2. Phase 16 System DNA regression.
3. Real PostgreSQL Phase 17 live certification.

The live certification verifies:

- canonical PostgreSQL Resource Graph tables;
- RLS and FORCE RLS;
- real Resource fixtures;
- immutable ResourceState history;
- Known-Good State;
- temporal relationship reconstruction;
- incident-time topology;
- Known-Good diff;
- change correlation;
- Agent Resource Context;
- Resource Graph → System DNA evidence;
- System DNA authority boundary;
- ResourceState UPDATE rejection;
- ResourceState DELETE rejection;
- Relationship History mutation rejection;
- Graph Change Event mutation rejection;
- no execution authorization from Resource Graph evidence.

Cross-scope isolation is live-tested only when another organization/environment exists in the local database. If no alternate scope exists, the live script explicitly reports that test as skipped rather than claiming it was performed.

---

## Final Result

**${success ? "PHASE 17 CERTIFIED." : "PHASE 17 CERTIFICATION FAILED."}**
`;


  fs.writeFileSync(
    CERTIFICATION_DOC,

    content,

    "utf8"
  );
}


/*
 * ============================================================================
 * MAIN
 * ============================================================================
 */

function main() {
  section(
    "AIRA PHASE 17 MASTER CERTIFICATION"
  );


  const phase17 =
    runPhase17Tests();


  const phase16 =
    runPhase16SystemDnaRegression();


  const live =
    runLiveCertification();


  section(
    "MASTER CERTIFICATION SUMMARY"
  );


  check(
    "Phase 17 regression passed",
    phase17
  );


  check(
    "Phase 16 System DNA regression passed",
    phase16
  );


  check(
    "Live PostgreSQL certification passed",
    live
  );


  const success =
    phase17 &&
    phase16 &&
    live;


  log(
    ""
  );


  log(
    success
      ? "AIRA PHASE 17 MASTER CERTIFICATION: PASS"
      : "AIRA PHASE 17 MASTER CERTIFICATION: FAIL"
  );


  fs.writeFileSync(
    REPORT_PATH,

    report.join(
      "\n"
    ) +
      "\n",

    "utf8"
  );


  writeCertificationDocument(
    success
  );


  process.exitCode =
    success
      ? 0
      : 1;
}


main();