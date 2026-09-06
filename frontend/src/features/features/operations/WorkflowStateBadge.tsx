import type { WorkflowState } from './operationsOverview.types'

const labels: Record<WorkflowState, string> = {
  observing: 'Observing',
  investigating: 'Investigating',
  human_required: 'Human required',
  approval_required: 'Approval required',
  recovery_ready: 'Recovery ready',
  recovery_running: 'Recovery running',
  verification_pending: 'Verification pending',
  verified: 'Verified',
  failed: 'Failed',
}

const styles: Record<WorkflowState, string> = {
  observing: 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300',
  investigating: 'border-indigo-400/20 bg-indigo-400/[0.06] text-indigo-300',
  human_required: 'border-amber-400/20 bg-amber-400/[0.06] text-amber-300',
  approval_required: 'border-amber-400/20 bg-amber-400/[0.06] text-amber-300',
  recovery_ready: 'border-violet-400/20 bg-violet-400/[0.06] text-violet-300',
  recovery_running: 'border-violet-400/20 bg-violet-400/[0.06] text-violet-300',
  verification_pending: 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300',
  verified: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300',
  failed: 'border-red-400/20 bg-red-400/[0.06] text-red-300',
}

export function WorkflowStateBadge({ state }: { state: WorkflowState }) {
  return (
    <span className={['inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium', styles[state]].join(' ')}>
      {labels[state]}
    </span>
  )
}
