import { useAuthStore } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

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
  /** Skip adding X-CSRF-Token (for public endpoints that don't need it) */
  skipCsrf?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, skipCsrf = false } = options

  const isMutation = MUTATION_METHODS.has(method.toUpperCase())
  const hasBody = body != null
  const bodyString = hasBody ? JSON.stringify(body) : undefined

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (hasBody) {
    headers['Content-Type'] = 'application/json'
  }

  // Attach CSRF token only for cookie-authenticated mutations
  if (isMutation && !skipCsrf) {
    const csrfToken = useAuthStore.getState().csrfToken
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyString,
    credentials: 'include',
    signal,
  })

  if (res.status === 401) {
    // Session expired â€” clear local auth state
    useAuthStore.getState().setUnauthenticated()
  }

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

// â”€â”€â”€ Public auth endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const authApi = {
  register: (body: { fullName: string; email: string; password: string; organizationName: string }) =>
    request<{ user: unknown; organization: unknown; membership: unknown; csrfToken: string }>(
      '/api/v1/auth/register', { method: 'POST', body, skipCsrf: true }),

  login: (body: { email: string; password: string; rememberMe?: boolean }) =>
    request<{ user: unknown; organization: unknown; membership: unknown; csrfToken: string }>(
      '/api/v1/auth/login', { method: 'POST', body, skipCsrf: true }),

  session: (signal?: AbortSignal) =>
    request<{
      authenticated: boolean
      user: unknown
      organization: unknown
      membership: unknown
      session: unknown
      csrfToken: string
    }>('/api/v1/auth/session', { signal }),

  logout: () => request('/api/v1/auth/logout', { method: 'POST' }),
  logoutAll: () => request('/api/v1/auth/logout-all', { method: 'POST' }),
  csrf: (signal?: AbortSignal) =>
    request<{ csrfToken: string }>('/api/v1/auth/csrf', { signal }),
}

// â”€â”€â”€ Public health endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface OnboardingStatus {
  workspaceCreated: boolean
  serviceAdded: boolean
  domainVerified: boolean
  monitoringConnected: boolean
  firstEventReceived: boolean
  firstInsightGenerated: boolean
  nextRecommendedAction: string
}

// ─── Service endpoints ───────────────────────────────────────────────────────

import type {
  CreateServiceBody,
  Service,
  ServiceListParams,
  ServiceListResponse,
  UpdateServiceBody,
} from '@/types/service'

export const serviceApi = {
  list: (params?: ServiceListParams, signal?: AbortSignal) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ).toString() : ''
    return request<ServiceListResponse>(`/api/v1/services${qs}`, { signal })
  },

  get: (id: string, signal?: AbortSignal) =>
    request<{ success: boolean; data: Service }>(`/api/v1/services/${id}`, { signal }),

  create: (body: CreateServiceBody) =>
    request<{ success: boolean; data: Service }>('/api/v1/services', { method: 'POST', body }),

  update: (id: string, body: UpdateServiceBody) =>
    request<{ success: boolean; data: Service }>(`/api/v1/services/${id}`, { method: 'PATCH', body }),

  pause: (id: string) =>
    request<{ success: boolean; data: Service }>(`/api/v1/services/${id}/pause`, { method: 'POST' }),

  resume: (id: string) =>
    request<{ success: boolean; data: Service }>(`/api/v1/services/${id}/resume`, { method: 'POST' }),

  archive: (id: string) =>
    request<{ success: boolean; data: Service }>(`/api/v1/services/${id}`, { method: 'DELETE' }),
}

// ─── Verification endpoints ──────────────────────────────────────────────────

import type {
  VerificationChallenge,
  VerificationCheckResult,
  VerificationMethod,
  VerificationStatus,
} from '@/types/verification'

export const verificationApi = {
  get: (serviceId: string, signal?: AbortSignal) =>
    request<{ success: boolean; data: VerificationStatus }>(
      `/api/v1/services/${serviceId}/verification`, { signal }),

  challenge: (serviceId: string, method: VerificationMethod) =>
    request<{ success: boolean; data: VerificationChallenge }>(
      `/api/v1/services/${serviceId}/verification/challenge`, { method: 'POST', body: { method } }),

  check: (serviceId: string) =>
    request<{ success: boolean; data: VerificationCheckResult }>(
      `/api/v1/services/${serviceId}/verification/check`, { method: 'POST' }),

  regenerate: (serviceId: string, method: VerificationMethod) =>
    request<{ success: boolean; data: VerificationChallenge }>(
      `/api/v1/services/${serviceId}/verification/regenerate`, { method: 'POST', body: { method } }),
}

