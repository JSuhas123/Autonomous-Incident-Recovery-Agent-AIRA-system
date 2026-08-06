import { useOnboardingStatus } from '@/api/hooks/useDashboard'
import { ActiveIncidentsPanel } from '@/components/incidents/ActiveIncidentsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store/authStore'
import { motion } from 'framer-motion'
import { CheckCircle2, Circle, Plug, Plus, Server } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const ONBOARDING_STEPS = [
  {
    key: 'workspaceCreated' as const,
    label: 'Workspace created',
    description: 'Your organization workspace is ready.',
  },
  {
    key: 'serviceAdded' as const,
    label: 'First service added',
    description: 'Register a service AIRA will monitor.',
  },
  {
    key: 'monitoringConnected' as const,
    label: 'Monitor activated',
    description: 'Connect a monitoring integration to start receiving events.',
  },
  {
    key: 'firstEventReceived' as const,
    label: 'First event received',
    description: 'AIRA received its first signal from your infrastructure.',
  },
  {
    key: 'firstInsightGenerated' as const,
    label: 'First insight generated',
    description: 'AIRA produced its first automated decision.',
  },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const organization = useAuthStore((s) => s.organization)
  const { data: onboarding, isLoading } = useOnboardingStatus()

  const completedCount = onboarding
    ? ONBOARDING_STEPS.filter((s) => onboarding[s.key]).length
    : 0

  return (
    <motion.div
      className="space-y-8 max-w-3xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Welcome heading */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome to AIRA{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {organization?.name
            ? `You're setting up ${organization.name}.`
            : 'Get started by connecting your first monitored service.'}{' '}
          No services are connected yet.
        </p>
      </div>

      {/* Three-step getting-started flow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Get started in three steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-5">
            {[
              {
                step: 1,
                title: 'Add a service',
                body: 'Register the services you want AIRA to monitor and protect.',
                action: () => navigate('/services'),
                cta: 'Add service',
              },
              {
                step: 2,
                title: 'Connect monitoring',
                body: 'Link your existing observability tools — Datadog, Prometheus, PagerDuty, and more.',
                action: () => navigate('/integrations'),
                cta: 'Browse integrations',
              },
              {
                step: 3,
                title: 'Receive insights',
                body: 'AIRA analyses signals and surfaces automated recovery recommendations.',
                action: () => navigate('/insights'),
                cta: 'View insights',
              },
            ].map(({ step, title, body, action, cta }) => (
              <li key={step} className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  {step}
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{body}</p>
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <Button size="sm" variant="outline" onClick={action}>
                    {cta}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Primary and secondary CTA */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate('/services')} className="gap-2">
          <Plus className="w-4 h-4" />
          Add your first service
        </Button>
        <Button variant="outline" onClick={() => navigate('/integrations')} className="gap-2">
          <Plug className="w-4 h-4" />
          Explore integrations
        </Button>
      </div>

      {/* Onboarding progress checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              Setup progress
            </span>
            {isLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : (
              <span className="text-xs text-muted-foreground font-normal">
                {completedCount} / {ONBOARDING_STEPS.length} completed
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {ONBOARDING_STEPS.map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {ONBOARDING_STEPS.map(({ key, label, description }) => {
                const done = onboarding?.[key] ?? false
                return (
                  <li key={key} className="flex items-start gap-3 py-1">
                    {done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${done ? 'line-through text-muted-foreground' : ''}`}>
                        {label}
                      </p>
                      {!done && (
                        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Active incidents */}
      <ActiveIncidentsPanel />
    </motion.div>
  )
}
