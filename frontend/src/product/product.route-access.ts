import type {
  ProductPersona,
} from './product.types'

import {
  getNavigationForPersona,
} from './product.navigation'


const ALWAYS_ALLOWED_PATHS =
  new Set([
    '/profile',
    '/help',
  ])


function normalizePath(
  pathname:
    string,
) {
  if (
    !pathname ||
    pathname ===
      '/'
  ) {
    return '/'
  }

  const normalized =
    pathname.endsWith('/')
      ? pathname.slice(
          0,
          -1,
        )
      : pathname

  return normalized ||
    '/'
}


function routeMatches(
  pathname:
    string,
  routePath:
    string,
) {
  const current =
    normalizePath(
      pathname,
    )

  const target =
    normalizePath(
      routePath,
    )


  return (
    current ===
      target ||
    current.startsWith(
      `${target}/`,
    )
  )
}


export function getAllowedProductPaths(
  persona:
    ProductPersona,
  permissions:
    string[],
) {
  return getNavigationForPersona(
    persona,
    permissions,
  )
    .flatMap(
      (group) =>
        group.items,
    )
    .map(
      (item) =>
        item.path,
    )
}


export function canAccessProductPath(
  {
    pathname,
    persona,
    permissions,
  }: {
    pathname:
      string

    persona:
      ProductPersona

    permissions:
      string[]
  },
) {
  const normalized =
    normalizePath(
      pathname,
    )


  if (
    ALWAYS_ALLOWED_PATHS.has(
      normalized,
    )
  ) {
    return true
  }


  const paths =
    getAllowedProductPaths(
      persona,
      permissions,
    )


  return paths.some(
    (path) =>
      routeMatches(
        normalized,
        path,
      ),
  )
}