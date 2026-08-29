import { useAuthStore, type EnvironmentSummary } from '@/store/authStore'

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

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    signal,
    skipCsrf = false,
  } = options

  const isMutation =
    MUTATION_METHODS.has(
      method.toUpperCase(),
    )

  const hasBody =
    body != null

  const bodyString =
    hasBody
      ? JSON.stringify(body)
      : undefined

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  /**
   * Canonical environment context.
   *
   * The backend still validates that this environment belongs
   * to the authenticated organization. The browser value is
   * never treated as authoritative.
   */
  const activeEnvironment =
    useAuthStore.getState().activeEnvironment

  if (
    activeEnvironment?.id
  ) {
    headers['X-AIRA-Environment-Id'] =
      activeEnvironment.id
  }

  if (
    hasBody
  ) {
    headers['Content-Type'] =
      'application/json'
  }

  // Attach CSRF token only for cookie-authenticated mutations
  if (
    isMutation &&
    !skipCsrf
  ) {
    const csrfToken =
      useAuthStore.getState().csrfToken

    if (
      csrfToken
    ) {
      headers['X-CSRF-Token'] =
        csrfToken
    }
  }

  const res =
    await fetch(
      `${BASE_URL}${path}`,
      {
        method,
        headers,
        body: bodyString,
        credentials: 'include',
        signal,
      },
    )

  if (
    res.status === 401
  ) {
    // Session expired — clear local auth state
    useAuthStore
      .getState()
      .setUnauthenticated()
  }

  let data: unknown

  const contentType =
    res.headers.get('content-type') ?? ''

  if (
    contentType.includes(
      'application/json',
    )
  ) {
    data =
      await res.json()
  } else {
    data =
      await res.text()
  }

  if (
    !res.ok
  ) {
    const err =
      data as {
        error?: string
        message?: string
        code?: string
      }

    throw new ApiError(
      res.status,
      err.error ??
        err.message ??
        `HTTP ${res.status}`,
      err.code,
      data,
    )
  }

  return data as T
}


// ─── Public auth endpoints ───────────────────────────────────────────────────

export const authApi = {
  register: (
    body: {
      fullName: string
      email: string
      password: string
      organizationName: string
    },
  ) =>
    request<{
      user: unknown
      organization: unknown
      membership: unknown
      csrfToken: string
    }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body,
        skipCsrf: true,
      },
    ),

  login: (
    body: {
      email: string
      password: string
      rememberMe?: boolean
    },
  ) =>
    request<{
      user: unknown
      organization: unknown
      membership: unknown
      csrfToken: string
    }>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body,
        skipCsrf: true,
      },
    ),

  session: (
    signal?: AbortSignal,
  ) =>
    request<{
      authenticated: boolean
      user: unknown
      organization: unknown
      membership: unknown
      environment:
        EnvironmentSummary |
        null
      session: unknown
      csrfToken: string
    }>(
      '/api/v1/auth/session',
      {
        signal,
      },
    ),

  logout: () =>
    request(
      '/api/v1/auth/logout',
      {
        method: 'POST',
      },
    ),

  logoutAll: () =>
    request(
      '/api/v1/auth/logout-all',
      {
        method: 'POST',
      },
    ),

  csrf: (
    signal?: AbortSignal,
  ) =>
    request<{
      csrfToken: string
    }>(
      '/api/v1/auth/csrf',
      {
        signal,
      },
    ),
}


export interface EnvironmentSummaryResponse {
  total: number
  active: number
  maintenance: number
  hasProduction: boolean

  plan: string

  limit: number | null
  remaining: number | null
}


export const environmentApi = {
  list: (
    signal?: AbortSignal,
  ) =>
    request<{
      environments:
        EnvironmentSummary[]
    }>(
      '/api/v1/environments',
      {
        signal,
      },
    ),

  summary: (
    signal?: AbortSignal,
  ) =>
    request<{
      summary:
        EnvironmentSummaryResponse
    }>(
      '/api/v1/environments/summary',
      {
        signal,
      },
    ),

  get: (
    environmentId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      environment:
        EnvironmentSummary
    }>(
      `/api/v1/environments/${environmentId}`,
      {
        signal,
      },
    ),

  create: (
    body: {
      name: string
      slug?: string

      type?:
        | 'development'
        | 'testing'
        | 'staging'
        | 'production'
        | 'custom'

      criticality?:
        | 'low'
        | 'medium'
        | 'high'
        | 'critical'

      description?: string

      settings?: {
        allowAutonomousExecution?: boolean
        requireApprovalForDestructiveActions?: boolean
        timezone?: string | null
      }
    },
  ) =>
    request<{
      environment:
        EnvironmentSummary
    }>(
      '/api/v1/environments',
      {
        method: 'POST',
        body,
      },
    ),

  update: (
    environmentId: string,
    body: {
      name?: string
      description?: string

      criticality?:
        | 'low'
        | 'medium'
        | 'high'
        | 'critical'

      settings?: {
        allowAutonomousExecution?: boolean
        requireApprovalForDestructiveActions?: boolean
        timezone?: string | null
      }
    },
  ) =>
    request<{
      environment:
        EnvironmentSummary
    }>(
      `/api/v1/environments/${environmentId}`,
      {
        method: 'PATCH',
        body,
      },
    ),

  setDefault: (
    environmentId: string,
  ) =>
    request<{
      environment:
        EnvironmentSummary
      isDefault: boolean
    }>(
      `/api/v1/environments/${environmentId}/default`,
      {
        method: 'POST',
        body: {},
      },
    ),

  enterMaintenance: (
    environmentId: string,
    reason: string,
  ) =>
    request<{
      environment:
        EnvironmentSummary
    }>(
      `/api/v1/environments/${environmentId}/maintenance`,
      {
        method: 'POST',
        body: {
          reason,
        },
      },
    ),

  activate: (
    environmentId: string,
  ) =>
    request<{
      environment:
        EnvironmentSummary
    }>(
      `/api/v1/environments/${environmentId}/activate`,
      {
        method: 'POST',
        body: {},
      },
    ),

  archive: (
    environmentId: string,
    reason = '',
  ) =>
    request<{
      archived: boolean
      environment:
        EnvironmentSummary
    }>(
      `/api/v1/environments/${environmentId}`,
      {
        method: 'DELETE',
        body: {
          reason,
        },
      },
    ),
}


