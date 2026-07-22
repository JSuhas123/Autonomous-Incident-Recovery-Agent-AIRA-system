import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '—'
  return format(d, 'MMM d, yyyy')
}

export function formatDateTime(date: string | Date | undefined | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '—'
  return format(d, 'MMM d, yyyy HH:mm:ss')
}

export function formatRelative(date: string | Date | undefined | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}

export function formatPercent(value: number | undefined | null, decimals = 1): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatConfidence(value: number | undefined | null): string {
  if (value == null) return '—'
  return `${Math.round(value * 100)}%`
}

export function formatNumber(value: number | undefined | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat().format(value)
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '…'
}
