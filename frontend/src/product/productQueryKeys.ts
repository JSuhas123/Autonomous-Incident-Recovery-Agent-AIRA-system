export interface ProductQueryScope {
  organizationId:
    string

  environmentId:
    string

  tenantEpoch:
    number
}


function scopeKey(
  scope:
    ProductQueryScope,
) {
  return [
    scope.organizationId,
    scope.environmentId,
    scope.tenantEpoch,
  ] as const
}


export const productQueryKeys = {
  all: [
    'product',
  ] as const,


  scope(
    scope:
      ProductQueryScope,
  ) {
    return [
      ...this.all,
      ...scopeKey(
        scope,
      ),
    ] as const
  },


  overview(
    scope:
      ProductQueryScope,
  ) {
    return [
      ...this.scope(
        scope,
      ),
      'overview',
    ] as const
  },


  operations(
    scope:
      ProductQueryScope,
  ) {
    return [
      ...this.scope(
        scope,
      ),
      'operations',
    ] as const
  },


  incidents(
    scope:
      ProductQueryScope,
  ) {
    return [
      ...this.scope(
        scope,
      ),
      'incidents',
    ] as const
  },


  shadow(
    scope:
      ProductQueryScope,
  ) {
    return [
      ...this.scope(
        scope,
      ),
      'shadow',
    ] as const
  },


  billing(
    scope:
      ProductQueryScope,
  ) {
    return [
      ...this.scope(
        scope,
      ),
      'billing',
    ] as const
  },


  usage(
    scope:
      ProductQueryScope,
  ) {
    return [
      ...this.scope(
        scope,
      ),
      'usage',
    ] as const
  },
}