// ─── Public health / onboarding types ────────────────────────────────────────

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
  list: (
    params?: ServiceListParams,
    signal?: AbortSignal,
  ) => {
    const qs =
      params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(
                (
                  [, value],
                ) =>
                  value != null,
              )
              .map(
                (
                  [key, value],
                ) => [
                  key,
                  String(value),
                ],
              ),
          ).toString()
        : ''

    return request<ServiceListResponse>(
      `/api/v1/services${qs}`,
      {
        signal,
      },
    )
  },

  get: (
    id: string,
    signal?: AbortSignal,
  ) =>
    request<{
      success: boolean
      data: Service
    }>(
      `/api/v1/services/${id}`,
      {
        signal,
      },
    ),

  create: (
    body: CreateServiceBody,
  ) =>
    request<{
      success: boolean
      data: Service
    }>(
      '/api/v1/services',
      {
        method: 'POST',
        body,
      },
    ),

  update: (
    id: string,
    body: UpdateServiceBody,
  ) =>
    request<{
      success: boolean
      data: Service
    }>(
      `/api/v1/services/${id}`,
      {
        method: 'PATCH',
        body,
      },
    ),

  pause: (
    id: string,
  ) =>
    request<{
      success: boolean
      data: Service
    }>(
      `/api/v1/services/${id}/pause`,
      {
        method: 'POST',
      },
    ),

  resume: (
    id: string,
  ) =>
    request<{
      success: boolean
      data: Service
    }>(
      `/api/v1/services/${id}/resume`,
      {
        method: 'POST',
      },
    ),

  archive: (
    id: string,
  ) =>
    request<{
      success: boolean
      data: Service
    }>(
      `/api/v1/services/${id}`,
      {
        method: 'DELETE',
      },
    ),
}


// ─── Verification endpoints ──────────────────────────────────────────────────

import type {
  VerificationChallenge,
  VerificationCheckResult,
  VerificationMethod,
  VerificationStatus,
} from '@/types/verification'


export const verificationApi = {
  get: (
    serviceId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      success: boolean
      data:
        VerificationStatus
    }>(
      `/api/v1/services/${serviceId}/verification`,
      {
        signal,
      },
    ),

  challenge: (
    serviceId: string,
    method:
      VerificationMethod,
  ) =>
    request<{
      success: boolean
      data:
        VerificationChallenge
    }>(
      `/api/v1/services/${serviceId}/verification/challenge`,
      {
        method: 'POST',
        body: {
          method,
        },
      },
    ),

  check: (
    serviceId: string,
  ) =>
    request<{
      success: boolean
      data:
        VerificationCheckResult
    }>(
      `/api/v1/services/${serviceId}/verification/check`,
      {
        method: 'POST',
      },
    ),

  regenerate: (
    serviceId: string,
    method:
      VerificationMethod,
  ) =>
    request<{
      success: boolean
      data:
        VerificationChallenge
    }>(
      `/api/v1/services/${serviceId}/verification/regenerate`,
      {
        method: 'POST',
        body: {
          method,
        },
      },
    ),
}


// ─── Dashboard endpoints ─────────────────────────────────────────────────────

export const dashboardApi = {
  onboarding: (
    signal?: AbortSignal,
  ) =>
    request<{
      success: boolean
      data:
        OnboardingStatus
    }>(
      '/api/v1/dashboard/onboarding',
      {
        signal,
      },
    ),
}


// ─── Phase 19 Recovery Coverage ───────────────────────────────────────────────

export type CoverageClassification =
  | 'COVERED'
  | 'PARTIAL'
  | 'HUMAN_ONLY'
  | 'UNKNOWN'


export type CoverageGapSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL'


