import { useAgentIntelligence, useRetryAnalysis, useTriggerAnalysis } from '@/api/hooks/useAgentIntelligence'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { AgentIntelligence, AgentTraceEntry, ConfidenceDimensions } from '@/types/agentIntelligence'
import { AlertTriangle, Bot, CheckCircle, ChevronDown, ChevronRight, Clock, Info, RefreshCw, XCircle } from 'lucide-react'
import React, { useState } from 'react'

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ value, label }: { value?: number; label: string }) {
  if (value === undefined) return null
  const pct = Math.round(value * 100)
  const variant = pct >= 80 ? 'default' : pct >= 60 ? 'secondary' : 'destructive'
  return (
    <Badge variant={variant} className="text-xs font-mono">
      {label} {pct}%
    </Badge>
  )
}

function ConfidenceRow({ dims }: { dims?: ConfidenceDimensions }) {
  if (!dims) return null
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      <ConfidenceBadge value={dims.correlationConfidence}         label="Correlation" />
      <ConfidenceBadge value={dims.evidenceCompleteness}          label="Evidence" />
      <ConfidenceBadge value={dims.diagnosisConfidence}           label="Diagnosis" />
      <ConfidenceBadge value={dims.playbookSelectionConfidence}   label="Playbook" />
      <ConfidenceBadge value={dims.parameterConfidence}           label="Params" />
      <ConfidenceBadge value={dims.recoveryObservationConfidence} label="Recovery" />
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-full text-left py-1"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      {open && <div className="mt-2 space-y-2 text-sm">{children}</div>}
    </div>
  )
}

// ── State pill ────────────────────────────────────────────────────────────────

