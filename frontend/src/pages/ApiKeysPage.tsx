import { ApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Key, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ApiKey {
  id: string
  keyId: string
  description: string
  active: boolean
  secret?: string
  createdAt: string
}

// Inline admin fetcher — admin endpoints are not tenant-scoped
async function adminRequest<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const { buildAuthHeaders } = await import('@/lib/hmac')
  const { useAuthStore } = await import('@/store/authStore')
  const { credentials } = useAuthStore.getState()
  if (!credentials) throw new ApiError(401, 'Not authenticated')
  const body = opts.body as string | undefined
  const authHeaders = await buildAuthHeaders(credentials.keyId, credentials.secret, body ?? '')
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}${path}`, {
    ...opts,
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
  })
  return res.json() as Promise<T>
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState<ApiKey | null>(null)
  const [showSecret, setShowSecret] = useState(false)

  async function fetchKeys() {
    try {
      const data = await adminRequest<{ apiKeys: ApiKey[] }>('/api/admin/api-keys')
      setKeys(data.apiKeys ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchKeys() }, [])

  async function createKey() {
    const data = await adminRequest<ApiKey>('/api/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ description: 'New API Key' }),
    })
    setNewKey(data)
    fetchKeys()
  }

  async function deleteKey(id: string) {
    await adminRequest(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
    fetchKeys()
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage API access keys</p>
        </div>
        <Button size="sm" onClick={createKey}>
          <Plus className="w-4 h-4 mr-2" />
          Generate Key
        </Button>
      </div>

      {newKey && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-primary">New API Key Created — Save the secret now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xs"><span className="text-muted-foreground">Key ID:</span> {newKey.keyId}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono break-all">
                <span className="text-muted-foreground">Secret:</span>{' '}
                {showSecret ? newKey.secret : '••••••••••••••••'}
              </p>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSecret(v => !v)}>
                {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Active Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys found.</p>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <p className="text-sm font-medium font-mono">{k.keyId}</p>
                    <p className="text-xs text-muted-foreground">{k.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={k.active ? 'default' : 'secondary'}>
                      {k.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-7 w-7"
                      onClick={() => deleteKey(k.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
