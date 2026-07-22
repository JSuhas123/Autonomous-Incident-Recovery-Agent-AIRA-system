import { useDecision } from '@/api/hooks/useDecisions'
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageLoader } from '@/components/shared/PageLoader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import { motion } from 'framer-motion'
import { Activity, ArrowLeft, Clock } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

export default function IncidentDetailPage() {
  const { decisionId = '' } = useParams()
  const navigate = useNavigate()
  const { data: decision, isLoading, error, refetch } = useDecision(decisionId)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState description={(error as Error).message} onRetry={() => refetch()} />
  if (!decision) return <ErrorState title="Not found" description="Decision not found" />

  const d = decision as any

  return (
    <motion.div
      className="space-y-5 max-w-4xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Incident Detail</h1>
          <p className="text-xs font-mono text-muted-foreground">{d._id}</p>
        </div>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-5 flex flex-wrap gap-4 items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={d.approvalStatus ?? d.status ?? 'pending'} />
              {d.confidenceScore != null && <ConfidenceBadge score={d.confidenceScore} />}
            </div>
            <p className="font-semibold text-lg">{d.recommendedAction ?? 'No action'}</p>
            <p className="text-sm text-muted-foreground">{d.signalType ?? 'Unknown signal'}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/incidents/${d._id}/timeline`}>
                <Clock className="w-3 h-3 mr-1" /> Timeline
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/incidents/${d._id}/recovery`}>
                <Activity className="w-3 h-3 mr-1" /> Recovery
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Metadata */}
        <Card>
          <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ['Created', formatDateTime(d.createdAt)],
              ['Updated', formatDateTime(d.updatedAt)],
              ['Tenant', d.tenantId],
              ['Signal ID', d.signalId],
              ['Runbook', d.runbookId ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">{label}</span>
                <span className="font-mono text-xs text-right break-all">{value ?? '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Decision Trace */}
        <Card>
          <CardHeader><CardTitle>Decision Trace</CardTitle></CardHeader>
          <CardContent>
            {d.decisionTrace ? (
              <pre className="text-xs font-mono bg-muted/30 rounded p-3 overflow-auto max-h-64">
                {JSON.stringify(d.decisionTrace, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No trace available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Signal Payload */}
      {d.signal && (
        <Card>
          <CardHeader><CardTitle>Signal Payload</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted/30 rounded p-3 overflow-auto max-h-64">
              {JSON.stringify(d.signal, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
