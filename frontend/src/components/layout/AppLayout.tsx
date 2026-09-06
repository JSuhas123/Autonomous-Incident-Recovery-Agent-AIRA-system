import {
  Outlet,
} from 'react-router-dom'

import {
  ProductCommandPalette,
} from './ProductCommandPalette'

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
    <div className="min-h-screen bg-background">
      <ProductSidebar />

      <div
        className={[
          'min-h-screen transition-[padding-left] duration-200',

          collapsed
            ? 'lg:pl-[76px]'
            : 'lg:pl-[252px]',
        ].join(' ')}
      >
        <ProductTopBar />

        <main className="min-h-[calc(100vh-4rem)]">
          <ProductRouteGuard>
            <div className="mx-auto w-full max-w-[1800px] p-4 sm:p-6">
              <Outlet />
            </div>
          </ProductRouteGuard>
        </main>
      </div>

      <ProductCommandPalette />
    </div>
  )
}