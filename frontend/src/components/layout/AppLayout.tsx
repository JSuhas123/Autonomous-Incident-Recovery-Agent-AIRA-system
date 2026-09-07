import {
  Outlet,
} from 'react-router-dom'

import {
  ProductCommandPalette,
} from './ProductCommandPalette'

import {
  ProductContextTransitionOverlay,
} from './ProductContextTransitionOverlay'

import {
  ProductMobileNavigation,
} from './ProductMobileNavigation'

import {
  ProductSidebar,
} from './ProductSidebar'

import {
  ProductTopBar,
} from './ProductTopBar'

import {
  ProductRouteGuard,
} from '@/product/ProductRouteGuard'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function AppLayout() {
  const collapsed =
    useProductRuntimeStore(
      (state) =>
        state.sidebarCollapsed,
    )


  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <ProductSidebar />


      <div
        className={[
          'min-h-screen transition-[padding-left] duration-200',

          collapsed
            ? 'lg:pl-[76px]'
            : 'lg:pl-[252px]',
        ].join(
          ' ',
        )}
      >
        <ProductTopBar />


        <main className="min-h-[calc(100vh-4rem)]">
          <ProductRouteGuard>
            <div className="mx-auto w-full max-w-[1800px] p-3 pb-20 sm:p-5 sm:pb-20 xl:p-6">
              <Outlet />
            </div>
          </ProductRouteGuard>
        </main>
      </div>


      <ProductMobileNavigation />

      <ProductCommandPalette />

      <ProductContextTransitionOverlay />
    </div>
  )
}