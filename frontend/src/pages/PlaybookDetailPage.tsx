import { ExecutionTimeline } from '@/components/shared/ExecutionTimeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import {
    AlertTriangle, ArrowLeft, CheckCircle, ChevronRight, Clock, GitBranch,
    Layers,
    Shield, ShieldAlert, ShieldCheck
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

const PLAYBOOK_DETAIL: Record<string, object> = {
  'PB-K8S-CRASHLOOP-001': {
    id: 'PB-K8S-CRASHLOOP-001',
    name: 'Kubernetes CrashLoopBackOff Recovery',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'kubernetes',
    riskLevel: 'HIGH',
    approvalMode: 'CONDITIONAL',
    incidentFamilies: ['CrashLoopBackOff', 'PodCrashLoop'],
    requiredEvidence: ['resource.pod', 'resource.namespace'],
    requiredSignals: ['pod_name', 'namespace'],
    minimumConfidence: 0.7,
    stages: [
      { id: 'investigate-pod', name: 'Investigate Pod State', type: 'INVESTIGATION', order: 1, failurePolicy: 'CONTINUE', runbooks: ['RB-K8S-POD-RESTART'] },
      { id: 'recover-pod',     name: 'Restart Crashed Pod',   type: 'RECOVERY',      order: 2, failurePolicy: 'ROLLBACK', runbooks: ['RB-K8S-POD-RESTART'] },
      { id: 'verify-recovery', name: 'Verify Pod Recovery',   type: 'VERIFICATION',  order: 3, failurePolicy: 'ESCALATE', runbooks: ['RB-K8S-POD-RESTART'] },
    ],
    referencedRunbooks: [{ runbookId: 'RB-K8S-POD-RESTART', semver: '1.0.0', lifecycle: 'DRAFT' }],
    rollback: { strategy: 'STAGE_ROLLBACK', maxAttempts: 1 },
    escalation: { maxRecoveryAttempts: 3, escalateTo: 'oncall-sre' },
    activationBlockers: [
      'Lifecycle is DRAFT',
      'Referenced runbooks not ACTIVE: RB-K8S-POD-RESTART@DRAFT',
    ],
    owner: 'AIRA Platform / site-reliability',
    lastUpdated: '2024-01-15',
  },
}

