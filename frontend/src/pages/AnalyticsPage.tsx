import {
    useActionAccuracy,
    useConfidenceTrends,
    useEffectivenessRecords,
} from '@/api/hooks/useAnalytics'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPercent } from '@/lib/format'
import { motion } from 'framer-motion'
import { Activity, Target, TrendingUp } from 'lucide-react'
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts'

export default function AnalyticsPage() {
  const { data: trends, isLoading: loadingTrends, error: trendErr, refetch: refetchTrends } = useConfidenceTrends()
  const { data: accuracy, isLoading: loadingAccuracy } = useActionAccuracy()
  const { data: effectiveness, isLoading: loadingEff } = useEffectivenessRecords()

  const trendData: any[] = Array.isArray(trends) ? trends : (trends as any)?.trends ?? []
  const accuracyData: any[] = Array.isArray(accuracy)
    ? accuracy
    : (accuracy as any)?.accuracy ?? (accuracy as any)?.byAction ?? []
  const effData: any[] = Array.isArray(effectiveness)
    ? effectiveness
    : (effectiveness as any)?.records ?? (effectiveness as any)?.byAction ?? []

  const avgConfidence = trendData.length
    ? trendData.reduce((sum, d) => sum + (d.score ?? d.confidence ?? d.avgConfidence ?? 0), 0) / trendData.length
    : null

  const tooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 6,
    fontSize: 12,
  }

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Confidence trends and action effectiveness</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Avg Confidence"
          value={avgConfidence != null ? formatPercent(avgConfidence) : '—'}
          icon={TrendingUp}
          description="Rolling average"
        />
        <MetricCard
          title="Effectiveness Records"
          value={effData.length}
          icon={Activity}
          description="Total evaluated"
        />
        <MetricCard
          title="Action Accuracy"
          value={accuracyData.length ? `${accuracyData.length} actions` : '—'}
          icon={Target}
        />
      </div>

      {/* Confidence Trend Chart */}
      <Card>
        <CardHeader><CardTitle>Confidence Trend</CardTitle></CardHeader>
        <CardContent>
          {trendErr ? (
            <ErrorState description={(trendErr as Error).message} onRetry={() => refetchTrends()} className="py-8" />
          ) : loadingTrends ? (
            <Skeleton className="h-48" />
          ) : trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No trend data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  formatter={(v: any, name: string) => [`${Math.round(Number(v) * 100)}%`, 'Confidence']}
                  contentStyle={tooltipStyle}
                />
                <ReferenceLine y={0.8} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: 'Target 80%', fontSize: 10, fill: 'hsl(var(--primary))' }} />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} name="Confidence" />
                <Line type="monotone" dataKey="confidence" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} name="Confidence" />
                <Line type="monotone" dataKey="avgConfidence" stroke="hsl(142, 76%, 36%)" dot={false} strokeWidth={2} name="Avg Confidence" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Action Accuracy Chart */}
      <Card>
        <CardHeader><CardTitle>Action Accuracy</CardTitle></CardHeader>
        <CardContent>
          {loadingAccuracy ? (
            <Skeleton className="h-48" />
          ) : accuracyData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No accuracy data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={accuracyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="action" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  formatter={(v: any, name: string) => {
                    const pct = Number(v) > 1 ? Number(v) : Math.round(Number(v) * 100)
                    return [`${pct}%`, 'Accuracy']
                  }}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="accuracy" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Accuracy" />
                <Bar dataKey="successRate" fill="hsl(142, 76%, 36%)" radius={[3, 3, 0, 0]} name="Success Rate" />
                <Bar dataKey="effectivenessScore" fill="hsl(221, 83%, 53%)" radius={[3, 3, 0, 0]} name="Effectiveness" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
