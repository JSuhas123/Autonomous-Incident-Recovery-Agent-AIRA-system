import { Check, Circle, CircleDot, ShieldCheck } from 'lucide-react'
import { FeaturePageHeader, FixtureNotice, SafetyBoundary, SectionCard } from '../shared'
import { ONBOARDING_FIXTURE } from './onboarding.fixture'

export default function ProductOnboardingPage() {
  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Evidence-driven onboarding"
        title="Set up AIRA"
        description="AIRA onboarding advances from real backend evidence—not from clicking Next—so customers know when each operational capability is genuinely ready."
      />
      <FixtureNotice />

      <SectionCard kicker="Customer journey" title="Organization readiness">
        <div className="space-y-2">
          {ONBOARDING_FIXTURE.map((step, index) => {
            const Icon = step.status === 'complete' ? Check : step.status === 'current' ? CircleDot : Circle
            return (
              <div key={step.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
                <div className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-full border', step.status === 'complete' ? 'border-emerald-400/20 text-emerald-300' : step.status === 'current' ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground'].join(' ')}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium">{index + 1}. {step.label}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{step.evidence}</p>
                </div>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{step.status}</span>
              </div>
            )
          })}
        </div>
      </SectionCard>

      <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-xs font-medium">Next: Invite your team</p></div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">The server will mark this step complete only after a real invitation/member state exists.</p>
      </div>

      <SafetyBoundary>
        Onboarding state is server-owned evidence. Frontend clicks must never manufacture readiness, certification, or execution authority.
      </SafetyBoundary>
    </div>
  )
}
