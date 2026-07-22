import { useApprovalStats } from '@/api/hooks/useApprovals'
import { useDecisions } from '@/api/hooks/useDecisions'
import { useHealth } from '@/api/hooks/useHealth'
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative, truncate } from '@/lib/format'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, CheckSquare, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: decisions, isLoading: loadingDecisions, error: decErr, refetch: refetchDec } = useDecisions({ limit: '10' })
  const { data: approvalStats, isLoading: loadingStats } = useApprovalStats()
  const { data: health } = useHealth()

  const recent = Array.isArray(decisions) ? decisions : (decisions as any)?.decisions ?? []
  // Stats: backend wraps counts in { queue: { pending, approved, rejected } }
  const aq = (approvalStats as any)?.queue ?? approvalStats as any

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">System overview and recent activity</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingStats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <MetricCard
              title="Pending Approvals"
              value={aq?.pending ?? 0}
              icon={CheckSquare}
              description="Awaiting review"
            />
            <MetricCard
              title="Total Decisions"
              value={(decisions as any)?.total ?? recent.length}
              icon={Zap}
              description="All time"
            />
            <MetricCard
              title="System Health"
              value={health?.status === 'healthy' ? 'Healthy' : health?.status ?? 'Unknown'}
              icon={Activity}
              iconColor={health?.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}
            />
            <MetricCard
              title="Expired"
              value={aq?.expired ?? 0}
              icon={AlertTriangle}
              iconColor="text-amber-400"
              description="This period"
            />
          </>
        )}
      </div>

      {/* Recent Decisions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Decisions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {decErr ? (
            <ErrorState
              className="py-10"
              description={(decErr as Error).message}
              onRetry={() => refetchDec()}
            />
          ) : loadingDecisions ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-10">No decisions found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-xs text-muted-foreground font-medium">Signal</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Confidence</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d: any) => (
                  <tr
                    key={d._id}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/incidents/${d._id}`)}
                  >
                    <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                      {truncate(d.signalType ?? d._id, 30)}
                    </td>
                    <td className="px-4 py-3">{truncate(d.recommendedAction ?? '—', 30)}</td>
                    <td className="px-4 py-3">
                      {d.confidenceScore != null ? (
                        <ConfidenceBadge score={d.confidenceScore} />
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.approvalStatus ?? d.status ?? 'pending'} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatRelative(d.createdAt)}
                    </td>
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
