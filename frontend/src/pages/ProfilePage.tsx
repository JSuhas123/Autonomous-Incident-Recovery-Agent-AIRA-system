import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLogout } from '@/hooks/useLogout'
import { useAuthStore } from '@/store/authStore'
import { motion } from 'framer-motion'
import { LogOut } from 'lucide-react'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const organization = useAuthStore((s) => s.organization)
  const logout = useLogout()

  const initials = (user?.fullName ?? user?.email ?? 'U').slice(0, 2).toUpperCase()

  return (
    <motion.div
      className="space-y-5 max-w-xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your account and credentials</p>
      </div>

      <Card>
        <CardContent className="p-6 flex items-center gap-4">
          <Avatar className="w-14 h-14">
            <AvatarFallback className="text-base">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{user?.fullName ?? user?.email ?? 'Unknown'}</p>
            <p className="text-sm text-muted-foreground">{organization?.name ?? organization?.tenantId ?? 'No organization'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            ['Email', user?.email],
            ['Organization', organization?.name],
            ['Tenant ID', organization?.tenantId],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono text-xs">{value ?? '—'}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button variant="destructive" size="sm" onClick={logout}>
        <LogOut className="w-4 h-4 mr-2" /> Sign Out
      </Button>
    </motion.div>
  )
}
