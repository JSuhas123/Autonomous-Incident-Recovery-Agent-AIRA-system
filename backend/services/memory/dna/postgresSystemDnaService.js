"use strict";

const crypto =
  require(
    "node:crypto"
  );


const {
  scopedSystemDnaService,
} =
  require(
    "./scopedSystemDnaService"
  );


const {
  systemDnaTrustService,
} =
  require(
    "./systemDnaTrustService"
  );


const {
  systemDnaSnapshotService,
} =
  require(
    "./systemDnaSnapshotService"
  );


const PostgresSystemDnaRepository =
  require(
    "../../../persistence/postgres/PostgresSystemDnaRepository"
  );


/*
 * ============================================================================
 * POSTGRES SYSTEM DNA SERVICE
 * ============================================================================
 *
 * Phase 16 remains authoritative for System DNA synthesis from memory.
 *
 * Phase 17.14 adds OPTIONAL evidence contributors.
 *
 * Existing callers using:
 *
 *   postgresSystemDnaService
 *   rebuildSystemDna()
 *
 * continue to behave exactly as before because the default contributor list
 * is empty.
 *
 * Graph-aware integration explicitly constructs this service with a
 * ResourceGraphSystemDnaContributor.
 * ============================================================================
 */

class PostgresSystemDnaService {

  constructor(
    options =
      {}
  ) {
    this.builder =
      options.builder ||
      scopedSystemDnaService;

    this.trustService =
      options.trustService ||
      systemDnaTrustService;

    this.snapshotService =
      options.snapshotService ||
      systemDnaSnapshotService;

    this.repository =
      options.repository ||
      new PostgresSystemDnaRepository(
        options
      );


    this.evidenceContributors =
      Array.isArray(
        options.evidenceContributors
      )
        ? options
            .evidenceContributors
            .filter(
              Boolean
            )
        : [];
  }


  async rebuild(
    input
  ) {
    const built =
      await this.builder
        .build(
          input
        );


    /*
     * ------------------------------------------------------------------------
     * PHASE 17.14 OPTIONAL DERIVED EVIDENCE
     * ------------------------------------------------------------------------
     *
     * Memory remains System DNA's learned-history authority.
     *
     * Resource Graph contributors provide structural/temporal evidence only.
     */
    const contributions =
      await this.collectEvidenceContributions({
        input,

        built,
      });


    if (
      contributions.length >
      0
    ) {
      this.applyEvidenceContributions({
        built,

        contributions,
      });
    }


    /*
     * Trust remains based on authoritative Phase 16 memory aggregation.
     *
     * Resource Graph evidence does NOT silently inflate memory trust.
     */
    const trust =
      this.trustService
        .score({
          aggregation:
            built.aggregation,

          conflicts:
            built.conflicts,
        });


    built.dna.trustScore =
      trust.score;


    built.dna.metadata = {
      ...(
        built.dna.metadata ||
        {}
      ),

      trustComponents:
        trust.components,

      provenanceEvidenceCount:
        trust
          .provenance
          .evidenceCount,

      resourceGraphContributionCount:
        contributions.length,

      executionAuthorized:
        false,
    };


    const previous =
      await this.repository
        .findActive({
          organizationId:
            input.organizationId,

          scopeType:
            built.dna.scopeType,

          environmentPublicId:
            built.dna
              .environmentPublicId,

          serviceId:
            built.dna
              .servicePublicId ||
            built.dna
              .serviceId,

          resourceId:
            built.dna
              .resourcePublicId ||
            built.dna
              .resourceId,
        });


    const comparison =
      this.snapshotService
        .compare({
          previous:
            previous
              ? {
                  fingerprint:
                    previous
                      .fingerprint,
                }
              : null,

          current:
            built.dna,
        });


    if (
      !comparison.changed
    ) {
      return {
        created:
          false,

        duplicate:
          true,

        snapshot:
          previous,

        dna:
          built.dna,

        trust,

        comparison,

        contributions,

        safety: {
          executionAuthorized:
            false,

          evidenceOnly:
            true,
        },
      };
    }


    if (
      previous
    ) {
      await this.repository
        .supersedeActive({
          organizationId:
            input.organizationId,

          scopeType:
            built.dna.scopeType,

          environmentPublicId:
            built.dna
              .environmentPublicId,

          serviceId:
            built.dna
              .servicePublicId ||
            built.dna
              .serviceId,

          resourceId:
            built.dna
              .resourcePublicId ||
            built.dna
              .resourceId,
        });
    }


    const snapshot =
      await this.repository
        .createSnapshot({
          organizationId:
            input.organizationId,

          dna:
            built.dna,

          trust,
        });


    return {
      created:
        true,

      duplicate:
        false,

      snapshot,

      dna:
        built.dna,

      trust,

      comparison,

      conflicts:
        built.conflicts,

      contributions,

      safety: {
        executionAuthorized:
          false,

        evidenceOnly:
          true,

        requiresPolicyEvaluation:
          true,

        requiresAuthorization:
          true,
      },
    };
  }


  /*
   * ==========================================================================
   * CONTRIBUTOR COLLECTION
   * ==========================================================================
   */

