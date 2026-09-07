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


export type ProductOnboardingStepStatus =
  | 'complete'
  | 'current'
  | 'pending'


export interface ProductOnboardingStep {
  id:
    string

  label:
    string

  status:
    ProductOnboardingStepStatus

  evidence:
    string

  detail:
    string

  actionPath:
    string | null
}


export interface ProductOnboardingRecommendation {
  id:
    string

  title:
    string

  description:
    string

  actionPath:
    string
}


export interface ProductOnboardingReadModel {
  generatedAt:
    string

  scope: {
    organizationId:
      string

    environmentId:
      string
  }

  readiness: {
    completed:
      number

    total:
      number

    percent:
      number

    fullyReady:
      boolean

    currentStepId:
      string | null
  }

  steps:
    ProductOnboardingStep[]

  evidence: {
    profileStatus:
      string

    activeMembers:
      number

    pendingInvitations:
      number

    teams:
      number

    integrations: {
      total:
        number

      connected:
        number

      operational:
        number

      observedEvents:
        number
    }

    signals:
      number

    resources:
      number

    policies:
      number

    incidents:
      number

    notificationChannels:
      number

    notificationRoutes:
      number

    environment: {
      name:
        string | null

      type:
        string | null

      criticality:
        string | null

      status:
        string

      autonomousExecutionAllowed:
        boolean

      destructiveApprovalRequired:
        boolean
    }
  }

  recommendations:
    ProductOnboardingRecommendation[]

  safety: {
    executionAuthorized:
      false

    onboardingGrantsAuthority:
      false

    readinessGrantsCertification:
      false

    browserCanCompleteSteps:
      false
  }

  executionAuthorized:
    false
}


async function get():
  Promise<ProductOnboardingReadModel> {
  const auth =
    useAuthStore
      .getState()


  const headers:
    Record<
      string,
      string
    > = {
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
      `${BASE_URL}/api/v1/product/onboarding`,
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
    throw new Error(
      payload
        ?.error
        ?.message ??
      payload
        ?.message ??
      'Unable to load onboarding evidence.',
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
      'Onboarding response violated AIRA execution-authority boundary.',
    )
  }


  return payload
    .data
}


export const productOnboardingApi = {
  get,
}