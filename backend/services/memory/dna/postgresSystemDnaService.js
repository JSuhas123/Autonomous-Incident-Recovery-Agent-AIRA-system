"use strict";


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
  }


  async rebuild(
    input
  ) {
    const built =
      await this.builder
        .build(
          input
        );


    const trust =
      this.trustService
        .score({
          aggregation:
            built.aggregation,

          conflicts:
            built.conflicts,
        });


    /**
     * Trust belongs to the final DNA projection.
     */
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
}


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