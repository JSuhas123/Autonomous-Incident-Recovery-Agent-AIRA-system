import { useDecision } from '@/api/hooks/useDecisions'
import { useExecuteRunbook, useRunbooks } from '@/api/hooks/useRunbooks'
import { PageLoader } from '@/components/shared/PageLoader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/useToast'
import { motion } from 'framer-motion'
import { ArrowLeft, Play } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function RecoveryExecutionPage() {
  const { decisionId = '' } = useParams()
  const navigate = useNavigate()
  const { data: decision, isLoading } = useDecision(decisionId)
  const { data: runbooks } = useRunbooks()
  const execute = useExecuteRunbook()
  const [selectedRunbook, setSelectedRunbook] = useState<string>('')

  if (isLoading) return <PageLoader />

  const d = decision as any
  const runbookList: any[] = Array.isArray(runbooks) ? runbooks : (runbooks as any)?.runbooks ?? []

  async function handleExecute() {
    if (!selectedRunbook) {
      toast.error('Select a runbook')
      return
    }
    try {
      await execute.mutateAsync({ runbookId: selectedRunbook, input: { decisionId } })
      toast.success('Runbook execution started')
    } catch (err: any) {
      toast.error('Execution failed', err.message)
    }
  }

  return (
    <motion.div
      className="space-y-5 max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Recovery Execution</h1>
          <p className="text-xs font-mono text-muted-foreground">{decisionId}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Recommended Action</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm font-medium">{d?.recommendedAction ?? 'No action available'}</p>
          {d?.reasoning && (
            <p className="text-sm text-muted-foreground mt-2">{d.reasoning}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Execute Runbook</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Select Runbook</label>
            <Select value={selectedRunbook} onValueChange={setSelectedRunbook}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a runbook…" />
              </SelectTrigger>
              <SelectContent>
                {runbookList.map((rb: any) => (
                  <SelectItem key={rb._id} value={rb._id}>
                    {rb.name ?? rb._id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleExecute} loading={execute.isPending} className="gap-2">
            <Play className="w-4 h-4" /> Execute
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
