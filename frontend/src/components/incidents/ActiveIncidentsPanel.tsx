import { useIncidents } from '@/api/hooks/useIncidents'
import { IncidentSeverityBadge, IncidentStatusBadge } from '@/components/incidents/IncidentBadges'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function ActiveIncidentsPanel() {
  const navigate = useNavigate()
  const { data, isLoading } = useIncidents({ status: 'open', limit: 5 })
  const { data: ackData } = useIncidents({ status: 'acknowledged', limit: 5 })
  const { data: resolvedData } = useIncidents({ status: 'resolved', limit: 3 })

  const activeIncidents = [
    ...(data?.incidents ?? []),
    ...(ackData?.incidents ?? []),
  ]
  const recentlyResolved = resolvedData?.incidents ?? []
  const affectedServices = new Set(activeIncidents.map((i) => String(i.serviceId))).size

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Incidents</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[1, 2].map((k) => <Skeleton key={k} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Incidents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-2xl font-bold text-foreground">{activeIncidents.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-2xl font-bold text-foreground">{affectedServices}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Services affected</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-2xl font-bold text-green-600">{recentlyResolved.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Recently resolved</p>
          </div>
        </div>

        {/* Active incidents list */}
        {activeIncidents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">No active incidents.</p>
        ) : (
          <ul className="space-y-2">
            {activeIncidents.map((inc) => (
              <li
                key={inc.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => navigate(`/incidents/${inc.id}`)}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium truncate">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inc.detectedAt).toLocaleString()}
                    {inc.occurrenceCount > 1 && ` · ${inc.occurrenceCount}×`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <IncidentSeverityBadge severity={inc.severity} />
                  <IncidentStatusBadge status={inc.status} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Recently resolved */}
        {recentlyResolved.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Recently resolved</p>
            <ul className="space-y-1.5">
              {recentlyResolved.map((inc) => (
                <li
                  key={inc.id}
                  className="flex items-center justify-between gap-2 text-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                >
                  <span className="truncate">{inc.title}</span>
                  <span className="text-xs shrink-0">
                    {inc.resolvedAt ? new Date(inc.resolvedAt).toLocaleDateString() : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
