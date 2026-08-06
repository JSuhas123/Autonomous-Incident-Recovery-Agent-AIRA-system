import { useDecision } from '@/api/hooks/useDecisions'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageLoader } from '@/components/shared/PageLoader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

export default function RecoveryTimelinePage() {
  const { decisionId = '' } = useParams()
  const navigate = useNavigate()
  const { data: decision, isLoading, error, refetch } = useDecision(decisionId)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState description={(error as Error).message} onRetry={() => refetch()} />

  const d = decision as any
  const steps: any[] = d?.decisionTrace?.steps ?? d?.executionSteps ?? []

  return (
    <motion.div
      className="space-y-5 max-w-3xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Recovery Timeline</h1>
          <p className="text-xs font-mono text-muted-foreground">{decisionId}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Event Timeline</CardTitle></CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No timeline events available
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
              {steps.map((step: any, idx: number) => (
                <div key={idx} className="relative mb-6">
                  <div
                    className={cn(
                      'absolute -left-4 top-1 w-2.5 h-2.5 rounded-full border-2 border-background',
                      step.status === 'completed' ? 'bg-emerald-400' :
                      step.status === 'failed' ? 'bg-red-400' :
                      step.status === 'running' ? 'bg-blue-400' : 'bg-muted-foreground',
                    )}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{step.name ?? step.action ?? `Step ${idx + 1}`}</span>
                      {step.status && (
                        <Badge variant={
                          step.status === 'completed' ? 'success' :
                          step.status === 'failed' ? 'destructive' :
                          step.status === 'running' ? 'running' : 'secondary'
                        } className="text-xs">
                          {step.status}
                        </Badge>
                      )}
                    </div>
                    {step.timestamp && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(step.timestamp)}
                      </div>
                    )}
                    {step.message && (
                      <p className="text-sm text-muted-foreground">{step.message}</p>
                    )}
                    {step.output && (
                      <pre className="text-xs font-mono bg-muted/30 rounded p-2 overflow-auto max-h-32 mt-1">
                        {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
