import { useGenerateReport, useReports } from '@/api/hooks/useReports'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/useToast'
import { formatDateTime } from '@/lib/format'
import { motion } from 'framer-motion'
import { Download, FileText, Plus } from 'lucide-react'

export default function ReportsPage() {
  const { data, isLoading, error, refetch } = useReports()
  const generateReport = useGenerateReport()

  const reports: any[] = Array.isArray(data) ? data : (data as any)?.reports ?? []

  async function handleGenerate() {
    try {
      await generateReport.mutateAsync({ type: 'summary', format: 'json' })
      toast.success('Report generation started')
      refetch()
    } catch (err: any) {
      toast.error('Failed to generate report', err.message)
    }
  }

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">System reports and exports</p>
        </div>
        <Button size="sm" onClick={handleGenerate} loading={generateReport.isPending}>
          <Plus className="w-3 h-3 mr-1" /> Generate Report
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <ErrorState description={(error as Error).message} onRetry={() => refetch()} className="py-10" />
          ) : isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : reports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              description="Generate a report to see it here"
              action={
                <Button size="sm" variant="outline" onClick={handleGenerate}>
                  <Plus className="w-3 h-3 mr-1" /> Generate
                </Button>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Name', 'Type', 'Status', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium first:pl-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((r: any) => (
                  <tr key={r._id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="pl-6 pr-4 py-3">{r.name ?? r._id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.type ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'destructive' : 'pending'}>
                        {r.status ?? 'pending'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      {r.url && (
                        <Button size="icon-sm" variant="ghost" asChild>
                          <a href={r.url} download aria-label="Download">
                            <Download className="w-3 h-3" />
                          </a>
                        </Button>
                      )}
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
