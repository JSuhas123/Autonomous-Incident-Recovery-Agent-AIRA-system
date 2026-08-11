import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import {
    AlertCircle,
    CheckCircle,
    ChevronRight,
    Clock,
    Loader2,
    RotateCcw,
    SkipForward,
    XCircle,
} from 'lucide-react'

export interface TimelineEvent {
  id: string
  type: 'stage' | 'approval' | 'rollback' | 'escalation' | 'outcome'
  label: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'ROLLED_BACK' | 'ESCALATED' | 'WAITING'
  startedAt?: string
  completedAt?: string
  durationMs?: number
  detail?: string
  runbookId?: string
}

const STATUS_CONFIG: Record<
  TimelineEvent['status'],
  { icon: React.ReactNode; color: string; badgeClass: string }
> = {
  PENDING:     { icon: <Clock className="w-3.5 h-3.5" />,       color: 'bg-zinc-400',    badgeClass: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
  RUNNING:     { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: 'bg-blue-500',  badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  SUCCEEDED:   { icon: <CheckCircle className="w-3.5 h-3.5" />,  color: 'bg-emerald-500', badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  FAILED:      { icon: <XCircle className="w-3.5 h-3.5" />,      color: 'bg-rose-500',    badgeClass: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
  SKIPPED:     { icon: <SkipForward className="w-3.5 h-3.5" />,  color: 'bg-amber-400',   badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  ROLLED_BACK: { icon: <RotateCcw className="w-3.5 h-3.5" />,    color: 'bg-orange-500',  badgeClass: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  ESCALATED:   { icon: <AlertCircle className="w-3.5 h-3.5" />,  color: 'bg-purple-500',  badgeClass: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  WAITING:     { icon: <Clock className="w-3.5 h-3.5" />,        color: 'bg-amber-500',   badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

interface ExecutionTimelineProps {
  events: TimelineEvent[]
  className?: string
}

/**
 * ExecutionTimeline — renders a vertical timeline of playbook/runbook
 * execution stages with status indicators, durations and details.
 */
export function ExecutionTimeline({ events, className }: ExecutionTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground py-6 text-center', className)}>
        No execution events to display.
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* Vertical connector line */}
      <div
        className="absolute left-[13px] top-4 bottom-4 w-px bg-border"
        aria-hidden="true"
      />

      <ol className="space-y-3">
        {events.map((event, idx) => {
          const cfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.PENDING
          const isLast = idx === events.length - 1

          return (
            <li key={event.id} className="relative flex items-start gap-3 pl-0">
              {/* Status dot */}
              <div
                className={cn(
                  'relative z-10 flex items-center justify-center w-7 h-7 rounded-full border-2 border-background shrink-0',
                  cfg.color,
                  'text-white',
                )}
              >
                {cfg.icon}
              </div>

              {/* Content */}
              <div className={cn('flex-1 min-w-0 pb-1', isLast ? '' : '')}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{event.label}</span>
                  <Badge variant="outline" className={cn('text-xs h-5', cfg.badgeClass)}>
                    {event.status}
                  </Badge>
                  {event.runbookId && (
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {event.runbookId}
                    </code>
                  )}
                  {event.durationMs != null && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDuration(event.durationMs)}
                    </span>
                  )}
                  {event.type === 'stage' && (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>

                {event.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{event.detail}</p>
                )}

                {(event.startedAt || event.completedAt) && (
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    {event.startedAt && <span>Started: {event.startedAt}</span>}
                    {event.completedAt && <span>Completed: {event.completedAt}</span>}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default ExecutionTimeline
