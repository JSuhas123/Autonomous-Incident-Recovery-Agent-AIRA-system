"use strict";


const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
  );


function numberValue(
  value
) {
  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function nullableNumber(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : null;
}


function percent(
  numerator,
  denominator
) {
  if (
    !denominator
  ) {
    return null;
  }


  return Math.round(
    (
      numerator /
      denominator
    ) *
      1000
  ) /
    10;
}


function minutesLabel(
  value
) {
  const minutes =
    nullableNumber(
      value
    );


  if (
    minutes ===
    null
  ) {
    return null;
  }


  if (
    minutes <
    60
  ) {
    return `${Math.round(
      minutes *
        10
    ) /
      10} min`;
  }


  return `${Math.round(
    (
      minutes /
      60
    ) *
      10
  ) /
    10} hr`;
}


function iso(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }


  return date
    .toISOString();
}


class ProductPersonaReadModelService {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }


  async getReliability({
    organizationId,
    environmentId,
  }) {
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
          const orgId =
            resolved
              .organizationUuid;


          const envId =
            resolved
              .environmentUuid;


          const [
            incidentsResult,
            recoveryResult,
            takeoverResult,
            approvalResult,
            serviceResult,
          ] =
            await Promise.all([
              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status)
                              NOT IN (
                                  'resolved',
                                  'closed'
                              )
                      )::int
                          AS active,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(severity) =
                                  'critical'

                              AND

                              LOWER(status)
                              NOT IN (
                                  'resolved',
                                  'closed'
                              )
                      )::int
                          AS critical_active,

                      COUNT(*) FILTER (
                          WHERE
                              resolved_at
                                  IS NOT NULL

                              OR

                              closed_at
                                  IS NOT NULL
                      )::int
                          AS resolved,

                      PERCENTILE_CONT(
                          0.5
                      )
                      WITHIN GROUP (
                          ORDER BY
                              EXTRACT(
                                  EPOCH
                                  FROM (
                                      COALESCE(
                                          resolved_at,
                                          closed_at
                                      )
                                      -
                                      COALESCE(
                                          first_detected_at,
                                          created_at
                                      )
                                  )
                              ) /
                              60.0
                      )
                      FILTER (
                          WHERE
                              (
                                  resolved_at
                                      IS NOT NULL

                                  OR

                                  closed_at
                                      IS NOT NULL
                              )

                              AND

                              COALESCE(
                                  resolved_at,
                                  closed_at
                              )
                              >=
                              COALESCE(
                                  first_detected_at,
                                  created_at
                              )
                      )
                          AS median_mttr_minutes

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
                  orgId,
                  envId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*) FILTER (
                          WHERE
                              is_current =
                                  TRUE
                      )::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              is_current =
                                  TRUE

                              AND

                              recovery_confirmed =
                                  TRUE
                      )::int
                          AS confirmed,

                      COUNT(*) FILTER (
                          WHERE
                              is_current =
                                  TRUE

                              AND

                              recovered =
                                  FALSE
                      )::int
                          AS not_recovered

                  FROM
                      execution.recovery_verifications

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  orgId,
                  envId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              status IN (
                                  'ACTIVE',
                                  'AUTHORIZED',
                                  'RELEASING'
                              )
                      )::int
                          AS active

                  FROM
                      human_operations.takeover_sessions

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  orgId,
                  envId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status) =
                                  'pending'
                      )::int
                          AS pending

                  FROM
                      execution.approvals

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  orgId,
                  envId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COALESCE(
                          service_id,
                          'unassigned'
                      )
                          AS service_id,

                      COUNT(*)::int
                          AS incident_count,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status)
                              NOT IN (
                                  'resolved',
                                  'closed'
                              )
                      )::int
                          AS active_incidents,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(severity) =
                                  'critical'
                      )::int
                          AS critical_incidents,

                      MAX(
                          last_observed_at
                      )
                          AS last_observed_at

                  FROM
                      incidents.incidents

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2

                  GROUP BY
                      COALESCE(
                          service_id,
                          'unassigned'
                      )

                  ORDER BY
                      active_incidents DESC,
                      critical_incidents DESC,
                      incident_count DESC

                  LIMIT 10
                `,
                [
                  orgId,
                  envId,
                ]
              ),
            ]);


          const incidents =
            incidentsResult
              .rows[0] ||
            {};


          const recovery =
            recoveryResult
              .rows[0] ||
            {};


          const takeovers =
            takeoverResult
              .rows[0] ||
            {};


          const approvals =
            approvalResult
              .rows[0] ||
            {};


          const totalIncidents =
            numberValue(
              incidents.total
            );


          const activeIncidents =
            numberValue(
              incidents.active
            );


          const criticalActive =
            numberValue(
              incidents
                .critical_active
            );


          const resolvedIncidents =
            numberValue(
              incidents.resolved
            );


          const recoveryTotal =
            numberValue(
              recovery.total
            );


          const recoveryConfirmed =
            numberValue(
              recovery.confirmed
            );


          const takeoverTotal =
            numberValue(
              takeovers.total
            );


          const recoverySuccess =
            percent(
              recoveryConfirmed,
              recoveryTotal
            );


          const takeoverShare =
            percent(
              takeoverTotal,
              totalIncidents
            );


          const mttrMinutes =
            nullableNumber(
              incidents
                .median_mttr_minutes
            );


          const attention =
            serviceResult
              .rows
              .filter(
                (
                  row
                ) =>
                  numberValue(
                    row.active_incidents
                  ) >
                    0 ||
                  numberValue(
                    row.incident_count
                  ) >
                    1
              )
              .map(
                (
                  row
                ) => ({
                  serviceId:
                    row.service_id,

                  incidentCount:
                    numberValue(
                      row.incident_count
                    ),

                  activeIncidents:
                    numberValue(
                      row.active_incidents
                    ),

                  criticalIncidents:
                    numberValue(
                      row.critical_incidents
                    ),

                  lastObservedAt:
                    iso(
                      row.last_observed_at
                    ),

                  state:
                    numberValue(
                      row.critical_incidents
                    ) >
                    0
                      ? "critical"
                      : numberValue(
                            row.active_incidents
                          ) >
                          0
                        ? "warning"
                        : "info",
                })
              );


          return {
            generatedAt:
              new Date()
                .toISOString(),

            scope: {
              organizationId,
              environmentId,
            },

            metrics: {
              incidents: {
                total:
                  totalIncidents,

                active:
                  activeIncidents,

                criticalActive,

                resolved:
                  resolvedIncidents,
              },

              mttr: {
                available:
                  mttrMinutes !==
                  null,

                minutes:
                  mttrMinutes,

                display:
                  minutesLabel(
                    mttrMinutes
                  ),

                basis:
                  mttrMinutes !==
                  null
                    ? "Median of incidents with persisted detection and resolution timestamps"
                    : "Insufficient resolved incident timing evidence",
              },

              /*
               * Existing canonical incident schema does not establish
               * pre-detection service-impact onset.
               *
               * Therefore a truthful MTTD cannot be calculated here.
               */
              mttd: {
                available:
                  false,

                minutes:
                  null,

                display:
                  null,

                basis:
                  "No authoritative pre-detection impact timestamp is available in this product read model",
              },

              recovery: {
                verifications:
                  recoveryTotal,

                confirmed:
                  recoveryConfirmed,

                notRecovered:
                  numberValue(
                    recovery
                      .not_recovered
                  ),

                successPercent:
                  recoverySuccess,

                available:
                  recoveryTotal >
                  0,
              },

              humanTakeover: {
                total:
                  takeoverTotal,

                active:
                  numberValue(
                    takeovers.active
                  ),

                incidentSharePercent:
                  takeoverShare,

                available:
                  totalIncidents >
                  0,
              },

              pendingApprovals:
                numberValue(
                  approvals.pending
                ),
            },

            attention,

            evidenceState: {
              recoveryCoverage:
                "unavailable",

              reason:
                "A verified-recovery count does not establish capability coverage across all services.",
            },

            safety: {
              executionAuthorized:
                false,

              reliabilityMetricsGrantAuthority:
                false,

              historicalSuccessGrantsAuthority:
                false,
            },

            executionAuthorized:
              false,
          };
        }
      );
  }


  async getExecutive({
    organizationId,
    environmentId,
  }) {
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
          const orgId =
            resolved
              .organizationUuid;


          const envId =
            resolved
              .environmentUuid;


          const [
            incidentResult,
            recoveryResult,
            takeoverResult,
          ] =
            await Promise.all([
              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status)
                              NOT IN (
                                  'resolved',
                                  'closed'
                              )
                      )::int
                          AS active,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(severity) =
                                  'critical'

                              AND

                              LOWER(status)
                              NOT IN (
                                  'resolved',
                                  'closed'
                              )
                      )::int
                          AS critical_active,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(
                                  COALESCE(
                                      metadata->>'customerImpact',
                                      metadata->>'customer_impact',
                                      'false'
                                  )
                              ) =
                                  'true'
                      )::int
                          AS customer_impacting,

                      COALESCE(
                          SUM(
                              EXTRACT(
                                  EPOCH
                                  FROM (
                                      COALESCE(
                                          resolved_at,
                                          closed_at
                                      )
                                      -
                                      COALESCE(
                                          first_detected_at,
                                          created_at
                                      )
                                  )
                              ) /
                              60.0
                          )
                          FILTER (
                              WHERE
                                  (
                                      resolved_at
                                          IS NOT NULL

                                      OR

                                      closed_at
                                          IS NOT NULL
                                  )

                                  AND

                                  COALESCE(
                                      resolved_at,
                                      closed_at
                                  )
                                  >=
                                  COALESCE(
                                      first_detected_at,
                                      created_at
                                  )
                          ),
                          0
                      )
                          AS observed_incident_minutes,

                      PERCENTILE_CONT(
                          0.5
                      )
                      WITHIN GROUP (
                          ORDER BY
                              EXTRACT(
                                  EPOCH
                                  FROM (
                                      COALESCE(
                                          resolved_at,
                                          closed_at
                                      )
                                      -
                                      COALESCE(
                                          first_detected_at,
                                          created_at
                                      )
                                  )
                              ) /
                              60.0
                      )
                      FILTER (
                          WHERE
                              (
                                  resolved_at
                                      IS NOT NULL

                                  OR

                                  closed_at
                                      IS NOT NULL
                              )
                      )
                          AS median_mttr_minutes

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
                  orgId,
                  envId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*) FILTER (
                          WHERE
                              is_current =
                                  TRUE
                      )::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              is_current =
                                  TRUE

                              AND

                              recovery_confirmed =
                                  TRUE
                      )::int
                          AS confirmed

                  FROM
                      execution.recovery_verifications

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  orgId,
                  envId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS total

                  FROM
                      human_operations.takeover_sessions

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  orgId,
                  envId,
                ]
              ),
            ]);


          const incidents =
            incidentResult
              .rows[0] ||
            {};


          const recovery =
            recoveryResult
              .rows[0] ||
            {};


          const total =
            numberValue(
              incidents.total
            );


          const active =
            numberValue(
              incidents.active
            );


          const critical =
            numberValue(
              incidents
                .critical_active
            );


          const recoveryTotal =
            numberValue(
              recovery.total
            );


          const confirmed =
            numberValue(
              recovery.confirmed
            );


          const takeovers =
            numberValue(
              takeoverResult
                .rows[0]
                ?.total
            );


          const recoverySuccess =
            percent(
              confirmed,
              recoveryTotal
            );


          const takeoverShare =
            percent(
              takeovers,
              total
            );


          const mttr =
            nullableNumber(
              incidents
                .median_mttr_minutes
            );


          const narrative = [];


          if (
            critical >
            0
          ) {
            narrative.push(
              `${critical} active critical incident${critical === 1 ? "" : "s"} currently require operational attention.`
            );
          } else {
            narrative.push(
              "No active critical incidents are present in the selected environment."
            );
          }


          if (
            recoveryTotal >
            0
          ) {
            narrative.push(
              `${confirmed} of ${recoveryTotal} current recovery verification record${recoveryTotal === 1 ? "" : "s"} confirm recovery.`
            );
          } else {
            narrative.push(
              "There is not yet enough recovery-verification evidence to report a recovery success rate."
            );
          }


          if (
            takeovers >
            0
          ) {
            narrative.push(
              `${takeovers} human takeover session${takeovers === 1 ? "" : "s"} are recorded in the selected product scope.`
            );
          }


          return {
            generatedAt:
              new Date()
                .toISOString(),

            scope: {
              organizationId,
              environmentId,
            },

            metrics: {
              totalIncidents:
                total,

              activeIncidents:
                active,

              criticalActive:
                critical,

              medianMttr: {
                available:
                  mttr !==
                  null,

                minutes:
                  mttr,

                display:
                  minutesLabel(
                    mttr
                  ),
              },

              recoverySuccess: {
                available:
                  recoverySuccess !==
                  null,

                percent:
                  recoverySuccess,

                confirmed,

                total:
                  recoveryTotal,
              },

              humanTakeover: {
                total:
                  takeovers,

                sharePercent:
                  takeoverShare,
              },
            },

            impact: {
              customerImpactingIncidents:
                numberValue(
                  incidents
                    .customer_impacting
                ),

              customerImpactEvidenceAvailable:
                total >
                0,

              observedIncidentMinutes:
                Math.round(
                  numberValue(
                    incidents
                      .observed_incident_minutes
                  ) *
                    10
                ) /
                10,

              /*
               * This value intentionally means ACTUAL observed incident
               * duration. It is not "minutes saved".
               */
              estimatedMinutesAvoided: {
                available:
                  false,

                value:
                  null,

                reason:
                  "A counterfactual baseline is required before avoided incident minutes can be calculated.",
              },

              financialSavings: {
                available:
                  false,

                value:
                  null,

                reason:
                  "No authoritative business-cost model is attached to this product scope.",
              },

              serviceAvailability: {
                available:
                  false,

                value:
                  null,

                reason:
                  "Incident records alone cannot establish weighted service availability.",
              },

              recoveryCoverage: {
                available:
                  false,

                value:
                  null,

                reason:
                  "Capability-to-service coverage evidence is not complete enough for an executive coverage percentage.",
              },
            },

            narrative,

            safety: {
              executionAuthorized:
                false,

              executivePersonaGrantsAuthority:
                false,

              businessMetricsGrantAuthority:
                false,
            },

            executionAuthorized:
              false,
          };
        }
      );
  }


  async getGovernance({
    organizationId,
    environmentId,
  }) {
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
          const orgId =
            resolved
              .organizationUuid;


          const envId =
            resolved
              .environmentUuid;


          const [
            approvalsResult,
            policyResult,
            tracesResult,
            takeoverResult,
          ] =
            await Promise.all([
              client.query(
                `
                  SELECT
                      COUNT(*)::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status) =
                                  'pending'
                      )::int
                          AS pending,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status) =
                                  'approved'
                      )::int
                          AS approved,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status) =
                                  'rejected'
                      )::int
                          AS rejected

                  FROM
                      execution.approvals

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  orgId,
                  envId,
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
                                  'active'
                      )::int
                          AS active

                  FROM
                      policy.policies

                  WHERE
                      organization_id =
                          $1
                `,
                [
                  orgId,
                ]
              ),


              client.query(
                `
                  SELECT
                      public_id,
                      decision,
                      recommended_action,
                      tier,
                      action_risk,
                      created_at

                  FROM
                      audit.decision_traces

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2

                  ORDER BY
                      created_at DESC

                  LIMIT 8
                `,
                [
                  orgId,
                  envId,
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
                                  'ACTIVE'
                      )::int
                          AS active,

                      COUNT(*) FILTER (
                          WHERE
                              status =
                                  'DENIED'
                      )::int
                          AS denied,

                      COUNT(*) FILTER (
                          WHERE
                              status =
                                  'RELEASED'
                      )::int
                          AS released

                  FROM
                      human_operations.takeover_sessions

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2
                `,
                [
                  orgId,
                  envId,
                ]
              ),
            ]);


          const approvals =
            approvalsResult
              .rows[0] ||
            {};


          const policies =
            policyResult
              .rows[0] ||
            {};


          const takeovers =
            takeoverResult
              .rows[0] ||
            {};


          return {
            generatedAt:
              new Date()
                .toISOString(),

            scope: {
              organizationId,
              environmentId,
            },

            metrics: {
              policies: {
                total:
                  numberValue(
                    policies.total
                  ),

                active:
                  numberValue(
                    policies.active
                  ),
              },

              approvals: {
                total:
                  numberValue(
                    approvals.total
                  ),

                pending:
                  numberValue(
                    approvals.pending
                  ),

                approved:
                  numberValue(
                    approvals.approved
                  ),

                rejected:
                  numberValue(
                    approvals.rejected
                  ),
              },

              humanTakeover: {
                total:
                  numberValue(
                    takeovers.total
                  ),

                active:
                  numberValue(
                    takeovers.active
                  ),

                denied:
                  numberValue(
                    takeovers.denied
                  ),

                released:
                  numberValue(
                    takeovers.released
                  ),
              },

              auditDecisionTraces:
                tracesResult
                  .rows
                  .length,
            },

            controls: [
              {
                id:
                  "execution-authority",

                title:
                  "Execution authority remains backend-controlled",

                state:
                  "healthy",

                detail:
                  "Product persona, dashboard state and read-model evidence cannot authorize execution.",
              },

              {
                id:
                  "human-control",

                title:
                  "Human takeover remains non-executing",

                state:
                  numberValue(
                    takeovers.active
                  ) >
                  0
                    ? "info"
                    : "healthy",

                detail:
                  `${numberValue(
                    takeovers.active
                  )} active human takeover session(s). Human control state does not itself authorize infrastructure execution.`,
              },

              {
                id:
                  "approval-boundary",

                title:
                  "Approval evidence is independently tracked",

                state:
                  numberValue(
                    approvals.pending
                  ) >
                  0
                    ? "warning"
                    : "healthy",

                detail:
                  `${numberValue(
                    approvals.pending
                  )} approval request(s) currently pending.`,
              },
            ],

            recentEvents:
              tracesResult
                .rows
                .map(
                  (
                    row
                  ) => ({
                    id:
                      row.public_id,

                    title:
                      row.recommended_action ||
                      row.decision ||
                      "Decision evaluated",

                    actor:
                      "AIRA decision pipeline",

                    result:
                      row.decision ||
                      "Decision trace recorded",

                    risk:
                      row.action_risk ||
                      row.tier ||
                      null,

                    occurredAt:
                      iso(
                        row.created_at
                      ),
                  })
                ),

            unavailable: {
              trustExceptions: {
                available:
                  false,

                reason:
                  "No trustworthy aggregate trust-exception metric is derived by this read model.",
              },

              certificationSummary: {
                available:
                  false,

                reason:
                  "Certification evidence remains a separate authority domain and is not inferred here.",
              },

              auditCompletenessPercent: {
                available:
                  false,

                reason:
                  "Presence of audit records does not prove complete audit coverage.",
              },
            },

            safety: {
              executionAuthorized:
                false,

              governancePersonaGrantsAuthority:
                false,

              certificationGrantsAuthority:
                false,

              trustGrantsAuthority:
                false,
            },

            executionAuthorized:
              false,
          };
        }
      );
  }


  async getDeveloper({
    organizationId,
    environmentId,
  }) {
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
          const orgId =
            resolved
              .organizationUuid;


          const envId =
            resolved
              .environmentUuid;


          const [
            servicesResult,
            recentResult,
          ] =
            await Promise.all([
              client.query(
                `
                  SELECT
                      COALESCE(
                          service_id,
                          'unassigned'
                      )
                          AS service_id,

                      COUNT(*)::int
                          AS incident_count,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(status)
                              NOT IN (
                                  'resolved',
                                  'closed'
                              )
                      )::int
                          AS active_incidents,

                      COUNT(*) FILTER (
                          WHERE
                              LOWER(severity) =
                                  'critical'

                              AND

                              LOWER(status)
                              NOT IN (
                                  'resolved',
                                  'closed'
                              )
                      )::int
                          AS critical_active,

                      MAX(
                          last_observed_at
                      )
                          AS last_observed_at

                  FROM
                      incidents.incidents

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2

                  GROUP BY
                      COALESCE(
                          service_id,
                          'unassigned'
                      )

                  ORDER BY
                      active_incidents DESC,
                      critical_active DESC,
                      incident_count DESC
                `,
                [
                  orgId,
                  envId,
                ]
              ),


              client.query(
                `
                  SELECT
                      public_id,
                      service_id,
                      title,
                      severity,
                      status,
                      created_at,
                      last_observed_at

                  FROM
                      incidents.incidents

                  WHERE
                      organization_id =
                          $1

                      AND

                      environment_id =
                          $2

                  ORDER BY
                      COALESCE(
                          last_observed_at,
                          created_at
                      ) DESC

                  LIMIT 10
                `,
                [
                  orgId,
                  envId,
                ]
              ),
            ]);


          const services =
            servicesResult
              .rows
              .map(
                (
                  row
                ) => {
                  const active =
                    numberValue(
                      row.active_incidents
                    );


                  const critical =
                    numberValue(
                      row.critical_active
                    );


                  return {
                    id:
                      row.service_id,

                    name:
                      row.service_id,

                    incidentCount:
                      numberValue(
                        row.incident_count
                      ),

                    activeIncidents:
                      active,

                    criticalActive:
                      critical,

                    lastObservedAt:
                      iso(
                        row.last_observed_at
                      ),

                    health:
                      critical >
                      0
                        ? "critical"
                        : active >
                            0
                          ? "warning"
                          : "healthy",

                    recoveryCoverage: {
                      available:
                        false,

                      value:
                        null,
                    },
                  };
                }
              );


          const activeIncidentCount =
            services.reduce(
              (
                total,
                service
              ) =>
                total +
                service
                  .activeIncidents,
              0
            );


          const recommendations =
            services
              .filter(
                (
                  service
                ) =>
                  service
                    .activeIncidents >
                    0 ||
                  service
                    .incidentCount >
                    1
              )
              .slice(
                0,
                5
              )
              .map(
                (
                  service
                ) => ({
                  id:
                    `reliability-${service.id}`,

                  title:
                    `Review reliability evidence for ${service.name}`,

                  detail:
                    `${service.incidentCount} incident(s) observed, including ${service.activeIncidents} currently active.`,

                  evidenceBased:
                    true,
                })
              );


          return {
            generatedAt:
              new Date()
                .toISOString(),

            scope: {
              organizationId,
              environmentId,
            },

            metrics: {
              observedServices:
                services.length,

              activeIncidents:
                activeIncidentCount,

              servicesWithActiveIncidents:
                services.filter(
                  (
                    service
                  ) =>
                    service
                      .activeIncidents >
                    0
                ).length,

              criticalServices:
                services.filter(
                  (
                    service
                  ) =>
                    service
                      .criticalActive >
                    0
                ).length,
            },

            /*
             * AIRA currently has observed service identifiers in incident
             * evidence, but this read model does not invent user ownership.
             */
            ownership: {
              available:
                false,

              reason:
                "No authoritative user-to-service ownership mapping is available in this product read model.",
            },

            services,

            recentIncidents:
              recentResult
                .rows
                .map(
                  (
                    row
                  ) => ({
                    id:
                      row.public_id,

                    serviceId:
                      row.service_id ||
                      "unassigned",

                    title:
                      row.title ||
                      "Incident",

                    severity:
                      row.severity,

                    status:
                      row.status,

                    observedAt:
                      iso(
                        row.last_observed_at ||
                        row.created_at
                      ),
                  })
                ),

            recommendations,

            /*
             * Graph/resource state changes are useful infrastructure evidence,
             * but AIRA does not yet have a canonical developer-owned
             * deployment/change feed linked to service ownership.
             */
            changes: {
              available:
                false,

              items:
                [],

              reason:
                "No authoritative service-owned change feed is available for this developer view.",
            },

            safety: {
              executionAuthorized:
                false,

              developerPersonaGrantsAuthority:
                false,

              recommendationsGrantAuthority:
                false,
            },

            executionAuthorized:
              false,
          };
        }
      );
  }
}


const productPersonaReadModelService =
  new ProductPersonaReadModelService();


module.exports =
  productPersonaReadModelService;


module.exports
  .ProductPersonaReadModelService =
  ProductPersonaReadModelService;