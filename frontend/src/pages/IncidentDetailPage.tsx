import { useAcknowledgeIncident, useIncident, useIncidentTimeline, useReopenIncident, useResolveIncident } from '@/api/hooks/useIncidents'
import { IncidentSeverityBadge, IncidentStatusBadge } from '@/components/incidents/IncidentBadges'
import { IncidentTimeline } from '@/components/incidents/IncidentTimeline'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, Server, ShieldAlert } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

export default function IncidentDetailPage() {
  const { incidentId = '' } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { data, isLoading, error, refetch } = useIncident(incidentId)
  const { data: tlData, isLoading: tlLoading } = useIncidentTimeline(incidentId)

  const acknowledge = useAcknowledgeIncident()
  const resolve     = useResolveIncident()
  const reopen      = useReopenIncident()

  const inc = data?.incident

  async function handleAck() {
    try {
      await acknowledge.mutateAsync({ incidentId })
      toast({ title: 'Incident acknowledged' })
    } catch (e: unknown) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  async function handleResolve() {
    try {
      await resolve.mutateAsync({ incidentId })
      toast({ title: 'Incident resolved' })
    } catch (e: unknown) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  async function handleReopen() {
    try {
      await reopen.mutateAsync({ incidentId })
      toast({ title: 'Incident reopened' })
    } catch (e: unknown) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !inc) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <ShieldAlert className="w-10 h-10 text-muted-foreground" />
        <p className="font-medium">Incident not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/incidents')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to incidents
        </Button>
      </div>
    )
  }

  const canAck     = inc.status === 'open'
  const canResolve = ['open', 'acknowledged', 'investigating', 'recovering'].includes(inc.status)
  const canReopen  = ['resolved', 'closed'].includes(inc.status)

  return (
    <motion.div
      className="space-y-5 max-w-4xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/incidents')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Incidents
        </Button>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <IncidentSeverityBadge severity={inc.severity} />
                <IncidentStatusBadge status={inc.status} />
                {inc.occurrenceCount > 1 && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {inc.occurrenceCount}× observed
                  </span>
                )}
              </div>
              <h1 className="text-lg font-semibold leading-snug">{inc.title}</h1>
              {inc.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{inc.description}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 shrink-0 flex-wrap">
              {canAck && (
                <Button size="sm" variant="outline" onClick={handleAck} disabled={acknowledge.isPending}>
                  Acknowledge
                </Button>
              )}
              {canResolve && (
                <Button size="sm" onClick={handleResolve} disabled={resolve.isPending}>
                  Mark resolved
                </Button>
              )}
              {canReopen && (
                <Button size="sm" variant="outline" onClick={handleReopen} disabled={reopen.isPending}>
                  Reopen
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Detected</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                {new Date(inc.detectedAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last observed</p>
              <p className="font-medium">{new Date(inc.lastObservedAt).toLocaleString()}</p>
            </div>
            {inc.acknowledgedAt && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Acknowledged</p>
                <p className="font-medium">{new Date(inc.acknowledgedAt).toLocaleString()}</p>
              </div>
            )}
            {inc.resolvedAt && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Resolved</p>
                <p className="font-medium text-green-600">{new Date(inc.resolvedAt).toLocaleString()}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Service</p>
              <p className="font-medium flex items-center gap-1">
                <Server className="w-3.5 h-3.5 text-muted-foreground" />
                <button
                  className="hover:underline text-left"
                  onClick={() => navigate(`/services/${inc.serviceId}`)}
                >
                  View service
                </button>
              </p>
            </div>
          </div>

          {inc.impact && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Impact</p>
                <p className="text-sm">{inc.impact}</p>
              </div>
            </>
          )}

          {inc.resolution && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Resolution</p>
                <p className="text-sm">{inc.resolution}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Evidence */}
      {inc.evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Probable contributing signals</CardTitle>
            <p className="text-xs text-muted-foreground">
              Sanitized results from monitor checks. These are observed failures — not confirmed root causes.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inc.evidence.slice(-5).reverse().map((ev, i) => (
                <div key={i} className="flex items-center gap-3 text-xs border rounded p-2.5">
                  <span className={ev.status === 'healthy' ? 'text-green-600' : 'text-red-500'}>
                    ●
                  </span>
                  <span className="text-muted-foreground w-36 shrink-0">
                    {new Date(ev.checkedAt).toLocaleString()}
                  </span>
                  <span className="font-medium">
                    {ev.sanitizedErrorMessage ?? (ev.statusCode ? `HTTP ${ev.statusCode}` : ev.status)}
                  </span>
                  {ev.responseTimeMs != null && (
                    <span className="text-muted-foreground ml-auto">{ev.responseTimeMs} ms</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {tlLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((k) => <Skeleton key={k} className="h-10 w-full" />)}
            </div>
          ) : (
            <IncidentTimeline events={tlData?.timeline ?? []} />
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
