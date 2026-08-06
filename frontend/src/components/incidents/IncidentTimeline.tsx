import { cn } from '@/lib/cn'
import type { IncidentTimelineEvent } from '@/types/incident'
import { AlertCircle, CheckCircle2, RefreshCw, User, Wrench } from 'lucide-react'

const EVENT_ICONS: Record<string, React.ElementType> = {
  opened:           AlertCircle,
  observed_failure: AlertCircle,
  acknowledged:     User,
  assigned:         User,
  resolved:         CheckCircle2,
  closed:           CheckCircle2,
  reopened:         RefreshCw,
  status_changed:   Wrench,
}

const EVENT_COLORS: Record<string, string> = {
  opened:           'text-red-500',
  observed_failure: 'text-red-400',
  acknowledged:     'text-amber-500',
  resolved:         'text-green-500',
  closed:           'text-slate-400',
  reopened:         'text-violet-500',
}

export function IncidentTimeline({ events }: { events: IncidentTimelineEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No timeline events yet.</p>
  }

  return (
    <ol className="relative space-y-0">
      {events.map((ev, i) => {
        const Icon = EVENT_ICONS[ev.eventType] ?? Wrench
        const color = EVENT_COLORS[ev.eventType] ?? 'text-slate-400'
        const isLast = i === events.length - 1

        return (
          <li key={ev.id ?? i} className="flex gap-4">
            {/* Vertical connector */}
            <div className="flex flex-col items-center">
              <span className={cn('mt-1 shrink-0', color)}>
                <Icon className="w-4 h-4" />
              </span>
              {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-0" />}
            </div>

            {/* Content */}
            <div className={cn('pb-5 min-w-0', isLast && 'pb-0')}>
              <p className="text-sm font-medium leading-snug">{ev.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(ev.occurredAt).toLocaleString()}
                {ev.actor === 'user' && ' · user action'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
