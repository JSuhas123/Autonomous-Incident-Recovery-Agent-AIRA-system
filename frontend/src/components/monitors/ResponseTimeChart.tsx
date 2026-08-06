import type { MonitorCheck } from '@/types/monitor'
import { useMemo } from 'react'
import {
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'

interface Props {
  checks: MonitorCheck[]
  /** Minimum number of checks required before showing the chart */
  minSamples?: number
}

const MIN_DEFAULT = 5

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function statusColor(status: MonitorCheck['status']) {
  switch (status) {
    case 'healthy':  return '#22c55e'  // green-500
    case 'degraded': return '#f59e0b'  // amber-500
    case 'down':     return '#ef4444'  // red-500
    default:         return '#94a3b8'  // slate-400
  }
}

export default function ResponseTimeChart({ checks, minSamples = MIN_DEFAULT }: Props) {
  // Oldest to newest for left-to-right display
  const data = useMemo(
    () =>
      [...checks]
        .reverse()
        .map((c) => ({
          t:    formatTime(c.checkedAt),
          ms:   c.responseTimeMs,
          status: c.status,
          dot:  statusColor(c.status),
        })),
    [checks]
  )

  if (data.length < minSamples) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
        Collecting data — need at least {minSamples} checks
      </div>
    )
  }

  const validMs = data.map((d) => d.ms).filter((v): v is number => v != null)
  const avg = validMs.length
    ? Math.round(validMs.reduce((a, b) => a + b, 0) / validMs.length)
    : null

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}ms`}
          />
          <Tooltip
            formatter={(value: number) => [`${value} ms`, 'Response time']}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          {avg != null && (
            <ReferenceLine
              y={avg}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{ value: `avg ${avg}ms`, fill: '#94a3b8', fontSize: 10, position: 'right' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="ms"
            stroke="#6366f1"
            strokeWidth={1.5}
            dot={(props: any) => {
              const { cx, cy, payload } = props
              return (
                <circle
                  key={`dot-${payload.t}`}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={payload.dot}
                  strokeWidth={0}
                />
              )
            }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
