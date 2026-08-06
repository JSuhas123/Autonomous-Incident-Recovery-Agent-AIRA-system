import { ApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

async function adminRequest<T>(path: string): Promise<T> {
  const { buildAuthHeaders } = await import('@/lib/hmac')
  const { useAuthStore } = await import('@/store/authStore')
  const { credentials } = useAuthStore.getState()
  if (!credentials) throw new ApiError(401, 'Not authenticated')
  const authHeaders = await buildAuthHeaders(credentials.keyId, credentials.secret, '')
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}${path}`, {
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
  })
  return res.json() as Promise<T>
}

interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  createdAt: string
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminRequest<{ roles: Role[] }>('/api/admin/roles')
      .then((d) => setRoles(d.roles ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div>
        <h1 className="text-xl font-semibold">Roles</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage access control roles</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            System Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles found.</p>
          ) : (
            <div className="space-y-3">
              {roles.map((r) => (
                <div key={r.id} className="p-3 rounded-md border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium capitalize">{r.name}</p>
                    <Badge variant="secondary">{r.permissions.length} permissions</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
