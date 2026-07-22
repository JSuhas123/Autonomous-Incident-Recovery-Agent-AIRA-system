import { useThresholds, useUpdateThresholds } from '@/api/hooks/useSafety'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageLoader } from '@/components/shared/PageLoader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/useToast'
import { motion } from 'framer-motion'
import { Save } from 'lucide-react'
import { useState } from 'react'

const thresholdFields = [
  { key: 'confidenceThreshold', label: 'Confidence Threshold', description: 'Minimum confidence score (0–1) to auto-approve', min: 0, max: 1, step: 0.01 },
  { key: 'criticalConfidenceThreshold', label: 'Critical Confidence Threshold', description: 'Minimum score for critical incidents', min: 0, max: 1, step: 0.01 },
  { key: 'maxRetries', label: 'Max Retries', description: 'Maximum retries for failed actions', min: 0, max: 10, step: 1 },
  { key: 'timeoutSeconds', label: 'Timeout (seconds)', description: 'Execution timeout per step', min: 1, max: 3600, step: 1 },
]

export default function SettingsPage() {
  const { data: thresholds, isLoading, error, refetch } = useThresholds()
  const updateThresholds = useUpdateThresholds()
  const [values, setValues] = useState<Record<string, string>>({})

  const t = thresholds as any

  function getVal(key: string) {
    return key in values ? values[key] : String(t?.[key] ?? '')
  }

  async function handleSave() {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(values)) {
      const n = parseFloat(v)
      if (!isNaN(n)) parsed[k] = n
    }
    if (!Object.keys(parsed).length) { toast.error('No changes to save'); return }
    try {
      await updateThresholds.mutateAsync(parsed)
      toast.success('Thresholds saved')
      setValues({})
    } catch (err: any) {
      toast.error('Save failed', err.message)
    }
  }

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState description={(error as Error).message} onRetry={() => refetch()} />

  return (
    <motion.div
      className="space-y-5 max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure system thresholds and preferences</p>
      </div>

      <Tabs defaultValue="thresholds">
        <TabsList>
          <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Confidence Thresholds</CardTitle>
              <CardDescription>Control when decisions require manual approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {thresholdFields.map(({ key, label, description, min, max, step }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={getVal(key)}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              ))}
              <Button onClick={handleSave} loading={updateThresholds.isPending} size="sm">
                <Save className="w-3 h-3 mr-1" /> Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
