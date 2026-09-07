import {
  LoaderCircle,
} from 'lucide-react'


export function PageLoader() {
  return (
    <div
      className="flex min-h-[45vh] items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading AIRA product page"
    >
      <div className="flex flex-col items-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />

        <p className="mt-3 text-xs text-muted-foreground">
          Loading AIRA
        </p>
      </div>
    </div>
  )
}