export interface CoverageSummary {
  resources: number
  applicableFailureModes: number

  covered: number
  partial: number
  humanOnly: number
  unknown: number

  coveragePercentage: number

  totalGapCount: number
  criticalGapCount: number
  highGapCount: number
  mediumGapCount: number
  lowGapCount: number

  generatedAt: string | null
  snapshotPublicId: string | null

  hasSnapshot: boolean

  generationBasis?:
    Record<string, unknown>

  executionAuthorized: false
}


export interface CoverageDomain {
  domain: string

  applicableFailureModes: number

  covered: number
  partial: number
  humanOnly: number
  unknown: number

  coveragePercentage: number

  executionAuthorized: false
}


export interface CoverageEvaluation {
  id?: string
  publicId?: string

  resourceId: string
  resourcePublicId: string
  resourceType: string

  failureModeVersionId: string
  failureModeKey: string
  failureModeSemver: string

  classification:
    CoverageClassification

  reasonCodes: string[]

  readiness:
    Record<string, unknown>

  confidence: number

  evaluationBasis:
    Record<string, unknown>

  evaluatedAt: string

  executionAuthorized: false
}


export interface CoverageResource {
  resourceId: string
  resourcePublicId: string
  resourceType: string

  applicableFailureModes: number

  covered: number
  partial: number
  humanOnly: number
  unknown: number

  coveragePercentage: number

  evaluations:
    CoverageEvaluation[]

  executionAuthorized: false
}


export interface CoverageSnapshot {
  id?: string

  publicId: string

  resourcesCount: number
  applicableFailureModesCount: number

  coveredCount: number
  partialCount: number
  humanOnlyCount: number
  unknownCount: number

  coveragePercentage: number

  summary:
    Record<string, unknown>

  generationBasis:
    Record<string, unknown>

  generatedAt: string

  executionAuthorized: false
}


export interface CoverageGap {
  id: string
  publicId: string

  gapKey: string

  evaluationId:
    string |
    null

  resourceId:
    string |
    null

  resourcePublicId:
    string |
    null

  resourceType:
    string |
    null

  failureModeKey:
    string |
    null

  failureModeSemver:
    string |
    null

  classification:
    CoverageClassification

  reasonCode: string

  severity:
    CoverageGapSeverity

  priorityScore: number

  explanation:
    string |
    null

  evidence:
    Record<string, unknown>

  detectedAt: string
  lastDetectedAt: string

  resolvedAt:
    string |
    null

  latestSnapshotId?:
    string |
    null

  executionAuthorized: false
}


export interface CoverageRefreshResponse {
  refreshedAt: string

  score:
    Record<string, unknown>

  gapSummary: {
    total: number
    critical: number
    high: number
  }

  snapshot:
    CoverageSnapshot |
    null

  currentGapCount: number
  historicalGapCount: number

  dynamicKnowledgeDiscovery: true

  coverageImpliesExecution: false

  executionAuthorized: false
}


