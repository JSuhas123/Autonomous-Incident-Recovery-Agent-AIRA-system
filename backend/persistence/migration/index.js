"use strict";

const MigrationDomainRegistry =
  require(
    "./MigrationDomainRegistry"
  );

const MigrationStateStore =
  require(
    "./MigrationStateStore"
  );

const MigrationCheckpointStore =
  require(
    "./MigrationCheckpointStore"
  );

const MigrationCutoverPolicy =
  require(
    "./MigrationCutoverPolicy"
  );

const MongoBackfillModelRegistry =
  require(
    "./MongoBackfillModelRegistry"
  );

const MongoBackfillSource =
  require(
    "./MongoBackfillSource"
  );

const BackfillDocumentNormalizer =
  require(
    "./BackfillDocumentNormalizer"
  );

const BackfillIdentityBootstrapper =
  require(
    "./BackfillIdentityBootstrapper"
  );

const DomainBackfillAdapterRegistry =
  require(
    "./DomainBackfillAdapterRegistry"
  );

const MigrationLock =
  require(
    "./MigrationLock"
  );

const BackfillRunner =
  require(
    "./BackfillRunner"
  );

const BackfillReplayGuard =
  require(
    "./BackfillReplayGuard"
  );

const VerificationCanonicalizer =
  require(
    "./VerificationCanonicalizer"
  );

const VerificationReport =
  require(
    "./VerificationReport"
  );

const MigrationVerificationStore =
  require(
    "./MigrationVerificationStore"
  );

const DomainVerificationAdapterRegistry =
  require(
    "./DomainVerificationAdapterRegistry"
  );

const MigrationVerifier =
  require(
    "./MigrationVerifier"
  );

module.exports = {
  MigrationDomainRegistry,
  MigrationStateStore,
  MigrationCheckpointStore,
  MigrationCutoverPolicy,

  MongoBackfillModelRegistry,
  MongoBackfillSource,
  BackfillDocumentNormalizer,

  BackfillIdentityBootstrapper,
  DomainBackfillAdapterRegistry,

  MigrationLock,
  BackfillRunner,
  BackfillReplayGuard,

  VerificationCanonicalizer,
  VerificationReport,
  MigrationVerificationStore,
  DomainVerificationAdapterRegistry,
  MigrationVerifier,
};