// ─── Dashboard endpoints ─────────────────────────────────────────────────────

export const dashboardApi = {
  onboarding: (signal?: AbortSignal) =>
    request<{ success: boolean; data: OnboardingStatus }>(
      '/api/v1/dashboard/onboarding', { signal }),
}

export const healthApi = {
  check: (signal?: AbortSignal) =>
    request<{ status: string; timestamp: string; components?: Record<string, string> }>(
      '/health', { signal }),
  get: (signal?: AbortSignal) =>
    request<{ status: string; timestamp: string; components?: Record<string, string> }>(
      '/health', { signal }),
}

// ─── Monitor endpoints ───────────────────────────────────────────────────────

import type { CreateMonitorBody, Monitor, MonitorCheck, UpdateMonitorBody } from '@/types/monitor'

export const monitorApi = {
  /** List all monitors for a service */
  listForService: (serviceId: string, signal?: AbortSignal) =>
    request<{ monitors: Monitor[] }>(`/api/v1/services/${serviceId}/monitors`, { signal }),

  /** Create a monitor for a service */
  create: (serviceId: string, body: CreateMonitorBody) =>
    request<{ monitor: Monitor }>(`/api/v1/services/${serviceId}/monitors`, { method: 'POST', body }),

  /** List all monitors across all services for the org */
  listAll: (signal?: AbortSignal) =>
    request<{ monitors: Monitor[] }>('/api/v1/monitors', { signal }),

  /** Get a single monitor */
  get: (monitorId: string, signal?: AbortSignal) =>
    request<{ monitor: Monitor }>(`/api/v1/monitors/${monitorId}`, { signal }),

  /** Update monitor configuration */
  update: (monitorId: string, body: UpdateMonitorBody) =>
    request<{ monitor: Monitor }>(`/api/v1/monitors/${monitorId}`, { method: 'PATCH', body }),

  /** Pause a monitor */
  pause: (monitorId: string) =>
    request<{ monitor: Monitor }>(`/api/v1/monitors/${monitorId}/pause`, { method: 'POST' }),

  /** Resume a paused monitor */
  resume: (monitorId: string) =>
    request<{ monitor: Monitor }>(`/api/v1/monitors/${monitorId}/resume`, { method: 'POST' }),

  /** Run a one-time test check (not persisted) */
  test: (monitorId: string) =>
    request<{ result: MonitorCheck }>(`/api/v1/monitors/${monitorId}/test`, { method: 'POST' }),

  /** Get paginated check history */
  checks: (monitorId: string, params?: { limit?: number; before?: string }, signal?: AbortSignal) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : ''
    return request<{ checks: MonitorCheck[]; count: number }>(
      `/api/v1/monitors/${monitorId}/checks${qs}`, { signal })
  },

  /** Delete a monitor and its check history */
  delete: (monitorId: string) =>
    request<void>(`/api/v1/monitors/${monitorId}`, { method: 'DELETE' }),
}

// â”€â”€â”€ Tenant-scoped helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function tenantPath(tenantId: string, suffix: string) {
  return `/api/v1/tenants/${tenantId}${suffix}`
}

// â”€â”€â”€ Signals / Decisions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Approvals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const approvalApi = {
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

// â”€â”€â”€ Runbooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Action Logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const actionLogApi = {
  list: (tenantId: string, params?: Record<string, string> | number) => {
    const limit = typeof params === 'number' ? params : 50
    const extra = typeof params === 'object' && params !== null ? params : {}
    const q = new URLSearchParams({ limit: String(limit), ...extra })
    return request<{ data: unknown[] }>(tenantPath(tenantId, `/action-logs?${q}`))
  },
}

// â”€â”€â”€ Policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const policyApi = {
  get: (_tenantId: string) =>
    request<unknown>('/api/v1/policy/version-history').then((r) => {
      const versions: any[] = (r as any)?.versions ?? (Array.isArray(r) ? r : [])
      return versions[0] ?? { yaml: '', content: '', policyYaml: '' }
    }),

  versions: (_tenantId: string) =>
    request('/api/v1/policy/version-history'),

  validate: (_tenantId: string, policyYaml: string) =>
    request('/api/v1/policy/validate', { method: 'POST', body: { policyYaml } }),

  update: (tenantId: string, policyYaml: string) =>
    request('/api/v1/policy/create-version', {
      method: 'POST',
      body: { policyYaml, tenantId },
    }),

  dryRun: (_tenantId: string, policyYaml: string, signal: Record<string, unknown>) =>
    request('/api/v1/policy/dry-run', { method: 'POST', body: { policyYaml, signal } }),

  rollback: (body: unknown) =>
    request('/api/v1/policy/rollback', { method: 'POST', body }),
  dryRunResults: () =>
    request('/api/v1/policy/dry-run/results'),
  versionHistory: () =>
    request('/api/v1/policy/version-history'),
  rollbackHistory: () =>
    request('/api/v1/policy/rollback-history'),
}

