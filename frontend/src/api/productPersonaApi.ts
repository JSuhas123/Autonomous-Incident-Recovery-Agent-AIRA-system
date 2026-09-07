import {
  getProductScopeSignal,
} from '@/product/productScope'

import {
  useAuthStore,
} from '@/store/authStore'


const BASE_URL =
  import.meta.env
    .VITE_API_URL ??
  'http://localhost:5000'


export type ProductFeatureState =
  | 'healthy'
  | 'degraded'
  | 'warning'
  | 'critical'
  | 'info'
  | 'unknown'


export interface ReliabilityReadModel {
  generatedAt: string

  metrics: {
    incidents: {
      total: number
      active: number
      criticalActive: number
      resolved: number
    }

    mttr: {
      available: boolean
      minutes: number | null
      display: string | null
      basis: string
    }

    mttd: {
      available: false
      minutes: null
      display: null
      basis: string
    }

    recovery: {
      verifications: number
      confirmed: number
      notRecovered: number
      successPercent: number | null
      available: boolean
    }

    humanTakeover: {
      total: number
      active: number
      incidentSharePercent: number | null
      available: boolean
    }

    pendingApprovals: number
  }

  attention: Array<{
    serviceId: string
    incidentCount: number
    activeIncidents: number
    criticalIncidents: number
    lastObservedAt: string | null
    state: ProductFeatureState
  }>

  evidenceState: {
    recoveryCoverage: 'unavailable'
    reason: string
  }

  executionAuthorized: false
}


export interface ExecutiveReadModel {
  generatedAt: string

  metrics: {
    totalIncidents: number
    activeIncidents: number
    criticalActive: number

    medianMttr: {
      available: boolean
      minutes: number | null
      display: string | null
    }

    recoverySuccess: {
      available: boolean
      percent: number | null
      confirmed: number
      total: number
    }

    humanTakeover: {
      total: number
      sharePercent: number | null
    }
  }

  impact: {
    customerImpactingIncidents: number
    customerImpactEvidenceAvailable: boolean
    observedIncidentMinutes: number

    estimatedMinutesAvoided: {
      available: false
      value: null
      reason: string
    }

    financialSavings: {
      available: false
      value: null
      reason: string
    }

    serviceAvailability: {
      available: false
      value: null
      reason: string
    }

    recoveryCoverage: {
      available: false
      value: null
      reason: string
    }
  }

  narrative: string[]

  executionAuthorized: false
}


export interface GovernanceReadModel {
  generatedAt: string

  metrics: {
    policies: {
      total: number
      active: number
    }

    approvals: {
      total: number
      pending: number
      approved: number
      rejected: number
    }

    humanTakeover: {
      total: number
      active: number
      denied: number
      released: number
    }

    auditDecisionTraces: number
  }

  controls: Array<{
    id: string
    title: string
    state: ProductFeatureState
    detail: string
  }>

  recentEvents: Array<{
    id: string
    title: string
    actor: string
    result: string
    risk: string | null
    occurredAt: string | null
  }>

  unavailable: {
    trustExceptions: {
      available: false
      reason: string
    }

    certificationSummary: {
      available: false
      reason: string
    }

    auditCompletenessPercent: {
      available: false
      reason: string
    }
  }

  executionAuthorized: false
}


export interface DeveloperReadModel {
  generatedAt: string

  metrics: {
    observedServices: number
    activeIncidents: number
    servicesWithActiveIncidents: number
    criticalServices: number
  }

  ownership: {
    available: false
    reason: string
  }

  services: Array<{
    id: string
    name: string
    incidentCount: number
    activeIncidents: number
    criticalActive: number
    lastObservedAt: string | null
    health: ProductFeatureState

    recoveryCoverage: {
      available: false
      value: null
    }
  }>

  recentIncidents: Array<{
    id: string
    serviceId: string
    title: string
    severity: string
    status: string
    observedAt: string | null
  }>

  recommendations: Array<{
    id: string
    title: string
    detail: string
    evidenceBased: true
  }>

  changes: {
    available: false
    items: []
    reason: string
  }

  executionAuthorized: false
}


async function request<T>(
  path: string,
): Promise<T> {
  const auth =
    useAuthStore
      .getState()


  const headers:
    Record<string, string> = {
      Accept:
        'application/json',
    }


  if (
    auth
      .activeEnvironment
      ?.id
  ) {
    headers[
      'X-AIRA-Environment-Id'
    ] =
      auth
        .activeEnvironment
        .id
  }


  const response =
    await fetch(
      `${BASE_URL}/api/v1/product/${path}`,
      {
        credentials:
          'include',

        headers,

        signal:
          getProductScopeSignal(),
      },
    )


  const payload:
    any =
    await response
      .json()
      .catch(
        () => null,
      )


  if (
    !response.ok
  ) {
    throw new Error(
      payload
        ?.error
        ?.message ??
      payload
        ?.message ??
      `Unable to load ${path}.`,
    )
  }


  if (
    payload
      ?.executionAuthorized !==
      false ||
    payload
      ?.data
      ?.executionAuthorized !==
      false
  ) {
    throw new Error(
      `Product ${path} read model violated AIRA execution-authority boundary.`,
    )
  }


  return payload
    .data as T
}


export const productPersonaApi = {
  reliability:
    () =>
      request<ReliabilityReadModel>(
        'reliability',
      ),

  executive:
    () =>
      request<ExecutiveReadModel>(
        'executive',
      ),

  governance:
    () =>
      request<GovernanceReadModel>(
        'governance',
      ),

  developer:
    () =>
      request<DeveloperReadModel>(
        'developer',
      ),
}