"use strict";


const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
  );


function numberValue(
  value
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}


function step({
  id,
  label,
  complete,
  evidence,
  detail,
  actionPath,
}) {
  return {
    id,
    label,


    status:
      complete
        ? "complete"
        : "pending",


    evidence,
    detail,


    actionPath:
      actionPath ||
      null,
  };
}


function assignCurrentStep(
  steps
) {
  let currentAssigned =
    false;


  return steps.map(
    (
      item
    ) => {
      if (
        item.status ===
        "complete"
      ) {
        return item;
      }


      if (
        !currentAssigned
      ) {
        currentAssigned =
          true;


        return {
          ...item,

          status:
            "current",
        };
      }


      return item;
    }
  );
}


class ProductOnboardingService {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }


  async getReadiness({
    organizationId,
    environmentId,
  }) {
    if (
      !organizationId ||
      !environmentId
    ) {
      const error =
        new Error(
          "Product onboarding requires authoritative organization and environment context"
        );


      error.status =
        400;


      error.code =
        "PRODUCT_ONBOARDING_SCOPE_REQUIRED";


      error.executionAuthorized =
        false;


      throw error;
    }


    return this.tenantScope
      .run(
        {
          organizationId,
          environmentId,
        },

        async (
          client,
          resolved
        ) => {
          /*
           * CRITICAL TENANT-SAFETY RULE
           *
           * Incoming organization/environment identifiers are logical/public
           * identifiers.
           *
           * PostgresTenantScope has already converted them into the canonical
           * PostgreSQL UUIDs and established RLS:
           *
           *   resolved.organizationUuid
           *   resolved.environmentUuid
           *
           * All direct SQL in this read model must use those resolved UUIDs.
           */
          const databaseOrganizationId =
            resolved
              .organizationUuid;


          const databaseEnvironmentId =
            resolved
              .environmentUuid;


          const [
            profileResult,
            membershipResult,
            invitationResult,
            integrationResult,
            resourcesResult,
            environmentResult,
            policyResult,
            signalResult,
            incidentResult,
            teamResult,
            channelResult,
            routingResult,
          ] =
            await Promise.all([
              client.query(
                `
                  SELECT
                      profile_status,
                      completed_at,
                      verified_at

                  FROM
                      product.organization_profiles

                  WHERE
                      organization_id =
                          $1

                  LIMIT 1
                `,
                [
                  databaseOrganizationId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count

                  FROM
                      identity.organization_memberships

                  WHERE
                      organization_id =
                          $1

                      AND

                      status =
                          'active'
                `,
                [
                  databaseOrganizationId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count

                  FROM
                      identity.organization_invitations

                  WHERE
                      organization_id =
                          $1

                      AND

                      accepted_at IS NULL

                      AND

                      revoked_at IS NULL

                      AND

                      superseded_at IS NULL

                      AND

                      expires_at >
                          NOW()
                `,
                [
                  databaseOrganizationId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              status =
                                  'connected'
                      )::int
                          AS connected,

                      COUNT(*) FILTER (
                          WHERE
                              health_status IN (
                                  'healthy',
                                  'degraded'
                              )
                      )::int
                          AS operational,

                      COUNT(*) FILTER (
                          WHERE
                              last_successful_event_at
                                  IS NOT NULL
                      )::int
                          AS observed_events

                  FROM
                      integrations.connections

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  databaseOrganizationId,
                  databaseEnvironmentId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count,

                      MAX(
                          discovered_at
                      )
                          AS latest_discovery

                  FROM
                      resources.resources

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  databaseOrganizationId,
                  databaseEnvironmentId,
                ]
              ),


              client.query(
                `
                  SELECT
                      id,
                      public_id,
                      name,
                      environment_type,
                      criticality,
                      status,
                      settings

                  FROM
                      tenancy.environments

                  WHERE
                      organization_id =
                          $1

                      AND

                      id =
                          $2

                  LIMIT 1
                `,
                [
                  databaseOrganizationId,
                  databaseEnvironmentId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count

                  FROM
                      policy.policies

                  WHERE
                      organization_id =
                          $1

                      AND

                      status =
                          'active'
                `,
                [
                  databaseOrganizationId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count,

                      MAX(
                          observed_at
                      )
                          AS latest_signal

                  FROM
                      signals.signals

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  databaseOrganizationId,
                  databaseEnvironmentId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count,

                      MIN(
                          created_at
                      )
                          AS first_incident,

                      MAX(
                          created_at
                      )
                          AS latest_incident

                  FROM
                      incidents.incidents

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  databaseOrganizationId,
                  databaseEnvironmentId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count

                  FROM
                      tenancy.teams

                  WHERE
                      organization_id =
                          $1

                      AND

                      status =
                          'active'
                `,
                [
                  databaseOrganizationId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count

                  FROM
                      notifications.channels

                  WHERE
                      organization_id =
                          $1

                      AND

                      status =
                          'active'
                `,
                [
                  databaseOrganizationId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS count

                  FROM
                      notifications.routing_rules

                  WHERE
                      organization_id =
                          $1

                      AND

                      enabled =
                          TRUE

                      AND

                      (
                          environment_id IS NULL

                          OR

                          environment_id =
                              $2
                      )
                `,
                [
                  databaseOrganizationId,
                  databaseEnvironmentId,
                ]
              ),
            ]);


          const profile =
            profileResult
              .rows[0] ||
            null;


          const environment =
            environmentResult
              .rows[0] ||
            null;


          if (
            !environment
          ) {
            const error =
              new Error(
                "Current onboarding environment does not exist"
              );


            error.status =
              404;


            error.code =
              "PRODUCT_ONBOARDING_ENVIRONMENT_NOT_FOUND";


            error.executionAuthorized =
              false;


            throw error;
          }


          const activeMembers =
            numberValue(
              membershipResult
                .rows[0]
                ?.count
            );


          const pendingInvitations =
            numberValue(
              invitationResult
                .rows[0]
                ?.count
            );


          const integrations =
            integrationResult
              .rows[0] ||
            {};


          const integrationsTotal =
            numberValue(
              integrations.total
            );


          const integrationsConnected =
            numberValue(
              integrations.connected
            );


          const integrationsOperational =
            numberValue(
              integrations.operational
            );


          const integrationsObserved =
            numberValue(
              integrations.observed_events
            );


          const resources =
            numberValue(
              resourcesResult
                .rows[0]
                ?.count
            );


          const policies =
            numberValue(
              policyResult
                .rows[0]
                ?.count
            );


          const signals =
            numberValue(
              signalResult
                .rows[0]
                ?.count
            );


          const incidents =
            numberValue(
              incidentResult
                .rows[0]
                ?.count
            );


          const teams =
            numberValue(
              teamResult
                .rows[0]
                ?.count
            );


          const notificationChannels =
            numberValue(
              channelResult
                .rows[0]
                ?.count
            );


          const notificationRoutes =
            numberValue(
              routingResult
                .rows[0]
                ?.count
            );


          const settings =
            environment.settings &&
            typeof environment.settings ===
              "object"
              ? environment.settings
              : {};


          const profileComplete =
            Boolean(
              profile &&
              [
                "complete",
                "verified",
              ].includes(
                profile.profile_status
              )
            );


          const teamEvidence =
            activeMembers >
              1 ||
            pendingInvitations >
              0;


          const observabilityEvidence =
            integrationsOperational >
              0 ||
            integrationsObserved >
              0 ||
            signals >
              0;


          const infrastructureEvidence =
            integrationsConnected >
              0;


          const resourceEvidence =
            resources >
              0;


          const environmentEvidence =
            Boolean(
              environment.environment_type &&
              environment.criticality
            );


          const autonomousExecutionDisabled =
            settings
              .allowAutonomousExecution !==
            true;


          const destructiveApprovalRequired =
            settings
              .requireApprovalForDestructiveActions !==
            false;


          const safetyEvidence =
            policies >
              0 ||
            (
              autonomousExecutionDisabled &&
              destructiveApprovalRequired
            );


          /*
           * Shadow readiness is product readiness only.
           *
           * It never means certification or execution authority.
           */
          const shadowEvidence =
            autonomousExecutionDisabled &&
            (
              signals >
                0 ||
              incidents >
                0
            );


          const incidentEvidence =
            incidents >
              0;


          let steps = [
            step({
              id:
                "profile",

              label:
                "Complete company profile",

              complete:
                profileComplete,

              evidence:
                profileComplete
                  ? `Profile status: ${profile.profile_status}`
                  : "Organization profile is incomplete",

              detail:
                profileComplete
                  ? "AIRA has the organization identity information required for product context."
                  : "Complete the organization profile so AIRA can establish operating context.",

              actionPath:
                "/organization",
            }),


            step({
              id:
                "invite",

              label:
                "Invite your team",

              complete:
                teamEvidence,

              evidence:
                `${activeMembers} active member(s) · ${pendingInvitations} pending invitation(s)`,

              detail:
                teamEvidence
                  ? "Collaborative organization membership evidence exists."
                  : "Add another member or create a real organization invitation.",

              actionPath:
                "/team",
            }),


            step({
              id:
                "observability",

              label:
                "Connect observability",

              complete:
                observabilityEvidence,

              evidence:
                `${signals} signal(s) · ${integrationsOperational} operational integration(s)`,

              detail:
                observabilityEvidence
                  ? "AIRA has evidence that telemetry is reaching this environment."
                  : "Connect a supported observability source and allow AIRA to receive real telemetry.",

              actionPath:
                "/integrations",
            }),


            step({
              id:
                "infrastructure",

              label:
                "Connect infrastructure",

              complete:
                infrastructureEvidence,

              evidence:
                `${integrationsConnected}/${integrationsTotal} integration connection(s) connected`,

              detail:
                infrastructureEvidence
                  ? "A real connected integration exists for this environment."
                  : "A draft integration does not count. A validated connected integration is required.",

              actionPath:
                "/integrations",
            }),


            step({
              id:
                "discovery",

              label:
                "Discover resources",

              complete:
                resourceEvidence,

              evidence:
                `${resources} canonical resource(s) discovered`,

              detail:
                resourceEvidence
                  ? "Canonical infrastructure/resource evidence exists."
                  : "AIRA has not yet persisted resource discovery evidence for this environment.",

              actionPath:
                "/resources",
            }),


            step({
              id:
                "environment",

              label:
                "Classify environment",

              complete:
                environmentEvidence,

              evidence:
                environmentEvidence
                  ? `${environment.environment_type} · ${environment.criticality}`
                  : "Environment classification is incomplete",

              detail:
                environmentEvidence
                  ? `Environment status: ${environment.status}.`
                  : "Store both environment type and criticality in the canonical environment record.",

              actionPath:
                "/settings",
            }),


            step({
              id:
                "policy",

              label:
                "Configure safety policy",

              complete:
                safetyEvidence,

              evidence:
                `${policies} active policy record(s) · autonomous execution ${
                  autonomousExecutionDisabled
                    ? "disabled"
                    : "enabled"
                }`,

              detail:
                safetyEvidence
                  ? destructiveApprovalRequired
                    ? "Destructive actions require approval or an explicit active policy exists."
                    : "Stored policy evidence exists; review destructive-action approval configuration."
                  : "AIRA does not yet have sufficient stored safety-policy evidence.",

              actionPath:
                "/policies",
            }),


            step({
              id:
                "shadow",

              label:
                "Enter Shadow Mode",

              complete:
                shadowEvidence,

              evidence:
                autonomousExecutionDisabled
                  ? `${signals} signal(s) · ${incidents} incident(s) observed · execution disabled`
                  : "Autonomous execution is enabled in environment configuration",

              detail:
                shadowEvidence
                  ? "AIRA is observing real evidence while remaining non-executing through this product mode."
                  : "Shadow readiness requires real telemetry or incident evidence while autonomous execution remains disabled.",

              actionPath:
                "/shadow",
            }),


            step({
              id:
                "incident",

              label:
                "Observe first incident",

              complete:
                incidentEvidence,

              evidence:
                `${incidents} real incident(s) persisted`,

              detail:
                incidentEvidence
                  ? "A real incident lifecycle exists in this environment."
                  : "This step remains incomplete until AIRA persists an actual incident.",

              actionPath:
                "/incidents",
            }),
          ];


          steps =
            assignCurrentStep(
              steps
            );


          const completed =
            steps.filter(
              (
                item
              ) =>
                item.status ===
                "complete"
            ).length;


          const current =
            steps.find(
              (
                item
              ) =>
                item.status ===
                "current"
            ) ||
            null;


          const total =
            steps.length;


          return {
            generatedAt:
              new Date()
                .toISOString(),


            /*
             * Preserve the logical/public scope in the API response.
             *
             * Internal UUIDs remain backend implementation details.
             */
            scope: {
              organizationId,
              environmentId,
            },


            readiness: {
              completed,
              total,


              percent:
                Math.round(
                  (
                    completed /
                    total
                  ) *
                  100
                ),


              fullyReady:
                completed ===
                total,


              currentStepId:
                current
                  ?.id ||
                null,
            },


            steps,


            evidence: {
              profileStatus:
                profile
                  ?.profile_status ||
                "missing",


              activeMembers,


              pendingInvitations,


              teams,


              integrations: {
                total:
                  integrationsTotal,

                connected:
                  integrationsConnected,

                operational:
                  integrationsOperational,

                observedEvents:
                  integrationsObserved,
              },


              signals,


              resources,


              policies,


              incidents,


              notificationChannels,


              notificationRoutes,


              environment: {
                name:
                  environment.name,

                type:
                  environment.environment_type,

                criticality:
                  environment.criticality,

                status:
                  environment.status,


                autonomousExecutionAllowed:
                  settings
                    .allowAutonomousExecution ===
                  true,


                destructiveApprovalRequired,
              },
            },


            recommendations: [
              ...(teams ===
                0
                ? [
                    {
                      id:
                        "create-response-team",

                      title:
                        "Create an incident-response team",

                      description:
                        "Teams improve ownership and escalation routing.",

                      actionPath:
                        "/team",
                    },
                  ]
                : []),


              ...(notificationChannels ===
                0
                ? [
                    {
                      id:
                        "configure-notification-channel",

                      title:
                        "Configure an operational notification channel",

                      description:
                        "Configure an appropriate supported operational notification channel.",

                      actionPath:
                        "/team",
                    },
                  ]
                : []),


              ...(notificationRoutes ===
                0
                ? [
                    {
                      id:
                        "configure-routing-policy",

                      title:
                        "Configure notification routing",

                      description:
                        "Define which responders should receive operational events.",

                      actionPath:
                        "/team",
                    },
                  ]
                : []),
            ],


            safety: {
              executionAuthorized:
                false,

              onboardingGrantsAuthority:
                false,

              readinessGrantsCertification:
                false,

              browserCanCompleteSteps:
                false,
            },


            executionAuthorized:
              false,
          };
        }
      );
  }
}


const productOnboardingService =
  new ProductOnboardingService();


module.exports =
  productOnboardingService;


module.exports
  .ProductOnboardingService =
  ProductOnboardingService;