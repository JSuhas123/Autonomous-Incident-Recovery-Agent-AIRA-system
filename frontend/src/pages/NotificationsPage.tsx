import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { useNotificationsStore } from '@/store/notificationsStore'
import { motion } from 'framer-motion'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'

export default function NotificationsPage() {
  const { notifications, markRead, markAllRead, remove } = useNotificationsStore()

  return (
    <motion.div
      className="space-y-5 max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{notifications.filter((n) => !n.read).length} unread</p>
        </div>
        {notifications.some((n) => !n.read) && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications" description="You're all caught up" />
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start justify-between gap-3 p-4 hover:bg-muted/20',
                    !n.read && 'bg-primary/5',
                  )}
                  onClick={() => markRead(n.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                    <div className={cn('space-y-0.5', n.read && 'pl-5')}>
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.message && <p className="text-xs text-muted-foreground">{n.message}</p>}
                      <p className="text-xs text-muted-foreground">{formatRelative(n.timestamp)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); remove(n.id) }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
