"use strict";

const {
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_TRUST_LEVEL,
  EVIDENCE_INTEGRITY_STATUS,
  createEvidenceItem,
  createEvidencePackage,
  verifyEvidenceIntegrity,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

describe(
  "Phase 12.4 canonical evidence contract",
  () => {
    test(
      "creates canonical provenance and integrity metadata",
      () => {
        const evidence =
          createEvidenceItem({
            id:
              "ev-1",

            type:
              EVIDENCE_TYPE
                .METRIC,

            source:
              "prometheus",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .PROMETHEUS,

            provider:
              "prometheus",

            observedAt:
              "2026-08-18T10:00:00.000Z",

            collectedAt:
              "2026-08-18T10:00:05.000Z",

            serviceId:
              "service-1",

            summary:
              "CPU exceeded threshold",

            structuredData: {
              cpu:
                97,
            },

            trustLevel:
              EVIDENCE_TRUST_LEVEL
                .SOURCE_REPORTED,

            provenance: {
              collector:
                "test-collector",

              retrievalMethod:
                "test-read",

              sourceRef:
                "Metric:1",

              canonicalStore:
                "Signal",
            },
          });

        expect(
          evidence.schemaVersion
        ).toBe(
          EVIDENCE_SCHEMA_VERSION
        );

        expect(
          evidence.canonicalRef
        ).toBe(
          "evidence:ev-1"
        );

        expect(
          evidence.provenance
            .collector
        ).toBe(
          "test-collector"
        );

        expect(
          evidence.provenance
            .sourceRef
        ).toBe(
          "Metric:1"
        );

        expect(
          evidence.trust
            .level
        ).toBe(
          EVIDENCE_TRUST_LEVEL
            .SOURCE_REPORTED
        );

        expect(
          evidence.integrity
            .algorithm
        ).toBe(
          "sha256"
        );

        expect(
          typeof evidence
            .integrity
            .contentHash
        ).toBe(
          "string"
        );

        expect(
          evidence.integrity
            .contentHash
            .length
        ).toBe(
          64
        );
      }
    );

    test(
      "verifies unchanged canonical evidence",
      () => {
        const evidence =
          createEvidenceItem({
            id:
              "ev-2",

            type:
              EVIDENCE_TYPE
                .LOG,

            source:
              "log-store",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .LOG_AGGREGATOR,

            summary:
              "Database connection timeout",

            structuredData: {
              code:
                "ETIMEDOUT",
            },
          });

        const verification =
          verifyEvidenceIntegrity(
            evidence
          );

        expect(
          verification.valid
        ).toBe(
          true
        );

        expect(
          verification.status
        ).toBe(
          EVIDENCE_INTEGRITY_STATUS
            .VERIFIED
        );
      }
    );

    test(
      "detects evidence mutation after canonicalization",
      () => {
        const evidence =
          createEvidenceItem({
            id:
              "ev-3",

            type:
              EVIDENCE_TYPE
                .METRIC,

            source:
              "prometheus",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .PROMETHEUS,

            structuredData: {
              cpu:
                92,
            },
          });

        /*
         * The top-level evidence object is frozen, so construct the shape a
         * downstream serialization/deserialization layer could accidentally
         * mutate.
         */
        const mutated = {
          ...evidence,

          structuredData: {
            cpu:
              10,
          },
        };

        const verification =
          verifyEvidenceIntegrity(
            mutated
          );

        expect(
          verification.valid
        ).toBe(
          false
        );

        expect(
          verification.status
        ).toBe(
          EVIDENCE_INTEGRITY_STATUS
            .INVALID
        );
      }
    );

    test(
      "sensitive evidence is always redacted fail closed",
      () => {
        const evidence =
          createEvidenceItem({
            id:
              "ev-4",

            type:
              EVIDENCE_TYPE
                .LOG,

            source:
              "application",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .LOG_AGGREGATOR,

            sensitive:
              true,

            structuredData: {
              password:
                "never-store-this",

              message:
                "authentication failed",
            },
          });

        expect(
          evidence.redacted
        ).toBe(
          true
        );

        expect(
          evidence.structuredData
        ).toBe(
          "[REDACTED]"
        );
      }
    );

    test(
      "credential-like keys are recursively redacted",
      () => {
        const evidence =
          createEvidenceItem({
            id:
              "ev-5",

            type:
              EVIDENCE_TYPE
                .SIGNAL,

            source:
              "integration",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .AIRA_SIGNAL_STORE,

            structuredData: {
              safe:
                "value",

              apiKey:
                "secret-api-key",

              nested: {
                authorization:
                  "Bearer hidden",

                cookie:
                  "session=hidden",
              },
            },
          });

        expect(
          evidence
            .structuredData
            .safe
        ).toBe(
          "value"
        );

        expect(
          evidence
            .structuredData
            .apiKey
        ).toBe(
          "[REDACTED]"
        );

        expect(
          evidence
            .structuredData
            .nested
            .authorization
        ).toBe(
          "[REDACTED]"
        );

        expect(
          evidence
            .structuredData
            .nested
            .cookie
        ).toBe(
          "[REDACTED]"
        );
      }
    );

    test(
      "package summarizes evidence integrity and trust",
      () => {
        const canonical =
          createEvidenceItem({
            id:
              "ev-6",

            type:
              EVIDENCE_TYPE
                .INCIDENT_EVENT,

            source:
              "incident_service",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .AIRA_INCIDENT_STORE,

            trustLevel:
              EVIDENCE_TRUST_LEVEL
                .CANONICAL,

            provenance: {
              collector:
                "test",

              sourceRef:
                "IncidentEvent:1",
            },
          });

        const external =
          createEvidenceItem({
            id:
              "ev-7",

            type:
              EVIDENCE_TYPE
                .ALERT,

            source:
              "datadog",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .DATADOG,

            trustLevel:
              EVIDENCE_TRUST_LEVEL
                .SOURCE_REPORTED,

            provenance: {
              collector:
                "test",

              sourceRef:
                "Signal:1",
            },
          });

        const packageResult =
          createEvidencePackage({
            incidentId:
              "incident-1",

            correlationId:
              "corr-1",

            items: [
              canonical,
              external,
            ],

            completeness:
              0.8,
          });

        expect(
          packageResult.itemCount
        ).toBe(
          2
        );

        expect(
          packageResult.integritySummary
            .verified
        ).toBe(
          2
        );

        expect(
          packageResult.trustSummary
            .canonical
        ).toBe(
          1
        );

        expect(
          packageResult.trustSummary
            .sourceReported
        ).toBe(
          1
        );

        expect(
          packageResult.evidenceRefs
        ).toEqual([
          "evidence:ev-6",
          "evidence:ev-7",
        ]);
      }
    );

    test(
      "package detects duplicate canonical evidence identifiers",
      () => {
        const first =
          createEvidenceItem({
            id:
              "duplicate",

            type:
              EVIDENCE_TYPE
                .SIGNAL,

            source:
              "one",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .AIRA_SIGNAL_STORE,
          });

        const second =
          createEvidenceItem({
            id:
              "duplicate",

            type:
              EVIDENCE_TYPE
                .SIGNAL,

            source:
              "two",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .AIRA_SIGNAL_STORE,
          });

        const packageResult =
          createEvidencePackage({
            incidentId:
              "incident-2",

            items: [
              first,
              second,
            ],
          });

        expect(
          packageResult
            .duplicateEvidenceIds
        ).toEqual([
          "duplicate",
        ]);
      }
    );

    test(
      "legacy evidence without fingerprint remains readable but unverified",
      () => {
        const verification =
          verifyEvidenceIntegrity({
            id:
              "legacy",

            type:
              EVIDENCE_TYPE
                .SIGNAL,
          });

        expect(
          verification.valid
        ).toBeNull();

        expect(
          verification.status
        ).toBe(
          EVIDENCE_INTEGRITY_STATUS
            .UNVERIFIED
        );
      }
    );
  }
);