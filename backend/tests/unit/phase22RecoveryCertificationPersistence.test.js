"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const PostgresRecoveryCertificationRepository =
  require(
    "../../persistence/postgres/PostgresRecoveryCertificationRepository"
  );


const MIGRATION =
  path.join(
    __dirname,

    "../../persistence/postgres/migrations/0087_recovery_certification_foundation.sql"
  );


function migrationText() {
  return fs.readFileSync(
    MIGRATION,
    "utf8"
  );
}


describe(
  "Phase 22.2 PostgreSQL Recovery Certification foundation",

  () => {
    test(
      "0087 creates every canonical certification table",

      () => {
        const migration =
          migrationText();


        const tables = [
          "certification.certified_capabilities",

          "certification.certification_runs",

          "certification.evidence_links",

          "certification.metric_snapshots",

          "certification.autonomy_evaluations",

          "certification.certificates",

          "certification.certificate_constraints",

          "certification.status_history",

          "certification.revocations",
        ];


        for (
          const table
          of tables
        ) {
          expect(
            migration
          )
            .toContain(
              table
            );
        }
      }
    );


   test(
  "all certification persistence remains non-authorizing",

  () => {
    const migration =
      migrationText();


    expect(
      migration
    )
      .toContain(
        "execution_authorized BOOLEAN NOT NULL"
      );


    expect(
      migration
    )
      .toMatch(
        /execution_authorized\s*=\s*FALSE/
      );


    expect(
      migration
    )
      .toContain(
        "Certification NEVER grants execution authorization"
      );
  }
);


    test(
      "all certification tables are protected by forced RLS",

      () => {
        const migration =
          migrationText();


        expect(
          migration
        )
          .toContain(
            "ENABLE ROW LEVEL SECURITY"
          );


        expect(
          migration
        )
          .toContain(
            "FORCE ROW LEVEL SECURITY"
          );


        expect(
          migration
        )
          .toContain(
            "tenancy.current_organization_id()"
          );


        expect(
          migration
        )
          .toContain(
            "tenancy.current_environment_id()"
          );
      }
    );


    test(
      "certificate and evidence history are immutable",

      () => {
        const migration =
          migrationText();


        expect(
          migration
        )
          .toContain(
            "certification.aira_reject_immutable_mutation"
          );


        expect(
          migration
        )
          .toContain(
            "Phase 22 certification evidence is immutable"
          );


        expect(
          migration
        )
          .toContain(
            "'certificates'"
          );


        expect(
          migration
        )
          .toContain(
            "'evidence_links'"
          );


        expect(
          migration
        )
          .toContain(
            "'metric_snapshots'"
          );


        expect(
          migration
        )
          .toContain(
            "'status_history'"
          );


        expect(
          migration
        )
          .toContain(
            "'revocations'"
          );
      }
    );


    test(
      "capability run and certificate relationships use tenant-bound foreign keys",

      () => {
        const migration =
          migrationText();


        expect(
          migration
        )
          .toContain(
            "FOREIGN KEY (\n                organization_id,\n                environment_id,\n                capability_id"
          );


        expect(
          migration
        )
          .toContain(
            "certification_run_id"
          );


        expect(
          migration
        )
          .toContain(
            "certificate_id"
          );
      }
    );


    test(
      "certification runs are the only mutable lifecycle record",

      () => {
        const migration =
          migrationText();


        expect(
          migration
        )
          .toContain(
            "trg_certification_run_updated_at"
          );


        const immutableSection =
          migration
            .split(
              "-- ROW LEVEL SECURITY"
            )[0]
            .split(
              "-- IMMUTABILITY"
            )[1];


        expect(
          immutableSection
        )
          .toBeTruthy();


        expect(
          immutableSection
        )
          .not
          .toContain(
            "'certification_runs'"
          );
      }
    );


    test(
      "repository scopes capability creation and forces executionAuthorized false",

      async () => {
        const client = {
          query:
            jest.fn(
              async () => ({
                rows: [
                  {
                    id:
                      "cap-uuid",

                    public_id:
                      "certcap_k8s_crashloop",

                    organization_id:
                      "org-uuid",

                    environment_id:
                      "env-uuid",

                    capability_key:
                      "K8S_CRASHLOOP_RECOVERY",

                    identity_version:
                      "22.1-capability-identity-v1",

                    fingerprint:
                      "a".repeat(
                        64
                      ),

                    provider:
                      "kubernetes",

                    resource_type:
                      "deployment",

                    failure_mode:
                      "kubernetes.pod.crashloop",

                    recovery_strategy:
                      "rolling-restart",

                    resource_capability:
                      "RESTART",

                    playbook_id:
                      "pb_k8s_crashloop_recovery",

                    playbook_version:
                      "1",

                    domain:
                      "SOFTWARE_INFRASTRUCTURE",

                    constraints:
                      {},

                    identity_payload:
                      {},

                    execution_authorized:
                      false,
                  },
                ],
              })
            ),
        };


        const scope = {
          run:
            jest.fn(
              async (
                requestedScope,
                work
              ) =>
                work(
                  client,

                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",

                    applicationOrganizationId:
                      requestedScope
                        .organizationId,

                    applicationEnvironmentId:
                      requestedScope
                        .environmentId,
                  }
                )
            ),
        };


        const repository =
          new PostgresRecoveryCertificationRepository({
            scope,
          });


        const result =
          await repository
            .createCertifiedCapability({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              publicId:
                "certcap_k8s_crashloop",

              capabilityKey:
                "K8S_CRASHLOOP_RECOVERY",

              identityVersion:
                "22.1-capability-identity-v1",

              fingerprint:
                "a".repeat(
                  64
                ),

              provider:
                "kubernetes",

              resourceType:
                "deployment",

              failureMode:
                "kubernetes.pod.crashloop",

              recoveryStrategy:
                "rolling-restart",

              resourceCapability:
                "RESTART",

              playbookId:
                "pb_k8s_crashloop_recovery",

              playbookVersion:
                1,

              domain:
                "SOFTWARE_INFRASTRUCTURE",

              constraints:
                {},

              identityPayload:
                {},
            });


        expect(
          scope.run
        )
          .toHaveBeenCalledWith(
            {
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",
            },

            expect.any(
              Function
            ),

            null
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          client.query
            .mock
            .calls[0][0]
        )
          .toContain(
            "FALSE"
          );
      }
    );


    test(
      "issued certificate remains qualification evidence and cannot authorize execution",

      async () => {
        const client = {
          query:
            jest.fn(
              async () => ({
                rows: [
                  {
                    id:
                      "certificate-uuid",

                    public_id:
                      "cert_k8s_v1",

                    organization_id:
                      "org-uuid",

                    environment_id:
                      "env-uuid",

                    capability_id:
                      "capability-uuid",

                    certification_run_id:
                      "run-uuid",

                    certificate_version:
                      1,

                    qualified_level:
                      "L3",

                    score:
                      94.5,

                    confidence:
                      0.99,

                    evidence_digest:
                      "b".repeat(
                        64
                      ),

                    certificate_payload: {
                      source:
                        "phase21",
                    },

                    issued_at:
                      new Date(
                        "2026-09-01T00:00:00.000Z"
                      ),

                    expires_at:
                      null,

                    execution_authorized:
                      false,
                  },
                ],
              })
            ),
        };


        const scope = {
          run:
            jest.fn(
              async (
                _requestedScope,
                work
              ) =>
                work(
                  client,

                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",
                  }
                )
            ),
        };


        const repository =
          new PostgresRecoveryCertificationRepository({
            scope,
          });


        const certificate =
          await repository
            .issueCertificate({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              publicId:
                "cert_k8s_v1",

              capabilityId:
                "certcap_k8s_crashloop",

              certificationRunId:
                "certrun_1",

              certificateVersion:
                1,

              qualifiedLevel:
                "L3",

              score:
                94.5,

              confidence:
                0.99,

              evidenceDigest:
                "b".repeat(
                  64
                ),

              certificatePayload: {
                source:
                  "phase21",
              },
            });


        expect(
          certificate
            .qualifiedLevel
        )
          .toBe(
            "L3"
          );


        expect(
          certificate
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          client.query
            .mock
            .calls[0][0]
        )
          .toContain(
            "FALSE"
          );
      }
    );


    test(
      "revocation record also remains non-authorizing",

      async () => {
        const client = {
          query:
            jest.fn(
              async () => ({
                rows: [
                  {
                    id:
                      "revoke-uuid",

                    public_id:
                      "certrevoke_1",

                    organization_id:
                      "org-uuid",

                    environment_id:
                      "env-uuid",

                    certificate_id:
                      "certificate-uuid",

                    reason_code:
                      "SAFETY_REGRESSION",

                    reason:
                      "False recovery rate exceeded ceiling",

                    source:
                      "PHASE22_CERTIFICATION_ENGINE",

                    execution_authorized:
                      false,
                  },
                ],
              })
            ),
        };


        const scope = {
          run:
            jest.fn(
              async (
                _requestedScope,
                work
              ) =>
                work(
                  client,

                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",
                  }
                )
            ),
        };


        const repository =
          new PostgresRecoveryCertificationRepository({
            scope,
          });


        const revocation =
          await repository
            .revokeCertificate({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              certificateId:
                "cert_k8s_v1",

              reasonCode:
                "SAFETY_REGRESSION",

              reason:
                "False recovery rate exceeded ceiling",

              source:
                "PHASE22_CERTIFICATION_ENGINE",
            });


        expect(
          revocation
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);