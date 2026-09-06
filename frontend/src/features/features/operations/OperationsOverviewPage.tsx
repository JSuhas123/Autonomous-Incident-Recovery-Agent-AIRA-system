import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { OPERATIONS_OVERVIEW_FIXTURE } from './operationsOverview.fixture'
import { WorkflowStateBadge } from './WorkflowStateBadge'

export default function OperationsOverviewPage() {
  const navigate = useNavigate()
  const model = OPERATIONS_OVERVIEW_FIXTURE
  const incident = model.primaryIncident

  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Live operations"
        title="Operations"
        description="Incident pressure, investigation, human intervention, recovery, and verification state for SRE and platform engineering."
      />
      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {model.metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
      </section>

      <section className="aira-surface overflow-hidden">
        <div className="border-b border-border/70 bg-red-400/[0.025] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge state="critical" label={incident.severity} />
                <WorkflowStateBadge state={incident.state} />
              </div>
              <h2 className="mt-3 text-xl font-semibold">{incident.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{incident.service}</p>
            </div>
            <button onClick={() => navigate(`/incidents/${incident.id}`)} className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
              Open incident <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid gap-px bg-border/60 xl:grid-cols-3">
          <div className="bg-card p-5">
            <p className="aira-kicker">Blast radius</p>
            <p className="mt-3 text-xs leading-5">{incident.blastRadius}</p>
          </div>
          <div className="bg-card p-5">
            <p className="aira-kicker">AIRA diagnosis</p>
            <p className="mt-3 text-xs leading-5">{incident.hypothesis}</p>
            <p className="mt-3 text-xs text-muted-foreground">Diagnosis confidence <strong className="text-foreground">{Math.round(incident.diagnosisConfidence * 100)}%</strong></p>
          </div>
          <div className="bg-card p-5">
            <p className="aira-kicker">Recovery candidate</p>
            <p className="mt-3 text-xs leading-5">{incident.recovery}</p>
            <p className="mt-3 text-xs text-muted-foreground">Recovery confidence <strong className="text-foreground">{Math.round(incident.recoveryConfidence * 100)}%</strong></p>
          </div>
        </div>

        <div className="grid gap-px border-t border-border/60 bg-border/60 xl:grid-cols-3">
          <div className="bg-card p-4">
            <p className="text-xs font-semibold">Policy</p>
            <p className="mt-2 text-[11px] font-medium text-amber-300">{incident.policy}</p>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-red-300" />
              <p className="text-xs font-semibold">Execution authorization</p>
            </div>
            <p className="mt-2 text-xs font-medium text-red-300">NOT AUTHORIZED</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{incident.authorizationReason}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs font-semibold">Verification</p>
            <div className="mt-2"><WorkflowStateBadge state={incident.verification} /></div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard kicker="Incident pressure" title="Active incident queue">
          <div className="divide-y divide-border/60">
            {model.incidents.map((item) => (
              <button key={item.id} onClick={() => navigate(`/incidents/${item.id}`)} className="flex w-full items-center gap-3 py-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{item.title}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{item.service} · {item.age}</p>
                </div>
                <WorkflowStateBadge state={item.state} />
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="Human takeover" title="Human tasks">
          <div className="space-y-2">
            {model.humanTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
                <p className="text-xs font-medium">{task.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{task.assignee} · waiting {task.waiting}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard kicker="Change intelligence" title="Recent correlated changes">
        <div className="grid gap-3 xl:grid-cols-3">
          {model.recentChanges.map((change) => (
            <div key={change.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{change.service}</p>
                <StateBadge state={change.correlation === 'high' ? 'critical' : change.correlation === 'medium' ? 'warning' : 'info'} label={`${change.correlation} correlation`} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{change.description}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">{change.age}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SafetyBoundary>
        Diagnosis confidence, recovery confidence, human approval, autonomy level, and persona remain separate from actual execution authorization.
      </SafetyBoundary>
    </div>
  )
}
