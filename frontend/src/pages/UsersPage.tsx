import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { Plus, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

async function adminRequest<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'include',
  })
  return res.json() as Promise<T>
}

interface User {
  id: string
  email: string
  name: string
  role: string
  status: string
  createdAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchUsers() {
    try {
      const data = await adminRequest<{ users: User[] }>('/api/admin/users')
      setUsers(data.users ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  async function deleteUser(id: string) {
    await adminRequest(`/api/admin/users/${id}`, { method: 'DELETE' })
    fetchUsers()
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage user accounts</p>
        </div>
        <Button size="sm" disabled>
          <Plus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            All Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{u.role}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-7 w-7"
                      onClick={() => deleteUser(u.id)}
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
