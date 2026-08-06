import { useMonitorChecks, usePauseMonitor, useResumeMonitor, useServiceMonitors } from '@/api/hooks/useMonitors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { Monitor } from '@/types/monitor'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, PauseCircle, PlayCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import MonitorForm from './MonitorForm'
import ResponseTimeChart from './ResponseTimeChart'

interface Props {
  serviceId: string
}

function StatusIcon({ status }: { status: Monitor['lastStatus'] }) {
  if (status === 'healthy')  return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
  if (status === 'degraded') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
  if (status === 'down')     return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
  return <Clock className="w-4 h-4 text-slate-400 shrink-0" />
}

function statusBadge(status: Monitor['lastStatus']) {
  switch (status) {
    case 'healthy':  return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0 text-xs">Healthy</Badge>
    case 'degraded': return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-0 text-xs">Degraded</Badge>
    case 'down':     return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0 text-xs">Down</Badge>
    default:         return <Badge variant="secondary" className="text-xs">Unknown</Badge>
  }
}

function MonitorCard({ monitor }: { monitor: Monitor }) {
  const [expanded, setExpanded] = useState(false)
  const pauseMutation  = usePauseMonitor()
  const resumeMutation = useResumeMonitor()
  const { data: checksData } = useMonitorChecks(monitor.id, { limit: 30 })
  const checks = checksData?.checks ?? []

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <StatusIcon status={monitor.lastStatus} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{monitor.name}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">{monitor.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {statusBadge(monitor.lastStatus)}
          {!monitor.enabled && <Badge variant="outline" className="text-xs">Paused</Badge>}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7"
            title={monitor.enabled ? 'Pause' : 'Resume'}
            onClick={() =>
              monitor.enabled
                ? pauseMutation.mutate(monitor.id)
                : resumeMutation.mutate(monitor.id)
            }
            disabled={pauseMutation.isPending || resumeMutation.isPending}
          >
            {monitor.enabled
              ? <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" />
              : <PlayCircle  className="w-3.5 h-3.5 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {monitor.lastCheckedAt && (
          <span>Checked {new Date(monitor.lastCheckedAt).toLocaleTimeString()}</span>
        )}
        {monitor.lastStatusCode != null && <span>HTTP {monitor.lastStatusCode}</span>}
        {monitor.lastResponseTimeMs != null && <span>{monitor.lastResponseTimeMs} ms</span>}
        {monitor.lastStatus === 'unknown' && !monitor.lastCheckedAt && <span>Pending first check</span>}
      </div>

      {expanded && (
        <ResponseTimeChart checks={checks} />
      )}
    </div>
  )
}

export default function ServiceMonitoringTab({ serviceId }: Props) {
  const { data, isLoading, error, refetch } = useServiceMonitors(serviceId)
  const [addOpen, setAddOpen] = useState(false)
  const monitors = data?.monitors ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {monitors.length === 0 ? 'No monitors configured yet.' : `${monitors.length} monitor${monitors.length !== 1 ? 's' : ''}`}
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add monitor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add monitor</DialogTitle>
            </DialogHeader>
            <MonitorForm
              serviceId={serviceId}
              onSuccess={() => {
                setAddOpen(false)
                refetch()
              }}
              onCancel={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load monitors: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && monitors.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Clock className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium text-sm">No monitors yet</p>
            <p className="text-sm text-muted-foreground">
              Add a monitor to start tracking this service's uptime and performance.
            </p>
          </CardContent>
        </Card>
      )}

      {monitors.length > 0 && (
        <div className="space-y-3">
          {monitors.map((m) => <MonitorCard key={m.id} monitor={m} />)}
        </div>
      )}
    </div>
  )
}
