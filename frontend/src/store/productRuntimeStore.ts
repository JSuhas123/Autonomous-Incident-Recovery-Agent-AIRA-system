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


export interface ProductRuntimeOrganization {
  id: string

  name: string

  slug: string
}


export interface ProductRuntimeEnvironment {
  id: string

  name: string

  type:
    | 'development'
    | 'staging'
    | 'production'
    | 'unknown'

  criticality?:
    string | null
}


interface ProductRuntimeState {
  contextSource:
    ProductContextSource

  contextReady:
    boolean

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
    ProductRuntimeOrganization |
    null

  environment:
    ProductRuntimeEnvironment |
    null

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
      context: {
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
          ProductRuntimeOrganization |
          null

        environment:
          ProductRuntimeEnvironment |
          null

        landingPath:
          string
      }
    ) => void

  markContextUnavailable:
    () => void

  setSidebarCollapsed:
    (
      value:
        boolean
    ) => void

  setCommandOpen:
    (
      value:
        boolean
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

  contextReady:
    false,

  userId:
    null,

  membershipId:
    null,

  role:
    null,

  persona:
    PRODUCT_PERSONAS
      .EXECUTIVE,

  permissions:
    [] as string[],

  organization:
    null as ProductRuntimeOrganization |
    null,

  environment:
    null as ProductRuntimeEnvironment |
    null,

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
    (set) => ({
      ...INITIAL_STATE,


      hydrateProductContext:
        (context) =>
          set({
            contextSource:
              context.source,

            contextReady:
              true,

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
          }),


      markContextUnavailable:
        () =>
          set({
            contextSource:
              'unavailable',

            contextReady:
              false,

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
            (state) => ({
              tenantEpoch:
                state.tenantEpoch +
                1,
            }),
          ),


      clearTenantScopedState:
        () =>
          set(
            (state) => ({
              contextSource:
                'unavailable',

              contextReady:
                false,

              organization:
                null,

              environment:
                null,

              permissions:
                [],

              tenantEpoch:
                state.tenantEpoch +
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