export const coverageApi = {
  summary: (
    signal?: AbortSignal,
  ) =>
    request<{
      success: boolean
      data:
        CoverageSummary
    }>(
      '/api/v1/coverage/summary',
      {
        signal,
      },
    ),

  domains: (
    signal?: AbortSignal,
  ) =>
    request<{
      success: boolean
      data:
        CoverageDomain[]
    }>(
      '/api/v1/coverage/domains',
      {
        signal,
      },
    ),

  resources: (
    params?: {
      classification?:
        CoverageClassification

      resourceType?: string
      resourceId?: string

      limit?: number
      offset?: number
    },

    signal?: AbortSignal,
  ) => {
    const query =
      new URLSearchParams()

    if (
      params?.classification
    ) {
      query.set(
        'classification',
        params.classification,
      )
    }

    if (
      params?.resourceType
    ) {
      query.set(
        'resourceType',
        params.resourceType,
      )
    }

    if (
      params?.resourceId
    ) {
      query.set(
        'resourceId',
        params.resourceId,
      )
    }

    if (
      params?.limit !==
      undefined
    ) {
      query.set(
        'limit',
        String(
          params.limit,
        ),
      )
    }

    if (
      params?.offset !==
      undefined
    ) {
      query.set(
        'offset',
        String(
          params.offset,
        ),
      )
    }

    const suffix =
      query.toString()
        ? `?${query.toString()}`
        : ''

    return request<{
      success: boolean
      data:
        CoverageResource[]
    }>(
      `/api/v1/coverage/resources${suffix}`,
      {
        signal,
      },
    )
  },

  failureModes: (
    params?: {
      classification?:
        CoverageClassification

      failureModeKey?: string

      limit?: number
      offset?: number
    },

    signal?: AbortSignal,
  ) => {
    const query =
      new URLSearchParams()

    if (
      params?.classification
    ) {
      query.set(
        'classification',
        params.classification,
      )
    }

    if (
      params?.failureModeKey
    ) {
      query.set(
        'failureModeKey',
        params.failureModeKey,
      )
    }

    if (
      params?.limit !==
      undefined
    ) {
      query.set(
        'limit',
        String(
          params.limit,
        ),
      )
    }

    if (
      params?.offset !==
      undefined
    ) {
      query.set(
        'offset',
        String(
          params.offset,
        ),
      )
    }

    const suffix =
      query.toString()
        ? `?${query.toString()}`
        : ''

    return request<{
      success: boolean
      data:
        CoverageEvaluation[]
    }>(
      `/api/v1/coverage/failure-modes${suffix}`,
      {
        signal,
      },
    )
  },

  gaps: (
    params?: {
      severity?:
        CoverageGapSeverity

      reasonCode?: string

      classification?:
        CoverageClassification

      resourceType?: string

      includeResolved?: boolean

      limit?: number
      offset?: number
    },

    signal?: AbortSignal,
  ) => {
    const query =
      new URLSearchParams()

    if (
      params?.severity
    ) {
      query.set(
        'severity',
        params.severity,
      )
    }

    if (
      params?.reasonCode
    ) {
      query.set(
        'reasonCode',
        params.reasonCode,
      )
    }

    if (
      params?.classification
    ) {
      query.set(
        'classification',
        params.classification,
      )
    }

    if (
      params?.resourceType
    ) {
      query.set(
        'resourceType',
        params.resourceType,
      )
    }

    if (
      params?.includeResolved !==
      undefined
    ) {
      query.set(
        'includeResolved',
        String(
          params.includeResolved,
        ),
      )
    }

    if (
      params?.limit !==
      undefined
    ) {
      query.set(
        'limit',
        String(
          params.limit,
        ),
      )
    }

    if (
      params?.offset !==
      undefined
    ) {
      query.set(
        'offset',
        String(
          params.offset,
        ),
      )
    }

    const suffix =
      query.toString()
        ? `?${query.toString()}`
        : ''

    return request<{
      success: boolean
      data:
        CoverageGap[]
    }>(
      `/api/v1/coverage/gaps${suffix}`,
      {
        signal,
      },
    )
  },

  history: (
    params?: {
      limit?: number
      offset?: number
    },

    signal?: AbortSignal,
  ) => {
    const query =
      new URLSearchParams()

    if (
      params?.limit !==
      undefined
    ) {
      query.set(
        'limit',
        String(
          params.limit,
        ),
      )
    }

    if (
      params?.offset !==
      undefined
    ) {
      query.set(
        'offset',
        String(
          params.offset,
        ),
      )
    }

    const suffix =
      query.toString()
        ? `?${query.toString()}`
        : ''

    return request<{
      success: boolean
      data:
        CoverageSnapshot[]
    }>(
      `/api/v1/coverage/history${suffix}`,
      {
        signal,
      },
    )
  },

  refresh: () =>
    request<{
      success: boolean
      data:
        CoverageRefreshResponse
    }>(
      '/api/v1/coverage/refresh',
      {
        method: 'POST',
      },
    ),
}


// ─── Health endpoints ────────────────────────────────────────────────────────

export const healthApi = {
  check: (
    signal?: AbortSignal,
  ) =>
    request<{
      status: string
      timestamp: string
      components?:
        Record<string, string>
    }>(
      '/health',
      {
        signal,
      },
    ),

  get: (
    signal?: AbortSignal,
  ) =>
    request<{
      status: string
      timestamp: string
      components?:
        Record<string, string>
    }>(
      '/health',
      {
        signal,
      },
    ),
}


// ─── Monitor endpoints ───────────────────────────────────────────────────────

import type {
  CreateMonitorBody,
  Monitor,
  MonitorCheck,
  UpdateMonitorBody,
} from '@/types/monitor'


