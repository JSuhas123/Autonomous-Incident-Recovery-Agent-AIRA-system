import {
  Bell,
} from 'lucide-react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  useProductNotificationSummary,
} from '@/hooks/useProductNotifications'


export function ProductNotificationBell() {
  const navigate =
    useNavigate()


  const {
    data,
  } =
    useProductNotificationSummary()


  const unread =
    data
      ?.unreadCount ??
    0


  const critical =
    data
      ?.criticalUnread ??
    0


  return (
    <button
      type="button"
      onClick={
        () =>
          navigate(
            '/notifications',
          )
      }
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label={
        unread >
        0
          ? `${unread} unread notifications`
          : 'Notifications'
      }
    >
      <Bell className="h-4 w-4" />


      {unread >
        0 && (
        <>
          <span
            className={[
              'absolute right-1.5 top-1.5 h-2 w-2 rounded-full',

              critical >
              0
                ? 'bg-red-400'
                : 'bg-amber-400',
            ].join(
              ' ',
            )}
          />


          <span className="absolute -right-2 -top-2 flex min-w-5 items-center justify-center rounded-full border border-background bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {unread >
            99
              ? '99+'
              : unread}
          </span>
        </>
      )}
    </button>
  )
}