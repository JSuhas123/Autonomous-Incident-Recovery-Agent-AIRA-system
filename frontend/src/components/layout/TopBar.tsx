import { Button } from '@/components/ui/button'
import { useLogout } from '@/hooks/useLogout'
import { useAuthStore } from '@/store/authStore'
import { useNotificationsStore } from '@/store/notificationsStore'
import { Bell, LogOut, Menu, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const navigate = useNavigate()
  const logout = useLogout()
  const user = useAuthStore((s) => s.user)
  const organization = useAuthStore((s) => s.organization)

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

      {/* Org name — visible on desktop */}
      <div className="hidden lg:flex items-center gap-2">
        {organization?.name && (
          <span className="text-sm font-medium text-foreground">{organization.name}</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* User name — visible on medium+ screens */}
        {user?.fullName && (
          <span className="hidden md:block text-sm text-muted-foreground mr-2">
            {user.fullName}
          </span>
        )}

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

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  )
}

