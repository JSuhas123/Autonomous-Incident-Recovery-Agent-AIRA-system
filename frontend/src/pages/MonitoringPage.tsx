import { useAllMonitors, useMonitorChecks, usePauseMonitor, useResumeMonitor } from '@/api/hooks/useMonitors'
import ResponseTimeChart from '@/components/monitors/ResponseTimeChart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Monitor } from '@/types/monitor'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, CheckCircle2, Clock, PauseCircle, PlayCircle } from 'lucide-react'
import { useState } from 'react'

function statusBadge(status: Monitor['lastStatus']) {
  switch (status) {
    case 'healthy':  return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">Healthy</Badge>
    case 'degraded': return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-0">Degraded</Badge>
    case 'down':     return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0">Down</Badge>
    default:         return <Badge variant="secondary">Unknown</Badge>
  }
}

function StatusIcon({ status }: { status: Monitor['lastStatus'] }) {
  if (status === 'healthy')  return <CheckCircle2 className="w-4 h-4 text-green-500" />
  if (status === 'degraded') return <AlertTriangle className="w-4 h-4 text-amber-500" />
  if (status === 'down')     return <AlertTriangle className="w-4 h-4 text-red-500" />
  return <Clock className="w-4 h-4 text-slate-400" />
}

function MonitorRow({ monitor }: { monitor: Monitor }) {
  const pauseMutation  = usePauseMonitor()
  const resumeMutation = useResumeMonitor()
  const { data: checksData } = useMonitorChecks(monitor.id, { limit: 30 })
  const [expanded, setExpanded] = useState(false)
  const checks = checksData?.checks ?? []

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={monitor.lastStatus} />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{monitor.name}</p>
            <p className="text-xs text-muted-foreground truncate">{monitor.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
              ? <PauseCircle className="w-4 h-4 text-muted-foreground" />
              : <PlayCircle  className="w-4 h-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Hide chart' : 'Show chart'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {monitor.lastCheckedAt && (
          <span>Last checked: {new Date(monitor.lastCheckedAt).toLocaleTimeString()}</span>
        )}
        {monitor.lastStatusCode != null && (
          <span>Status code: {monitor.lastStatusCode}</span>
        )}
        {monitor.lastResponseTimeMs != null && (
          <span>Response: {monitor.lastResponseTimeMs} ms</span>
        )}
        <span>Every {monitor.intervalSeconds}s</span>
        {monitor.consecutiveFailures > 0 && (
          <span className="text-red-500">{monitor.consecutiveFailures} consecutive failures</span>
        )}
      </div>
      {expanded && <ResponseTimeChart checks={checks} />}
    </div>
  )
}

export default function MonitoringPage() {
  const { data, isLoading, error } = useAllMonitors()
  const monitors = data?.monitors ?? []

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Monitoring</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real-time HTTP, HTTPS, and SSL checks for your services.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-muted-foreground" />
              No monitors configured
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Open a service and add a monitor from the Monitoring tab to start seeing real check data here.
          </CardContent>
        </Card>
      )}

      {monitors.length > 0 && (
        <div className="space-y-3">
          {monitors.map((m) => <MonitorRow key={m.id} monitor={m} />)}
        </div>
      )}
    </motion.div>
  )
}