export const monitorApi = {
  /** List all monitors for a service */
  listForService: (
    serviceId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      monitors: Monitor[]
    }>(
      `/api/v1/services/${serviceId}/monitors`,
      {
        signal,
      },
    ),

  /** Create a monitor for a service */
  create: (
    serviceId: string,
    body: CreateMonitorBody,
  ) =>
    request<{
      monitor: Monitor
    }>(
      `/api/v1/services/${serviceId}/monitors`,
      {
        method: 'POST',
        body,
      },
    ),

  /** List all monitors across all services for the org */
  listAll: (
    signal?: AbortSignal,
  ) =>
    request<{
      monitors: Monitor[]
    }>(
      '/api/v1/monitors',
      {
        signal,
      },
    ),

  /** Get a single monitor */
  get: (
    monitorId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      monitor: Monitor
    }>(
      `/api/v1/monitors/${monitorId}`,
      {
        signal,
      },
    ),

  /** Update monitor configuration */
  update: (
    monitorId: string,
    body: UpdateMonitorBody,
  ) =>
    request<{
      monitor: Monitor
    }>(
      `/api/v1/monitors/${monitorId}`,
      {
        method: 'PATCH',
        body,
      },
    ),

  /** Pause a monitor */
  pause: (
    monitorId: string,
  ) =>
    request<{
      monitor: Monitor
    }>(
      `/api/v1/monitors/${monitorId}/pause`,
      {
        method: 'POST',
      },
    ),

  /** Resume a paused monitor */
  resume: (
    monitorId: string,
  ) =>
    request<{
      monitor: Monitor
    }>(
      `/api/v1/monitors/${monitorId}/resume`,
      {
        method: 'POST',
      },
    ),

  /** Run a one-time test check (not persisted) */
  test: (
    monitorId: string,
  ) =>
    request<{
      result:
        MonitorCheck
    }>(
      `/api/v1/monitors/${monitorId}/test`,
      {
        method: 'POST',
      },
    ),

  /** Get paginated check history */
  checks: (
    monitorId: string,
    params?: {
      limit?: number
      before?: string
    },
    signal?: AbortSignal,
  ) => {
    const qs =
      params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(
                (
                  [, value],
                ) =>
                  value != null,
              )
              .map(
                (
                  [key, value],
                ) => [
                  key,
                  String(value),
                ],
              ),
          ).toString()
        : ''

    return request<{
      checks:
        MonitorCheck[]
      count: number
    }>(
      `/api/v1/monitors/${monitorId}/checks${qs}`,
      {
        signal,
      },
    )
  },

  /** Delete a monitor and its check history */
  delete: (
    monitorId: string,
  ) =>
    request<void>(
      `/api/v1/monitors/${monitorId}`,
      {
        method: 'DELETE',
      },
    ),
}


// ─── Tenant-scoped helpers ───────────────────────────────────────────────────

function tenantPath(
  tenantId: string,
  suffix: string,
) {
  return `/api/v1/tenants/${tenantId}${suffix}`
}


// ─── Signals / Decisions ─────────────────────────────────────────────────────

import type {
  AgentIntelligence,
  AgentTraceEntry,
} from '@/types/agentIntelligence'

import type {
  Incident,
  IncidentListParams,
  IncidentTimelineEvent,
} from '@/types/incident'


export const incidentApi = {
  list: (
    params?: IncidentListParams,
    signal?: AbortSignal,
  ) => {
    const qs =
      params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(
                (
                  [, value],
                ) =>
                  value != null,
              )
              .map(
                (
                  [key, value],
                ) => [
                  key,
                  String(value),
                ],
              ),
          ).toString()
        : ''

    return request<{
      incidents: Incident[]
      count: number
    }>(
      `/api/v1/incidents${qs}`,
      {
        signal,
      },
    )
  },

  get: (
    incidentId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      incident: Incident
    }>(
      `/api/v1/incidents/${incidentId}`,
      {
        signal,
      },
    ),

  acknowledge: (
    incidentId: string,
    body?: {
      note?: string
    },
  ) =>
    request<{
      incident: Incident
    }>(
      `/api/v1/incidents/${incidentId}/acknowledge`,
      {
        method: 'POST',
        body:
          body ??
          {},
      },
    ),

  resolve: (
    incidentId: string,
    body?: {
      resolution?: string
    },
  ) =>
    request<{
      incident: Incident
    }>(
      `/api/v1/incidents/${incidentId}/resolve`,
      {
        method: 'POST',
        body:
          body ??
          {},
      },
    ),

  reopen: (
    incidentId: string,
    body?: {
      reason?: string
    },
  ) =>
    request<{
      incident: Incident
    }>(
      `/api/v1/incidents/${incidentId}/reopen`,
      {
        method: 'POST',
        body:
          body ??
          {},
      },
    ),

  assign: (
    incidentId: string,
    body: {
      assigneeId?: string | null
      note?: string
    },
  ) =>
    request<{
      incident: Incident
    }>(
      `/api/v1/incidents/${incidentId}/assignment`,
      {
        method: 'PATCH',
        body,
      },
    ),

  timeline: (
    incidentId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      timeline:
        IncidentTimelineEvent[]
      count: number
    }>(
      `/api/v1/incidents/${incidentId}/timeline`,
      {
        signal,
      },
    ),

  // ── Agent Intelligence (v2) ──────────────────────────────────────────────

  analyze: (
    incidentId: string,
  ) =>
    request<{
      runId: string
      state: string
      message?: string
    }>(
      `/api/v1/incidents/${incidentId}/analyze`,
      {
        method: 'POST',
        body: {},
      },
    ),

  retryAnalysis: (
    incidentId: string,
  ) =>
    request<{
      runId: string
      state: string
    }>(
      `/api/v1/incidents/${incidentId}/retry-analysis`,
      {
        method: 'POST',
        body: {},
      },
    ),

  intelligence: (
    incidentId: string,
    signal?: AbortSignal,
  ) =>
    request<AgentIntelligence>(
      `/api/v1/incidents/${incidentId}/intelligence`,
      {
        signal,
      },
    ),

  agentEvidence: (
    incidentId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      evidencePackage:
        unknown
    }>(
      `/api/v1/incidents/${incidentId}/evidence`,
      {
        signal,
      },
    ),

  agentDiagnosis: (
    incidentId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      diagnosis: unknown
    }>(
      `/api/v1/incidents/${incidentId}/diagnosis`,
      {
        signal,
      },
    ),

  agentTrace: (
    incidentId: string,
    signal?: AbortSignal,
  ) =>
    request<{
      agentTrace:
        AgentTraceEntry[]
    }>(
      `/api/v1/incidents/${incidentId}/agent-trace`,
      {
        signal,
      },
    ),
}


