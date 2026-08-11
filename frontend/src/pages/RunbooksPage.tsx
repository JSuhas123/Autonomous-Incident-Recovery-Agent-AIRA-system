import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { motion } from 'framer-motion'
import { BookOpen, CheckCircle, ChevronRight, Clock, Filter, Search, XCircle } from 'lucide-react'
import { useState } from 'react'

const MOCK_RUNBOOKS = [
  {
    id: 'RB-K8S-POD-RESTART',
    name: 'Kubernetes Pod Restart',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'kubernetes',
    steps: 5,
    risk: 'MEDIUM',
    lastUpdated: '2024-01-15',
  },
  {
    id: 'RB-DB-FAILOVER',
    name: 'Database Failover',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'database',
    steps: 4,
    risk: 'CRITICAL',
    lastUpdated: '2024-01-10',
  },
  {
    id: 'RB-CACHE-INVALIDATE',
    name: 'Cache Invalidation',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'infrastructure',
    steps: 3,
    risk: 'LOW',
    lastUpdated: '2024-01-12',
  },
  {
    id: 'RB-MQ-RECOVERY',
    name: 'Message Queue Recovery',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'infrastructure',
    steps: 4,
    risk: 'HIGH',
    lastUpdated: '2024-01-08',
  },
  {
    id: 'RB-API-RATE-LIMIT-FIX',
    name: 'API Rate Limit Fix',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'incident-management',
    steps: 3,
    risk: 'MEDIUM',
    lastUpdated: '2024-01-14',
  },
]

const LIFECYCLE_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  VALIDATED: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  DRAFT: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  DEPRECATED: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  DISABLED: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
}

const RISK_COLORS: Record<string, string> = {
  LOW: 'text-emerald-600',
  MEDIUM: 'text-amber-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-rose-600',
}

const LIFECYCLE_ICON: Record<string, React.ReactNode> = {
  ACTIVE: <CheckCircle className="w-3.5 h-3.5" />,
  DRAFT: <Clock className="w-3.5 h-3.5" />,
  DEPRECATED: <XCircle className="w-3.5 h-3.5" />,
}

export default function RunbooksPage() {
  const [search, setSearch] = useState('')
  const [lifecycleFilter, setLifecycleFilter] = useState<string | null>(null)

  const filtered = MOCK_RUNBOOKS.filter((rb) => {
    const matchSearch =
      rb.id.toLowerCase().includes(search.toLowerCase()) ||
      rb.name.toLowerCase().includes(search.toLowerCase())
    const matchLifecycle = !lifecycleFilter || rb.lifecycle === lifecycleFilter
    return matchSearch && matchLifecycle
  })

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Runbooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Executable automation blueprints. Runbooks define low-level steps
            executed by AIRA's action handlers.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {filtered.length} runbook{filtered.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search runbooks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {['ACTIVE', 'VALIDATED', 'DRAFT'].map((lc) => (
            <Button
              key={lc}
              size="sm"
              variant={lifecycleFilter === lc ? 'default' : 'outline'}
              className="h-7 text-xs px-2"
              onClick={() => setLifecycleFilter(lifecycleFilter === lc ? null : lc)}
            >
              {lc}
            </Button>
          ))}
        </div>
      </div>

      {/* Runbook list */}
      <div className="grid gap-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BookOpen className="w-8 h-8 mb-3 opacity-40" />
              <p className="text-sm">No runbooks match your filters.</p>
            </CardContent>
          </Card>
        )}
        {filtered.map((rb) => (
          <Card key={rb.id} className="hover:shadow-sm transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <CardTitle className="text-sm font-medium">{rb.name}</CardTitle>
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {rb.id}
                  </code>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 text-xs ${LIFECYCLE_COLORS[rb.lifecycle] ?? ''}`}
                >
                  {LIFECYCLE_ICON[rb.lifecycle]}
                  {rb.lifecycle}
                </Badge>
                <span>v{rb.semver}</span>
                <span className="capitalize">{rb.category}</span>
                <span>{rb.steps} step{rb.steps !== 1 ? 's' : ''}</span>
                <span className={`font-medium ${RISK_COLORS[rb.risk] ?? ''}`}>
                  {rb.risk} risk
                </span>
                <span className="ml-auto">Updated {rb.lastUpdated}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        <span className="font-medium">Lifecycle: </span>
        <span className="text-amber-600">DRAFT</span> — not yet validated.{' '}
        <span className="text-blue-600">VALIDATED</span> — passed schema checks.{' '}
        <span className="text-emerald-600">ACTIVE</span> — ready for execution.
      </div>
    </motion.div>
  )
}
