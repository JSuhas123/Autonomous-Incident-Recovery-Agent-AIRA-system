import { buildAuthHeaders } from '@/lib/hmac'
import { useAuthStore } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'



export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  /** Skip tenant-scoped auth (for unauthenticated/health endpoints) */
  noAuth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, noAuth = false } = options

  const bodyString = body != null ? JSON.stringify(body) : ''

  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (!noAuth) {
    const { credentials } = useAuthStore.getState()
    if (!credentials) throw new ApiError(401, 'Not authenticated')
    const authHeaders = await buildAuthHeaders(
      credentials.keyId,
      credentials.secret,
      bodyString,
    )
    headers = { ...headers, ...authHeaders }
  }

  const url = `${BASE_URL}${path}`

  const res = await fetch(url, {
    method,
    headers,
    body: bodyString || undefined,
    signal,
  })

  let data: unknown
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }

  if (!res.ok) {
    const err = data as { error?: string; message?: string; code?: string }
    throw new ApiError(
      res.status,
      err.error ?? err.message ?? `HTTP ${res.status}`,
      err.code,
      data,
    )
  }

  return data as T
}

// ─── Public health endpoints (no auth) ────────────────────────────────────

export const healthApi = {
  /** Alias used by useHealth hook */
  check: (signal?: AbortSignal) =>
    request<{ status: string; timestamp: string; components?: Record<string, string> }>(
      '/health', { noAuth: true, signal },
    ),
  get: (signal?: AbortSignal) =>
    request<{ status: string; timestamp: string; components?: Record<string, string> }>(
      '/health', { noAuth: true, signal },
    ),
  getDetailed: (token: string, signal?: AbortSignal) =>
    fetch(`${BASE_URL}/health/detailed`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }).then((r) => r.json()),
}

// ─── Tenant-scoped helpers ─────────────────────────────────────────────────

function tenantPath(tenantId: string, suffix: string) {
  return `/api/v1/tenants/${tenantId}${suffix}`
}

// ─── Signals / Decisions ──────────────────────────────────────────────────

export const signalApi = {
  submit: (tenantId: string, body: unknown) =>
    request(tenantPath(tenantId, '/signals'), { method: 'POST', body }),

  getDecision: (tenantId: string, decisionId: string) =>
    request(tenantPath(tenantId, `/decisions/${decisionId}`)),

  listDecisions: (tenantId: string, params?: Record<string, string>) => {
    const q = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''
    return request<{ recentDecisions: unknown[]; summary: unknown }>(
      tenantPath(tenantId, `/decisions${q}`),
    )
  },

  getAudit: (tenantId: string, id: string) =>
    request(tenantPath(tenantId, `/audit/${id}`)),

  getPatterns: (tenantId: string) =>
    request(tenantPath(tenantId, '/patterns')),

  getIncident: (tenantId: string, id: string) =>
    request(tenantPath(tenantId, `/incidents/${id}`)),

  listActions: (tenantId: string) =>
    request(tenantPath(tenantId, '/actions')),
}

// ─── Approvals ────────────────────────────────────────────────────────────

export const approvalApi = {
  /** Backend only returns pending; status filter is client-side */
  list: (tenantId: string, _status?: string) =>
    request<{ pending: unknown[]; pendingCount: number }>(tenantPath(tenantId, '/approvals')),

  get: (tenantId: string, approvalId: string) =>
    request(tenantPath(tenantId, `/approvals/${approvalId}`)),

  stats: (tenantId: string) =>
    request<{ tenantId: string; queue: { pending: number; approved: number; rejected: number } }>(
      tenantPath(tenantId, '/approvals/queue/stats'),
    ),

  approve: (
    tenantId: string,
    approvalId: string,
    body: { approvedBy: string; comment?: string },
  ) =>
    request(tenantPath(tenantId, `/approvals/${approvalId}/approve`), { method: 'POST', body }),

  reject: (
    tenantId: string,
    approvalId: string,
    body: { rejectedBy: string; reason?: string },
  ) =>
    request(tenantPath(tenantId, `/approvals/${approvalId}/reject`), { method: 'POST', body }),
}

