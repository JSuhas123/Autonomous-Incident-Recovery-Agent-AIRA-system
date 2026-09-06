import {
  create,
} from 'zustand'

import {
  PRODUCT_PERSONAS,
  type ProductPersona,
} from '@/product/product.types'

import type {
  ProductContextSource,
} from '@/product/product.runtime'


export type ProductContextStatus =
  | 'unavailable'
  | 'loading'
  | 'transitioning'
  | 'ready'
  | 'error'


export interface ProductRuntimeOrganization {
  id:
    string

  tenantId:
    string | null

  name:
    string

  slug:
    string

  status?:
    string | null
}


export interface ProductRuntimeEnvironment {
  id:
    string

  organizationId:
    string | null

  name:
    string

  slug?:
    string | null

  type:
    | 'development'
    | 'testing'
    | 'staging'
    | 'production'
    | 'custom'
    | 'unknown'

  criticality?:
    string | null

  status?:
    string | null

  settings?: {
    allowAutonomousExecution:
      boolean

    requireApprovalForDestructiveActions:
      boolean

    timezone:
      string | null
  } | null
}


interface HydrateProductContextInput {
  source:
    ProductContextSource

  userId:
    string | null

  membershipId:
    string | null

  role:
    string | null

  persona:
    ProductPersona

  permissions:
    string[]

  organization:
    ProductRuntimeOrganization | null

  environment:
    ProductRuntimeEnvironment | null

  landingPath:
    string

  requestId?:
    string | null
}


interface ProductRuntimeState {
  contextSource:
    ProductContextSource

  contextStatus:
    ProductContextStatus

  contextReady:
    boolean

  contextError:
    string | null

  requestId:
    string | null

  userId:
    string | null

  membershipId:
    string | null

  role:
    string | null

  persona:
    ProductPersona

  permissions:
    string[]

  organization:
    ProductRuntimeOrganization | null

  environment:
    ProductRuntimeEnvironment | null

  landingPath:
    string

  sidebarCollapsed:
    boolean

  commandOpen:
    boolean

  tenantEpoch:
    number

  hydrateProductContext:
    (
      context:
        HydrateProductContextInput,
    ) => void

  markContextLoading:
    () => void

  beginTenantTransition:
    () => void

  markContextError:
    (
      message:
        string,
    ) => void

  markContextUnavailable:
    () => void

  setSidebarCollapsed:
    (
      value:
        boolean,
    ) => void

  setCommandOpen:
    (
      value:
        boolean,
    ) => void

  incrementTenantEpoch:
    () => void

  clearTenantScopedState:
    () => void

  resetProductRuntime:
    () => void
}


const INITIAL_STATE = {
  contextSource:
    'unavailable' as const,

  contextStatus:
    'unavailable' as const,

  contextReady:
    false,

  contextError:
    null as string | null,

  requestId:
    null as string | null,

  userId:
    null as string | null,

  membershipId:
    null as string | null,

  role:
    null as string | null,

  persona:
    PRODUCT_PERSONAS
      .EXECUTIVE,

  permissions:
    [] as string[],

  organization:
    null as ProductRuntimeOrganization | null,

  environment:
    null as ProductRuntimeEnvironment | null,

  landingPath:
    '/overview',

  sidebarCollapsed:
    false,

  commandOpen:
    false,

  tenantEpoch:
    0,
}


export const useProductRuntimeStore =
  create<ProductRuntimeState>(
    (
      set,
    ) => ({
      ...INITIAL_STATE,


      hydrateProductContext:
        (
          context,
        ) =>
          set({
            contextSource:
              context.source,

            contextStatus:
              'ready',

            contextReady:
              true,

            contextError:
              null,

            requestId:
              context.requestId ??
              null,

            userId:
              context.userId,

            membershipId:
              context.membershipId,

            role:
              context.role,

            persona:
              context.persona,

            permissions:
              Array.from(
                new Set(
                  context.permissions,
                ),
              ),

            organization:
              context.organization,

            environment:
              context.environment,

            landingPath:
              context.landingPath,

            commandOpen:
              false,
          }),


      markContextLoading:
        () =>
          set({
            contextSource:
              'unavailable',

            contextStatus:
              'loading',

            contextReady:
              false,

            contextError:
              null,

            requestId:
              null,

            permissions:
              [],

            organization:
              null,

            environment:
              null,

            commandOpen:
              false,
          }),


      beginTenantTransition:
        () =>
          set(
            (
              state,
            ) => ({
              contextSource:
                'unavailable',

              contextStatus:
                'transitioning',

              contextReady:
                false,

              contextError:
                null,

              requestId:
                null,

              permissions:
                [],

              organization:
                null,

              environment:
                null,

              commandOpen:
                false,

              tenantEpoch:
                state
                  .tenantEpoch +
                1,
            }),
          ),


      markContextError:
        (
          contextError,
        ) =>
          set({
            contextSource:
              'unavailable',

            contextStatus:
              'error',

            contextReady:
              false,

            contextError,

            permissions:
              [],

            organization:
              null,

            environment:
              null,

            commandOpen:
              false,
          }),


      markContextUnavailable:
        () =>
          set({
            contextSource:
              'unavailable',

            contextStatus:
              'unavailable',

            contextReady:
              false,

            contextError:
              null,

            requestId:
              null,

            userId:
              null,

            membershipId:
              null,

            role:
              null,

            permissions:
              [],

            organization:
              null,

            environment:
              null,

            persona:
              PRODUCT_PERSONAS
                .EXECUTIVE,

            landingPath:
              '/overview',

            commandOpen:
              false,
          }),


      setSidebarCollapsed:
        (
          sidebarCollapsed,
        ) =>
          set({
            sidebarCollapsed,
          }),


      setCommandOpen:
        (
          commandOpen,
        ) =>
          set({
            commandOpen,
          }),


      incrementTenantEpoch:
        () =>
          set(
            (
              state,
            ) => ({
              tenantEpoch:
                state
                  .tenantEpoch +
                1,
            }),
          ),


      clearTenantScopedState:
        () =>
          set(
            (
              state,
            ) => ({
              contextSource:
                'unavailable',

              contextStatus:
                'transitioning',

              contextReady:
                false,

              contextError:
                null,

              requestId:
                null,

              permissions:
                [],

              organization:
                null,

              environment:
                null,

              commandOpen:
                false,

              tenantEpoch:
                state
                  .tenantEpoch +
                1,
            }),
          ),


      resetProductRuntime:
        () =>
          set({
            ...INITIAL_STATE,
          }),
    }),
  )