  async collectEvidenceContributions({
    input,
    built,
  }) {
    const contributions =
      [];


    for (
      const contributor
      of this.evidenceContributors
    ) {
      if (
        !contributor ||
        typeof contributor
          .contribute !==
        "function"
      ) {
        continue;
      }


      const contribution =
        await contributor
          .contribute({
            input,

            built,
          });


      if (
        !contribution
      ) {
        continue;
      }


      assertSafeContribution(
        contribution
      );


      contributions.push(
        contribution
      );
    }


    return contributions;
  }


  /*
   * ==========================================================================
   * CONTRIBUTION APPLICATION
   * ==========================================================================
   *
   * Important:
   *
   * - evidenceMemoryIds stays memory-only.
   * - evidenceCount stays memory-only.
   * - trust remains memory-derived.
   *
   * Graph evidence receives separate provenance metadata.
   *
   * The final DNA fingerprint is extended using contributor fingerprints so
   * topology/state evidence changes can generate a new DNA snapshot.
   * ==========================================================================
   */

  applyEvidenceContributions({
    built,
    contributions,
  }) {
    const originalFingerprint =
      built.dna.fingerprint;


    const contributorFingerprints =
      contributions
        .map(
          (contribution) => ({
            contributor:
              contribution.contributor,

            version:
              contribution.version ||
              null,

            fingerprint:
              contribution.fingerprint,
          })
        )
        .sort(
          (
            left,
            right
          ) =>
            String(
              left.contributor
            ).localeCompare(
              String(
                right.contributor
              )
            )
        );


    built.dna.fingerprint =
      createCombinedFingerprint({
        memoryFingerprint:
          originalFingerprint,

        contributorFingerprints,
      });


    /*
     * Append derived traits without modifying Phase 16 memory evidence.
     */
    const contributedTraits =
      contributions
        .flatMap(
          (contribution) =>
            Array.isArray(
              contribution.traits
            )
              ? contribution.traits
              : []
        );


    built.dna.traits =
      mergeTraits(
        built.dna.traits,
        contributedTraits
      );


    built.dna.metadata = {
      ...(
        built.dna.metadata ||
        {}
      ),

      baseMemoryFingerprint:
        originalFingerprint,

      combinedEvidenceFingerprint:
        built.dna.fingerprint,

      evidenceAuthorities: [
        "OPERATIONAL_MEMORY",
        ...new Set(
          contributions.map(
            (contribution) =>
              contribution.contributor
          )
        ),
      ],

      resourceGraphEvidence:
        contributions
          .filter(
            (contribution) =>
              contribution.contributor ===
              "RESOURCE_GRAPH"
          )
          .map(
            (contribution) =>
              contribution.evidence
          ),

      derivedEvidenceContributors:
        contributorFingerprints,

      resourceGraphCanonical:
        false,

      systemDnaDerived:
        true,

      executionAuthorized:
        false,
    };
  }
}


/*
 * ============================================================================
 * SAFETY
 * ============================================================================
 */

function assertSafeContribution(
  contribution
) {
  const unsafe =
    contribution
      ?.safety
      ?.evidenceOnly !==
      true ||
    contribution
      ?.safety
      ?.executionAuthorized !==
      false ||
    contribution
      ?.safety
      ?.grantsExecutionPermission !==
      false ||
    contribution
      ?.safety
      ?.bypassesPolicy !==
      false;


  if (
    unsafe
  ) {
    const error =
      new Error(
        "System DNA evidence contributor violated safety boundary"
      );

    error.code =
      "SYSTEM_DNA_CONTRIBUTOR_SAFETY_VIOLATION";

    error.status =
      500;

    throw error;
  }
}


/*
 * ============================================================================
 * FINGERPRINT
 * ============================================================================
 */

function createCombinedFingerprint({
  memoryFingerprint,
  contributorFingerprints,
}) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify({
        version:
          "17.14.v1",

        memoryFingerprint,

        contributors:
          contributorFingerprints,
      })
    )
    .digest(
      "hex"
    );
}


/*
 * ============================================================================
 * TRAIT MERGE
 * ============================================================================
 */

function mergeTraits(
  existing =
    [],
  contributed =
    []
) {
  const result = [];

  const seen =
    new Set();


  for (
    const trait
    of [
      ...(
        Array.isArray(
          existing
        )
          ? existing
          : []
      ),

      ...(
        Array.isArray(
          contributed
        )
          ? contributed
          : []
      ),
    ]
  ) {
    if (
      !trait ||
      typeof trait !==
        "object"
    ) {
      continue;
    }


    const identity =
      JSON.stringify(
        trait
      );


    if (
      seen.has(
        identity
      )
    ) {
      continue;
    }


    seen.add(
      identity
    );

    result.push(
      trait
    );
  }


  return result;
}


/*
 * ============================================================================
 * DEFAULT PHASE 16 SERVICE
 * ============================================================================
 *
 * IMPORTANT:
 *
 * Default singleton intentionally has NO Resource Graph contributor.
 *
 * This preserves all certified Phase 16 behavior.
 * ============================================================================
 */

const postgresSystemDnaService =
  new PostgresSystemDnaService();


module.exports = {
  PostgresSystemDnaService,

  postgresSystemDnaService,

  rebuildSystemDna:
    postgresSystemDnaService
      .rebuild
      .bind(
        postgresSystemDnaService
      ),
};