export const signalApi = {
  submit: (
    tenantId: string,
    body: unknown,
  ) =>
    request(
      tenantPath(
        tenantId,
        '/signals',
      ),
      {
        method: 'POST',
        body,
      },
    ),

  getDecision: (
    tenantId: string,
    decisionId: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/decisions/${decisionId}`,
      ),
    ),

  listDecisions: (
    tenantId: string,
    params?:
      Record<string, string>,
  ) => {
    const q =
      params &&
      Object.keys(params).length
        ? `?${new URLSearchParams(params)}`
        : ''

    return request<{
      recentDecisions:
        unknown[]
      summary: unknown
    }>(
      tenantPath(
        tenantId,
        `/decisions${q}`,
      ),
    )
  },

  getAudit: (
    tenantId: string,
    id: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/audit/${id}`,
      ),
    ),

  getPatterns: (
    tenantId: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        '/patterns',
      ),
    ),

  getIncident: (
    tenantId: string,
    id: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/incidents/${id}`,
      ),
    ),

  listActions: (
    tenantId: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        '/actions',
      ),
    ),
}


// ─── Approvals ────────────────────────────────────────────────────────────────

export const approvalApi = {
  list: (
    tenantId: string,
    _status?: string,
  ) =>
    request<{
      pending: unknown[]
      pendingCount: number
    }>(
      tenantPath(
        tenantId,
        '/approvals',
      ),
    ),

  get: (
    tenantId: string,
    approvalId: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/approvals/${approvalId}`,
      ),
    ),

  stats: (
    tenantId: string,
  ) =>
    request<{
      tenantId: string
      queue: {
        pending: number
        approved: number
        rejected: number
      }
    }>(
      tenantPath(
        tenantId,
        '/approvals/queue/stats',
      ),
    ),

  approve: (
    tenantId: string,
    approvalId: string,
    body: {
      approvedBy: string
      comment?: string
    },
  ) =>
    request(
      tenantPath(
        tenantId,
        `/approvals/${approvalId}/approve`,
      ),
      {
        method: 'POST',
        body,
      },
    ),

  reject: (
    tenantId: string,
    approvalId: string,
    body: {
      rejectedBy: string
      reason?: string
    },
  ) =>
    request(
      tenantPath(
        tenantId,
        `/approvals/${approvalId}/reject`,
      ),
      {
        method: 'POST',
        body,
      },
    ),
}


// ─── Runbooks ────────────────────────────────────────────────────────────────

