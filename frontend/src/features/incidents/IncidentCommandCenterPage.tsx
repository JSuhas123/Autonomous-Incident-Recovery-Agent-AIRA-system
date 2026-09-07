import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Clock3,
  FileSearch,
  LoaderCircle,
  ShieldAlert,
} from 'lucide-react'

import {
  useNavigate,
  useParams,
} from 'react-router-dom'

import {
  useIncident,
  useIncidentTimeline,
} from '@/api/hooks/useIncidents'

import {
  useAgentIntelligence,
} from '@/api/hooks/useAgentIntelligence'

import {
  IncidentCommandPanel,
} from '@/components/incidents/IncidentCommandPanel'

import {
  FeaturePageHeader,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


function formatTime(
  value?: string | null,
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return date.toLocaleString()
}


function severityState(
  severity?: string,
):
  | 'critical'
  | 'warning'
  | 'info'
  | 'healthy' {
  if (
    severity ===
    'critical'
  ) {
    return 'critical'
  }

  if (
    severity ===
    'warning'
  ) {
    return 'warning'
  }

  return 'info'
}


function valueText(
  value: unknown,
) {
  if (
    typeof value ===
    'string'
  ) {
    return value
  }

  if (
    typeof value ===
      'number' ||
    typeof value ===
      'boolean'
  ) {
    return String(value)
  }

  return null
}


export default function IncidentCommandCenterPage() {
  const navigate =
    useNavigate()

  const {
    incidentId =
      '',
  } =
    useParams()


  const incidentQuery =
    useIncident(
      incidentId,
    )


  const timelineQuery =
    useIncidentTimeline(
      incidentId,
    )


  const intelligenceQuery =
    useAgentIntelligence(
      incidentId,
    )


  if (
    !incidentId
  ) {
    return (
      <div className="space-y-6">
        <FeaturePageHeader
          kicker="Incident command"
          title="Incident unavailable"
          description="An incident identifier is required."
        />

        <SafetyBoundary>
          No incident state was loaded and no execution authority was granted.
        </SafetyBoundary>
      </div>
    )
  }


  if (
    incidentQuery
      .isLoading
  ) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }


  if (
    incidentQuery.error ||
    !incidentQuery
      .data
      ?.incident
  ) {
    return (
      <div className="space-y-6">
        <FeaturePageHeader
          kicker="Incident command"
          title="Incident unavailable"
          description="AIRA could not load this incident in the current organization and environment."
          action={
            <button
              type="button"
              onClick={
                () =>
                  navigate(
                    '/incidents',
                  )
              }
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />

              Back to incidents
            </button>
          }
        />

        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />

            <div>
              <p className="text-sm font-medium">
                Incident read failed
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {incidentQuery.error instanceof Error
                  ? incidentQuery.error.message
                  : 'Incident is unavailable.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }


  const incident =
    incidentQuery
      .data
      .incident


  const timeline =
    timelineQuery
      .data
      ?.timeline ??
    []


  const intelligence =
    intelligenceQuery
      .intelligence


  const intelligenceRecord =
    intelligence &&
    typeof intelligence ===
      'object'
      ? intelligence as unknown as Record<string, unknown>
      : null


  const intelligenceSummary =
    intelligenceRecord
      ? (
          valueText(
            intelligenceRecord.summary,
          ) ??
          valueText(
            intelligenceRecord.diagnosis,
          ) ??
          valueText(
            intelligenceRecord.rootCause,
          )
        )
      : null


  const intelligenceConfidence =
    intelligenceRecord &&
    typeof intelligenceRecord.confidence ===
      'number'
      ? intelligenceRecord.confidence
      : null


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Incident command"
        title={
          incident.title
        }
        description={`${incident.serviceId} · authoritative incident, investigation, human-control, and recovery context.`}
        action={
          <button
            type="button"
            onClick={
              () =>
                navigate(
                  '/incidents',
                )
            }
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />

            Back to incidents
          </button>
        }
      />


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="aira-surface p-4">
          <p className="text-xs text-muted-foreground">
            Severity
          </p>

          <div className="mt-3">
            <StateBadge
              state={
                severityState(
                  incident.severity,
                )
              }
              label={
                incident.severity
              }
            />
          </div>
        </div>


        <div className="aira-surface p-4">
          <p className="text-xs text-muted-foreground">
            Status
          </p>

          <p className="mt-3 text-sm font-semibold capitalize">
            {
              incident.status
            }
          </p>
        </div>


        <div className="aira-surface p-4">
          <p className="text-xs text-muted-foreground">
            Occurrences
          </p>

          <p className="mt-3 text-sm font-semibold">
            {
              incident.occurrenceCount
            }
          </p>
        </div>


        <div className="aira-surface p-4">
          <p className="text-xs text-muted-foreground">
            Execution authorization
          </p>

          <p className="mt-3 text-sm font-semibold text-red-300">
            NOT GRANTED BY THIS VIEW
          </p>
        </div>
      </section>


      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          kicker="Incident history"
          title="Timeline"
        >
          {timelineQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />

              Loading timeline…
            </div>
          ) : timeline.length ===
            0 ? (
            <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <p className="text-xs text-muted-foreground">
                No timeline events have been persisted for this incident.
              </p>
            </div>
          ) : (
            <div className="space-y-4 border-l border-border pl-4">
              {timeline.map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item.id
                    }
                  >
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock3 className="h-3 w-3" />

                      {
                        formatTime(
                          item.occurredAt,
                        )
                      }
                    </div>

                    <p className="mt-1 text-xs font-medium">
                      {
                        item.eventType
                      }
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {
                        item.description
                      }
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </SectionCard>


        <SectionCard
          kicker="Observed evidence"
          title="Incident evidence"
        >
          {incident.evidence.length ===
          0 ? (
            <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <p className="text-xs text-muted-foreground">
                No evidence is currently attached to this incident.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {incident.evidence.map(
                (
                  evidence,
                  index,
                ) => (
                  <div
                    key={`${evidence.checkedAt}-${index}`}
                    className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />

                        <p className="text-xs font-medium">
                          {
                            evidence.status
                          }
                        </p>
                      </div>

                      <span className="text-[10px] text-muted-foreground">
                        {
                          formatTime(
                            evidence.checkedAt,
                          )
                        }
                      </span>
                    </div>

                    <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground">
                      <span>
                        HTTP:{' '}
                        {
                          evidence.statusCode ??
                          '—'
                        }
                      </span>

                      <span>
                        Response:{' '}
                        {
                          evidence.responseTimeMs !=
                          null
                            ? `${evidence.responseTimeMs} ms`
                            : '—'
                        }
                      </span>

                      {evidence.sanitizedErrorMessage && (
                        <span>
                          Error:{' '}
                          {
                            evidence.sanitizedErrorMessage
                          }
                        </span>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </SectionCard>
      </section>


      <SectionCard
        kicker="Investigation"
        title="AIRA intelligence"
        action={
          <BrainCircuit className="h-4 w-4 text-cyan-300" />
        }
      >
        {intelligenceQuery.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />

            Loading intelligence…
          </div>
        ) : intelligenceQuery.error ? (
          <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
            <p className="text-xs text-muted-foreground">
              No current AIRA intelligence result is available for this incident.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4 md:col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Current analysis
              </p>

              <p className="mt-2 text-xs leading-5">
                {intelligenceSummary ??
                  'Intelligence exists, but no human-readable summary is exposed by this result.'}
              </p>
            </div>


            <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Confidence
              </p>

              <p className="mt-2 text-sm font-semibold">
                {intelligenceConfidence ==
                null
                  ? '—'
                  : `${Math.round(
                      intelligenceConfidence *
                        100,
                    )}%`}
              </p>
            </div>
          </div>
        )}
      </SectionCard>


      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-300" />

          <div>
            <p className="text-sm font-medium">
              Human command & takeover
            </p>

            <p className="text-[11px] text-muted-foreground">
              Existing Phase-23 control-plane state. Actions remain independently permissioned.
            </p>
          </div>
        </div>

        <IncidentCommandPanel
          incidentId={
            incidentId
          }
        />
      </section>


      <SafetyBoundary>
        Incident state, investigation evidence, human takeover, recovery decisions, certification, verification and execution authorization remain separate authority domains. This command center does not infer or grant infrastructure execution rights.
      </SafetyBoundary>
    </div>
  )
}