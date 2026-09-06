import { Eye, ShieldCheck } from 'lucide-react'
import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { SHADOW_MODE_FIXTURE } from './shadowMode.fixture'

export default function ShadowModePage() {
  const model = SHADOW_MODE_FIXTURE
  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Trust-building mode"
        title="Shadow Mode"
        description="Compare what AIRA observed, diagnosed, and would have done against real human decisions and outcomes without allowing autonomous execution."
      />
      <FixtureNotice />

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
        <div className="flex items-center gap-2 text-cyan-300"><Eye className="h-4 w-4" /><p className="text-sm font-medium">Shadow Mode active</p></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">AIRA may observe, investigate, recommend, and score expected recovery outcomes. Autonomous infrastructure execution remains disabled.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
      </section>

      <SectionCard kicker="Comparison" title="AIRA vs human decision">
        <div className="space-y-3">
          {model.cases.map((item) => (
            <div key={item.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-medium">{item.incident}</p>
                <StateBadge state={item.match ? 'healthy' : 'warning'} label={item.match ? 'Matched' : 'Different action'} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">AIRA would do</p><p className="mt-1 text-xs">{item.aira}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Engineer did</p><p className="mt-1 text-xs">{item.human}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outcome</p><p className="mt-1 text-xs">{item.outcome}</p></div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SafetyBoundary>
        Shadow Mode is explicitly non-executing. Recommendation quality may improve trust, but trust does not grant authorization.
      </SafetyBoundary>
    </div>
  )
}
