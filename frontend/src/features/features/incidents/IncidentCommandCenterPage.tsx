import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { FeaturePageHeader, FixtureNotice, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { INCIDENT_COMMAND_FIXTURE } from './incidentCommand.fixture'

export default function IncidentCommandCenterPage() {
  const navigate = useNavigate()
  const { incidentId } = useParams()
  const incident = { ...INCIDENT_COMMAND_FIXTURE, id: incidentId ?? INCIDENT_COMMAND_FIXTURE.id }

  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Incident command"
        title={incident.title}
        description={`${incident.service} · ${incident.environment} · full evidence, hypothesis, recovery, authorization, human-work, and verification context.`}
        action={
          <button onClick={() => navigate('/incidents')} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to incidents
          </button>
        }
      />
      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="aira-surface p-4"><p className="text-xs text-muted-foreground">Severity</p><div className="mt-3"><StateBadge state="critical" label={incident.severity} /></div></div>
        <div className="aira-surface p-4"><p className="text-xs text-muted-foreground">Status</p><p className="mt-3 text-sm font-semibold">{incident.status}</p></div>
        <div className="aira-surface p-4"><p className="text-xs text-muted-foreground">Execution authorization</p><p className="mt-3 text-sm font-semibold text-red-300">NOT AUTHORIZED</p></div>
        <div className="aira-surface p-4"><p className="text-xs text-muted-foreground">Verification</p><p className="mt-3 text-sm font-semibold text-cyan-300">{incident.recovery.verification}</p></div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard kicker="Incident history" title="Timeline">
          <div className="space-y-4 border-l border-border pl-4">
            {incident.timeline.map((item) => (
              <div key={item.id}>
                <p className="text-[10px] text-muted-foreground">{item.time}</p>
                <p className="mt-1 text-xs font-medium">{item.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="Evidence" title="Evidence collected">
          <div className="space-y-2">
            {incident.evidence.map((item) => <div key={item} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3 text-[11px] leading-5">{item}</div>)}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard kicker="Investigation" title="Ranked hypotheses">
          <div className="space-y-2">
            {incident.hypotheses.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
                <p className="text-xs font-medium">{item.title}</p>
                <strong className="text-xs">{Math.round(item.confidence * 100)}%</strong>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="Recovery" title="Candidate & authorization" action={<ShieldAlert className="h-4 w-4 text-red-300" />}>
          <p className="text-xs leading-5">{incident.recovery.action}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Recovery confidence</p><p className="mt-1 text-sm font-semibold">{Math.round(incident.recovery.confidence * 100)}%</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Risk</p><p className="mt-1 text-sm font-semibold capitalize">{incident.recovery.risk}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Policy</p><p className="mt-1 text-[11px] font-semibold text-amber-300">{incident.recovery.policy}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Execution</p><p className="mt-1 text-[11px] font-semibold text-red-300">BLOCKED</p></div>
          </div>
        </SectionCard>
      </section>

      <SafetyBoundary>
        Incident evidence, hypotheses, recovery confidence, approvals, execution authorization, and verification are intentionally separate product states.
      </SafetyBoundary>
    </div>
  )
}
