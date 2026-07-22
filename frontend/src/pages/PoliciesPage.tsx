import { usePolicies, usePolicyVersions, useUpdatePolicy, useValidatePolicy } from '@/api/hooks/usePolicies'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageLoader } from '@/components/shared/PageLoader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/useToast'
import { formatDateTime } from '@/lib/format'
import { AlertTriangle, CheckCircle, Save } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'

export default function PoliciesPage() {
  const { data: policy, isLoading, error, refetch } = usePolicies()
  const { data: versions } = usePolicyVersions()
  const updatePolicy = useUpdatePolicy()
  const validatePolicy = useValidatePolicy()

  const [yaml, setYaml] = useState<string>('')
  const [validationResult, setValidationResult] = useState<any>(null)

  // Initialize editor with current policy
  const currentYaml = (policy as any)?.yaml ?? (policy as any)?.content ?? ''
  const editorValue = yaml || currentYaml

  const versionList: any[] = Array.isArray(versions) ? versions : (versions as any)?.versions ?? []

  async function handleValidate() {
    if (!editorValue) return
    try {
      const result = await validatePolicy.mutateAsync(editorValue)
      setValidationResult(result)
    } catch (err: any) {
      toast.error('Validation failed', err.message)
    }
  }

  async function handleSave() {
    if (!editorValue) return
    try {
      await updatePolicy.mutateAsync(editorValue)
      toast.success('Policy saved successfully')
      setYaml('')
    } catch (err: any) {
      toast.error('Save failed', err.message)
    }
  }

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState description={(error as Error).message} onRetry={() => refetch()} />

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Policies</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage recovery policies and rules</p>
      </div>

      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle>Policy YAML</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  loading={validatePolicy.isPending}
                >
                  Validate
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  loading={updatePolicy.isPending}
                  disabled={!yaml}
                >
                  <Save className="w-3 h-3 mr-1" /> Save
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full h-96 font-mono text-xs bg-muted/30 border border-border rounded p-3 text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                value={editorValue}
                onChange={(e) => setYaml(e.target.value)}
                spellCheck={false}
                placeholder="# Enter policy YAML…"
              />
            </CardContent>
          </Card>

          {validationResult && (
            <Card>
              <CardContent className="p-4 flex items-start gap-3">
                {validationResult.valid ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-sm">
                    {validationResult.valid ? 'Policy is valid' : 'Validation errors'}
                  </p>
                  {validationResult.errors?.map((e: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground mt-1">{e}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="versions">
          <Card>
            <CardContent className="p-0">
              {versionList.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-10">No versions available</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Version', 'Updated By', 'Created', 'Status'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium first:pl-6">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {versionList.map((v: any, i: number) => (
                      <tr key={v._id ?? i} className="border-b border-border/50">
                        <td className="pl-6 pr-4 py-3 font-mono text-xs">{v.version ?? i + 1}</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.updatedBy ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</td>
                        <td className="px-4 py-3">
                          {v.active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Archived</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
