import { Toaster } from '@/components/ui/toaster'
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap'
import { router } from '@/router'
import { RouterProvider } from 'react-router-dom'

function Bootstrap({ children }: { children: React.ReactNode }) {
  useSessionBootstrap()
  return <>{children}</>
}

export default function App() {
  return (
    <Bootstrap>
      <RouterProvider router={router} />
      <Toaster />
    </Bootstrap>
  )
}
