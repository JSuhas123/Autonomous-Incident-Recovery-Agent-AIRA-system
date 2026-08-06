/**
 * DemoBanner — visible when VITE_DEMO_MODE=true.
 * Shows a non-intrusive notice that recovery actions are simulated.
 */
export function DemoBanner() {
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
  if (!isDemoMode) return null

  return (
    <div className="w-full bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-1.5 text-center text-xs text-yellow-600 dark:text-yellow-400 font-medium">
      DEMO MODE — Recovery actions are simulated. No real infrastructure is modified.
    </div>
  )
}
