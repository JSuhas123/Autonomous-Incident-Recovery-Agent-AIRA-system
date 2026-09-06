import {
  RouterProvider,
} from 'react-router-dom'

import {
  Toaster,
} from '@/components/ui/toaster'

import {
  router,
} from '@/router'

import {
  ProductContextProvider,
} from '@/product/ProductContextProvider'

import {
  useSessionBootstrap,
} from '@/hooks/useSessionBootstrap'


export default function App() {
  useSessionBootstrap()


  return (
    <ProductContextProvider>
      <RouterProvider
        router={
          router
        }
      />

      <Toaster />
    </ProductContextProvider>
  )
}