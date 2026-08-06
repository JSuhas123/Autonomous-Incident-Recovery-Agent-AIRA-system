import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/authStore'
import { motion } from 'framer-motion'
import { Users } from 'lucide-react'

export default function TeamPage() {
  const user = useAuthStore((s) => s.user)
  const membership = useAuthStore((s) => s.membership)

  return (
    <motion.div
      className="space-y-6 max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage members and roles in your organization.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-muted-foreground" />
            Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user && (
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <span className="text-xs capitalize bg-primary/10 text-primary px-2 py-1 rounded-full">
                {membership?.role ?? 'member'}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Team invitations will be available in a future release.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
