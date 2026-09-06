import { Bell, CheckCheck } from 'lucide-react'
import { FeaturePageHeader, FixtureNotice, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { NOTIFICATIONS_FIXTURE } from './notifications.fixture'

export default function ProductNotificationsPage() {
  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Product inbox"
        title="Notifications"
        description="In-product incident, approval, human-task, recovery, trust, certification, integration, policy, and security notifications."
      />
      <FixtureNotice />

      <SectionCard
        kicker="Inbox"
        title="Recent notifications"
        action={<button className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
      >
        <div className="space-y-2">
          {NOTIFICATIONS_FIXTURE.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/40"><Bell className="h-3.5 w-3.5 text-muted-foreground" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium">{item.title}</p>
                  {item.unread && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.detail}</p>
                <p className="mt-2 text-[9px] uppercase tracking-wider text-muted-foreground">{item.kind.replace(/_/g, ' ')}</p>
              </div>
              <StateBadge state={item.state} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SafetyBoundary>
        Notification eligibility and actionable approval links must ultimately come from backend permission and routing decisions, not browser persona.
      </SafetyBoundary>
    </div>
  )
}
