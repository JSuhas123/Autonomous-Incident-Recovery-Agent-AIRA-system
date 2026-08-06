import { useIncidents } from '@/api/hooks/useIncidents'
import { IncidentSeverityBadge, IncidentStatusBadge } from '@/components/incidents/IncidentBadges'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { IncidentSeverity, IncidentStatus } from '@/types/incident'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STATUS_OPTIONS: { value: IncidentStatus | 'all'; label: string }[] = [
  { value: 'all',           label: 'All statuses' },
  { value: 'open',          label: 'Open' },
  { value: 'acknowledged',  label: 'Acknowledged' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'recovering',    label: 'Recovering' },
  { value: 'resolved',      label: 'Resolved' },
  { value: 'closed',        label: 'Closed' },
]

const SEVERITY_OPTIONS: { value: IncidentSeverity | 'all'; label: string }[] = [
  { value: 'all',      label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning',  label: 'Warning' },
  { value: 'info',     label: 'Info' },
]

export default function IncidentListPage() {
  const navigate = useNavigate()
  const [status, setStatus]     = useState<IncidentStatus | 'all'>('all')
  const [severity, setSeverity] = useState<IncidentSeverity | 'all'>('all')

  const params = {
    ...(status   !== 'all' ? { status }   : {}),
    ...(severity !== 'all' ? { severity } : {}),
    limit: 100,
  }

  const { data, isLoading, error, refetch } = useIncidents(params)
  const incidents = data?.incidents ?? []

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Observed failures generated from real monitor state transitions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={status} onValueChange={(v) => setStatus(v as IncidentStatus | 'all')}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={severity} onValueChange={(v) => setSeverity(v as IncidentSeverity | 'all')}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((k) => <Skeleton key={k} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Failed to load incidents.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : incidents.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium">No incidents found</p>
            <p className="text-sm text-muted-foreground">
              Incidents are generated automatically when monitors detect repeated observed failures.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <Card
              key={inc.id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => navigate(`/incidents/${inc.id}`)}
            >
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <IncidentSeverityBadge severity={inc.severity} />
                    <IncidentStatusBadge status={inc.status} />
                    {inc.occurrenceCount > 1 && (
                      <span className="text-xs text-muted-foreground">{inc.occurrenceCount}× observed</span>
                    )}
                  </div>
                  <p className="font-medium text-sm leading-snug">{inc.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{inc.description}</p>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(inc.detectedAt).toLocaleString()}
                  </p>
                  {inc.resolvedAt && (
                    <p className="text-xs text-green-600">
                      Resolved {new Date(inc.resolvedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  )
}
