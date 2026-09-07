import {
  getProductScopeSignal,
} from '@/product/productScope'

import {
  useAuthStore,
} from '@/store/authStore'

import type {
  FeatureState,
} from '@/features/shared/FeaturePrimitives'


const BASE_URL =
  import.meta.env
    .VITE_API_URL ??
  'http://localhost:5000'


export interface ProductMetric {
  id:
    string

  label:
    string

  value:
    string

  detail:
    string

  state:
    FeatureState
}

export interface ProductCommercialState {
  status:
    'available' |
    'unavailable'

  reason:
    string | null

  message?:
    string
}


export interface ProductDegradedDependency {
  dependency:
    string

  code:
    string

  status:
    'unavailable'
}

export interface ProductIncidentSummary {
  id:
    string

  title:
    string

  description:
    string | null

  service:
    string

  serviceId:
    string | null

  severity:
    'critical' |
    'high' |
    'low'

  rawSeverity:
    string

  status:
    string

  workflowState:
    string

  source:
    string | null

  providerCount:
    number

  evidenceCount:
    number

  correlationConfidence:
    number | null

  detectedAt:
    string | null

  createdAt:
    string | null

  age:
    string

  executionAuthorized:
    false
}


export interface ProductOverviewReadModel {
  generatedAt:
    string

  scope: {
    organizationId:
      string

    environmentId:
      string
  }

  health:
    FeatureState

  metrics:
    ProductMetric[]

  incidents:
    ProductIncidentSummary[]

  environmentSummary: {
    total:
      number

    active:
      number

    maintenance:
      number

    hasProduction:
      boolean

    plan:
      string | null

    limit:
      number | null

    remaining:
      number | null
  }
  commercial:
  ProductCommercialState

degraded:
  boolean

degradedDependencies:
  ProductDegradedDependency[]
 
  safety: {
    executionAuthorized:
      false

    personaGrantsAuthorization:
      false
  }
}


export interface ProductOperationsReadModel {
  generatedAt:
    string

  scope: {
    organizationId:
      string

    environmentId:
      string
  }

  metrics:
    ProductMetric[]

  primaryIncident:
    ProductIncidentSummary |
    null

  incidents:
    ProductIncidentSummary[]

  safety: {
    executionAuthorized:
      false

    readModelOnly:
      true
  }
}


export interface ProductIncidentReadModel {
  generatedAt:
    string

  scope: {
    organizationId:
      string

    environmentId:
      string
  }

  incidents:
    ProductIncidentSummary[]

  count:
    number

  executionAuthorized:
    false
}


export interface ShadowModeReadModel {
  generatedAt:
    string

  scope: {
    organizationId:
      string

    environmentId:
      string
  }

  mode: {
    shadowMode:
      true

    autonomousExecutionAllowed:
      boolean

    autonomousExecutionPerformed:
      false

    executionAuthorized:
      false
  }

  metrics:
    ProductMetric[]

  comparisons: {
    available:
      boolean

    sampleSize:
      number

    diagnosisAgreement:
      number | null

    actionAgreement:
      number | null

    reason:
      string
  }

  cases: Array<{
    id:
      string

    incident:
      string

    aira:
      string

    human:
      string

    outcome:
      string

    match:
      boolean
  }>

  safety: {
    executionAuthorized:
      false

    productModeGrantsAuthority:
      false

    comparisonScoreGrantsAuthority:
      false
  }
}


export class ProductReadModelApiError
  extends Error {
  constructor(
    public readonly status:
      number,

    message:
      string,

    public readonly code?:
      string,
  ) {
    super(
      message,
    )

    this.name =
      'ProductReadModelApiError'
  }
}


async function get<T>(
  path:
    string,
): Promise<T> {
  const environmentId =
    useAuthStore
      .getState()
      .activeEnvironment
      ?.id


  const headers:
    Record<
      string,
      string
    > = {
      Accept:
        'application/json',
    }


  if (
    environmentId
  ) {
    headers[
      'X-AIRA-Environment-Id'
    ] =
      environmentId
  }


  const response =
    await fetch(
      `${BASE_URL}${path}`,
      {
        method:
          'GET',

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
    throw new ProductReadModelApiError(
      response.status,

      payload
        ?.error
        ?.message ??
      payload
        ?.message ??
      'Unable to load AIRA product data.',

      payload
        ?.error
        ?.code ??
      payload
        ?.code,
    )
  }


  if (
    payload
      ?.executionAuthorized !==
    false
  ) {
    throw new ProductReadModelApiError(
      500,

      'Product read model violated the execution-authority boundary.',

      'PRODUCT_READ_MODEL_AUTHORITY_VIOLATION',
    )
  }


  return payload
    .data as T
}


export const productReadModelApi = {
  overview() {
    return get<ProductOverviewReadModel>(
      '/api/v1/product/overview',
    )
  },


  operations() {
    return get<ProductOperationsReadModel>(
      '/api/v1/product/operations',
    )
  },


  incidents() {
    return get<ProductIncidentReadModel>(
      '/api/v1/product/incidents',
    )
  },


  shadow() {
    return get<ShadowModeReadModel>(
      '/api/v1/product/shadow',
    )
  },
}