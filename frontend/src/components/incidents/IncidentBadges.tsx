import { cn } from '@/lib/cn'
import type { IncidentSeverity, IncidentStatus } from '@/types/incident'

const STATUS_STYLES: Record<IncidentStatus, string> = {
  open:           'bg-red-100 text-red-800 border-red-200',
  acknowledged:   'bg-amber-100 text-amber-800 border-amber-200',
  investigating:  'bg-blue-100 text-blue-800 border-blue-200',
  recovering:     'bg-violet-100 text-violet-800 border-violet-200',
  resolved:       'bg-green-100 text-green-800 border-green-200',
  closed:         'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open:           'Open',
  acknowledged:   'Acknowledged',
  investigating:  'Investigating',
  recovering:     'Recovering',
  resolved:       'Resolved',
  closed:         'Closed',
}

const SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  info:     'bg-blue-50 text-blue-700 border-blue-200',
  warning:  'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
      STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
    )}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function IncidentSeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border uppercase tracking-wide',
      SEVERITY_STYLES[severity] ?? 'bg-slate-100 text-slate-600 border-slate-200'
    )}>
      {severity}
    </span>
  )
}
