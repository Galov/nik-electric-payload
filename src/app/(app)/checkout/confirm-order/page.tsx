import type { Metadata } from 'next'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { redirect } from 'next/navigation'

export default function ConfirmOrderPage() {
  redirect('/checkout')
}

export const metadata: Metadata = {
  description: 'Потвърждение на поръчка.',
  openGraph: mergeOpenGraph({
    title: 'Потвърждаване на поръчка',
    url: '/checkout/confirm-order',
  }),
  title: 'Потвърждаване на поръчка',
}
