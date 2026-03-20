import { AuthProvider } from '@/providers/Auth'
import { EcommerceProvider } from '@payloadcms/plugin-ecommerce/client/react'
import React from 'react'

import { HeaderThemeProvider } from './HeaderTheme'
import { ThemeProvider } from './Theme'
import { SonnerProvider } from '@/providers/Sonner'
import { manualAdapterClient } from '@/ecommerce/manualAdapter'

export const Providers: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HeaderThemeProvider>
          <SonnerProvider />
          <EcommerceProvider
            enableVariants={false}
            api={{
              cartsFetchQuery: {
                depth: 2,
                populate: {
                  products: {
                    images: true,
                    inventory: true,
                    price: true,
                    priceInUSD: true,
                    published: true,
                    slug: true,
                    title: true,
                  },
                },
              },
            }}
            paymentMethods={[manualAdapterClient()]}
          >
            {children}
          </EcommerceProvider>
        </HeaderThemeProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
