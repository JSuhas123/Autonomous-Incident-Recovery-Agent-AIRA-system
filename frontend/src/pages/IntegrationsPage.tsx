import { useWebhookEvents, useWebhookStats } from '@/api/hooks/useIntegrations'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime, truncate } from '@/lib/format'
import { Activity, CheckCircle, Plug, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'

export default function IntegrationsPage() {
  const { data: events, isLoading, error, refetch } = useWebhookEvents()
  const { data: stats } = useWebhookStats()

  const s = stats as any
  const items: any[] = Array.isArray(events) ? events : (events as any)?.events ?? []

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Webhook history and outbound event delivery</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Total Events" value={s?.total ?? items.length} icon={Activity} />
        <MetricCard title="Delivered" value={s?.delivered ?? 0} icon={CheckCircle} iconColor="text-emerald-400" />
        <MetricCard title="Failed" value={s?.failed ?? 0} icon={XCircle} iconColor="text-red-400" />
      </div>

      <Card>
        <CardHeader><CardTitle>Webhook Events</CardTitle></CardHeader>
        <CardContent className="p-0">
          {error ? (
            <ErrorState description={(error as Error).message} onRetry={() => refetch()} className="py-10" />
          ) : isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Plug} title="No webhook events" description="Events will appear when integrations fire" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Event Type', 'URL', 'Status', 'Response', 'Sent At'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium first:pl-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((ev: any, i: number) => (
                  <tr key={ev._id ?? i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="pl-6 pr-4 py-2 font-medium">{ev.eventType ?? ev.type ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{truncate(ev.url ?? '—', 40)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={ev.status === 'delivered' || ev.success ? 'success' : 'destructive'}>
                        {ev.status ?? (ev.success ? 'delivered' : 'failed')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{ev.responseCode ?? ev.statusCode ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatDateTime(ev.sentAt ?? ev.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
 