const LIFECYCLE_STYLES: Record<string, { bg: string; icon: React.ElementType }> = {
  ACTIVE:     { bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  DRAFT:      { bg: 'bg-gray-500/15 text-gray-400 border-gray-500/30',         icon: Clock },
  VALIDATED:  { bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',         icon: ShieldCheck },
  APPROVED:   { bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',         icon: ShieldCheck },
  DEPRECATED: { bg: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',   icon: AlertTriangle },
  DISABLED:   { bg: 'bg-red-500/15 text-red-400 border-red-500/30',            icon: ShieldAlert },
}

const STAGE_TYPE_STYLES: Record<string, string> = {
  INVESTIGATION: 'text-blue-400',
  RECOVERY:      'text-emerald-400',
  VERIFICATION:  'text-cyan-400',
  ROLLBACK:      'text-orange-400',
  ESCALATION:    'text-red-400',
  NOTIFICATION:  'text-purple-400',
}

const APPROVAL_STYLES: Record<string, string> = {
  AUTOMATIC:   'text-emerald-400',
  CONDITIONAL: 'text-yellow-400',
  MANUAL:      'text-orange-400',
}

const RISK_STYLES: Record<string, string> = {
  LOW: 'text-emerald-400', MEDIUM: 'text-yellow-400', HIGH: 'text-orange-400', CRITICAL: 'text-red-400',
}

// Demo execution timeline events for the golden path
const DEMO_TIMELINE_EVENTS = [
  { id: 'e1', type: 'incident' as const,     label: 'Incident Detected',         status: 'SUCCEEDED' as const, durationMs: 0,   detail: 'CrashLoopBackOff on my-service-pod' },
  { id: 'e2', type: 'playbook' as const,     label: 'Playbook Matched',          status: 'SUCCEEDED' as const, durationMs: 12,  detail: 'PB-K8S-CRASHLOOP-001 selected (score: 0.95)' },
  { id: 'e3', type: 'stage' as const,        label: 'INVESTIGATION',             status: 'SUCCEEDED' as const, durationMs: 450, detail: 'Pod state collected, logs captured' },
  { id: 'e4', type: 'runbook' as const,      label: 'RB-K8S-POD-RESTART',       status: 'SUCCEEDED' as const, durationMs: 380, detail: '5 steps executed', runbookId: 'RB-K8S-POD-RESTART' },
  { id: 'e5', type: 'stage' as const,        label: 'RECOVERY',                  status: 'SUCCEEDED' as const, durationMs: 8200, detail: 'Pod restarted and recreated by controller' },
  { id: 'e6', type: 'stage' as const,        label: 'VERIFICATION',              status: 'SUCCEEDED' as const, durationMs: 4100, detail: 'pod_running condition satisfied' },
  { id: 'e7', type: 'verification' as const, label: 'Health Check Passed',       status: 'SUCCEEDED' as const, durationMs: 200, detail: 'Pod is Running and ready' },
  { id: 'e8', type: 'outcome' as const,      label: 'AUTO_RESOLVED',             status: 'SUCCEEDED' as const, durationMs: 0,   detail: 'Total recovery time: 12.7s' },
]

export default function PlaybookDetailPage() {
  const { playbookId } = useParams<{ playbookId: string }>()
  const navigate = useNavigate()
  const pb = playbookId ? PLAYBOOK_DETAIL[playbookId] as any : null

  if (!pb) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>Playbook <code className="text-white">{playbookId}</code> not found in catalogue.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/playbooks')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Playbooks
        </Button>
      </div>
    )
  }

  const lifecycle = LIFECYCLE_STYLES[pb.lifecycle] || LIFECYCLE_STYLES.DRAFT
  const LifecycleIcon = lifecycle.icon
  const isReady = pb.lifecycle === 'ACTIVE' && pb.activationBlockers?.length === 0

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/playbooks')} className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{pb.name}</h1>
            <Badge className={`border ${lifecycle.bg} flex items-center gap-1 text-xs`}>
              <LifecycleIcon className="h-3 w-3" />
              {pb.lifecycle}
            </Badge>
            <Badge variant="outline" className="text-xs text-gray-400">v{pb.semver}</Badge>
          </div>
          <p className="text-gray-400 text-sm mt-1 font-mono">{pb.id}</p>
        </div>
        <div className={`text-sm font-bold ${isReady ? 'text-emerald-400' : 'text-yellow-400'}`}>
          {isReady ? '✓ ACTIVE_READY' : '⚠ NOT_ACTIVE_READY'}
        </div>
      </div>

      {/* Architectural invariant notice */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
        <strong>Architecture invariant:</strong> This Playbook NEVER directly executes infrastructure.
        All execution flows: <span className="font-mono">Playbook → Runbook Registry → RunbookExecutionEngine → ActionHandler</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Policy / Approval */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><Shield className="h-4 w-4" /> Policy & Approval</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Approval Mode</span>
              <span className={`font-bold ${APPROVAL_STYLES[pb.approvalMode] || 'text-gray-300'}`}>{pb.approvalMode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Level</span>
              <span className={`font-bold ${RISK_STYLES[pb.riskLevel] || 'text-gray-300'}`}>{pb.riskLevel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Min Confidence</span>
              <span className="text-gray-300">{(pb.minimumConfidence * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Rollback</span>
              <span className="text-gray-300">{pb.rollback?.strategy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Escalation</span>
              <span className="text-gray-300">{pb.escalation?.escalateTo}</span>
            </div>
          </CardContent>
        </Card>

        {/* Triggers */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><GitBranch className="h-4 w-4" /> Incident Triggers</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <div className="text-gray-500 text-xs mb-1">Incident Families</div>
              <div className="flex flex-wrap gap-1">
                {pb.incidentFamilies.map((f: string) => (
                  <Badge key={f} variant="outline" className="text-xs text-blue-300 border-blue-500/30">{f}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Required Evidence</div>
              {pb.requiredEvidence.map((e: string) => (
                <div key={e} className="text-xs font-mono text-orange-300">{e}</div>
              ))}
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Required Signals</div>
              {pb.requiredSignals.map((s: string) => (
                <div key={s} className="text-xs font-mono text-yellow-300">{s}</div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Referenced Runbooks */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><Layers className="h-4 w-4" /> Referenced Runbooks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pb.referencedRunbooks.map((r: any) => (
              <div key={r.runbookId} className="p-2 rounded bg-gray-800/50 border border-gray-700/50">
                <div className="flex items-center justify-between">
                  <code className="text-sm text-blue-300">{r.runbookId}</code>
                  <Badge className={`text-xs border ${LIFECYCLE_STYLES[r.lifecycle]?.bg || 'text-gray-400'}`}>
                    {r.lifecycle}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">v{r.semver}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Stages */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader><CardTitle className="text-sm text-gray-400">Execution Stages (ordered)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...pb.stages].sort((a: any, b: any) => a.order - b.order).map((stage: any, i: number) => (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50"
              >
                <span className="text-xs text-gray-500 w-5 text-center font-mono mt-0.5">{stage.order}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">{stage.name}</span>
                    <Badge variant="outline" className={`text-xs border-gray-600 ${STAGE_TYPE_STYLES[stage.type] || 'text-gray-400'}`}>
                      {stage.type}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stage.runbooks.map((rb: string) => (
                      <code key={rb} className="text-xs text-blue-300">{rb}</code>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">failurePolicy: {stage.failurePolicy}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Activation Blockers */}
      {pb.activationBlockers?.length > 0 && (
        <Card className="bg-yellow-500/5 border-yellow-500/30">
          <CardHeader><CardTitle className="text-sm text-yellow-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Activation Blockers</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {pb.activationBlockers.map((b: string, i: number) => (
                <li key={i} className="text-sm text-yellow-300 flex items-start gap-2">
                  <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Golden Path Execution Timeline (demo) */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader>
          <CardTitle className="text-sm text-gray-400">Golden Path: CrashLoopBackOff → AUTO_RESOLVED</CardTitle>
          <p className="text-xs text-gray-500 mt-1">Demo execution timeline (simulated, no real infrastructure)</p>
        </CardHeader>
        <CardContent>
          <ExecutionTimeline events={DEMO_TIMELINE_EVENTS} />
        </CardContent>
      </Card>
    </div>
  )
}