function StatePill({ state, manualReason }: { state?: string; manualReason?: string }) {
  if (!state) return null
  const inProgress = !['COMPLETED', 'MANUAL_REQUIRED', 'FAILED'].includes(state)
  const isManual   = state === 'MANUAL_REQUIRED'
  const isComplete = state === 'COMPLETED'
  const isFailed   = state === 'FAILED'

  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
      isComplete ? 'bg-green-50 text-green-800 border border-green-200' :
      isManual   ? 'bg-amber-50 text-amber-800 border border-amber-200' :
      isFailed   ? 'bg-red-50 text-red-800 border border-red-200' :
                   'bg-blue-50 text-blue-800 border border-blue-200'
    }`}>
      {isComplete ? <CheckCircle className="w-4 h-4 shrink-0" /> :
       isManual   ? <AlertTriangle className="w-4 h-4 shrink-0" /> :
       isFailed   ? <XCircle className="w-4 h-4 shrink-0" /> :
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
      <span className="font-medium">{inProgress ? 'Analyzing…' : state.replace(/_/g, ' ')}</span>
      {manualReason && <span className="text-xs opacity-75 ml-1">— {manualReason}</span>}
    </div>
  )
}

// ── Agent trace timeline ──────────────────────────────────────────────────────

function AgentTimeline({ entries }: { entries: AgentTraceEntry[] }) {
  return (
    <ol className="space-y-2">
      {entries.map((e, i) => {
        const ok      = e.status === 'SUCCESS'
        const failed  = e.status === 'FAILED'
        const manual  = e.status === 'MANUAL_REQUIRED'
        return (
          <li key={i} className="flex items-start gap-3 text-xs">
            <span className={`mt-0.5 shrink-0 ${ok ? 'text-green-600' : failed ? 'text-red-500' : manual ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {ok ? '✓' : failed ? '✗' : manual ? '⚠' : '○'}
            </span>
            <div className="min-w-0">
              <span className="font-medium">{e.agent}</span>
              {e.durationMs != null && (
                <span className="text-muted-foreground ml-2">{e.durationMs}ms</span>
              )}
              {e.confidence != null && (
                <span className="text-muted-foreground ml-2">{Math.round(e.confidence * 100)}%</span>
              )}
              {e.fallbackUsed && <Badge variant="outline" className="ml-2 text-[10px]">fallback</Badge>}
              {e.manualReason && <p className="text-muted-foreground mt-0.5">{e.manualReason}</p>}
              {e.warnings?.map((w, j) => (
                <p key={j} className="text-amber-600 mt-0.5">{w}</p>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { incidentId: string }

export function AgentIntelligencePanel({ incidentId }: Props) {
  const { intelligence, isLoading, error } = useAgentIntelligence(incidentId)
  const trigger = useTriggerAnalysis(incidentId)
  const retry   = useRetryAnalysis(incidentId)

  const intel = intelligence as AgentIntelligence | undefined

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bot className="w-4 h-4" />AI Investigation</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    )
  }

  if (error || !intel) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bot className="w-4 h-4" />AI Investigation</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">No agent analysis yet for this incident.</p>
          <Button size="sm" variant="outline" onClick={() => trigger.mutate()} disabled={trigger.isPending}>
            {trigger.isPending ? 'Starting…' : 'Run AI Analysis'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const isTerminal = ['COMPLETED', 'MANUAL_REQUIRED', 'FAILED'].includes(intel.state)
  const diag = intel.diagnosis
  const pb   = intel.playbookRecommendation
  const pr   = intel.parameterResolution
  const ri   = intel.recoveryIntelligence
  const ex   = intel.explanationResult
  const lr   = intel.learningResult

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="w-4 h-4" />AI Investigation
            <span className="text-[10px] font-normal text-muted-foreground">AIRA v2 · 8-agent</span>
          </CardTitle>
          {isTerminal && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => retry.mutate()} disabled={retry.isPending}>
              <RefreshCw className={`w-3 h-3 mr-1 ${retry.isPending ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* State + confidence */}
        <StatePill state={intel.state} manualReason={intel.manualReason} />
        <ConfidenceRow dims={intel.confidence} />

        {/* IMPORTANT: AI inference disclaimer */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/60 rounded p-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Sections marked <strong>AI INFERENCE</strong> are model-generated and require human review.
            Sections marked <strong>DETERMINISTIC</strong> come directly from the Playbook/Runbook execution engine.
          </span>
        </div>

        <Separator />

        {/* Diagnosis */}
        {diag && (
          <Section title="Diagnosis · AI INFERENCE">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Primary hypothesis</p>
            <p className="font-medium">{diag.recommendedIncidentType ?? diag.primaryHypothesis ?? '—'}</p>
            <p className="text-muted-foreground">Confidence: {diag.diagnosisConfidence != null ? `${Math.round(diag.diagnosisConfidence * 100)}%` : '—'}</p>
            {diag.hypotheses && diag.hypotheses.length > 1 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">Alternatives</p>
                {diag.hypotheses.slice(1, 4).map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-mono w-8 shrink-0">{Math.round(h.confidence * 100)}%</span>
                    <span>{h.rootCause}</span>
                  </div>
                ))}
              </div>
            )}
            {diag.unresolvedQuestions && diag.unresolvedQuestions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">Unresolved</p>
                {diag.unresolvedQuestions.map((q, i) => (
                  <p key={i} className="text-xs text-amber-600">• {q}</p>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Playbook recommendation */}
        {pb && (
          <>
            <Separator />
            <Section title="Playbook Recommendation · AI INFERENCE">
              <div className="flex items-center gap-2">
                <Badge variant={pb.recommendation === 'EXECUTE_CANDIDATE' ? 'default' : 'secondary'}>
                  {pb.recommendation?.replace(/_/g, ' ')}
                </Badge>
                {pb.recommendedPlaybookId && (
                  <span className="font-mono text-xs">{pb.recommendedPlaybookId}</span>
                )}
              </div>
              {pb.reasoningConfidence != null && (
                <p className="text-xs text-muted-foreground">Selection confidence: {Math.round(pb.reasoningConfidence * 100)}%</p>
              )}
              {pb.reasons && pb.reasons.length > 0 && (
                <ul className="text-xs list-disc list-inside text-muted-foreground mt-1">
                  {pb.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </Section>
          </>
        )}

        {/* Parameter resolution */}
        {pr && (
          <>
            <Separator />
            <Section title="Parameters · AI INFERENCE">
              <div className="flex items-center gap-2">
                <Badge variant={pr.readyForExecution ? 'default' : 'secondary'}>
                  {pr.readyForExecution ? 'Ready' : 'Incomplete'}
                </Badge>
              </div>
              {pr.candidates && pr.candidates.length > 0 && (
                <table className="w-full text-xs mt-2">
                  <thead><tr className="text-muted-foreground"><th className="text-left">Param</th><th className="text-left">Value</th><th className="text-left">Confidence</th><th className="text-left">Source</th></tr></thead>
                  <tbody>
                    {pr.candidates.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-0.5 font-mono">{c.parameter}</td>
                        <td className="py-0.5 font-mono">{String(c.proposedValue)}</td>
                        <td className="py-0.5">{Math.round(c.confidence * 100)}%</td>
                        <td className="py-0.5 text-muted-foreground">{c.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pr.ambiguous && pr.ambiguous.length > 0 && (
                <p className="text-amber-600 text-xs">Ambiguous: {pr.ambiguous.join(', ')}</p>
              )}
              {pr.unresolved && pr.unresolved.length > 0 && (
                <p className="text-red-500 text-xs">Unresolved: {pr.unresolved.join(', ')}</p>
              )}
            </Section>
          </>
        )}

        {/* Execution result — DETERMINISTIC */}
        {intel.executionResult && (
          <>
            <Separator />
            <Section title="Execution Result · DETERMINISTIC">
              <div className="flex items-center gap-2">
                <Badge variant={intel.executionResult.outcome === 'AUTO_RESOLVED' ? 'default' : 'secondary'}>
                  {intel.executionResult.outcome}
                </Badge>
                {intel.executionResult.playbookId && (
                  <span className="font-mono text-xs">{intel.executionResult.playbookId}</span>
                )}
              </div>
              {intel.executionResult.executionId && (
                <p className="text-xs text-muted-foreground font-mono">Execution: {intel.executionResult.executionId}</p>
              )}
            </Section>
          </>
        )}

        {/* Recovery intelligence */}
        {ri && (
          <>
            <Separator />
            <Section title="Recovery Intelligence · AI INFERENCE">
              <div className="flex items-center gap-2">
                <Badge variant={ri.state === 'RECOVERED' ? 'default' : ri.state === 'WORSENING' ? 'destructive' : 'secondary'}>
                  {ri.state}
                </Badge>
                <Badge variant="outline">{ri.recommendation}</Badge>
                <span className="text-xs text-muted-foreground">{Math.round(ri.confidence * 100)}% confidence</span>
              </div>
              {ri.concerns && ri.concerns.length > 0 && (
                <ul className="text-xs list-disc list-inside text-amber-600 mt-1">
                  {ri.concerns.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </Section>
          </>
        )}

        {/* Explanation */}
        {ex && (
          <>
            <Separator />
            <Section title="Explanation · AI INFERENCE">
              {ex.title && <p className="font-medium">{ex.title}</p>}
              {ex.whatHappened && <p className="text-muted-foreground">{ex.whatHappened}</p>}
              {ex.likelyCause && (
                <div className="mt-1">
                  <span className="text-xs text-muted-foreground">Likely cause: </span>
                  <span className="text-sm">{ex.likelyCause}</span>
                </div>
              )}
              {ex.finalOutcome && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge>{ex.finalOutcome}</Badge>
                  {ex.manualReason && <span className="text-xs text-muted-foreground">{ex.manualReason}</span>}
                </div>
              )}
              {ex.operatorNextSteps && ex.operatorNextSteps.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">Recommended next steps</p>
                  <ul className="text-xs list-disc list-inside space-y-0.5">
                    {ex.operatorNextSteps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </Section>
          </>
        )}

        {/* Learning */}
        {lr && lr.recommendations && lr.recommendations.length > 0 && (
          <>
            <Separator />
            <Section title="Learning Recommendations · REQUIRES HUMAN APPROVAL">
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded p-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                All recommendations are DRAFT and require explicit human approval before action.
              </div>
              {lr.recommendations.map((r, i) => (
                <div key={i} className="border rounded p-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{r.type}</Badge>
                    <span className="text-xs text-muted-foreground">{Math.round(r.confidence * 100)}% confidence</span>
                  </div>
                  <p className="text-xs">{r.description}</p>
                </div>
              ))}
            </Section>
          </>
        )}

        {/* Agent trace */}
        {intel.agentTrace && intel.agentTrace.length > 0 && (
          <>
            <Separator />
            <Section title="Agent Execution Trace">
              <AgentTimeline entries={intel.agentTrace} />
            </Section>
          </>
        )}

        {/* Timing */}
        {intel.createdAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Analysis started {new Date(intel.createdAt).toLocaleString()}
            {intel.completedAt && ` · completed ${new Date(intel.completedAt).toLocaleString()}`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
