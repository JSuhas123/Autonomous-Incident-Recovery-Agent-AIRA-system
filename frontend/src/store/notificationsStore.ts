import type { Notification } from '@/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification(n) {
        const notification: Notification = {
          ...n,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          read: false,
        }
        const notifications = [notification, ...get().notifications].slice(0, 100)
        set({ notifications, unreadCount: notifications.filter((x) => !x.read).length })
      },

      markRead(id) {
        const notifications = get().notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        )
        set({ notifications, unreadCount: notifications.filter((x) => !x.read).length })
      },

      markAllRead() {
        const notifications = get().notifications.map((n) => ({ ...n, read: true }))
        set({ notifications, unreadCount: 0 })
      },

      remove(id) {
        const notifications = get().notifications.filter((n) => n.id !== id)
        set({ notifications, unreadCount: notifications.filter((x) => !x.read).length })
      },
    }),
    { name: 'aira-notifications' },
  ),
)
