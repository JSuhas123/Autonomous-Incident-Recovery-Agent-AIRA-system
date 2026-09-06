import {
  PRODUCT_PERSONAS,
} from '@/product/product.types'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'

import OwnerAdminOverviewPage from './OwnerAdminOverviewPage'

import ExecutiveOverviewPage from '@/features/executive/ExecutiveOverviewPage'


export default function ProductOverviewPage() {
  const persona =
    useProductRuntimeStore(
      (
        state,
      ) =>
        state.persona,
    )


  /*
   * Viewer maps to Executive presentation.
   *
   * This branch changes presentation only.
   *
   * It does NOT grant or modify backend permissions.
   */
  if (
    persona ===
    PRODUCT_PERSONAS
      .EXECUTIVE
  ) {
    return (
      <ExecutiveOverviewPage />
    )
  }


  /*
   * ProductRouteGuard controls whether the persona is permitted to enter
   * /overview.
   *
   * Administration is the normal non-executive presentation for this path.
   */
  return (
    <OwnerAdminOverviewPage />
  )
}