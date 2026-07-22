import { useApprovals, useApprovalStats, useApprove, useReject } from '@/api/hooks/useApprovals'
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/useToast'
import { formatRelative, truncate } from '@/lib/format'
import { AlertTriangle, Check, CheckSquare, Clock, X } from 'lucide-react'
import { useState } from 'react'

export default function ApprovalsPage() {
  const [tab, setTab] = useState('pending')
  const [actionDialog, setActionDialog] = useState<{
    type: 'approve' | 'reject'; approvalId: string
  } | null>(null)
  const [comment, setComment] = useState('')

  const { data: approvals, isLoading, error, refetch } = useApprovals(tab === 'all' ? undefined : tab)
  const { data: stats, isLoading: loadingStats } = useApprovalStats()
  const approve = useApprove()
  const reject = useReject()

  // Backend returns { pending: [], pendingCount } or { approvals: [] }
  const items: any[] = Array.isArray(approvals)
    ? approvals
    : (approvals as any)?.pending
      ?? (approvals as any)?.approvals
      ?? []

  // Stats: backend wraps in { queue: { pending, approved, rejected } }
  const q = (stats as any)?.queue ?? stats as any

  async function handleAction() {
    if (!actionDialog) return
    try {
      if (actionDialog.type === 'approve') {
        await approve.mutateAsync({ approvalId: actionDialog.approvalId, comment })
        toast.success('Approved successfully')
      } else {
        await reject.mutateAsync({ approvalId: actionDialog.approvalId, reason: comment })
        toast.success('Rejected')
      }
      setActionDialog(null)
      setComment('')
    } catch (err: any) {
      toast.error('Action failed', err.message)
    }
  }

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review and approve or reject pending decisions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingStats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <MetricCard title="Pending" value={q?.pending ?? 0} icon={Clock} />
            <MetricCard title="Approved" value={q?.approved ?? 0} icon={Check} iconColor="text-emerald-400" />
            <MetricCard title="Rejected" value={q?.rejected ?? 0} icon={X} iconColor="text-red-400" />
            <MetricCard title="Expired" value={q?.expired ?? 0} icon={AlertTriangle} iconColor="text-amber-400" />
          </>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {error ? (
                <ErrorState description={(error as Error).message} onRetry={() => refetch()} className="py-10" />
              ) : isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : items.length === 0 ? (
                <EmptyState icon={CheckSquare} title={`No ${tab} approvals`} />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Decision', 'Action', 'Confidence', 'Status', 'Created', tab === 'pending' ? 'Actions' : ''].filter(Boolean).map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium first:pl-6">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a: any) => (
                      <tr key={a._id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="pl-6 pr-4 py-3 font-mono text-xs text-muted-foreground">{truncate(a.decisionId ?? a._id, 12)}</td>
                        <td className="px-4 py-3">{truncate(a.recommendedAction ?? a.action ?? '—', 35)}</td>
                        <td className="px-4 py-3">{a.confidenceScore != null ? <ConfidenceBadge score={a.confidenceScore} /> : '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={a.status ?? 'pending'} /></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelative(a.createdAt)}</td>
                        {tab === 'pending' && (
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <Button size="icon-sm" variant="success" onClick={() => { setActionDialog({ type: 'approve', approvalId: a._id }); setComment('') }}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon-sm" variant="destructive" onClick={() => { setActionDialog({ type: 'reject', approvalId: a._id }); setComment('') }}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === 'approve' ? 'Approve Decision' : 'Reject Decision'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="comment">{actionDialog?.type === 'approve' ? 'Comment (optional)' : 'Reason (optional)'}</Label>
            <Input
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={actionDialog?.type === 'approve' ? 'Add a comment…' : 'Reason for rejection…'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              variant={actionDialog?.type === 'approve' ? 'success' : 'destructive'}
              onClick={handleAction}
              loading={approve.isPending || reject.isPending}
            >
              {actionDialog?.type === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
