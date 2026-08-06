import { Button } from '@/components/ui/button'
import { useNotificationsStore } from '@/store/notificationsStore'
import { Bell, Menu, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const navigate = useNavigate()

  return (
    <header className="flex items-center justify-between px-4 h-14 border-b border-border bg-background shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-1">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>

        {/* Profile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/profile')}
          aria-label="Profile"
        >
          <User className="w-5 h-5" />
        </Button>
      </div>
    </header>
  )
}
