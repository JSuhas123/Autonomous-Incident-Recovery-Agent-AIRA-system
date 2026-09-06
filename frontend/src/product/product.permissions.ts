/**
 * ============================================================================
 * AIRA PHASE 25
 * FRONTEND PERMISSION HELPERS
 * ============================================================================
 *
 * IMPORTANT:
 *
 * Frontend permission checks exist only for:
 *
 * - presentation
 * - navigation
 * - disabled states
 * - explaining why an action is unavailable
 *
 * They are NOT security boundaries.
 *
 * Every protected action must still be authorized by the backend.
 * ============================================================================
 */

export type Permission =
  string

export function normalizePermissions(
  permissions:
    | string[]
    | null
    | undefined,
): string[] {
  if (
    !Array.isArray(
      permissions,
    )
  ) {
    return []
  }

  return [
    ...new Set(
      permissions
        .filter(
          (
            permission,
          ): permission is string =>
            typeof permission ===
            'string',
        )
        .map(
          (permission) =>
            permission.trim(),
        )
        .filter(Boolean),
    ),
  ]
}

export function hasPermission(
  permissions:
    | string[]
    | null
    | undefined,

  requiredPermission:
    string,
): boolean {
  return normalizePermissions(
    permissions,
  ).includes(
    requiredPermission,
  )
}

export function hasAnyPermission(
  permissions:
    | string[]
    | null
    | undefined,

  requiredPermissions:
    string[],
): boolean {
  if (
    requiredPermissions.length ===
    0
  ) {
    return true
  }

  const available =
    new Set(
      normalizePermissions(
        permissions,
      ),
    )

  return requiredPermissions
    .some(
      (permission) =>
        available.has(
          permission,
        ),
    )
}

export function hasAllPermissions(
  permissions:
    | string[]
    | null
    | undefined,

  requiredPermissions:
    string[],
): boolean {
  if (
    requiredPermissions.length ===
    0
  ) {
    return true
  }

  const available =
    new Set(
      normalizePermissions(
        permissions,
      ),
    )

  return requiredPermissions
    .every(
      (permission) =>
        available.has(
          permission,
        ),
    )
}