export const runbookApi = {
  list: (
    tenantId: string,
    params?: {
      incidentType?: string
      enabled?: boolean
    },
  ) => {
    const q =
      params
        ? `?${new URLSearchParams(
            params as Record<string, string>,
          )}`
        : ''

    return request(
      tenantPath(
        tenantId,
        `/runbooks${q}`,
      ),
    )
  },

  get: (
    tenantId: string,
    runbookId: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/runbooks/${runbookId}`,
      ),
    ),

  create: (
    tenantId: string,
    body: unknown,
  ) =>
    request(
      tenantPath(
        tenantId,
        '/runbooks',
      ),
      {
        method: 'POST',
        body,
      },
    ),

  update: (
    tenantId: string,
    runbookId: string,
    body: unknown,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/runbooks/${runbookId}`,
      ),
      {
        method: 'PUT',
        body,
      },
    ),

  execute: (
    tenantId: string,
    runbookId: string,
    input?:
      Record<string, unknown>,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/runbooks/${runbookId}/execute`,
      ),
      {
        method: 'POST',
        body:
          input ??
          {},
      },
    ),

  executions: (
    tenantId: string,
    runbookId: string,
  ) =>
    request(
      tenantPath(
        tenantId,
        `/runbooks/${runbookId}/executions`,
      ),
    ),
}


// ─── Action Logs ──────────────────────────────────────────────────────────────

export const actionLogApi = {
  list: (
    tenantId: string,
    params?:
      Record<string, string> |
      number,
  ) => {
    const limit =
      typeof params === 'number'
        ? params
        : 50

    const extra =
      typeof params === 'object' &&
      params !== null
        ? params
        : {}

    const q =
      new URLSearchParams({
        limit:
          String(limit),

        ...extra,
      })

    return request<{
      data: unknown[]
    }>(
      tenantPath(
        tenantId,
        `/action-logs?${q}`,
      ),
    )
  },
}


// ─── Policy ──────────────────────────────────────────────────────────────────

export const policyApi = {
  get: (
    _tenantId: string,
  ) =>
    request<unknown>(
      '/api/v1/policy/version-history',
    ).then(
      (
        response,
      ) => {
        const versions: any[] =
          (response as any)
            ?.versions ??
          (
            Array.isArray(response)
              ? response
              : []
          )

        return (
          versions[0] ??
          {
            yaml: '',
            content: '',
            policyYaml: '',
          }
        )
      },
    ),

  versions: (
    _tenantId: string,
  ) =>
    request(
      '/api/v1/policy/version-history',
    ),

  validate: (
    _tenantId: string,
    policyYaml: string,
  ) =>
    request(
      '/api/v1/policy/validate',
      {
        method: 'POST',
        body: {
          policyYaml,
        },
      },
    ),

  update: (
    tenantId: string,
    policyYaml: string,
  ) =>
    request(
      '/api/v1/policy/create-version',
      {
        method: 'POST',
        body: {
          policyYaml,
          tenantId,
        },
      },
    ),

  dryRun: (
    _tenantId: string,
    policyYaml: string,
    signal:
      Record<string, unknown>,
  ) =>
    request(
      '/api/v1/policy/dry-run',
      {
        method: 'POST',
        body: {
          policyYaml,
          signal,
        },
      },
    ),

  rollback: (
    body: unknown,
  ) =>
    request(
      '/api/v1/policy/rollback',
      {
        method: 'POST',
        body,
      },
    ),

  dryRunResults: () =>
    request(
      '/api/v1/policy/dry-run/results',
    ),

  versionHistory: () =>
    request(
      '/api/v1/policy/version-history',
    ),

  rollbackHistory: () =>
    request(
      '/api/v1/policy/rollback-history',
    ),
}


// ─── Confidence ──────────────────────────────────────────────────────────────

export const confidenceApi = {
  weights: (
    signal?: AbortSignal,
  ) =>
    request(
      '/api/v1/confidence/weights',
      {
        signal,
      },
    ),

  trends: (
    signal?: AbortSignal,
  ) =>
    request(
      '/api/v1/confidence/trends',
      {
        signal,
      },
    ),

  byAction: (
    signal?: AbortSignal,
  ) =>
    request(
      '/api/v1/confidence/accuracy/by-action',
      {
        signal,
      },
    ),

  byPattern: (
    signal?: AbortSignal,
  ) =>
    request(
      '/api/v1/confidence/accuracy/by-pattern',
      {
        signal,
      },
    ),

  recalibrate: (
    body: unknown,
  ) =>
    request(
      '/api/v1/confidence/recalibrate',
      {
        method: 'POST',
        body,
      },
    ),
}


// ─── Effectiveness ───────────────────────────────────────────────────────────

export const effectivenessApi = {
  get: (
    decisionTraceId: string,
    signal?: AbortSignal,
  ) =>
    request(
      `/api/v1/effectiveness/${decisionTraceId}`,
      {
        signal,
      },
    ),

  list: (
    _tenantId?: string,
  ) =>
    request(
      '/api/v1/effectiveness/',
    ),

  accuracy: (
    _tenantId?: string,
  ) =>
    request(
      '/api/v1/effectiveness/compare/actions',
    ),

  compareActions: (
    signal?: AbortSignal,
  ) =>
    request(
      '/api/v1/effectiveness/compare/actions',
      {
        signal,
      },
    ),
}


// ─── Integrations ────────────────────────────────────────────────────────────

export const integrationApi = {
  webhookHistory: (
    _tenantId?: string,
    signal?: AbortSignal,
  ) =>
    request(
      '/api/v1/integrations/webhooks/history',
      {
        signal,
      },
    ),

  webhookStats: (
    _tenantId?: string,
    signal?: AbortSignal,
  ) =>
    request(
      '/api/v1/integrations/webhooks/stats',
      {
        signal,
      },
    ),

  registerWebhook: (
    body: unknown,
  ) =>
    request(
      '/api/v1/integrations/webhooks/register',
      {
        method: 'POST',
        body,
      },
    ),

  slackNotify: (
    body: unknown,
  ) =>
    request(
      '/api/v1/integrations/slack/notify',
      {
        method: 'POST',
        body,
      },
    ),
}


// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportApi = {
  list: (
    _tenantId?: string,
  ) =>
    request(
      '/api/v1/reports',
    ),

  generate: (
    tenantId: string,
    params:
      Record<string, unknown>,
  ) =>
    request(
      '/api/v1/reports/effectiveness',
      {
        method: 'POST',
        body: {
          tenantId,

          startDate:
            params.startDate ??
            new Date(
              Date.now() -
              7 *
              24 *
              60 *
              60 *
              1000,
            ).toISOString(),

          endDate:
            params.endDate ??
            new Date()
              .toISOString(),

          ...params,
        },
      },
    ),

  effectiveness: (
    body: unknown,
  ) =>
    request(
      '/api/v1/reports/effectiveness',
      {
        method: 'POST',
        body,
      },
    ),

  failureAnalysis: (
    body: unknown,
  ) =>
    request(
      '/api/v1/reports/failure-analysis',
      {
        method: 'POST',
        body,
      },
    ),

  executiveSummary: (
    body: unknown,
  ) =>
    request(
      '/api/v1/reports/executive-summary',
      {
        method: 'POST',
        body,
      },
    ),

  get: (
    reportId: string,
  ) =>
    request(
      `/api/v1/reports/${reportId}`,
    ),

  archive: (
    reportId: string,
  ) =>
    request(
      `/api/v1/reports/${reportId}/archive`,
      {
        method: 'POST',
      },
    ),
}


// ─── Safety ──────────────────────────────────────────────────────────────────

export const safetyApi = {
  getKillSwitches: (
    _tenantId?: string,
  ) =>
    request(
      '/api/v1/safety/kill-switches',
    ),

  toggleKillSwitch: (
    _tenantId: string,
    action:
      | 'activate'
      | 'deactivate',
    scope?: string,
  ) =>
    request(
      '/api/v1/safety/kill-switches',
      {
        method: 'POST',
        body: {
          action,
          scope,
        },
      },
    ),

  setKillSwitch: (
    body: unknown,
  ) =>
    request(
      '/api/v1/safety/kill-switches',
      {
        method: 'POST',
        body,
      },
    ),

  getThresholds: (
    _tenantId?: string,
  ) =>
    request(
      '/api/v1/safety/thresholds',
    ),

  updateThresholds: (
    _tenantId: string,
    thresholds:
      Record<string, number>,
  ) =>
    request(
      '/api/v1/safety/thresholds',
      {
        method: 'POST',
        body:
          thresholds,
      },
    ),

  setThresholds: (
    body: unknown,
  ) =>
    request(
      '/api/v1/safety/thresholds',
      {
        method: 'POST',
        body,
      },
    ),
}


// ─── Execution Modes ─────────────────────────────────────────────────────────

export const executionApi = {
  stats: () =>
    request(
      '/api/v1/execution/stats',
    ),

  pendingApprovals: () =>
    request(
      '/api/v1/execution/approvals/pending',
    ),

  setDefaultMode: (
    body: unknown,
  ) =>
    request(
      '/api/v1/execution/config/default-mode',
      {
        method: 'POST',
        body,
      },
    ),
}


export const integrationCatalogueApi = {
  listDefinitions: () =>
    request<{
      definitions:
        import('../types/integration')
          .IntegrationDefinition[]
    }>(
      '/api/v1/integration-definitions',
    ),
}


export const integrationConnectionApi = {
  list: () =>
    request<{
      integrations:
        import('../types/integration')
          .IntegrationConnection[]

      count: number
    }>(
      '/api/v1/integrations/connections',
    ),

  get: (
    id: string,
  ) =>
    request<{
      integration:
        import('../types/integration')
          .IntegrationConnection
    }>(
      `/api/v1/integrations/connections/${id}`,
    ),

  create: (
    body:
      import('../types/integration')
        .CreateConnectionBody,
  ) =>
    request<{
      integration:
        import('../types/integration')
          .IntegrationConnection
    }>(
      '/api/v1/integrations/connections',
      {
        method: 'POST',
        body,
      },
    ),

  update: (
    id: string,
    body:
      import('../types/integration')
        .UpdateConnectionBody,
  ) =>
    request<{
      integration:
        import('../types/integration')
          .IntegrationConnection
    }>(
      `/api/v1/integrations/connections/${id}`,
      {
        method: 'PATCH',
        body,
      },
    ),

  test: (
    id: string,
  ) =>
    request<{
      success: boolean
      latencyMs?: number
      detail?: string
    }>(
      `/api/v1/integrations/connections/${id}/test`,
      {
        method: 'POST',
      },
    ),

  disable: (
    id: string,
  ) =>
    request<{
      integration:
        import('../types/integration')
          .IntegrationConnection
    }>(
      `/api/v1/integrations/connections/${id}/disable`,
      {
        method: 'POST',
      },
    ),

  rotateSecret: (
    id: string,
    secret: string,
  ) =>
    request<{
      success: boolean
    }>(
      `/api/v1/integrations/connections/${id}/rotate-secret`,
      {
        method: 'POST',
        body: {
          secret,
        },
      },
    ),

  delete: (
    id: string,
  ) =>
    request<void>(
      `/api/v1/integrations/connections/${id}`,
      {
        method: 'DELETE',
      },
    ),
}


export const developmentApi = {
  subscription: (
    signal?: AbortSignal,
  ) =>
    request<{
      plan: string
      status: string

      entitlements:
        Record<
          string,
          boolean |
          number |
          null
        >
    }>(
      '/api/v1/dev/subscription',
      {
        signal,
      },
    ),

  setPlan: (
    plan:
      | 'developer'
      | 'team'
      | 'business'
      | 'enterprise',
  ) =>
    request<{
      success: boolean

      subscription: {
        id: string
        organizationId: string
        plan: string
        status: string
      }

      plan: string
      status: string

      entitlements:
        Record<
          string,
          boolean |
          number |
          null
        >
    }>(
      '/api/v1/dev/subscription/plan',
      {
        method: 'POST',

        body: {
          plan,
        },
      },
    ),
}