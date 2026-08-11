import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import {
    AlertTriangle,
    ArrowLeft, CheckCircle, ChevronRight, Clock,
    Eye,
    Layers,
    ShieldAlert,
    ShieldCheck, TerminalSquare
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

// Static catalogue matching actual YAML definitions
const RUNBOOK_DETAIL: Record<string, object> = {
  'RB-K8S-POD-RESTART': {
    id: 'RB-K8S-POD-RESTART',
    name: 'Kubernetes Pod Restart',
    lifecycle: 'DRAFT',
    semver: '1.0.0',
    category: 'kubernetes',
    risk: 'HIGH',
    blastRadius: 'pod',
    reversible: true,
    verificationSupport: true,
    rollbackSupport: false,
    rollbackStrategy: 'NONE',
    parameters: [
      { name: 'pod',            type: 'string', required: true,  description: 'Pod name to restart' },
      { name: 'namespace',      type: 'string', required: true,  description: 'Kubernetes namespace' },
      { name: 'label_selector', type: 'string', required: false, description: 'Optional label selector' },
    ],
    steps: [
      { id: 'step-01', name: 'Identify affected pods',      type: 'kubernetes', action: 'list_pods',        failurePolicy: 'CONTINUE', handlerStatus: 'IMPLEMENTED' },
      { id: 'step-02', name: 'Capture pre-restart logs',    type: 'kubernetes', action: 'get_logs',         failurePolicy: 'CONTINUE', handlerStatus: 'IMPLEMENTED' },
      { id: 'step-03', name: 'Delete pod to trigger restart', type: 'kubernetes', action: 'restart_pod',   failurePolicy: 'STOP',     handlerStatus: 'IMPLEMENTED', requiresConfirmation: true },
      { id: 'step-04', name: 'Wait for pod recreation',     type: 'wait',       action: 'poll_condition',   failurePolicy: 'STOP',     handlerStatus: 'IMPLEMENTED' },
      { id: 'step-05', name: 'Verify pod health',           type: 'kubernetes', action: 'check_pod_health', failurePolicy: 'STOP',     handlerStatus: 'IMPLEMENTED' },
    ],
    verification: { strategy: 'ALL', timeoutSeconds: 120, checks: [{ id: 'check-01', type: 'pod_running', description: 'Confirm restarted pod is Running' }] },
    activationBlockers: ['Lifecycle is DRAFT — must be promoted to ACTIVE via DRAFT→VALIDATED→APPROVED→ACTIVE'],
    owner: 'Platform Engineering',
    lastUpdated: '2024-01-15',
    executionHistory: [],
  },
}

const LIFECYCLE_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  ACTIVE:     { bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', text: 'ACTIVE',     icon: CheckCircle },
  DRAFT:      { bg: 'bg-gray-500/15 text-gray-400 border-gray-500/30',         text: 'DRAFT',      icon: Clock },
  VALIDATED:  { bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',         text: 'VALIDATED',  icon: ShieldCheck },
  APPROVED:   { bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',         text: 'APPROVED',   icon: ShieldCheck },
  DEPRECATED: { bg: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',   text: 'DEPRECATED', icon: AlertTriangle },
  DISABLED:   { bg: 'bg-red-500/15 text-red-400 border-red-500/30',            text: 'DISABLED',   icon: ShieldAlert },
}

const HANDLER_STYLES: Record<string, string> = {
  IMPLEMENTED:     'text-emerald-400',
  MISSING_HANDLER: 'text-red-400',
}

const RISK_STYLES: Record<string, string> = {
  LOW:      'text-emerald-400',
  MEDIUM:   'text-yellow-400',
  HIGH:     'text-orange-400',
  CRITICAL: 'text-red-400',
}

export default function RunbookDetailPage() {
  const { runbookId } = useParams<{ runbookId: string }>()
  const navigate = useNavigate()
  const rb = runbookId ? RUNBOOK_DETAIL[runbookId] as any : null

  if (!rb) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>Runbook <code className="text-white">{runbookId}</code> not found in catalogue.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/runbooks')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Runbooks
        </Button>
      </div>
    )
  }

  const lifecycle = LIFECYCLE_STYLES[rb.lifecycle] || LIFECYCLE_STYLES.DRAFT
  const LifecycleIcon = lifecycle.icon
  const isReady = rb.lifecycle === 'ACTIVE'

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/runbooks')} className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{rb.name}</h1>
            <Badge className={`border ${lifecycle.bg} flex items-center gap-1 text-xs`}>
              <LifecycleIcon className="h-3 w-3" />
              {rb.lifecycle}
            </Badge>
            <Badge variant="outline" className="text-xs text-gray-400">v{rb.semver}</Badge>
          </div>
          <p className="text-gray-400 text-sm mt-1 font-mono">{rb.id}</p>
        </div>
        <div className={`text-sm font-bold ${isReady ? 'text-emerald-400' : 'text-yellow-400'}`}>
          {isReady ? '✓ ACTIVE_READY' : '⚠ NOT_ACTIVE_READY'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Meta */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader><CardTitle className="text-sm text-gray-400">Risk & Safety</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Level</span>
              <span className={`font-bold ${RISK_STYLES[rb.risk] || 'text-gray-300'}`}>{rb.risk}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Blast Radius</span>
              <span className="text-gray-300">{rb.blastRadius}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Reversible</span>
              <span className={rb.reversible ? 'text-emerald-400' : 'text-red-400'}>{rb.reversible ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Verification</span>
              <span className={rb.verificationSupport ? 'text-emerald-400' : 'text-red-400'}>{rb.verificationSupport ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Rollback</span>
              <span className={rb.rollbackStrategy !== 'NONE' ? 'text-emerald-400' : 'text-gray-500'}>{rb.rollbackStrategy}</span>
            </div>
          </CardContent>
        </Card>

        {/* Parameters */}
        <Card className="bg-gray-900 border-gray-700 md:col-span-2">
          <CardHeader><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><Layers className="h-4 w-4" /> Parameters</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rb.parameters.map((p: any) => (
                <div key={p.name} className="flex items-start justify-between text-sm">
                  <div>
                    <code className="text-blue-300">{p.name}</code>
                    <span className="text-gray-500 ml-2 text-xs">{p.type}</span>
                    {p.required && <span className="text-red-400 ml-1 text-xs">*</span>}
                  </div>
                  <span className="text-gray-400 text-xs max-w-xs text-right">{p.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Steps */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><TerminalSquare className="h-4 w-4" /> Execution Steps</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rb.steps.map((step: any, i: number) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50"
              >
                <span className="text-xs text-gray-500 w-6 text-center font-mono">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-sm text-white">{step.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    <code className={HANDLER_STYLES[step.handlerStatus]}>{step.type}/{step.action}</code>
                    <span className="text-gray-600 ml-2">failurePolicy: {step.failurePolicy}</span>
                    {step.requiresConfirmation && <span className="text-yellow-400 ml-2">⚠ requiresConfirmation</span>}
                  </div>
                </div>
                <span className={`text-xs font-medium ${HANDLER_STYLES[step.handlerStatus]}`}>
                  {step.handlerStatus === 'IMPLEMENTED' ? '✓' : '✗'}
                </span>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Activation Blockers */}
      {rb.activationBlockers?.length > 0 && (
        <Card className="bg-yellow-500/5 border-yellow-500/30">
          <CardHeader><CardTitle className="text-sm text-yellow-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Activation Blockers</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {rb.activationBlockers.map((b: string, i: number) => (
                <li key={i} className="text-sm text-yellow-300 flex items-start gap-2">
                  <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Verification */}
      {rb.verification && (
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><Eye className="h-4 w-4" /> Verification</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm text-gray-300 mb-2">Strategy: <span className="text-white">{rb.verification.strategy}</span> — Timeout: {rb.verification.timeoutSeconds}s</div>
            {rb.verification.checks.map((c: any) => (
              <div key={c.id} className="text-sm text-gray-400">{c.id}: {c.description}</div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
