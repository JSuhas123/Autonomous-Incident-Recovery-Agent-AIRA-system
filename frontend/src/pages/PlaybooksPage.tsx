import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { motion } from 'framer-motion'
import {
    BookMarked,
    CheckCircle,
    ChevronRight,
    Clock,
    Filter,
    Search,
    ShieldAlert,
    XCircle,
} from 'lucide-react'
import { useState } from 'react'

const MOCK_PLAYBOOKS = [
  {
    id: 'PB-K8S-CRASHLOOP-001',
    name: 'Kubernetes CrashLoopBackOff Recovery',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'kubernetes',
    stages: 3,
    risk: 'HIGH',
    approvalMode: 'CONDITIONAL',
    lastUpdated: '2024-01-15',
  },
  {
    id: 'PB-K8S-OOM-001',
    name: 'Kubernetes OOM Recovery',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'kubernetes',
    stages: 4,
    risk: 'HIGH',
    approvalMode: 'MANUAL',
    lastUpdated: '2024-01-15',
  },
  {
    id: 'PB-K8S-NODE-NOTREADY-001',
    name: 'Kubernetes Node Not Ready',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'kubernetes',
    stages: 3,
    risk: 'CRITICAL',
    approvalMode: 'MANUAL',
    lastUpdated: '2024-01-15',
  },
  {
    id: 'PB-DB-CONN-EXHAUST-001',
    name: 'Database Connection Exhaustion',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'database',
    stages: 4,
    risk: 'CRITICAL',
    approvalMode: 'MANUAL',
    lastUpdated: '2024-01-10',
  },
  {
    id: 'PB-CACHE-INVALIDATION-001',
    name: 'Cache Invalidation',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'infrastructure',
    stages: 3,
    risk: 'MEDIUM',
    approvalMode: 'AUTOMATIC',
    lastUpdated: '2024-01-12',
  },
  {
    id: 'PB-API-RATELIMIT-001',
    name: 'API Rate Limit Response',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'incident-management',
    stages: 3,
    risk: 'MEDIUM',
    approvalMode: 'AUTOMATIC',
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

const APPROVAL_LABELS: Record<string, string> = {
  AUTOMATIC: 'Auto-approve',
  MANUAL: 'Manual approval',
  CONDITIONAL: 'Conditional',
  DISABLED: 'No approval',
}

const LIFECYCLE_ICON: Record<string, React.ReactNode> = {
  ACTIVE: <CheckCircle className="w-3.5 h-3.5" />,
  DRAFT: <Clock className="w-3.5 h-3.5" />,
  DEPRECATED: <XCircle className="w-3.5 h-3.5" />,
}

export default function PlaybooksPage() {
  const [search, setSearch] = useState('')
  const [lifecycleFilter, setLifecycleFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const categories = [...new Set(MOCK_PLAYBOOKS.map((pb) => pb.category))]

  const filtered = MOCK_PLAYBOOKS.filter((pb) => {
    const matchSearch =
      pb.id.toLowerCase().includes(search.toLowerCase()) ||
      pb.name.toLowerCase().includes(search.toLowerCase())
    const matchLifecycle = !lifecycleFilter || pb.lifecycle === lifecycleFilter
    const matchCategory = !categoryFilter || pb.category === categoryFilter
    return matchSearch && matchLifecycle && matchCategory
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
          <h1 className="text-xl font-semibold">Playbooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            High-level incident response orchestration. Playbooks coordinate runbooks
            without directly executing infrastructure.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {filtered.length} playbook{filtered.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Architectural note */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Invariant:</strong> Playbooks never directly execute infrastructure.
          All execution flows: Playbook → Runbook Registry → RunbookExecutionService → Action Handler.
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search playbooks…"
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
        <div className="flex items-center gap-1.5">
          {categories.map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={categoryFilter === cat ? 'secondary' : 'ghost'}
              className="h-7 text-xs px-2 capitalize"
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Playbook list */}
      <div className="grid gap-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BookMarked className="w-8 h-8 mb-3 opacity-40" />
              <p className="text-sm">No playbooks match your filters.</p>
            </CardContent>
          </Card>
        )}
        {filtered.map((pb) => (
          <Card key={pb.id} className="hover:shadow-sm transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-muted-foreground shrink-0" />
                  <CardTitle className="text-sm font-medium">{pb.name}</CardTitle>
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {pb.id}
                  </code>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 text-xs ${LIFECYCLE_COLORS[pb.lifecycle] ?? ''}`}
                >
                  {LIFECYCLE_ICON[pb.lifecycle]}
                  {pb.lifecycle}
                </Badge>
                <span>v{pb.semver}</span>
                <span className="capitalize">{pb.category}</span>
                <span>{pb.stages} stage{pb.stages !== 1 ? 's' : ''}</span>
                <span className={`font-medium ${RISK_COLORS[pb.risk] ?? ''}`}>
                  {pb.risk} risk
                </span>
                <span>{APPROVAL_LABELS[pb.approvalMode] ?? pb.approvalMode}</span>
                <span className="ml-auto">Updated {pb.lastUpdated}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        <span className="font-medium">Approval: </span>
        <span>AUTOMATIC</span> — AIRA proceeds without human gate.{' '}
        <span>CONDITIONAL</span> — gate activates based on severity.{' '}
        <span>MANUAL</span> — always requires explicit approval before execution.
      </div>
    </motion.div>
  )
}
