import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLogout } from '@/hooks/useLogout'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import {
    AlertTriangle,
    BarChart2,
    CheckSquare,
    FileText,
    LayoutDashboard,
    LogOut,
    Plug,
    ScrollText,
    Server,
    Settings,
    Shield,
    Zap
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { to: '/approvals', icon: CheckSquare, label: 'Approvals' },
  { to: '/policies', icon: Shield, label: 'Policies' },
  { to: '/audit', icon: ScrollText, label: 'Audit Logs' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/integrations', icon: Plug, label: 'Integrations' },
  { to: '/cluster', icon: Server, label: 'Cluster' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const organization = useAuthStore((s) => s.organization)
  const logout = useLogout()

  return (
    <div className="flex flex-col h-full w-full bg-sidebar border-r border-border">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-border shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">AIRA</div>
          <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
            {organization?.tenantId ?? 'No tenant'}
          </div>
        </div>
      </div>

      {/* Nav items */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-0.5 px-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
          onClick={logout}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
