import { useDecisions } from '@/api/hooks/useDecisions'
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Pagination } from '@/components/shared/Pagination'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDateTime, truncate } from '@/lib/format'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PAGE_SIZE = 15

export default function IncidentListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading, error, refetch } = useDecisions()

  const items: any[] = Array.isArray(data) ? data : (data as any)?.decisions ?? []
  const filtered = items.filter((d) => {
    const q = debouncedSearch.toLowerCase()
    return (
      !q ||
      d.signalType?.toLowerCase().includes(q) ||
      d.recommendedAction?.toLowerCase().includes(q) ||
      d.action?.toLowerCase().includes(q) ||
      d.decisionId?.toLowerCase().includes(q) ||
      d._id?.toLowerCase().includes(q)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSearch(val: string) {
    setSearch(val)
    setPage(1)
  }

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All decisions and recovery actions
            {filtered.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground/70">
                ({filtered.length} total)
              </span>
            )}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search incidents…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Search incidents"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <ErrorState description={(error as Error).message} onRetry={() => refetch()} className="py-10" />
          ) : isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No incidents found"
              description={debouncedSearch ? 'Try a different search term' : 'Incidents will appear here when signals are processed'}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['ID', 'Signal Type', 'Action', 'Confidence', 'Status', 'Created'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium first:pl-6">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {paginated.map((d: any, idx: number) => (
                        <motion.tr
                          key={d.decisionId ?? d._id ?? idx}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: idx * 0.03, duration: 0.18 }}
                          className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                          onClick={() => navigate(`/incidents/${d.decisionId ?? d._id}`)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && navigate(`/incidents/${d.decisionId ?? d._id}`)}
                          role="row"
                          aria-label={`Incident ${d.decisionId ?? d._id}`}
                        >
                          <td className="pl-6 pr-4 py-3 font-mono text-xs text-muted-foreground">
                            {truncate(d.decisionId ?? d._id ?? '', 12)}
                          </td>
                          <td className="px-4 py-3">{d.signalType ?? d.inputs?.signals?.type ?? '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground max-w-xs">
                            {truncate(d.recommendedAction ?? d.action ?? '—', 45)}
                          </td>
                          <td className="px-4 py-3">
                            {(d.confidence ?? d.confidenceScore) != null
                              ? <ConfidenceBadge score={d.confidence ?? d.confidenceScore} />
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={d.approvalStatus ?? d.policyVerdict ?? d.actionStatus ?? d.status ?? 'pending'} />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(d.timestamp ?? d.createdAt)}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border">
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