// â”€â”€â”€ Confidence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const confidenceApi = {
  weights: (signal?: AbortSignal) =>
    request('/api/v1/confidence/weights', { signal }),
  trends: (signal?: AbortSignal) =>
    request('/api/v1/confidence/trends', { signal }),
  byAction: (signal?: AbortSignal) =>
    request('/api/v1/confidence/accuracy/by-action', { signal }),
  byPattern: (signal?: AbortSignal) =>
    request('/api/v1/confidence/accuracy/by-pattern', { signal }),
  recalibrate: (body: unknown) =>
    request('/api/v1/confidence/recalibrate', { method: 'POST', body }),
}

// â”€â”€â”€ Effectiveness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const effectivenessApi = {
  get: (decisionTraceId: string, signal?: AbortSignal) =>
    request(`/api/v1/effectiveness/${decisionTraceId}`, { signal }),
  list: (_tenantId?: string) =>
    request('/api/v1/effectiveness/'),
  accuracy: (_tenantId?: string) =>
    request('/api/v1/effectiveness/compare/actions'),
  compareActions: (signal?: AbortSignal) =>
    request('/api/v1/effectiveness/compare/actions', { signal }),
}

// â”€â”€â”€ Integrations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const integrationApi = {
  webhookHistory: (_tenantId?: string, signal?: AbortSignal) =>
    request('/api/v1/integrations/webhooks/history', { signal }),
  webhookStats: (_tenantId?: string, signal?: AbortSignal) =>
    request('/api/v1/integrations/webhooks/stats', { signal }),
  registerWebhook: (body: unknown) =>
    request('/api/v1/integrations/webhooks/register', { method: 'POST', body }),
  slackNotify: (body: unknown) =>
    request('/api/v1/integrations/slack/notify', { method: 'POST', body }),
}

// â”€â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const reportApi = {
  list: (_tenantId?: string) =>
    request('/api/v1/reports'),
  generate: (tenantId: string, params: Record<string, unknown>) =>
    request('/api/v1/reports/effectiveness', {
      method: 'POST',
      body: {
        tenantId,
        startDate: params.startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: params.endDate ?? new Date().toISOString(),
        ...params,
      },
    }),
  effectiveness: (body: unknown) =>
    request('/api/v1/reports/effectiveness', { method: 'POST', body }),
  failureAnalysis: (body: unknown) =>
    request('/api/v1/reports/failure-analysis', { method: 'POST', body }),
  executiveSummary: (body: unknown) =>
    request('/api/v1/reports/executive-summary', { method: 'POST', body }),
  get: (reportId: string) => request(`/api/v1/reports/${reportId}`),
  archive: (reportId: string) =>
    request(`/api/v1/reports/${reportId}/archive`, { method: 'POST' }),
}

// â”€â”€â”€ Safety â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const safetyApi = {
  getKillSwitches: (_tenantId?: string) =>
    request('/api/v1/safety/kill-switches'),
  toggleKillSwitch: (
    _tenantId: string,
    action: 'activate' | 'deactivate',
    scope?: string,
  ) =>
    request('/api/v1/safety/kill-switches', { method: 'POST', body: { action, scope } }),
  setKillSwitch: (body: unknown) =>
    request('/api/v1/safety/kill-switches', { method: 'POST', body }),
  getThresholds: (_tenantId?: string) =>
    request('/api/v1/safety/thresholds'),
  updateThresholds: (_tenantId: string, thresholds: Record<string, number>) =>
    request('/api/v1/safety/thresholds', { method: 'POST', body: thresholds }),
  setThresholds: (body: unknown) =>
    request('/api/v1/safety/thresholds', { method: 'POST', body }),
}

// â”€â”€â”€ Execution Modes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const executionApi = {
  stats: () => request('/api/v1/execution/stats'),
  pendingApprovals: () => request('/api/v1/execution/approvals/pending'),
  setDefaultMode: (body: unknown) =>
    request('/api/v1/execution/config/default-mode', { method: 'POST', body }),
}

