import {
  useActionAccuracy,
  useConfidenceTrends,
  useEffectivenessRecords,
} from '@/api/hooks/useAnalytics'

import {
  ErrorState,
} from '@/components/shared/ErrorState'

import {
  MetricCard,
} from '@/components/shared/MetricCard'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Skeleton,
} from '@/components/ui/skeleton'

import {
  formatPercent,
} from '@/lib/format'

import BillingPage from '@/pages/BillingPage'

import {
  motion,
} from 'framer-motion'

import {
  Activity,
  Target,
  TrendingUp,
} from 'lucide-react'

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
  YAxis,
} from 'recharts'


export default function AnalyticsPage() {
  const {
    data:
      trends,

    isLoading:
      loadingTrends,

    error:
      trendErr,

    refetch:
      refetchTrends,
  } =
    useConfidenceTrends()


  const {
    data:
      accuracy,

    isLoading:
      loadingAccuracy,
  } =
    useActionAccuracy()


  const {
    data:
      effectiveness,
  } =
    useEffectivenessRecords()


  const trendData:
    any[] =
    Array.isArray(
      trends,
    )
      ? trends
      : (
          trends as any
        )
          ?.trends ??
        []


  const accuracyData:
    any[] =
    Array.isArray(
      accuracy,
    )
      ? accuracy
      : (
          accuracy as any
        )
          ?.accuracy ??
        (
          accuracy as any
        )
          ?.byAction ??
        []


  const effData:
    any[] =
    Array.isArray(
      effectiveness,
    )
      ? effectiveness
      : (
          effectiveness as any
        )
          ?.records ??
        (
          effectiveness as any
        )
          ?.byAction ??
        []


  const avgConfidence =
    trendData.length
      ? trendData.reduce(
          (
            sum,
            row,
          ) =>
            sum +
            (
              row.score ??
              row.confidence ??
              row.avgConfidence ??
              0
            ),

          0,
        ) /
        trendData.length
      : null


  const tooltipStyle = {
    background:
      'hsl(var(--card))',

    border:
      '1px solid hsl(var(--border))',

    borderRadius:
      6,

    fontSize:
      12,
  }


  return (
    <motion.div
      className="space-y-8"
      initial={{
        opacity:
          0,

        y:
          8,
      }}
      animate={{
        opacity:
          1,

        y:
          0,
      }}
      transition={{
        duration:
          0.25,
      }}
    >
      <section className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">
            Analytics
          </h1>

          <p className="mt-0.5 text-sm text-muted-foreground">
            Confidence trends and action effectiveness
          </p>
        </div>


        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard
            title="Avg Confidence"
            value={
              avgConfidence !=
              null
                ? formatPercent(
                    avgConfidence,
                  )
                : '—'
            }
            icon={
              TrendingUp
            }
            description="Rolling average"
          />

          <MetricCard
            title="Effectiveness Records"
            value={
              effData.length
            }
            icon={
              Activity
            }
            description="Total evaluated"
          />

          <MetricCard
            title="Action Accuracy"
            value={
              accuracyData.length
                ? `${accuracyData.length} actions`
                : '—'
            }
            icon={
              Target
            }
          />
        </div>


        <Card>
          <CardHeader>
            <CardTitle>
              Confidence Trend
            </CardTitle>
          </CardHeader>

          <CardContent>
            {trendErr ? (
              <ErrorState
                description={
                  (
                    trendErr as
                      Error
                  ).message
                }
                onRetry={
                  () =>
                    refetchTrends()
                }
                className="py-8"
              />
            ) : loadingTrends ? (
              <Skeleton className="h-48" />
            ) : trendData.length ===
              0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No trend data available
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={
                  240
                }
              >
                <LineChart
                  data={
                    trendData
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />

                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize:
                        11,

                      fill:
                        'hsl(var(--muted-foreground))',
                    }}
                  />

                  <YAxis
                    domain={[
                      0,
                      1,
                    ]}
                    tickFormatter={
                      (
                        value,
                      ) =>
                        `${Math.round(
                          value *
                            100,
                        )}%`
                    }
                    tick={{
                      fontSize:
                        11,

                      fill:
                        'hsl(var(--muted-foreground))',
                    }}
                  />

                  <Tooltip
                    formatter={
                      (
                        value:
                          any,
                      ) => [
                        `${Math.round(
                          Number(
                            value,
                          ) *
                            100,
                        )}%`,

                        'Confidence',
                      ]
                    }
                    contentStyle={
                      tooltipStyle
                    }
                  />

                  <ReferenceLine
                    y={
                      0.8
                    }
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 4"
                  />

                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    dot={
                      false
                    }
                    strokeWidth={
                      2
                    }
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle>
              Action Accuracy
            </CardTitle>
          </CardHeader>

          <CardContent>
            {loadingAccuracy ? (
              <Skeleton className="h-48" />
            ) : accuracyData.length ===
              0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No accuracy data available
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={
                  240
                }
              >
                <BarChart
                  data={
                    accuracyData
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />

                  <XAxis
                    dataKey="action"
                  />

                  <YAxis />

                  <Tooltip
                    contentStyle={
                      tooltipStyle
                    }
                  />

                  <Bar
                    dataKey="accuracy"
                    fill="hsl(var(--primary))"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>


      <div
        id="billing"
        className="border-t border-border pt-8"
      >
        <BillingPage />
      </div>
    </motion.div>
  )
}