// ─── Runbooks ─────────────────────────────────────────────────────────────

export const runbookApi = {
  list: (tenantId: string, params?: { incidentType?: string; enabled?: boolean }) => {
    const q = params ? `?${new URLSearchParams(params as Record<string, string>)}` : ''
    return request(tenantPath(tenantId, `/runbooks${q}`))
  },
  get: (tenantId: string, runbookId: string) =>
    request(tenantPath(tenantId, `/runbooks/${runbookId}`)),
  create: (tenantId: string, body: unknown) =>
    request(tenantPath(tenantId, '/runbooks'), { method: 'POST', body }),
  update: (tenantId: string, runbookId: string, body: unknown) =>
    request(tenantPath(tenantId, `/runbooks/${runbookId}`), { method: 'PUT', body }),
  execute: (tenantId: string, runbookId: string, input?: Record<string, unknown>) =>
    request(tenantPath(tenantId, `/runbooks/${runbookId}/execute`), {
      method: 'POST',
      body: input ?? {},
    }),
  executions: (tenantId: string, runbookId: string) =>
    request(tenantPath(tenantId, `/runbooks/${runbookId}/executions`)),
}

// ─── Action Logs ──────────────────────────────────────────────────────────

export const actionLogApi = {
  list: (tenantId: string, params?: Record<string, string> | number) => {
    const limit = typeof params === 'number' ? params : 50
    const extra = typeof params === 'object' && params !== null ? params : {}
    const q = new URLSearchParams({ limit: String(limit), ...extra })
    return request<{ data: unknown[] }>(tenantPath(tenantId, `/action-logs?${q}`))
  },
}

// ─── Policy ───────────────────────────────────────────────────────────────

export const policyApi = {
  /** Get current policy — returns the latest version */
  get: (_tenantId: string) =>
    request<unknown>('/api/v1/policy/version-history', { noAuth: true }).then((r) => {
      const versions: any[] = (r as any)?.versions ?? (Array.isArray(r) ? r : [])
      return versions[0] ?? { yaml: '', content: '', policyYaml: '' }
    }),

  versions: (_tenantId: string) =>
    request('/api/v1/policy/version-history', { noAuth: true }),

  validate: (_tenantId: string, policyYaml: string) =>
    request('/api/v1/policy/validate', {
      method: 'POST',
      body: { policyYaml },
      noAuth: true,
    }),

  update: (tenantId: string, policyYaml: string) =>
    request('/api/v1/policy/create-version', {
      method: 'POST',
      body: { policyYaml, tenantId },
    }),

  dryRun: (_tenantId: string, policyYaml: string, signal: Record<string, unknown>) =>
    request('/api/v1/policy/dry-run', {
      method: 'POST',
      body: { policyYaml, signal },
      noAuth: true,
    }),

  rollback: (body: unknown) =>
    request('/api/v1/policy/rollback', { method: 'POST', body }),
  dryRunResults: () =>
    request('/api/v1/policy/dry-run/results', { noAuth: true }),
  versionHistory: () =>
    request('/api/v1/policy/version-history', { noAuth: true }),
  rollbackHistory: () =>
    request('/api/v1/policy/rollback-history', { noAuth: true }),
}

// ─── Confidence ───────────────────────────────────────────────────────────

export const confidenceApi = {
  /** Not tenant-scoped — pass optional AbortSignal only */
  weights: (signal?: AbortSignal) =>
    request('/api/v1/confidence/weights', { noAuth: true, signal }),
  trends: (signal?: AbortSignal) =>
    request('/api/v1/confidence/trends', { noAuth: true, signal }),
  byAction: (signal?: AbortSignal) =>
    request('/api/v1/confidence/accuracy/by-action', { noAuth: true, signal }),
  byPattern: (signal?: AbortSignal) =>
    request('/api/v1/confidence/accuracy/by-pattern', { noAuth: true, signal }),
  recalibrate: (body: unknown) =>
    request('/api/v1/confidence/recalibrate', { method: 'POST', body }),
}

