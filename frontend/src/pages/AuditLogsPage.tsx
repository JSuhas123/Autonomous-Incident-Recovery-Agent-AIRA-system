import { useAuditLogs } from '@/api/hooks/useAudit'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Pagination } from '@/components/shared/Pagination'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDateTime, truncate } from '@/lib/format'
import { AnimatePresence, motion } from 'framer-motion'
import { ScrollText, Search } from 'lucide-react'
import { useState } from 'react'

const PAGE_SIZE = 20

export default function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading, error, refetch } = useAuditLogs()

  const items: any[] = Array.isArray(data) ? data : (data as any)?.data ?? (data as any)?.logs ?? []
  const filtered = items.filter((log) => {
    const q = debouncedSearch.toLowerCase()
    return (
      !q ||
      log.action?.toLowerCase().includes(q) ||
      log.actor?.toLowerCase().includes(q) ||
      log.resource?.toLowerCase().includes(q) ||
      log.actionType?.toLowerCase().includes(q)
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
          <h1 className="text-xl font-semibold">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All system actions and events
            {filtered.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground/70">({filtered.length})</span>
            )}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search logs…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Search audit logs"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <ErrorState description={(error as Error).message} onRetry={() => refetch()} className="py-10" />
          ) : isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No logs found"
              description={debouncedSearch ? 'Try a different search' : 'Audit logs will appear here'}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Time', 'Action', 'Actor', 'Resource', 'Result'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium first:pl-6">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {paginated.map((log: any, i: number) => (
                        <motion.tr
                          key={log._id ?? i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="border-b border-border/50 hover:bg-muted/30"
                        >
                          <td className="pl-6 pr-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(log.timestamp ?? log.createdAt)}
                          </td>
                          <td className="px-4 py-2 font-medium">
                            {log.action ?? log.actionType ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {log.actor ?? log.performedBy ?? log.tenantId ?? '—'}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {truncate(log.resource ?? log.resourceId ?? log.decisionId ?? '—', 30)}
                          </td>
                          <td className="px-4 py-2">
                            <Badge
                              variant={log.success !== false && log.status !== 'failed' ? 'success' : 'destructive'}
                              className="text-xs"
                            >
                              {log.success !== false && log.status !== 'failed' ? 'Success' : 'Failed'}
                            </Badge>
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
