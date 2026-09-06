import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Info,
  ShieldAlert,
} from 'lucide-react'

export type FeatureState =
  | 'healthy'
  | 'degraded'
  | 'warning'
  | 'critical'
  | 'info'
  | 'unknown'

const stateClass: Record<FeatureState, string> = {
  healthy: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300',
  degraded: 'border-amber-400/20 bg-amber-400/[0.06] text-amber-300',
  warning: 'border-amber-400/20 bg-amber-400/[0.06] text-amber-300',
  critical: 'border-red-400/20 bg-red-400/[0.06] text-red-300',
  info: 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300',
  unknown: 'border-border bg-secondary/30 text-muted-foreground',
}

export function StateBadge({
  state,
  label,
}: {
  state: FeatureState
  label?: string
}) {
  const Icon =
    state === 'healthy'
      ? CheckCircle2
      : state === 'critical'
        ? ShieldAlert
        : state === 'info'
          ? Info
          : state === 'unknown'
            ? CircleHelp
            : AlertTriangle

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize',
        stateClass[state],
      ].join(' ')}
    >
      <Icon className="h-3 w-3" />
      {label ?? state}
    </span>
  )
}

export function MetricCard({
  label,
  value,
  detail,
  state = 'unknown',
}: {
  label: string
  value: string
  detail?: string
  state?: FeatureState
}) {
  const dot =
    state === 'healthy'
      ? 'bg-emerald-400'
      : state === 'critical'
        ? 'bg-red-400'
        : state === 'info'
          ? 'bg-cyan-400'
          : state === 'unknown'
            ? 'bg-muted-foreground'
            : 'bg-amber-400'

  return (
    <div className="aira-surface relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={['mt-1 h-2 w-2 rounded-full', dot].join(' ')} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  )
}

export function SectionCard({
  kicker,
  title,
  action,
  children,
  className = '',
}: {
  kicker?: string
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={['aira-surface p-5', className].join(' ')}>
      <div className="aira-panel-header">
        <div>
          {kicker && <p className="aira-kicker">{kicker}</p>}
          <h2 className={kicker ? 'mt-1 text-sm font-semibold' : 'text-sm font-semibold'}>
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function FixtureNotice({
  text = 'Phase 25 presentation fixture — authoritative data arrives through the Product BFF/read model in Phase 25.6.',
}: {
  text?: string
}) {
  return (
    <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-[11px] leading-5 text-amber-100/80">
      {text}
    </div>
  )
}

export function SafetyBoundary({
  children,
}: {
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/[0.12] px-4 py-3">
      <p className="text-xs font-medium">AIRA safety boundary</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {children ??
          'Product persona, confidence, recommendations, certification state, and UI controls do not themselves authorize infrastructure execution. Canonical backend permissions, tenant/environment scope, policy, approvals, kill switch, and execution authorization remain authoritative.'}
      </p>
    </div>
  )
}