// ─── Effectiveness ────────────────────────────────────────────────────────

export const effectivenessApi = {
  get: (decisionTraceId: string, signal?: AbortSignal) =>
    request(`/api/v1/effectiveness/${decisionTraceId}`, { noAuth: true, signal }),
  /** Overall stats — GET /api/v1/effectiveness/ */
  list: (_tenantId?: string) =>
    request('/api/v1/effectiveness/', { noAuth: true }),
  /** Action accuracy */
  accuracy: (_tenantId?: string) =>
    request('/api/v1/effectiveness/compare/actions', { noAuth: true }),
  compareActions: (signal?: AbortSignal) =>
    request('/api/v1/effectiveness/compare/actions', { noAuth: true, signal }),
}

// ─── Integrations ─────────────────────────────────────────────────────────

export const integrationApi = {
  webhookHistory: (_tenantId?: string, signal?: AbortSignal) =>
    request('/api/v1/integrations/webhooks/history', { noAuth: true, signal }),
  webhookStats: (_tenantId?: string, signal?: AbortSignal) =>
    request('/api/v1/integrations/webhooks/stats', { noAuth: true, signal }),
  registerWebhook: (body: unknown) =>
    request('/api/v1/integrations/webhooks/register', { method: 'POST', body }),
  slackNotify: (body: unknown) =>
    request('/api/v1/integrations/slack/notify', { method: 'POST', body }),
}

// ─── Reports ──────────────────────────────────────────────────────────────

export const reportApi = {
  list: (_tenantId?: string) =>
    request('/api/v1/reports', { noAuth: true }),
  generate: (tenantId: string, params: Record<string, unknown>) =>
    request('/api/v1/reports/effectiveness', {
      method: 'POST',
      body: {
        tenantId,
        startDate: params.startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: params.endDate ?? new Date().toISOString(),
        ...params,
      },
      noAuth: true,
    }),
  effectiveness: (body: unknown) =>
    request('/api/v1/reports/effectiveness', { method: 'POST', body }),
  failureAnalysis: (body: unknown) =>
    request('/api/v1/reports/failure-analysis', { method: 'POST', body }),
  executiveSummary: (body: unknown) =>
    request('/api/v1/reports/executive-summary', { method: 'POST', body }),
  get: (reportId: string) => request(`/api/v1/reports/${reportId}`, { noAuth: true }),
  archive: (reportId: string) =>
    request(`/api/v1/reports/${reportId}/archive`, { method: 'POST' }),
}

// ─── Safety ───────────────────────────────────────────────────────────────

export const safetyApi = {
  /** GET — no auth required */
  getKillSwitches: (_tenantId?: string) =>
    request('/api/v1/safety/kill-switches', { noAuth: true }),
  /** POST — uses HMAC auth (not tenant-scoped) */
  toggleKillSwitch: (
    _tenantId: string,
    action: 'activate' | 'deactivate',
    scope?: string,
  ) =>
    request('/api/v1/safety/kill-switches', { method: 'POST', body: { action, scope } }),
  setKillSwitch: (body: unknown) =>
    request('/api/v1/safety/kill-switches', { method: 'POST', body }),
  /** GET — no auth required */
  getThresholds: (_tenantId?: string) =>
    request('/api/v1/safety/thresholds', { noAuth: true }),
  /** POST — uses HMAC auth (not tenant-scoped) */
  updateThresholds: (_tenantId: string, thresholds: Record<string, number>) =>
    request('/api/v1/safety/thresholds', { method: 'POST', body: thresholds }),
  setThresholds: (body: unknown) =>
    request('/api/v1/safety/thresholds', { method: 'POST', body }),
}

// ─── Execution Modes ──────────────────────────────────────────────────────

export const executionApi = {
  stats: () => request('/api/v1/execution/stats', { noAuth: true }),
  pendingApprovals: () => request('/api/v1/execution/approvals/pending', { noAuth: true }),
  setDefaultMode: (body: unknown) =>
    request('/api/v1/execution/config/default-mode', { method: 'POST', body }),
}
