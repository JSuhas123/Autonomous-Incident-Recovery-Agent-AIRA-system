import { useCreateMonitor, useTestMonitor } from '@/api/hooks/useMonitors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { CreateMonitorBody, HttpMethod, MonitorCheck, MonitorType } from '@/types/monitor'
import { useState } from 'react'

interface Props {
  serviceId: string
  onSuccess?: () => void
  onCancel?: () => void
}

const MONITOR_TYPES: { value: MonitorType; label: string }[] = [
  { value: 'https', label: 'HTTPS' },
  { value: 'http',  label: 'HTTP'  },
  { value: 'ssl',   label: 'SSL Certificate' },
]

const HTTP_METHODS: HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH']

function CheckResultBadge({ result }: { result: MonitorCheck }) {
  const colors = {
    healthy:  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    down:     'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    unknown:  'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  }
  return (
    <div className={`rounded-md p-3 text-sm space-y-1 ${colors[result.status]}`}>
      <p className="font-semibold capitalize">{result.status}</p>
      {result.statusCode != null && <p>Status code: {result.statusCode}</p>}
      {result.responseTimeMs != null && <p>Response time: {result.responseTimeMs} ms</p>}
      {result.sslDaysRemaining != null && <p>SSL expires in: {result.sslDaysRemaining} days</p>}
      {result.sanitizedErrorMessage && <p>Error: {result.sanitizedErrorMessage}</p>}
    </div>
  )
}

export default function MonitorForm({ serviceId, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<CreateMonitorBody>({
    name: '',
    type: 'https',
    url: '',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 10000,
    expectedStatusCodes: [200],
    followRedirects: true,
    sslExpiryWarningDays: 30,
  })
  const [testResult, setTestResult] = useState<MonitorCheck | null>(null)
  const [createdMonitorId, setCreatedMonitorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateMonitor(serviceId)
  const testMutation   = useTestMonitor()

  function set<K extends keyof CreateMonitorBody>(key: K, value: CreateMonitorBody[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setTestResult(null)
    setError(null)
  }

  async function handleCreate() {
    setError(null)
    try {
      const res = await createMutation.mutateAsync(form)
      setCreatedMonitorId(res.monitor.id)
      onSuccess?.()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create monitor')
    }
  }

  async function handleTest() {
    setError(null)
    // We need a monitor to test — if not created yet, create first silently
    // The test endpoint requires an existing monitorId.
    // For pre-creation preview we show a simple message instead.
    if (!createdMonitorId) {
      setError('Save the monitor first, then run a test check.')
      return
    }
    try {
      const res = await testMutation.mutateAsync(createdMonitorId)
      setTestResult(res.result)
    } catch (e: any) {
      setError(e?.message ?? 'Test check failed')
    }
  }

  const loading = createMutation.isPending || testMutation.isPending

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-1">
        <Label htmlFor="mon-name">Monitor name</Label>
        <Input
          id="mon-name"
          placeholder="Homepage check"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={loading}
        />
      </div>

      {/* Type */}
      <div className="space-y-1">
        <Label>Type</Label>
        <Select
          value={form.type}
          onValueChange={(v) => set('type', v as MonitorType)}
          disabled={loading}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONITOR_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* URL */}
      <div className="space-y-1">
        <Label htmlFor="mon-url">URL</Label>
        <Input
          id="mon-url"
          placeholder="https://example.com"
          value={form.url}
          onChange={(e) => set('url', e.target.value)}
          disabled={loading}
        />
      </div>

      {/* Method (hidden for SSL) */}
      {form.type !== 'ssl' && (
        <div className="space-y-1">
          <Label>HTTP method</Label>
          <Select
            value={form.method}
            onValueChange={(v) => set('method', v as HttpMethod)}
            disabled={loading}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Interval */}
      <div className="space-y-1">
        <Label htmlFor="mon-interval">Check every (seconds)</Label>
        <Input
          id="mon-interval"
          type="number"
          min={30}
          max={86400}
          value={form.intervalSeconds}
          onChange={(e) => set('intervalSeconds', parseInt(e.target.value, 10))}
          disabled={loading}
        />
      </div>

      {/* Expected status codes (simple comma-separated input) */}
      {form.type !== 'ssl' && (
        <div className="space-y-1">
          <Label htmlFor="mon-codes">Expected status codes (comma-separated)</Label>
          <Input
            id="mon-codes"
            placeholder="200, 201"
            value={(form.expectedStatusCodes ?? [200]).join(', ')}
            onChange={(e) => {
              const codes = e.target.value
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => !isNaN(n))
              set('expectedStatusCodes', codes)
            }}
            disabled={loading}
          />
        </div>
      )}

      {/* SSL expiry warning days */}
      {(form.type === 'ssl' || form.type === 'https') && (
        <div className="space-y-1">
          <Label htmlFor="mon-ssl">Warn when SSL expires within (days)</Label>
          <Input
            id="mon-ssl"
            type="number"
            min={1}
            max={90}
            value={form.sslExpiryWarningDays}
            onChange={(e) => set('sslExpiryWarningDays', parseInt(e.target.value, 10))}
            disabled={loading}
          />
        </div>
      )}

      {/* Follow redirects */}
      {form.type !== 'ssl' && (
        <div className="flex items-center gap-2">
          <Switch
            id="mon-redirects"
            checked={form.followRedirects}
            onCheckedChange={(v) => set('followRedirects', v)}
            disabled={loading}
          />
          <Label htmlFor="mon-redirects">Follow redirects</Label>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {testResult && <CheckResultBadge result={testResult} />}

      <div className="flex gap-2 pt-2">
        <Button
          onClick={handleCreate}
          disabled={!form.name || !form.url || loading || !!createdMonitorId}
        >
          {createdMonitorId ? 'Saved' : createMutation.isPending ? 'Saving…' : 'Save monitor'}
        </Button>
        {createdMonitorId && (
          <Button variant="outline" onClick={handleTest} disabled={testMutation.isPending}>
            {testMutation.isPending ? 'Running…' : 'Run test check'}
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
        )}
      </div>
    </div>
  )
}
